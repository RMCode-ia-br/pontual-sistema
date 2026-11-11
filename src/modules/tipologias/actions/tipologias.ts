"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { ErroNegocio, executar, falha, falhaDeValidacao, formDataParaObjeto, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { registrarAuditoria } from "@/lib/auditoria";
import { extrairIp } from "@/lib/auth/autenticar";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissoes";

import { editarTipologiaSchema, idsSchema, tipologiaSchema } from "../schemas";

const campos = {
  id: true,
  nome: true,
  categoria: true,
  tipoDesenho: true,
  opcoesFolhas: true,
  templateDescricao: true,
  revisarTexto: true,
  cobrancaPadrao: true,
  categoriaMarkup: true,
  exigeEsquadria: true,
  ativo: true,
} as const;

const MENSAGEM_NOME = "Já existe uma tipologia com esse nome.";

function revalidar(id?: string) {
  revalidatePath("/tipologias");
  if (id) revalidatePath(`/tipologias/${id}`);
}

async function conferirNomeLivre(nome: string, ignorarId?: string) {
  const existente = await prisma.tipologia.findFirst({
    where: { deletadoEm: null, nome: { equals: nome, mode: "insensitive" }, ...(ignorarId ? { id: { not: ignorarId } } : {}) },
    select: { id: true },
  });
  if (existente) throw new ErroNegocio(MENSAGEM_NOME, { nome: MENSAGEM_NOME });
}

export async function criarTipologia(_anterior: ResultadoAcao<{ id: string }> | null, formData: FormData): Promise<ResultadoAcao<{ id: string }>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "criar", "tipologia")) return falha("Sem permissão.");
  const dados = tipologiaSchema.safeParse(formDataParaObjeto(formData));
  if (!dados.success) return falhaDeValidacao(dados.error);
  const v = dados.data;

  return executar(
    "tipologias.criar",
    async () => {
      await conferirNomeLivre(v.nome);
      const ip = extrairIp(await headers());
      const ultima = await prisma.tipologia.aggregate({ where: { deletadoEm: null }, _max: { ordem: true } });
      const criada = await prisma.$transaction(async (tx) => {
        const nova = await tx.tipologia.create({
          data: { ...v, ordem: (ultima._max.ordem ?? 0) + 1, criadoPorId: sessao.id, atualizadoPorId: sessao.id },
          select: campos,
        });
        await registrarAuditoria(tx, { usuario: sessao, entidade: "Tipologia", entidadeId: nova.id, acao: "CRIAR", depois: nova, ip });
        return nova;
      });
      revalidar();
      return sucesso({ id: criada.id }, "Tipologia criada. Agora cadastre a composição e os preços.");
    },
    MENSAGEM_NOME,
  );
}

export async function editarTipologia(_anterior: ResultadoAcao<{ id: string }> | null, formData: FormData): Promise<ResultadoAcao<{ id: string }>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "tipologia")) return falha("Sem permissão.");
  const dados = editarTipologiaSchema.safeParse(formDataParaObjeto(formData));
  if (!dados.success) return falhaDeValidacao(dados.error);
  const { id, ...v } = dados.data;

  return executar(
    "tipologias.editar",
    async () => {
      await conferirNomeLivre(v.nome, id);
      const ip = extrairIp(await headers());
      await prisma.$transaction(async (tx) => {
        const antes = await tx.tipologia.findFirst({ where: { id, deletadoEm: null }, select: campos });
        if (!antes) throw new ErroNegocio("Tipologia não encontrada.");
        const depois = await tx.tipologia.update({ where: { id }, data: { ...v, atualizadoPorId: sessao.id }, select: campos });
        await registrarAuditoria(tx, { usuario: sessao, entidade: "Tipologia", entidadeId: id, acao: "ATUALIZAR", antes, depois, ip });
      });
      revalidar(id);
      return sucesso({ id }, "Tipologia atualizada.");
    },
    MENSAGEM_NOME,
  );
}

async function mudarSituacao(idsBrutos: string[], ativo: boolean): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "tipologia")) return falha("Sem permissão.");
  const ids = idsSchema.safeParse(idsBrutos);
  if (!ids.success) return falha(ids.error.issues[0]?.message ?? "Seleção inválida.");

  return executar("tipologias.situacao", async () => {
    const ip = extrairIp(await headers());
    const alterados = await prisma.$transaction(async (tx) => {
      const alvos = await tx.tipologia.findMany({ where: { id: { in: ids.data }, deletadoEm: null, ativo: !ativo }, select: { id: true, ativo: true } });
      for (const antes of alvos) {
        await tx.tipologia.update({ where: { id: antes.id }, data: { ativo, atualizadoPorId: sessao.id } });
        await registrarAuditoria(tx, { usuario: sessao, entidade: "Tipologia", entidadeId: antes.id, acao: ativo ? "REATIVAR" : "INATIVAR", antes: { ativo: antes.ativo }, depois: { ativo }, ip });
      }
      return alvos.length;
    });
    revalidar();
    if (alterados === 0) return sucesso(undefined, "Nada a alterar.");
    return sucesso(undefined, ativo ? "Tipologia reativada." : "Tipologia inativada. Propostas já feitas continuam como estão.");
  });
}

export async function inativarTipologias(ids: string[]): Promise<ResultadoAcao> {
  return mudarSituacao(ids, false);
}

export async function reativarTipologias(ids: string[]): Promise<ResultadoAcao> {
  return mudarSituacao(ids, true);
}

/** Exclusão lógica. Recusada enquanto houver item de proposta usando a tipologia (o histórico das propostas depende dela). */
export async function excluirTipologias(idsBrutos: string[]): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "excluir", "tipologia")) return falha("Sem permissão.");
  const ids = idsSchema.safeParse(idsBrutos);
  if (!ids.success) return falha(ids.error.issues[0]?.message ?? "Seleção inválida.");

  return executar("tipologias.excluir", async () => {
    const ip = extrairIp(await headers());
    const emUso = await prisma.itemProposta.count({ where: { tipologiaId: { in: ids.data }, deletadoEm: null } });
    if (emUso > 0) throw new ErroNegocio("Esta tipologia já está em propostas. Inative-a em vez de excluir.");
    const removidos = await prisma.$transaction(async (tx) => {
      const alvos = await tx.tipologia.findMany({ where: { id: { in: ids.data }, deletadoEm: null }, select: campos });
      for (const antes of alvos) {
        await tx.tipologia.update({ where: { id: antes.id }, data: { deletadoEm: new Date(), atualizadoPorId: sessao.id } });
        await registrarAuditoria(tx, { usuario: sessao, entidade: "Tipologia", entidadeId: antes.id, acao: "EXCLUIR", antes, ip });
      }
      return alvos.length;
    });
    revalidar();
    return sucesso(undefined, removidos === 0 ? "Nada a remover." : "Tipologia enviada para a lixeira.");
  });
}
