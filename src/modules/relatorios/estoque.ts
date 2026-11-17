import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { somarDias } from "@/lib/dominio/calendario";
import { resumirPosicao, valorDaLinha, type ResumoDaPosicao, type TotalDoFornecedor } from "@/lib/dominio/relatorio-estoque";
import { dataLocalDoInstante, inputParaData } from "@/lib/formatadores";
import type { ParametrosBrutos } from "@/lib/listas/parametros";
import { saldoDaSucata } from "@/modules/estoque/sucata-base";

import { DIAS_DA_JANELA_PADRAO } from "./funil";

const LIMITE = 5000;
/** Fornecedores listados em "compras por fornecedor"; passou disso, a tela avisa que cortou. */
export const LIMITE_DE_FORNECEDORES = 500;
const milesimos = (d: { toString(): string } | null) => (d === null ? null : Math.round(Number(d.toString()) * 1000));
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export type PeriodoDeCompras = { de: string; ate: string };

/** Período da URL (dado não confiável) para "compras por fornecedor"; sem ele, os últimos 90 dias como os demais relatórios. */
export function lerPeriodoDoRelatorioDeEstoque(brutos: ParametrosBrutos, agora: Date = new Date()): PeriodoDeCompras {
  const ateBruto = um(brutos.ate);
  const deBruto = um(brutos.de);
  const ate = ateBruto && inputParaData(ateBruto) ? ateBruto : dataLocalDoInstante(agora);
  const de = deBruto && inputParaData(deBruto) ? deBruto : somarDias(ate, -(DIAS_DA_JANELA_PADRAO - 1));
  return { de: de <= ate ? de : ate, ate };
}

export type LinhaDoEstoque = {
  id: string;
  codigo: string;
  descricao: string;
  unidade: string;
  saldoMilesimos: number;
  estoqueMinimoMilesimos: number | null;
  custoUnitarioCentavos: number | null;
  /** `null` = sem custo (ou saldo não positivo): nunca zero. */
  valorCentavos: number | null;
  abaixoDoMinimo: boolean;
  /** Produto inativo que ainda tem saldo: o saldo vale dinheiro, então entra no valor, marcado "inativo". */
  ativo: boolean;
};

export type RelatorioDeEstoque = {
  posicao: ResumoDaPosicao;
  linhas: LinhaDoEstoque[];
  truncado: boolean;
  retalhosDisponiveis: number;
  sucataMilesimosKg: number;
  sucataComprimentoSemPesoMm: number;
  fornecedores: (TotalDoFornecedor & { nome: string })[];
  comprasNoPeriodo: number;
  /** Havia mais fornecedores do que o limite: a lista foi cortada. */
  fornecedoresTruncado: boolean;
  /** Produtos inativos com saldo (entram no valor do estoque). */
  inativosComSaldo: number;
};

export async function carregarRelatorioDeEstoque(periodo: PeriodoDeCompras): Promise<RelatorioDeEstoque> {
  const [produtos, retalhos, sucata, recebimentos] = await Promise.all([
    prisma.produto.findMany({
      // Ativos, e também os inativos que ainda têm saldo (o estoque físico existe e vale dinheiro).
      where: { deletadoEm: null, OR: [{ ativo: true }, { saldoCache: { not: 0 } }] },
      select: { id: true, codigo: true, descricao: true, unidade: true, ativo: true, saldoCache: true, estoqueMinimo: true, custoUnitarioCentavos: true },
      orderBy: { descricao: "asc" },
      take: LIMITE + 1,
    }),
    prisma.retalho.count({ where: { deletadoEm: null, status: "DISPONIVEL" } }),
    saldoDaSucata(prisma),
    totaisPorFornecedor(periodo),
  ]);
  const truncado = produtos.length > LIMITE;
  const lista = produtos.slice(0, LIMITE);
  const linhas: LinhaDoEstoque[] = lista.map((p) => {
    const saldo = milesimos(p.saldoCache) ?? 0;
    const minimo = milesimos(p.estoqueMinimo);
    return {
      id: p.id,
      codigo: p.codigo,
      descricao: p.descricao,
      unidade: p.unidade,
      saldoMilesimos: saldo,
      estoqueMinimoMilesimos: minimo,
      custoUnitarioCentavos: p.custoUnitarioCentavos,
      valorCentavos: saldo > 0 && p.custoUnitarioCentavos !== null ? valorDaLinha(saldo, p.custoUnitarioCentavos) : null,
      // Produto inativo não gera alerta de mínimo (saiu de linha), mas o saldo dele continua valendo no estoque.
      abaixoDoMinimo: p.ativo && minimo !== null && saldo < minimo,
      ativo: p.ativo,
    };
  });
  return {
    posicao: resumirPosicao(linhas.map((l) => ({ saldoMilesimos: l.saldoMilesimos, custoUnitarioCentavos: l.custoUnitarioCentavos, estoqueMinimoMilesimos: l.ativo ? l.estoqueMinimoMilesimos : null }))),
    linhas,
    truncado,
    retalhosDisponiveis: retalhos,
    sucataMilesimosKg: sucata.pesoMilesimosKg,
    sucataComprimentoSemPesoMm: sucata.comprimentoSemPesoMm,
    fornecedores: recebimentos.linhas,
    comprasNoPeriodo: recebimentos.compras,
    fornecedoresTruncado: recebimentos.truncado,
    inativosComSaldo: linhas.filter((l) => !l.ativo && l.saldoMilesimos !== 0).length,
  };
}

/** Total recebido por fornecedor no período, somado no banco (sem carregar item por item). Item sem preço conta à parte, nunca como zero. */
async function totaisPorFornecedor(p: PeriodoDeCompras): Promise<{ linhas: (TotalDoFornecedor & { nome: string })[]; compras: number; truncado: boolean }> {
  const base = Prisma.sql`
    FROM "ItemRecebimento" ir
    JOIN "RecebimentoCompra" r ON r.id = ir."recebimentoId" AND r."deletadoEm" IS NULL
    JOIN "Compra" c ON c.id = r."compraId" AND c."deletadoEm" IS NULL
    JOIN "Fornecedor" f ON f.id = c."fornecedorId"
   WHERE ir."deletadoEm" IS NULL AND r.data >= ${p.de}::date AND r.data <= ${p.ate}::date`;
  const [linhas, totais] = await Promise.all([
    prisma.$queryRaw<{ id: string; nome: string; valor: bigint; itens: number; sem_valor: number }[]>`
      SELECT f.id, COALESCE(f."nomeFantasia", f."razaoSocial") AS nome, COALESCE(sum(ir."valorCentavos"), 0)::bigint AS valor,
             count(*)::int AS itens, count(*) FILTER (WHERE ir."valorCentavos" IS NULL)::int AS sem_valor
        ${base} GROUP BY f.id, f."nomeFantasia", f."razaoSocial"
       ORDER BY valor DESC, f.id LIMIT ${LIMITE_DE_FORNECEDORES + 1}`,
    prisma.$queryRaw<{ compras: number }[]>`SELECT count(DISTINCT c.id)::int AS compras ${base}`,
  ]);
  return {
    linhas: linhas.slice(0, LIMITE_DE_FORNECEDORES).map((l) => ({ fornecedorId: l.id, nome: l.nome, valorCentavos: Number(l.valor), itens: l.itens, semValor: l.sem_valor })),
    compras: totais[0]?.compras ?? 0,
    truncado: linhas.length > LIMITE_DE_FORNECEDORES,
  };
}
