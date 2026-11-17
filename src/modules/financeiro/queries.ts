import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import type { LancamentoParaSaldo } from "@/lib/dominio/saldo";
import { calcularPaginacao, type Paginacao } from "@/lib/listas/parametros";

const comoTexto = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

export type ContaComSaldo = {
  id: string;
  nome: string;
  tipo: "BANCO" | "CAIXA" | "OUTRA";
  ativo: boolean;
  observacao: string | null;
  saldoInicialCentavos: number;
  saldoInicialInformado: boolean;
  dataSaldoInicial: string | null;
  /** Saldo hoje: saldo inicial (se informado) + lançamentos do dia do saldo até hoje, sem estornados. */
  saldoAtualCentavos: number;
  totalDeLancamentos: number;
};

/**
 * Contas financeiras com o saldo de hoje, calculado no banco (uma consulta agregada). A mesma regra de
 * `saldoEm` (src/lib/dominio/saldo.ts): anteriores à data do saldo inicial e estornados não contam.
 */
export async function listarContasFinanceiras(hoje: string, opcoes: { incluirInativas?: boolean } = {}): Promise<ContaComSaldo[]> {
  const [contas, movimentos] = await Promise.all([
    prisma.contaFinanceira.findMany({
      where: { deletadoEm: null, ...(opcoes.incluirInativas ? {} : { ativo: true }) },
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      include: { _count: { select: { lancamentos: true } } },
    }),
    prisma.$queryRaw<{ id: string; movimento: bigint }[]>`
      SELECT c."id", COALESCE(SUM(CASE WHEN l."tipo" = 'ENTRADA' THEN l."valorCentavos" ELSE -l."valorCentavos" END), 0)::bigint AS movimento
      FROM "ContaFinanceira" c
      LEFT JOIN "Lancamento" l ON l."contaFinanceiraId" = c."id"
        AND l."deletadoEm" IS NULL AND l."estornadoEm" IS NULL
        AND l."data" <= ${hoje}::date
        AND (NOT c."saldoInicialInformado" OR c."dataSaldoInicial" IS NULL OR l."data" >= c."dataSaldoInicial")
      WHERE c."deletadoEm" IS NULL
      GROUP BY c."id"`,
  ]);
  const porConta = new Map(movimentos.map((m) => [m.id, Number(m.movimento)]));
  return contas.map((c) => ({
    id: c.id,
    nome: c.nome,
    tipo: c.tipo,
    ativo: c.ativo,
    observacao: c.observacao,
    saldoInicialCentavos: c.saldoInicialCentavos,
    saldoInicialInformado: c.saldoInicialInformado,
    dataSaldoInicial: comoTexto(c.dataSaldoInicial),
    saldoAtualCentavos: (c.saldoInicialInformado ? c.saldoInicialCentavos : 0) + (porConta.get(c.id) ?? 0),
    totalDeLancamentos: c._count.lancamentos,
  }));
}

export async function obterContaFinanceira(id: string, hoje: string): Promise<ContaComSaldo | null> {
  const todas = await listarContasFinanceiras(hoje, { incluirInativas: true });
  return todas.find((c) => c.id === id) ?? null;
}

export type LinhaDeLancamento = LancamentoParaSaldo & {
  descricao: string;
  categoria: string | null;
  forma: string | null;
  comNotaFiscal: boolean;
  conciliado: boolean;
  transferenciaId: string | null;
  motivoEstorno: string | null;
  vinculoComTitulo: boolean;
};

export type ExtratoDaConta = {
  saldoAnteriorCentavos: number;
  saldoFinalCentavos: number;
  entradasCentavos: number;
  saidasCentavos: number;
  linhas: { lancamento: LinhaDeLancamento; saldoAposCentavos: number; incluidoNoSaldoInicial: boolean }[];
  /** Paginação das linhas (a tela). Sem paginação (exportação), `null`. */
  paginacao: Paginacao | null;
  /** Exportação com mais linhas do que o limite: as demais ficaram de fora. */
  truncado: boolean;
};

/** Linhas que a exportação do extrato aceita de uma vez; a tela pagina. */
export const LIMITE_DE_LINHAS_DO_EXTRATO = 20_000;

type LinhaDoSql = {
  id: string;
  data: Date;
  tipo: "ENTRADA" | "SAIDA";
  valorCentavos: number;
  estornado: boolean;
  descricao: string;
  categoria: string | null;
  forma: string | null;
  comNotaFiscal: boolean;
  conciliado: boolean;
  transferenciaId: string | null;
  motivoEstorno: string | null;
  vinculo: boolean;
  conta_no_saldo: boolean;
  acumulado: bigint;
};

