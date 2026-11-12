import "server-only";

import { prisma } from "@/lib/db";
import type { GrupoDreChave, MovimentoParaDre } from "@/lib/dominio/dre";
import { mesesDoPeriodo } from "@/lib/dominio/dre";
import { somarMeses, ultimoDiaDoMes } from "@/lib/dominio/parcelamento";

const comoData = (texto: string): Date => new Date(`${texto}T00:00:00Z`);
const comoTexto = (d: Date): string => d.toISOString().slice(0, 10);

export type Regime = "caixa" | "competencia";

export type PeriodoDoDre = { de: string; ate: string; meses: string[]; regime: Regime };

/** Período do DRE a partir da URL: padrão = os 6 últimos meses até o mês de hoje, regime de caixa. Mês futuro é aceito e vem zerado no caixa. */
export function lerPeriodoDoDre(bruto: Record<string, string | string[] | undefined>, hoje: string): PeriodoDoDre {
  const primeiro = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const mes = (v: string | undefined) => (v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : null);
  const mesFinal = mes(primeiro(bruto.ate)) ?? hoje.slice(0, 7);
  const mesInicial = mes(primeiro(bruto.de)) ?? somarMeses(`${mesFinal}-01`, -5).slice(0, 7);
  const [de, ate] = mesInicial <= mesFinal ? [mesInicial, mesFinal] : [mesFinal, mesInicial];
  const meses = mesesDoPeriodo(`${de}-01`, `${ate}-01`);
  const limitado = meses.slice(-36); // no máximo 3 anos por tela
  return { de: limitado[0], ate: limitado[limitado.length - 1], meses: limitado, regime: primeiro(bruto.regime) === "competencia" ? "competencia" : "caixa" };
}

type Categoria = { nome: string; grupo: GrupoDreChave | null };

/**
 * Movimentos do DRE.
 * - CAIXA: lançamentos não estornados, sem transferências, pela data do lançamento.
 * - COMPETÊNCIA: contas a receber (pelo vencimento) e a pagar (pelo mês de competência) não canceladas, com o valor cheio,
 *   mais os lançamentos avulsos (sem conta a receber/pagar). O que aguarda etapa e ainda não tem vencimento fica de fora.
 */
export async function carregarMovimentosDoDre(periodo: PeriodoDoDre): Promise<MovimentoParaDre[]> {
  const inicio = `${periodo.de}-01`;
  const [anoFim, mesFim] = periodo.ate.split("-").map(Number);
  const fim = `${periodo.ate}-${String(ultimoDiaDoMes(anoFim, mesFim)).padStart(2, "0")}`;

  const categorias = await prisma.categoriaFinanceira.findMany({ select: { id: true, nome: true, grupo: true } });
  const porId = new Map<string, Categoria>(categorias.map((c) => [c.id, { nome: c.nome, grupo: c.grupo }]));
  const mov = (data: string, tipo: "ENTRADA" | "SAIDA", valorCentavos: number, categoriaId: string | null): MovimentoParaDre => {
    const c = categoriaId ? porId.get(categoriaId) : undefined;
    return { data, tipo, valorCentavos, grupo: c?.grupo ?? null, categoriaId: c ? categoriaId : null, categoriaNome: c?.nome ?? null };
  };

  const filtroLancamento = { estornadoEm: null, deletadoEm: null, transferenciaId: null, data: { gte: comoData(inicio), lte: comoData(fim) } };

  if (periodo.regime === "caixa") {
    const lancamentos = await prisma.lancamento.findMany({ where: filtroLancamento, select: { data: true, tipo: true, valorCentavos: true, categoriaId: true } });
    return lancamentos.map((l) => mov(comoTexto(l.data), l.tipo, l.valorCentavos, l.categoriaId));
  }

  const [receber, pagar, avulsos, config] = await Promise.all([
    prisma.contaReceber.findMany({
      where: { deletadoEm: null, status: { in: ["ABERTA", "PARCIAL", "PAGA"] }, vencimento: { gte: comoData(inicio), lte: comoData(fim) } },
      select: { vencimento: true, valorCentavos: true, categoriaFinanceiraId: true },
    }),
    prisma.contaPagar.findMany({
      where: { deletadoEm: null, status: { in: ["ABERTA", "PARCIAL", "PAGA"] }, competencia: { gte: comoData(inicio), lte: comoData(fim) } },
      select: { competencia: true, valorCentavos: true, categoriaId: true },
    }),
    prisma.lancamento.findMany({ where: { ...filtroLancamento, contaReceberId: null, contaPagarId: null }, select: { data: true, tipo: true, valorCentavos: true, categoriaId: true } }),
    prisma.configuracaoEmpresa.findUnique({ where: { id: "singleton" }, select: { categoriaReceitaPadraoId: true } }),
  ]);
  const categoriaPadrao = config?.categoriaReceitaPadraoId ?? null;
  return [
    ...receber.map((r) => mov(comoTexto(r.vencimento!), "ENTRADA", r.valorCentavos, r.categoriaFinanceiraId ?? categoriaPadrao)),
    ...pagar.map((p) => mov(comoTexto(p.competencia), "SAIDA", p.valorCentavos, p.categoriaId)),
    ...avulsos.map((l) => mov(comoTexto(l.data), l.tipo, l.valorCentavos, l.categoriaId)),
  ];
}
