import "server-only";

import { prisma } from "@/lib/db";
import { somarDias } from "@/lib/dominio/calendario";
import { resumirPosicao, totalizarPorFornecedor, valorDaLinha, type ResumoDaPosicao, type TotalDoFornecedor } from "@/lib/dominio/relatorio-estoque";
import { dataLocalDoInstante, inputParaData } from "@/lib/formatadores";
import type { ParametrosBrutos } from "@/lib/listas/parametros";
import { saldoDaSucata } from "@/modules/estoque/sucata-base";

import { DIAS_DA_JANELA_PADRAO } from "./funil";

const LIMITE = 5000;
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
};

export async function carregarRelatorioDeEstoque(periodo: PeriodoDeCompras): Promise<RelatorioDeEstoque> {
  const [produtos, retalhos, sucata, recebimentos] = await Promise.all([
    prisma.produto.findMany({
      where: { deletadoEm: null, ativo: true },
      select: { id: true, codigo: true, descricao: true, unidade: true, saldoCache: true, estoqueMinimo: true, custoUnitarioCentavos: true },
      orderBy: { descricao: "asc" },
      take: LIMITE + 1,
    }),
    prisma.retalho.count({ where: { deletadoEm: null, status: "DISPONIVEL" } }),
    saldoDaSucata(prisma),
    prisma.itemRecebimento.findMany({
      where: { deletadoEm: null, recebimento: { deletadoEm: null, data: { gte: new Date(`${periodo.de}T00:00:00Z`), lte: new Date(`${periodo.ate}T00:00:00Z`) }, compra: { deletadoEm: null } } },
      select: { valorCentavos: true, recebimento: { select: { compraId: true, compra: { select: { fornecedorId: true, fornecedor: { select: { razaoSocial: true, nomeFantasia: true } } } } } } },
      take: LIMITE,
    }),
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
      abaixoDoMinimo: minimo !== null && saldo < minimo,
    };
  });
  const nomes = new Map<string, string>();
  const compras = new Set<string>();
  const porFornecedor = recebimentos.map((r) => {
    const c = r.recebimento.compra;
    nomes.set(c.fornecedorId, c.fornecedor.nomeFantasia ?? c.fornecedor.razaoSocial);
    compras.add(r.recebimento.compraId);
    return { fornecedorId: c.fornecedorId, valorCentavos: r.valorCentavos };
  });
  return {
    posicao: resumirPosicao(linhas.map((l) => ({ saldoMilesimos: l.saldoMilesimos, custoUnitarioCentavos: l.custoUnitarioCentavos, estoqueMinimoMilesimos: l.estoqueMinimoMilesimos }))),
    linhas,
    truncado,
    retalhosDisponiveis: retalhos,
    sucataMilesimosKg: sucata.pesoMilesimosKg,
    sucataComprimentoSemPesoMm: sucata.comprimentoSemPesoMm,
    fornecedores: totalizarPorFornecedor(porFornecedor).map((t) => ({ ...t, nome: nomes.get(t.fornecedorId) ?? "—" })),
    comprasNoPeriodo: compras.size,
  };
}
