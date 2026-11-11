"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { ErroNegocio, executar, falha, falhaDeValidacao, formDataParaObjeto, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { registrarAuditoria } from "@/lib/auditoria";
import { extrairIp } from "@/lib/auth/autenticar";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissoes";
import { campoIdObrigatorio } from "@/lib/validadores/campos";

import { editarEquipeSchema, equipeSchema, membroSchema } from "../schemas";

const MENSAGEM_NOME = "Já existe uma equipe com esse nome.";
const campos = { id: true, nome: true, descricao: true, ativo: true } as const;

function revalidar(id?: string) {
  revalidatePath("/funcionarios/equipes");
  revalidatePath("/funcionarios");
  if (id) revalidatePath(`/funcionarios/equipes/${id}`);
}

export async function criarEquipe(_anterior: ResultadoAcao<{ id: string }> | null, formData: FormData): Promise<ResultadoAcao<{ id: string }>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "criar", "equipe")) return falha("Sem permissão.");

  const dados = equipeSchema.safeParse(formDataParaObjeto(formData));
  if (!dados.success) return falhaDeValidacao(dados.error);

  return executar(
    "equipes.criar",
    async () => {
      const ip = extrairIp(await headers());
      const criada = await prisma.$transaction(async (tx) => {
        const nova = await tx.equipe.create({
          data: { nome: dados.data.nome, descricao: dados.data.descricao ?? null, ativo: true, criadoPorId: sessao.id, atualizadoPorId: sessao.id },
          select: campos,
        });
        await registrarAuditoria(tx, { usuario: sessao, entidade: "Equipe", entidadeId: nova.id, acao: "CRIAR", depois: nova, ip });
        return nova;
      });
      revalidar();
      return sucesso({ id: criada.id }, "Equipe criada.");
    },
    MENSAGEM_NOME,
  );
}

export async function editarEquipe(_anterior: ResultadoAcao | null, formData: FormData): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "equipe")) return falha("Sem permissão.");

  const dados = editarEquipeSchema.safeParse(formDataParaObjeto(formData));
  if (!dados.success) return falhaDeValidacao(dados.error);

  return executar(
    "equipes.editar",
    async () => {
      const ip = extrairIp(await headers());
      await prisma.$transaction(async (tx) => {
        const antes = await tx.equipe.findFirst({ where: { id: dados.data.id, deletadoEm: null }, select: campos });
        if (!antes) throw new ErroNegocio("Equipe não encontrada.");
        const depois = await tx.equipe.update({
          where: { id: antes.id },
          data: { nome: dados.data.nome, descricao: dados.data.descricao ?? null, ativo: dados.data.ativo, atualizadoPorId: sessao.id },
          select: campos,
        });
        await registrarAuditoria(tx, { usuario: sessao, entidade: "Equipe", entidadeId: antes.id, acao: "ATUALIZAR", antes, depois, ip });
      });
      revalidar(dados.data.id);
      return sucesso(undefined, "Equipe atualizada.");
    },
    MENSAGEM_NOME,
  );
}

/** Exclusão lógica da equipe (lixeira). As pessoas continuam cadastradas. */
export async function excluirEquipe(idBruto: string): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "excluir", "equipe")) return falha("Sem permissão.");
  const id = campoIdObrigatorio("Equipe inválida.").safeParse(idBruto);
  if (!id.success) return falha("Equipe inválida.");

  return executar("equipes.excluir", async () => {
    const ip = extrairIp(await headers());
    await prisma.$transaction(async (tx) => {
      const antes = await tx.equipe.findFirst({ where: { id: id.data, deletadoEm: null }, select: campos });
      if (!antes) throw new ErroNegocio("Equipe não encontrada.");
      await tx.equipe.update({ where: { id: antes.id }, data: { deletadoEm: new Date(), atualizadoPorId: sessao.id } });
      await registrarAuditoria(tx, { usuario: sessao, entidade: "Equipe", entidadeId: antes.id, acao: "EXCLUIR", antes, ip });
    });
    revalidar();
    return sucesso(undefined, "Equipe enviada para a lixeira.");
  });
}

