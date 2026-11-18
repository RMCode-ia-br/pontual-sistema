import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { curvaAbc, variacaoDeCusto, type CortesAbc, type LinhaDaCurva } from "@/lib/dominio/relatorio-estoque";

import type { PeriodoDeCompras } from "./estoque";

/**
 * Análises de estoque por período (Fase 7B, Bloco 7): curva ABC das saídas e variação de custo dos insumos. Datas dos
 * movimentos são datas de calendário (`@db.Date`); as do histórico de preço são instantes (horário de São Paulo).
 */

export const LIMITE_DE_LINHAS_DE_ESTOQUE = 1000;
const num = (v: unknown) => Number(v ?? 0);

export type ProdutoDaCurva = { produtoId: string; codigo: string; descricao: string; unidade: string; quantidadeMilesimos: number };
export type CurvaDeSaidas = { linhas: LinhaDaCurva<ProdutoDaCurva>[]; totalCentavos: number; semCusto: number; semCustoProdutos: number };

/**
 * Valor das saídas para obra no período (saída − devolução − estorno, ao custo congelado de cada movimento), por produto.
 * Movimento sem custo não entra no valor (nunca zero): é contado à parte.
 */
export async function curvaAbcDeSaidas(p: PeriodoDeCompras, cortes: CortesAbc): Promise<CurvaDeSaidas> {
  const linhas = await prisma.$queryRaw<{ id: string; codigo: string; descricao: string; unidade: string; qtd: Prisma.Decimal; valor: bigint; sem_custo: number }[]>`
    SELECT p.id, p.codigo, p.descricao, p.unidade::text AS unidade,
           -sum(m.quantidade) AS qtd,
           COALESCE(-sum(round(m.quantidade * m."custoUnitarioCentavos")) FILTER (WHERE m."custoUnitarioCentavos" IS NOT NULL), 0)::bigint AS valor,
           count(*) FILTER (WHERE m."custoUnitarioCentavos" IS NULL)::int AS sem_custo
      FROM "MovimentoEstoque" m JOIN "Produto" p ON p.id = m."produtoId"
     WHERE m."deletadoEm" IS NULL AND (m.tipo IN ('SAIDA_OBRA', 'DEVOLUCAO') OR (m.tipo = 'AJUSTE' AND m."estornoDeId" IS NOT NULL AND m."projetoId" IS NOT NULL)) AND m.data >= ${p.de}::date AND m.data <= ${p.ate}::date
     GROUP BY p.id, p.codigo, p.descricao, p.unidade`;
  const curva = curvaAbc(linhas.map((l) => ({ produtoId: l.id, codigo: l.codigo, descricao: l.descricao, unidade: l.unidade, quantidadeMilesimos: Math.round(Number(l.qtd) * 1000), valorCentavos: num(l.valor) })), cortes);
  return { ...curva, semCusto: linhas.reduce((s, l) => s + l.sem_custo, 0), semCustoProdutos: linhas.filter((l) => l.sem_custo > 0).length };
}

export type VariacaoDeCusto = { produtoId: string; codigo: string; descricao: string; ativo: boolean; custoInicialCentavos: number | null; custoFinalCentavos: number; variacaoPercentual: number | null; mudancas: number };

/**
 * Produtos cujo custo mudou no período (histórico de preços): custo no começo (o "custo anterior" da primeira mudança),
 * custo no fim (o "novo" da última) e a variação. Primeira informação de custo (sem anterior) mostra "sem base", nunca um percentual inventado.
 */
export async function variacaoDeCustoDosInsumos(p: PeriodoDeCompras): Promise<{ linhas: VariacaoDeCusto[]; truncado: boolean }> {
  const linhas = await prisma.$queryRaw<{ id: string; codigo: string; descricao: string; ativo: boolean; inicial: number | null; final: number; mudancas: number }[]>`
    SELECT p.id, p.codigo, p.descricao, p.ativo,
           (array_agg(h."custoAnteriorCentavos" ORDER BY h."criadoEm" ASC, h.id ASC))[1] AS inicial,
           (array_agg(h."custoNovoCentavos" ORDER BY h."criadoEm" DESC, h.id DESC))[1] AS final,
           count(*)::int AS mudancas
      FROM "HistoricoPreco" h JOIN "Produto" p ON p.id = h."produtoId"
     WHERE h."deletadoEm" IS NULL AND p."deletadoEm" IS NULL
       AND ((h."criadoEm" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN ${p.de}::date AND ${p.ate}::date
     GROUP BY p.id, p.codigo, p.descricao, p.ativo
     ORDER BY p.descricao
     LIMIT ${LIMITE_DE_LINHAS_DE_ESTOQUE + 1}`;
  const todas = linhas.map((l): VariacaoDeCusto => ({ produtoId: l.id, codigo: l.codigo, descricao: l.descricao, ativo: l.ativo, custoInicialCentavos: l.inicial, custoFinalCentavos: l.final, variacaoPercentual: variacaoDeCusto(l.inicial, l.final), mudancas: l.mudancas }));
  return { linhas: todas.slice(0, LIMITE_DE_LINHAS_DE_ESTOQUE), truncado: todas.length > LIMITE_DE_LINHAS_DE_ESTOQUE };
}
