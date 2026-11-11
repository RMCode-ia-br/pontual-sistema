"use server";

import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";

export type NotificacaoItem = {
  id: string;
  titulo: string;
  texto: string | null;
  link: string | null;
  lida: boolean;
  criadoEm: string;
};

/** Notificações do usuário (as dele e as para todos). Estado "lida" é compartilhado nas gerais. */
export async function listarNotificacoes(): Promise<NotificacaoItem[]> {
  const usuario = await exigirSessao();
  const itens = await prisma.notificacao.findMany({
    where: { OR: [{ usuarioId: usuario.id }, { usuarioId: null }] },
    orderBy: { criadoEm: "desc" },
    take: 20,
  });
  return itens.map((n) => ({ ...n, criadoEm: n.criadoEm.toISOString() }));
}

export async function marcarNotificacoesComoLidas(): Promise<void> {
  const usuario = await exigirSessao();
  await prisma.notificacao.updateMany({
    where: { lida: false, OR: [{ usuarioId: usuario.id }, { usuarioId: null }] },
    data: { lida: true },
  });
}
