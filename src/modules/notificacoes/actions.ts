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
  // Só os campos que a tela usa: nada de usuarioId, chaveUnica ou outros campos internos para o navegador.
  return itens.map((n) => ({ id: n.id, titulo: n.titulo, texto: n.texto, link: n.link, lida: n.lida, criadoEm: n.criadoEm.toISOString() }));
}

export async function marcarNotificacoesComoLidas(): Promise<void> {
  const usuario = await exigirSessao();
  await prisma.notificacao.updateMany({
    where: { lida: false, OR: [{ usuarioId: usuario.id }, { usuarioId: null }] },
    data: { lida: true },
  });
}
