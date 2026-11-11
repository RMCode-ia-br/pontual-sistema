"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { ErroNegocio, executar, falha, falhaDeValidacao, formDataParaObjeto, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { registrarAuditoria } from "@/lib/auditoria";
import { extrairIp } from "@/lib/auth/autenticar";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissoes";

import { buscarFornecedorPorCnpj } from "./queries";
import { editarFornecedorSchema, fornecedorSchema, idsSchema } from "./schemas";

const campos = {
  id: true,
  razaoSocial: true,
  nomeFantasia: true,
  cnpj: true,
  vendedorNome: true,
  telefone: true,
  email: true,
  condicoesPagamento: true,
  prazoEntregaDias: true,
  observacoes: true,
  ativo: true,
  categorias: { select: { id: true }, orderBy: { id: "asc" } },
} as const;

function revalidar(id?: string) {
  revalidatePath("/fornecedores");
  if (id) revalidatePath(`/fornecedores/${id}`);
  revalidatePath("/", "layout");
}

/** Formulário com várias caixas de mesmo nome: `formDataParaObjeto` guardaria só a última. */
function lerFormulario(formData: FormData) {
  return { ...formDataParaObjeto(formData), categoriaIds: Array.from(new Set(formData.getAll("categoriaIds").map(String))) };
}

/** Todas as categorias escolhidas precisam existir (nunca confiar em IDs vindos do navegador). */
async function conferirCategorias(ids: string[]) {
  if (ids.length === 0) return;
  const existentes = await prisma.categoriaProduto.count({ where: { id: { in: ids }, deletadoEm: null } });
  if (existentes !== ids.length) throw new ErroNegocio("Alguma categoria escolhida não existe mais. Recarregue a página.", { categoriaIds: "Escolha categorias da lista." });
}

async function conferirCnpj(cnpj: string | undefined, exceto?: string) {
  if (!cnpj) return;
  const outro = await buscarFornecedorPorCnpj(cnpj, exceto);
  if (outro) throw new ErroNegocio(`Já existe um fornecedor com esse CNPJ: ${outro.razaoSocial}.`, { cnpj: `Já cadastrado em ${outro.razaoSocial}.` });
}

export async function criarFornecedor(_anterior: ResultadoAcao<{ id: string }> | null, formData: FormData): Promise<ResultadoAcao<{ id: string }>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "criar", "fornecedor")) return falha("Sem permissão.");

  const dados = fornecedorSchema.safeParse(lerFormulario(formData));
  if (!dados.success) return falhaDeValidacao(dados.error);
  const { categoriaIds, ...valores } = dados.data;

  return executar("fornecedores.criar", async () => {
    await conferirCategorias(categoriaIds);
    await conferirCnpj(valores.cnpj);
    const ip = extrairIp(await headers());
    const criado = await prisma.$transaction(async (tx) => {
      const novo = await tx.fornecedor.create({
        data: {
          razaoSocial: valores.razaoSocial,
          nomeFantasia: valores.nomeFantasia ?? null,
          cnpj: valores.cnpj ?? null,
          vendedorNome: valores.vendedorNome ?? null,
          telefone: valores.telefone ?? null,
          email: valores.email ?? null,
          condicoesPagamento: valores.condicoesPagamento ?? null,
          prazoEntregaDias: valores.prazoEntregaDias ?? null,
          observacoes: valores.observacoes ?? null,
          categorias: { connect: categoriaIds.map((id) => ({ id })) },
          criadoPorId: sessao.id,
          atualizadoPorId: sessao.id,
        },
        select: campos,
      });
      await registrarAuditoria(tx, { usuario: sessao, entidade: "Fornecedor", entidadeId: novo.id, acao: "CRIAR", depois: novo, ip });
      return novo;
    });
    revalidar();
    return sucesso({ id: criado.id }, "Fornecedor cadastrado.");
  });
}