/** Coloca a pessoa na equipe (ou a traz de volta, se já esteve e saiu). */
export async function adicionarMembroDaEquipe(_anterior: ResultadoAcao | null, formData: FormData): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "equipe")) return falha("Sem permissão.");

  const dados = membroSchema.safeParse(formDataParaObjeto(formData));
  if (!dados.success) return falhaDeValidacao(dados.error);
  const { equipeId, funcionarioId, lider } = dados.data;

  return executar("equipes.membro.adicionar", async () => {
    const ip = extrairIp(await headers());
    await prisma.$transaction(async (tx) => {
      const equipe = await tx.equipe.findFirst({ where: { id: equipeId, deletadoEm: null }, select: { id: true } });
      if (!equipe) throw new ErroNegocio("Equipe não encontrada.");
      const funcionario = await tx.funcionario.findFirst({ where: { id: funcionarioId, ativo: true, deletadoEm: null }, select: { id: true } });
      if (!funcionario) throw new ErroNegocio("A pessoa escolhida não está disponível.", { funcionarioId: "Escolha um funcionário ativo." });

      const existente = await tx.equipeMembro.findUnique({ where: { equipeId_funcionarioId: { equipeId, funcionarioId } } });
      if (existente && !existente.deletadoEm) throw new ErroNegocio("Essa pessoa já está na equipe.", { funcionarioId: "Já está na equipe." });

      const membro = existente
        ? await tx.equipeMembro.update({ where: { id: existente.id }, data: { deletadoEm: null, lider, atualizadoPorId: sessao.id } })
        : await tx.equipeMembro.create({ data: { equipeId, funcionarioId, lider, criadoPorId: sessao.id, atualizadoPorId: sessao.id } });
      await registrarAuditoria(tx, { usuario: sessao, entidade: "EquipeMembro", entidadeId: membro.id, acao: "CRIAR", depois: { equipeId, funcionarioId, lider }, ip });
    });
    revalidar(equipeId);
    return sucesso(undefined, "Pessoa adicionada à equipe.");
  });
}

export async function removerMembroDaEquipe(idBruto: string): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "equipe")) return falha("Sem permissão.");
  const id = campoIdObrigatorio("Registro inválido.").safeParse(idBruto);
  if (!id.success) return falha("Registro inválido.");

  return executar("equipes.membro.remover", async () => {
    const ip = extrairIp(await headers());
    const equipeId = await prisma.$transaction(async (tx) => {
      const antes = await tx.equipeMembro.findFirst({ where: { id: id.data, deletadoEm: null }, select: { id: true, equipeId: true, funcionarioId: true, lider: true } });
      if (!antes) throw new ErroNegocio("Essa pessoa não está na equipe.");
      await tx.equipeMembro.update({ where: { id: antes.id }, data: { deletadoEm: new Date(), atualizadoPorId: sessao.id } });
      await registrarAuditoria(tx, { usuario: sessao, entidade: "EquipeMembro", entidadeId: antes.id, acao: "EXCLUIR", antes, ip });
      return antes.equipeId;
    });
    revalidar(equipeId);
    return sucesso(undefined, "Pessoa removida da equipe.");
  });
}

export async function definirLiderDaEquipe(idBruto: string, lider: boolean): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "equipe")) return falha("Sem permissão.");
  const id = campoIdObrigatorio("Registro inválido.").safeParse(idBruto);
  if (!id.success) return falha("Registro inválido.");

  return executar("equipes.membro.lider", async () => {
    const ip = extrairIp(await headers());
    const equipeId = await prisma.$transaction(async (tx) => {
      const antes = await tx.equipeMembro.findFirst({ where: { id: id.data, deletadoEm: null }, select: { id: true, equipeId: true, lider: true } });
      if (!antes) throw new ErroNegocio("Essa pessoa não está na equipe.");
      if (antes.lider === lider) return antes.equipeId;
      await tx.equipeMembro.update({ where: { id: antes.id }, data: { lider: lider === true, atualizadoPorId: sessao.id } });
      await registrarAuditoria(tx, { usuario: sessao, entidade: "EquipeMembro", entidadeId: antes.id, acao: "ATUALIZAR", antes: { lider: antes.lider }, depois: { lider }, ip });
      return antes.equipeId;
    });
    revalidar(equipeId);
    return sucesso(undefined, lider ? "Definido como líder." : "Líder removido.");
  });
}
