import "server-only";

import { prisma } from "@/lib/db";
import type { ItemDoModelo } from "@/lib/dominio/etapas";

export type ModeloDeEtapas = { id: string; nome: string; itens: ItemDoModelo[] };

/** O modelo de etapas padrão com seus itens, na ordem; `null` se a seed ainda não criou. */
export async function obterModeloPadrao(): Promise<ModeloDeEtapas | null> {
  const m = await prisma.modeloEtapas.findFirst({
    where: { padrao: true, deletadoEm: null },
    select: {
      id: true,
      nome: true,
      itens: {
        where: { deletadoEm: null },
        orderBy: { ordem: "asc" },
        select: { tipo: true, nome: true, ordem: true, grupoPrazo: true, peso: true, liberaGatilho: true, marcoGarantia: true, exigeEsquadria: true, ativo: true },
      },
    },
  });
  // O CHECK do banco só deixa os dois gatilhos de etapa gravados.
  return m as ModeloDeEtapas | null;
}