/**
 * Extrato do período [de, ate] com saldo corrido (ordem: data, depois criação). Estornados aparecem, riscados, sem mexer no saldo.
 * Tudo no banco: o saldo anterior e os totais vêm de agregados (nenhum lançamento fora do período é carregado), e o saldo depois
 * de cada linha vem de uma soma acumulada. A regra é a de `montarExtrato` (src/lib/dominio/saldo.ts), conferida em teste.
 * Com `pagina`/`tamanho`, traz só a página (a tela); sem eles, até {@link LIMITE_DE_LINHAS_DO_EXTRATO} linhas (exportação).
 */
export async function extratoDaConta(conta: ContaComSaldo, de: string, ate: string, opcoes: { pagina?: number; tamanho?: number } = {}): Promise<ExtratoDaConta> {
  const inicial = conta.saldoInicialInformado ? conta.saldoInicialCentavos : 0;
  // Conta no saldo: não estornado e não anterior à data do saldo inicial (quando informado).
  const conta_no_saldo = Prisma.sql`(l."estornadoEm" IS NULL AND (${conta.saldoInicialInformado} = false OR ${conta.dataSaldoInicial}::date IS NULL OR l."data" >= ${conta.dataSaldoInicial}::date))`;
  const efeito = Prisma.sql`(CASE WHEN l."tipo" = 'ENTRADA' THEN l."valorCentavos" ELSE -l."valorCentavos" END)`;

  const [agregado] = await prisma.$queryRaw<{ anterior: bigint; do_periodo: bigint; entradas: bigint; saidas: bigint; total: number }[]>`
    SELECT COALESCE(SUM(${efeito}) FILTER (WHERE l."data" < ${de}::date AND ${conta_no_saldo}), 0)::bigint AS anterior,
           COALESCE(SUM(${efeito}) FILTER (WHERE l."data" >= ${de}::date AND l."data" <= ${ate}::date AND ${conta_no_saldo}), 0)::bigint AS do_periodo,
           COALESCE(SUM(l."valorCentavos") FILTER (WHERE l."data" >= ${de}::date AND l."data" <= ${ate}::date AND l."estornadoEm" IS NULL AND l."tipo" = 'ENTRADA'), 0)::bigint AS entradas,
           COALESCE(SUM(l."valorCentavos") FILTER (WHERE l."data" >= ${de}::date AND l."data" <= ${ate}::date AND l."estornadoEm" IS NULL AND l."tipo" = 'SAIDA'), 0)::bigint AS saidas,
           count(*) FILTER (WHERE l."data" >= ${de}::date AND l."data" <= ${ate}::date)::int AS total
      FROM "Lancamento" l WHERE l."contaFinanceiraId" = ${conta.id} AND l."deletadoEm" IS NULL`;
  const total = agregado?.total ?? 0;
  const saldoAnterior = inicial + Number(agregado?.anterior ?? 0);

  const paginado = opcoes.pagina !== undefined || opcoes.tamanho !== undefined;
  const paginacao = paginado ? calcularPaginacao(total, opcoes.pagina ?? 1, opcoes.tamanho ?? 50) : null;
  const limite = paginacao ? paginacao.take : LIMITE_DE_LINHAS_DO_EXTRATO;
  const salto = paginacao ? paginacao.skip : 0;

  const linhas = await prisma.$queryRaw<LinhaDoSql[]>`
    SELECT * FROM (
      SELECT l."id", l."data", l."tipo"::text AS tipo, l."valorCentavos", (l."estornadoEm" IS NOT NULL) AS estornado, l."descricao", c."nome" AS categoria, l."forma"::text AS forma,
             l."comNotaFiscal", l."conciliado", l."transferenciaId", l."motivoEstorno", (l."contaReceberId" IS NOT NULL OR l."contaPagarId" IS NOT NULL) AS vinculo,
             ${conta_no_saldo} AS conta_no_saldo,
             SUM(CASE WHEN ${conta_no_saldo} THEN ${efeito} ELSE 0 END) OVER (ORDER BY l."data", l."criadoEm", l."id")::bigint AS acumulado,
             l."criadoEm"
        FROM "Lancamento" l LEFT JOIN "CategoriaFinanceira" c ON c."id" = l."categoriaId"
       WHERE l."contaFinanceiraId" = ${conta.id} AND l."deletadoEm" IS NULL AND l."data" >= ${de}::date AND l."data" <= ${ate}::date) t
     ORDER BY t."data", t."criadoEm", t."id" LIMIT ${limite} OFFSET ${salto}`;

  const itens = linhas.map((l) => ({
    lancamento: {
      id: l.id,
      data: l.data.toISOString().slice(0, 10),
      tipo: l.tipo,
      valorCentavos: l.valorCentavos,
      estornado: l.estornado,
      descricao: l.descricao,
      categoria: l.categoria,
      forma: l.forma,
      comNotaFiscal: l.comNotaFiscal,
      conciliado: l.conciliado,
      transferenciaId: l.transferenciaId,
      motivoEstorno: l.motivoEstorno,
      vinculoComTitulo: l.vinculo,
    } satisfies LinhaDeLancamento,
    saldoAposCentavos: saldoAnterior + Number(l.acumulado),
    incluidoNoSaldoInicial: !l.estornado && !l.conta_no_saldo,
  }));
  return {
    saldoAnteriorCentavos: saldoAnterior,
    saldoFinalCentavos: saldoAnterior + Number(agregado?.do_periodo ?? 0),
    entradasCentavos: Number(agregado?.entradas ?? 0),
    saidasCentavos: Number(agregado?.saidas ?? 0),
    linhas: itens,
    paginacao,
    truncado: !paginacao && total > LIMITE_DE_LINHAS_DO_EXTRATO,
  };
}

