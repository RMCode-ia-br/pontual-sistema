import "server-only";

import { prisma } from "@/lib/db";
import { montarExtrato, type LancamentoParaSaldo } from "@/lib/dominio/saldo";

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
};

/** Extrato do período [de, ate] com saldo corrido (ordem: data, depois criação). Estornados aparecem, riscados, sem mexer no saldo. */
export async function extratoDaConta(conta: ContaComSaldo, de: string, ate: string): Promise<ExtratoDaConta> {
  const lancamentos = await prisma.lancamento.findMany({
    where: { contaFinanceiraId: conta.id, deletadoEm: null },
    orderBy: [{ data: "asc" }, { criadoEm: "asc" }],
    select: {
      id: true,
      data: true,
      tipo: true,
      valorCentavos: true,
      estornadoEm: true,
      descricao: true,
      forma: true,
      comNotaFiscal: true,
      conciliado: true,
      transferenciaId: true,
      motivoEstorno: true,
      contaReceberId: true,
      contaPagarId: true,
      categoria: { select: { nome: true } },
    },
  });
  const itens: LinhaDeLancamento[] = lancamentos.map((l) => ({
    id: l.id,
    data: l.data.toISOString().slice(0, 10),
    tipo: l.tipo,
    valorCentavos: l.valorCentavos,
    estornado: l.estornadoEm !== null,
    descricao: l.descricao,
    categoria: l.categoria?.nome ?? null,
    forma: l.forma,
    comNotaFiscal: l.comNotaFiscal,
    conciliado: l.conciliado,
    transferenciaId: l.transferenciaId,
    motivoEstorno: l.motivoEstorno,
    vinculoComTitulo: l.contaReceberId !== null || l.contaPagarId !== null,
  }));

  const e = montarExtrato(conta, itens, de, ate);
  let entradas = 0;
  let saidas = 0;
  for (const linha of e.linhas) {
    if (linha.lancamento.estornado) continue;
    if (linha.lancamento.tipo === "ENTRADA") entradas += linha.lancamento.valorCentavos;
    else saidas += linha.lancamento.valorCentavos;
  }
  return { saldoAnteriorCentavos: e.saldoAnteriorCentavos, saldoFinalCentavos: e.saldoFinalCentavos, entradasCentavos: entradas, saidasCentavos: saidas, linhas: e.linhas };
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
