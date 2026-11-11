"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { ErroNegocio, executar, falha, falhaDeValidacao, formDataParaObjeto, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { registrarAuditoria } from "@/lib/auditoria";
import { extrairIp } from "@/lib/auth/autenticar";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissoes";

import { editarTarefaSchema, tarefaSchema } from "./schemas";

const idSchema = z.string().min(1).max(64);
const campos = { id: true, titulo: true, descricao: true, vencimento: true, status: true, responsavelId: true, concluidaEm: true } as const;

function revalidar() {
  revalidatePath("/tarefas");
  revalidatePath("/", "layout");
}

/** O responsável precisa ser um usuário ativo existente (nunca confiar em ID vindo do navegador). */
async function conferirResponsavel(responsavelId: string | null | undefined) {
  if (!responsavelId) return;
  const existe = await prisma.usuario.findFirst({ where: { id: responsavelId, ativo: true, deletadoEm: null }, select: { id: true } });
  if (!existe) throw new ErroNegocio("O responsável escolhido não está disponível.", { responsavelId: "Escolha um usuário ativo." });
}

export async function criarTarefa(_anterior: ResultadoAcao<{ id: string }> | null, formData: FormData): Promise<ResultadoAcao<{ id: string }>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "criar", "tarefa")) return falha("Sem permissão.");

  const dados = tarefaSchema.safeParse(formDataParaObjeto(formData));
  if (!dados.success) return falhaDeValidacao(dados.error);

  return executar("tarefas.criar", async () => {
    await conferirResponsavel(dados.data.responsavelId);
    const ip = extrairIp(await headers());
    const criada = await prisma.$transaction(async (tx) => {
      const nova = await tx.tarefa.create({
        data: {
          titulo: dados.data.titulo,
          descricao: dados.data.descricao ?? null,
          vencimento: dados.data.vencimento ?? null,
          responsavelId: dados.data.responsavelId ?? null,
          criadoPorId: sessao.id,
          atualizadoPorId: sessao.id,
        },
        select: campos,
      });
      await registrarAuditoria(tx, { usuario: sessao, entidade: "Tarefa", entidadeId: nova.id, acao: "CRIAR", depois: nova, ip });
      return nova;
    });
    revalidar();
    return sucesso({ id: criada.id }, "Tarefa criada.");
  });
}

export async function editarTarefa(_anterior: ResultadoAcao | null, formData: FormData): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "tarefa")) return falha("Sem permissão.");

  const dados = editarTarefaSchema.safeParse(formDataParaObjeto(formData));
  if (!dados.success) return falhaDeValidacao(dados.error);

  return executar("tarefas.editar", async () => {
    await conferirResponsavel(dados.data.responsavelId);
    const ip = extrairIp(await headers());
    await prisma.$transaction(async (tx) => {
      const antes = await tx.tarefa.findFirst({ where: { id: dados.data.id, deletadoEm: null }, select: campos });
      if (!antes) throw new ErroNegocio("Tarefa não encontrada.");
      const depois = await tx.tarefa.update({
        where: { id: antes.id },
        data: {
          titulo: dados.data.titulo,
          descricao: dados.data.descricao ?? null,
          vencimento: dados.data.vencimento ?? null,
          responsavelId: dados.data.responsavelId ?? null,
          atualizadoPorId: sessao.id,
        },
        select: campos,
      });
      await registrarAuditoria(tx, { usuario: sessao, entidade: "Tarefa", entidadeId: antes.id, acao: "ATUALIZAR", antes, depois, ip });
    });
    revalidar();
    return sucesso(undefined, "Tarefa atualizada.");
  });
}

async function mudarStatus(idBruto: string, concluir: boolean): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "tarefa")) return falha("Sem permissão.");
  const id = idSchema.safeParse(idBruto);
  if (!id.success) return falha("Tarefa inválida.");

  return executar("tarefas.status", async () => {
    const ip = extrairIp(await headers());
    await prisma.$transaction(async (tx) => {
      const antes = await tx.tarefa.findFirst({ where: { id: id.data, deletadoEm: null }, select: campos });
      if (!antes) throw new ErroNegocio("Tarefa não encontrada.");
      if ((antes.status === "CONCLUIDA") === concluir) return;
      const depois = await tx.tarefa.update({
        where: { id: antes.id },
        data: { status: concluir ? "CONCLUIDA" : "ABERTA", concluidaEm: concluir ? new Date() : null, atualizadoPorId: sessao.id },
        select: campos,
      });
      await registrarAuditoria(tx, {
        usuario: sessao,
        entidade: "Tarefa",
        entidadeId: antes.id,
        acao: concluir ? "CONCLUIR" : "REABRIR",
        antes,
        depois,
        ip,
      });
    });
    revalidar();
    return sucesso(undefined, concluir ? "Tarefa concluída." : "Tarefa reaberta.");
  });
}

export async function concluirTarefa(id: string): Promise<ResultadoAcao> {
  return mudarStatus(id, true);
}

export async function reabrirTarefa(id: string): Promise<ResultadoAcao> {
  return mudarStatus(id, false);
}

export async function excluirTarefa(idBruto: string): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "excluir", "tarefa")) return falha("Sem permissão.");
  const id = idSchema.safeParse(idBruto);
  if (!id.success) return falha("Tarefa inválida.");

  return executar("tarefas.excluir", async () => {
    const ip = extrairIp(await headers());
    await prisma.$transaction(async (tx) => {
      const antes = await tx.tarefa.findFirst({ where: { id: id.data, deletadoEm: null }, select: campos });
      if (!antes) throw new ErroNegocio("Tarefa não encontrada.");
      await tx.tarefa.update({ where: { id: antes.id }, data: { deletadoEm: new Date(), atualizadoPorId: sessao.id } });
      await registrarAuditoria(tx, { usuario: sessao, entidade: "Tarefa", entidadeId: antes.id, acao: "EXCLUIR", antes, ip });
    });
    revalidar();
    return sucesso(undefined, "Tarefa removida.");
  });
}
