"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { ErroNegocio, executar, falha, falhaDeValidacao, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { registrarAuditoria } from "@/lib/auditoria";
import { extrairIp } from "@/lib/auth/autenticar";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissoes";
import { gerarToken, hashDoToken } from "@/lib/tokens";

import { feedSchema, idUnicoSchema } from "../schemas";

/** Quantos links ativos cada usuário pode ter (calendário do celular, do computador, de um colega...). */
const MAXIMO_DE_LINKS = 5;

/**
 * Cria um link assinável (.ics) da agenda. O token em claro só volta aqui, uma vez: depois só existe o hash.
 * Quem tiver o link vê a agenda da empresa (sem valores) e pode ser desligado a qualquer momento.
 */
export async function criarFeedAgenda(entrada: unknown): Promise<ResultadoAcao<{ token: string }>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "criar", "feedAgenda")) return falha("Sem permissão.");
  const lido = feedSchema.safeParse(entrada ?? {});
  if (!lido.success) return falhaDeValidacao(lido.error);

  return executar("agenda.feed.criar", async () => {
    const ip = extrairIp(await headers());
    const token = gerarToken();
    await prisma.$transaction(async (tx) => {
      const ativos = await tx.feedAgenda.count({ where: { usuarioId: sessao.id, revogadoEm: null, deletadoEm: null } });
      if (ativos >= MAXIMO_DE_LINKS) throw new ErroNegocio(`Você já tem ${MAXIMO_DE_LINKS} links ativos. Desligue um que não usa mais para criar outro.`);
      const feed = await tx.feedAgenda.create({
        data: { usuarioId: sessao.id, nome: lido.data.nome ?? null, tokenHash: hashDoToken(token), criadoPorId: sessao.id, atualizadoPorId: sessao.id },
        select: { id: true, nome: true },
      });
      // O token nunca vai para a auditoria.
      await registrarAuditoria(tx, { usuario: sessao, entidade: "FeedAgenda", entidadeId: feed.id, acao: "CRIAR", depois: { nome: feed.nome }, ip });
    });
    revalidatePath("/agenda");
    return sucesso({ token }, "Link criado. Copie agora: ele não será mostrado de novo.");
  });
}

/** Desliga um link: quem o tinha deixa de receber a agenda na próxima atualização do calendário. */
export async function revogarFeedAgenda(idBruto: string): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "excluir", "feedAgenda")) return falha("Sem permissão.");
  const id = idUnicoSchema.safeParse(idBruto);
  if (!id.success) return falha("Link inválido.");

  return executar("agenda.feed.revogar", async () => {
    const ip = extrairIp(await headers());
    await prisma.$transaction(async (tx) => {
      // Só o dono revoga o próprio link.
      const feed = await tx.feedAgenda.findFirst({ where: { id: id.data, usuarioId: sessao.id, revogadoEm: null, deletadoEm: null }, select: { id: true, nome: true } });
      if (!feed) throw new ErroNegocio("Link não encontrado.");
      await tx.feedAgenda.update({ where: { id: feed.id }, data: { revogadoEm: new Date(), atualizadoPorId: sessao.id } });
      await registrarAuditoria(tx, { usuario: sessao, entidade: "FeedAgenda", entidadeId: feed.id, acao: "REVOGAR", antes: { nome: feed.nome }, ip });
    });
    revalidatePath("/agenda");
    return sucesso(undefined, "Link desligado.");
  });
}
