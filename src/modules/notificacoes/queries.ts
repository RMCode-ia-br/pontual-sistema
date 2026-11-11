import "server-only";

import { prisma } from "@/lib/db";

// Fica fora de actions.ts de propósito: tudo que é exportado de um arquivo "use server"
// vira um endpoint chamável pelo navegador, sem passar pelas checagens da página.
export async function contarNaoLidas(usuarioId: string): Promise<number> {
  return prisma.notificacao.count({ where: { lida: false, OR: [{ usuarioId }, { usuarioId: null }] } });
}
