import "server-only";

import { prisma } from "@/lib/db";

import type { TelaComFiltroSalvo } from "./schemas";

export type FiltroSalvoItem = { id: string; nome: string; consulta: string };

export async function listarFiltrosSalvos(usuarioId: string, tela: TelaComFiltroSalvo): Promise<FiltroSalvoItem[]> {
  return prisma.filtroSalvo.findMany({
    where: { usuarioId, tela, deletadoEm: null },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, consulta: true },
  });
}
