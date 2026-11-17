import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { ordenarMotivosDePerda, type MotivoDePerda } from "@/lib/dominio/indicadores";
import { limitesEmInstantes, type Periodo } from "@/lib/periodo";
import type { FiltrosProjetos } from "@/modules/projetos/queries";

/**
 * Motivos de perda: UMA fonte para o painel e para o relatório do funil (decisão 130). Conta os projetos PERDIDOS
 * DENTRO do período, pela DATA DA PERDA (`perdidoEm`), de qualquer data de criação, agrupados pelo motivo informado.
 * Não é "os projetos criados no período que hoje estão perdidos": essa conta dava números diferentes na tela inicial e no relatório.
 */
export const DEFINICAO_DOS_MOTIVOS_DE_PERDA =
  "Projetos marcados como perdidos dentro do período (pela data da perda, de qualquer data de criação), agrupados pelo motivo informado. Quem não teve motivo informado aparece como “Sem motivo informado”.";

export type FiltrosDePerda = Pick<FiltrosProjetos, "origem" | "responsavelId" | "porte">;

/** Os projetos perdidos no período (a MESMA cláusula serve a contagem do painel e a do funil). */
export function ondePerdidosNoPeriodo(p: Periodo, filtros: FiltrosDePerda = {}): Prisma.ProjetoWhereInput {
  const { inicio, fimExclusivo } = limitesEmInstantes(p);
  return {
    deletadoEm: null,
    status: "PERDIDO",
    perdidoEm: { gte: inicio, lt: fimExclusivo },
    ...(filtros.responsavelId ? { responsavelId: filtros.responsavelId } : {}),
    ...(filtros.origem ? { origem: filtros.origem } : {}),
    ...(filtros.porte ? { porte: filtros.porte } : {}),
  };
}

export async function motivosDePerdaNoPeriodo(p: Periodo, filtros: FiltrosDePerda = {}): Promise<{ motivos: MotivoDePerda[]; total: number }> {
  const grupos = await prisma.projeto.groupBy({ by: ["motivoPerdaId"], where: ondePerdidosNoPeriodo(p, filtros), _count: { _all: true } });
  const ids = grupos.map((g) => g.motivoPerdaId).filter((i): i is string => !!i);
  const nomes = ids.length ? await prisma.motivoPerda.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } }) : [];
  const nomePorId = new Map(nomes.map((n) => [n.id, n.nome]));
  const motivos = ordenarMotivosDePerda(
    grupos.map((g) => ({ motivoPerdaId: g.motivoPerdaId, nome: g.motivoPerdaId ? (nomePorId.get(g.motivoPerdaId) ?? "Motivo removido") : "Sem motivo informado", quantidade: g._count._all })),
  );
  return { motivos, total: motivos.reduce((s, m) => s + m.quantidade, 0) };
}