export async function editarFornecedor(_anterior: ResultadoAcao<{ id: string }> | null, formData: FormData): Promise<ResultadoAcao<{ id: string }>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "fornecedor")) return falha("Sem permissão.");

  const dados = editarFornecedorSchema.safeParse(lerFormulario(formData));
  if (!dados.success) return falhaDeValidacao(dados.error);
  const { id, categoriaIds, ...valores } = dados.data;

  return executar("fornecedores.editar", async () => {
    await conferirCategorias(categoriaIds);
    await conferirCnpj(valores.cnpj, id);
    const ip = extrairIp(await headers());
    await prisma.$transaction(async (tx) => {
      const antes = await tx.fornecedor.findFirst({ where: { id, deletadoEm: null }, select: campos });
      if (!antes) throw new ErroNegocio("Fornecedor não encontrado.");
      const depois = await tx.fornecedor.update({
        where: { id },
        data: {
          razaoSocial: valores.razaoSocial,
          nomeFantasia: valores.nomeFantasia ?? null,
          cnpj: valores.cnpj ?? null,
          vendedorNome: valores.vendedorNome ?? null,
          telefone: valores.telefone ?? null,
          email: valores.email ?? null,
          condicoesPagamento: valores.condicoesPagamento ?? null,
          prazoEntregaDias: valores.prazoEntregaDias ?? null,
          observacoes: valores.observacoes ?? null,
          categorias: { set: categoriaIds.map((c) => ({ id: c })) },
          atualizadoPorId: sessao.id,
        },
        select: campos,
      });
      await registrarAuditoria(tx, { usuario: sessao, entidade: "Fornecedor", entidadeId: id, acao: "ATUALIZAR", antes, depois, ip });
    });
    revalidar(id);
    return sucesso({ id }, "Fornecedor atualizado.");
  });
}

async function mudarSituacao(idsBrutos: string[], ativo: boolean): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "fornecedor")) return falha("Sem permissão.");
  const ids = idsSchema.safeParse(idsBrutos);
  if (!ids.success) return falha(ids.error.issues[0]?.message ?? "Seleção inválida.");

  return executar("fornecedores.situacao", async () => {
    const ip = extrairIp(await headers());
    const alterados = await prisma.$transaction(async (tx) => {
      const alvos = await tx.fornecedor.findMany({ where: { id: { in: ids.data }, deletadoEm: null, ativo: !ativo }, select: { id: true, ativo: true } });
      for (const antes of alvos) {
        await tx.fornecedor.update({ where: { id: antes.id }, data: { ativo, atualizadoPorId: sessao.id } });
        await registrarAuditoria(tx, { usuario: sessao, entidade: "Fornecedor", entidadeId: antes.id, acao: ativo ? "REATIVAR" : "INATIVAR", antes: { ativo: antes.ativo }, depois: { ativo }, ip });
      }
      return alvos.length;
    });
    revalidar();
    if (alterados === 0) return sucesso(undefined, "Nada a alterar.");
    return sucesso(undefined, `${alterados} ${alterados === 1 ? "fornecedor" : "fornecedores"} ${ativo ? "reativado" : "inativado"}${alterados === 1 ? "" : "s"}.`);
  });
}

export async function inativarFornecedores(ids: string[]): Promise<ResultadoAcao> {
  return mudarSituacao(ids, false);
}

export async function reativarFornecedores(ids: string[]): Promise<ResultadoAcao> {
  return mudarSituacao(ids, true);
}

/** Exclusão lógica (lixeira). Produtos que apontam para o fornecedor continuam existindo. */
export async function excluirFornecedores(idsBrutos: string[]): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "excluir", "fornecedor")) return falha("Sem permissão.");
  const ids = idsSchema.safeParse(idsBrutos);
  if (!ids.success) return falha(ids.error.issues[0]?.message ?? "Seleção inválida.");

  return executar("fornecedores.excluir", async () => {
    const ip = extrairIp(await headers());
    const removidos = await prisma.$transaction(async (tx) => {
      const alvos = await tx.fornecedor.findMany({ where: { id: { in: ids.data }, deletadoEm: null }, select: campos });
      for (const antes of alvos) {
        await tx.fornecedor.update({ where: { id: antes.id }, data: { deletadoEm: new Date(), atualizadoPorId: sessao.id } });
        await registrarAuditoria(tx, { usuario: sessao, entidade: "Fornecedor", entidadeId: antes.id, acao: "EXCLUIR", antes, ip });
      }
      return alvos.length;
    });
    revalidar();
    if (removidos === 0) return sucesso(undefined, "Nada a remover.");
    return sucesso(undefined, `${removidos} ${removidos === 1 ? "fornecedor enviado" : "fornecedores enviados"} para a lixeira.`);
  });
}
