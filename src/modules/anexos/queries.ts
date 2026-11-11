import "server-only";

import { prisma } from "@/lib/db";
import type { EntidadeComAnexo } from "@/lib/storage/regras";

export type AnexoItem = {
  id: string;
  nome: string;
  mime: string;
  tamanhoBytes: number;
  categoria: string | null;
  criadoEm: string;
};

export async function listarAnexos(entidadeTipo: EntidadeComAnexo, entidadeId: string, categoria?: string): Promise<AnexoItem[]> {
  const anexos = await prisma.anexo.findMany({
    where: { entidadeTipo, entidadeId, deletadoEm: null, ...(categoria ? { categoria } : {}) },
    orderBy: { criadoEm: "desc" },
    select: { id: true, nome: true, mime: true, tamanhoBytes: true, categoria: true, criadoEm: true },
  });
  return anexos.map((a) => ({ ...a, criadoEm: a.criadoEm.toISOString() }));
}