export type OpcoesDeLancamento = {
  contas: { id: string; nome: string }[];
  categorias: { id: string; nome: string; tipo: "RECEITA" | "DESPESA" }[];
  fornecedores: { id: string; nome: string }[];
};

/** Listas para os formulários de lançamento (só ativos). */
export async function opcoesDeLancamento(): Promise<OpcoesDeLancamento> {
  const [contas, categorias, fornecedores] = await Promise.all([
    prisma.contaFinanceira.findMany({ where: { ativo: true, deletadoEm: null }, orderBy: [{ ordem: "asc" }, { nome: "asc" }], select: { id: true, nome: true } }),
    prisma.categoriaFinanceira.findMany({ where: { ativo: true, deletadoEm: null }, orderBy: [{ tipo: "asc" }, { ordem: "asc" }, { nome: "asc" }], select: { id: true, nome: true, tipo: true } }),
    prisma.fornecedor.findMany({ where: { ativo: true, deletadoEm: null }, orderBy: { razaoSocial: "asc" }, select: { id: true, razaoSocial: true, nomeFantasia: true } }),
  ]);
  return {
    contas,
    categorias,
    fornecedores: fornecedores.map((f) => ({ id: f.id, nome: f.nomeFantasia?.trim() || f.razaoSocial })),
  };
}

export type DetalheDoLancamento = {
  id: string;
  data: string;
  tipo: "ENTRADA" | "SAIDA";
  valorCentavos: number;
  descricao: string;
  forma: string | null;
  comNotaFiscal: boolean;
  observacao: string | null;
  conciliado: boolean;
  conciliadoEm: Date | null;
  estornadoEm: Date | null;
  motivoEstorno: string | null;
  criadoEm: Date;
  conta: { id: string; nome: string };
  categoria: { id: string; nome: string } | null;
  fornecedor: { id: string; nome: string } | null;
  projeto: { id: string; codigo: string; titulo: string } | null;
  cliente: { id: string; nome: string } | null;
  contaReceberId: string | null;
  contaPagarId: string | null;
  /** Transferência: a outra ponta. */
  transferencia: { id: string; contaNome: string } | null;
};

export async function obterLancamento(id: string): Promise<DetalheDoLancamento | null> {
  const l = await prisma.lancamento.findFirst({
    where: { id, deletadoEm: null },
    include: {
      contaFinanceira: { select: { id: true, nome: true } },
      categoria: { select: { id: true, nome: true } },
      fornecedor: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
      projeto: { select: { id: true, codigo: true, titulo: true } },
      cliente: { select: { id: true, nome: true } },
    },
  });
  if (!l) return null;
  const outra = l.transferenciaId
    ? await prisma.lancamento.findFirst({ where: { transferenciaId: l.transferenciaId, id: { not: l.id }, deletadoEm: null }, select: { id: true, contaFinanceira: { select: { nome: true } } } })
    : null;
  return {
    id: l.id,
    data: l.data.toISOString().slice(0, 10),
    tipo: l.tipo,
    valorCentavos: l.valorCentavos,
    descricao: l.descricao,
    forma: l.forma,
    comNotaFiscal: l.comNotaFiscal,
    observacao: l.observacao,
    conciliado: l.conciliado,
    conciliadoEm: l.conciliadoEm,
    estornadoEm: l.estornadoEm,
    motivoEstorno: l.motivoEstorno,
    criadoEm: l.criadoEm,
    conta: l.contaFinanceira,
    categoria: l.categoria,
    fornecedor: l.fornecedor ? { id: l.fornecedor.id, nome: l.fornecedor.nomeFantasia?.trim() || l.fornecedor.razaoSocial } : null,
    projeto: l.projeto,
    cliente: l.cliente,
    contaReceberId: l.contaReceberId,
    contaPagarId: l.contaPagarId,
    transferencia: outra ? { id: outra.id, contaNome: outra.contaFinanceira.nome } : null,
  };
}
