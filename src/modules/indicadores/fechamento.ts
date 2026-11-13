import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { mediaDeDias, taxaDeFechamento } from "@/lib/dominio/indicadores";
import { limitesEmInstantes, somarDias, type Periodo } from "@/lib/periodo";

/**
 * Taxa de fechamento = projetos APROVADOS ÷ (aprovados + PERDIDOS que tiveram proposta enviada), pela data da DECISÃO
 * (a primeira aprovação ou a perda), numa janela de 90 dias que termina no fim do período escolhido (ou em hoje, se o
 * período ainda não acabou). Tempo visita → proposta = data de envio da primeira proposta − data da primeira visita
 * realizada (decisão 116).
 */

export const DIAS_DA_JANELA_DE_FECHAMENTO = 90;

/** A janela de 90 dias da taxa: termina no fim do período, sem passar de hoje. */
export function janelaDeFechamento(p: Periodo, hoje: string): Periodo {
  const fim = p.de <= hoje && p.ate > hoje ? hoje : p.ate;
  return { de: somarDias(fim, -(DIAS_DA_JANELA_DE_FECHAMENTO - 1)), ate: fim };
}

/** Projetos aprovados na janela (data da primeira aprovação). Cancelados depois não contam como ganhos. */
export function ondeAprovados(j: Periodo): Prisma.ProjetoWhereInput {
  const { inicio, fimExclusivo } = limitesEmInstantes(j);
  return { deletadoEm: null, status: { in: ["APROVADO", "EM_EXECUCAO", "CONCLUIDO"] }, dataFechamento: { gte: inicio, lt: fimExclusivo } };
}

/** Projetos perdidos na janela que tiveram proposta enviada (perder antes de propor não entra na taxa). */
export function ondePerdidos(j: Periodo): Prisma.ProjetoWhereInput {
  const { inicio, fimExclusivo } = limitesEmInstantes(j);
  return { deletadoEm: null, status: "PERDIDO", perdidoEm: { gte: inicio, lt: fimExclusivo }, propostas: { some: { enviadaEm: { not: null }, deletadoEm: null } } };
}

export type Fechamento = { janela: Periodo; aprovados: number; perdidos: number; taxaPercentual: number | null };

export async function fechamentoNaJanela(j: Periodo): Promise<Fechamento> {
  const [aprovados, perdidos] = await Promise.all([prisma.projeto.count({ where: ondeAprovados(j) }), prisma.projeto.count({ where: ondePerdidos(j) })]);
  return { janela: j, aprovados, perdidos, taxaPercentual: taxaDeFechamento(aprovados, perdidos) };
}

export type DecisaoDeProjeto = { id: string; codigo: string; titulo: string; cliente: string; resultado: "APROVADO" | "PERDIDO"; decididoEm: Date; valorCentavos: number | null };

export const LIMITE_DE_DECISOES = 500;

/** A lista que explica a taxa: cada projeto decidido na janela. */
export async function listarDecisoes(j: Periodo): Promise<{ linhas: DecisaoDeProjeto[]; truncado: boolean }> {
  const selecao = { id: true, codigo: true, titulo: true, dataFechamento: true, perdidoEm: true, valorFechadoCentavos: true, cliente: { select: { nome: true } } } as const;
  const [aprovados, perdidos] = await Promise.all([
    prisma.projeto.findMany({ where: ondeAprovados(j), orderBy: [{ dataFechamento: "desc" }, { id: "asc" }], take: LIMITE_DE_DECISOES + 1, select: selecao }),
    prisma.projeto.findMany({ where: ondePerdidos(j), orderBy: [{ perdidoEm: "desc" }, { id: "asc" }], take: LIMITE_DE_DECISOES + 1, select: selecao }),
  ]);
  const todas: DecisaoDeProjeto[] = [
    ...aprovados.map((x) => ({ id: x.id, codigo: x.codigo, titulo: x.titulo, cliente: x.cliente.nome, resultado: "APROVADO" as const, decididoEm: x.dataFechamento!, valorCentavos: x.valorFechadoCentavos })),
    ...perdidos.map((x) => ({ id: x.id, codigo: x.codigo, titulo: x.titulo, cliente: x.cliente.nome, resultado: "PERDIDO" as const, decididoEm: x.perdidoEm!, valorCentavos: null })),
  ].sort((a, b) => b.decididoEm.getTime() - a.decididoEm.getTime());
  return { truncado: aprovados.length > LIMITE_DE_DECISOES || perdidos.length > LIMITE_DE_DECISOES, linhas: todas.slice(0, LIMITE_DE_DECISOES) };
}

export type VisitaAteProposta = { projetoId: string; codigo: string; titulo: string; cliente: string; visitaEm: Date; propostaEnviadaEm: Date; dias: number };

type LinhaDoSql = { projetoId: string; codigo: string; titulo: string; cliente: string; visitaEm: Date; enviadaEm: Date; dias: number };

/**
 * Projetos cuja PRIMEIRA proposta foi enviada no período e que tiveram visita realizada: dias entre a primeira visita
 * realizada e o envio (em datas de São Paulo; nunca negativo: proposta enviada antes da visita registrada conta 0).
 */
export async function tempoVisitaAteProposta(p: Periodo): Promise<{ mediaDeDias: number | null; amostra: number; linhas: VisitaAteProposta[] }> {
  const { inicio, fimExclusivo } = limitesEmInstantes(p);
  const linhas = await prisma.$queryRaw<LinhaDoSql[]>`
    WITH env AS (
      SELECT pr."projetoId", min(pr."enviadaEm") AS enviada
        FROM "Proposta" pr WHERE pr."deletadoEm" IS NULL AND pr."enviadaEm" IS NOT NULL GROUP BY pr."projetoId"
    ), vis AS (
      SELECT e."projetoId", min(e."realizadoEm") AS realizada
        FROM "EventoAgenda" e WHERE e.tipo = 'VISITA_TECNICA' AND e."realizadoEm" IS NOT NULL AND e."deletadoEm" IS NULL AND e."projetoId" IS NOT NULL GROUP BY e."projetoId"
    )
    SELECT j.id AS "projetoId", j.codigo, j.titulo, c.nome AS cliente, vis.realizada AS "visitaEm", env.enviada AS "enviadaEm",
           GREATEST(0, ((env.enviada AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')::date - ((vis.realizada AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')::date)::int AS dias
      FROM env
      JOIN vis ON vis."projetoId" = env."projetoId"
      JOIN "Projeto" j ON j.id = env."projetoId" AND j."deletadoEm" IS NULL
      JOIN "Cliente" c ON c.id = j."clienteId"
     WHERE env.enviada >= ${inicio} AND env.enviada < ${fimExclusivo}
     ORDER BY env.enviada DESC, j.id`;
  return {
    mediaDeDias: mediaDeDias(linhas.map((l) => l.dias)),
    amostra: linhas.length,
    linhas: linhas.map((l) => ({ projetoId: l.projetoId, codigo: l.codigo, titulo: l.titulo, cliente: l.cliente, visitaEm: l.visitaEm, propostaEnviadaEm: l.enviadaEm, dias: l.dias })),
  };
}
