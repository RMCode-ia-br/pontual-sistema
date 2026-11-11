"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { ErroNegocio, executar, falha, falhaDeValidacao, formDataParaObjeto, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { registrarAuditoria } from "@/lib/auditoria";
import { extrairIp } from "@/lib/auth/autenticar";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissoes";

import { buscarProdutoPorCodigo } from "../queries";
import { COMPRIMENTO_BARRA_PADRAO_MM, editarProdutoSchema, idsSchema, produtoSchema } from "../schemas";

const campos = {
  id: true,
  codigo: true,
  descricao: true,
  categoriaId: true,
  unidade: true,
  linhaId: true,
  acabamentoId: true,
  fornecedorPrincipalId: true,
  custoUnitarioCentavos: true,
  custoAtualizadoEm: true,
  comprimentoBarraMm: true,
  pesoKgPorMetro: true,
  larguraMm: true,
  alturaMm: true,
  estoqueMinimo: true,
  localizacao: true,
  observacoes: true,
  ativo: true,
} as const;

function revalidar(id?: string) {
  revalidatePath("/produtos");
  if (id) revalidatePath(`/produtos/${id}`);
  revalidatePath("/", "layout");
}

type Valores = NonNullable<ReturnType<typeof produtoSchema.safeParse>["data"]>;

/** Cada vínculo escolhido precisa existir (nunca confiar em IDs vindos do navegador). */
async function conferirReferencias(v: Valores) {
  const [categoria, linha, acabamento, fornecedor] = await Promise.all([
    v.categoriaId ? prisma.categoriaProduto.count({ where: { id: v.categoriaId, deletadoEm: null } }) : 1,
    v.linhaId ? prisma.linhaAluminio.count({ where: { id: v.linhaId, deletadoEm: null } }) : 1,
    v.acabamentoId ? prisma.acabamentoAluminio.count({ where: { id: v.acabamentoId, deletadoEm: null } }) : 1,
    v.fornecedorPrincipalId ? prisma.fornecedor.count({ where: { id: v.fornecedorPrincipalId, deletadoEm: null } }) : 1,
  ]);
  const campos: Record<string, string> = {};
  if (!categoria) campos.categoriaId = "Escolha uma categoria da lista.";
  if (!linha) campos.linhaId = "Escolha uma linha da lista.";
  if (!acabamento) campos.acabamentoId = "Escolha um acabamento da lista.";
  if (!fornecedor) campos.fornecedorPrincipalId = "Escolha um fornecedor da lista.";
  if (Object.keys(campos).length > 0) throw new ErroNegocio("Alguma opção escolhida não existe mais. Recarregue a página.", campos);
}

async function conferirCodigo(codigo: string, exceto?: string) {
  const outro = await buscarProdutoPorCodigo(codigo, exceto);
  if (outro) throw new ErroNegocio(`Já existe um produto com esse código: ${outro.descricao}.`, { codigo: `Código já usado em ${outro.descricao}.` });
}

const MENSAGEM_CODIGO = "Já existe um produto com esse código.";

function paraBanco(v: Valores) {
  return {
    codigo: v.codigo,
    descricao: v.descricao,
    categoriaId: v.categoriaId ?? null,
    unidade: v.unidade,
    linhaId: v.linhaId ?? null,
    acabamentoId: v.acabamentoId ?? null,
    fornecedorPrincipalId: v.fornecedorPrincipalId ?? null,
    pesoKgPorMetro: v.pesoKgPorMetro ?? null,
    larguraMm: v.larguraMm ?? null,
    alturaMm: v.alturaMm ?? null,
    estoqueMinimo: v.estoqueMinimo ?? null,
    localizacao: v.localizacao ?? null,
    observacoes: v.observacoes ?? null,
  };
}

export async function criarProduto(_anterior: ResultadoAcao<{ id: string }> | null, formData: FormData): Promise<ResultadoAcao<{ id: string }>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "criar", "produto")) return falha("Sem permissão.");

  const dados = produtoSchema.safeParse(formDataParaObjeto(formData));
  if (!dados.success) return falhaDeValidacao(dados.error);
  const v = dados.data;

  return executar(
    "produtos.criar",
    async () => {
      await conferirReferencias(v);
      await conferirCodigo(v.codigo);
      const ip = extrairIp(await headers());
      const criado = await prisma.$transaction(async (tx) => {
        const novo = await tx.produto.create({
          data: {
            ...paraBanco(v),
            custoUnitarioCentavos: v.custo ?? null,
            custoAtualizadoEm: v.custo !== undefined ? new Date() : null,
            // Perfil vendido por barra: 6.000 mm é o padrão da spec quando nada foi informado.
            comprimentoBarraMm: v.comprimentoBarraMm ?? (v.unidade === "BARRA" ? COMPRIMENTO_BARRA_PADRAO_MM : null),
            criadoPorId: sessao.id,
            atualizadoPorId: sessao.id,
          },
          select: campos,
        });
        // O primeiro custo também entra no histórico (anterior vazio), para a linha do tempo ficar completa.
        if (novo.custoUnitarioCentavos !== null) {
          await tx.historicoPreco.create({
            data: {
              produtoId: novo.id,
              custoAnteriorCentavos: null,
              custoNovoCentavos: novo.custoUnitarioCentavos,
              origem: "MANUAL",
              fornecedorId: novo.fornecedorPrincipalId,
              usuarioId: sessao.id,
              observacao: "Custo inicial",
              criadoPorId: sessao.id,
              atualizadoPorId: sessao.id,
            },
          });
        }
        await registrarAuditoria(tx, { usuario: sessao, entidade: "Produto", entidadeId: novo.id, acao: "CRIAR", depois: novo, ip });
        return novo;
      });
      revalidar();
      return sucesso({ id: criado.id }, "Produto cadastrado.");
    },
    MENSAGEM_CODIGO,
  );
}

export async function editarProduto(_anterior: ResultadoAcao<{ id: string }> | null, formData: FormData): Promise<ResultadoAcao<{ id: string }>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "produto")) return falha("Sem permissão.");

  const dados = editarProdutoSchema.safeParse(formDataParaObjeto(formData));
  if (!dados.success) return falhaDeValidacao(dados.error);
  const { id, ...v } = dados.data;

  return executar(
    "produtos.editar",
    async () => {
      await conferirReferencias(v);
      await conferirCodigo(v.codigo, id);
      const ip = extrairIp(await headers());
      await prisma.$transaction(async (tx) => {
        const antes = await tx.produto.findFirst({ where: { id, deletadoEm: null }, select: campos });
        if (!antes) throw new ErroNegocio("Produto não encontrado.");

        const novoCusto = v.custo ?? null;
        const custoMudou = novoCusto !== antes.custoUnitarioCentavos;
        const depois = await tx.produto.update({
          where: { id },
          data: {
            ...paraBanco(v),
            comprimentoBarraMm: v.comprimentoBarraMm ?? null,
            custoUnitarioCentavos: novoCusto,
            ...(custoMudou ? { custoAtualizadoEm: novoCusto === null ? null : new Date() } : {}),
            atualizadoPorId: sessao.id,
          },
          select: campos,
        });
        // Toda mudança de custo (R13) grava o histórico NA MESMA transação. Apagar o custo não tem como
        // entrar no histórico (o valor novo é obrigatório lá), então esse caso fica só na auditoria.
        if (custoMudou && novoCusto !== null) {
          await tx.historicoPreco.create({
            data: {
              produtoId: id,
              custoAnteriorCentavos: antes.custoUnitarioCentavos,
              custoNovoCentavos: novoCusto,
              origem: "MANUAL",
              fornecedorId: depois.fornecedorPrincipalId,
              usuarioId: sessao.id,
              criadoPorId: sessao.id,
              atualizadoPorId: sessao.id,
            },
          });
        }
        await registrarAuditoria(tx, { usuario: sessao, entidade: "Produto", entidadeId: id, acao: "ATUALIZAR", antes, depois, ip });
      });
      revalidar(id);
      return sucesso({ id }, "Produto atualizado.");
    },
    MENSAGEM_CODIGO,
  );
}

async function mudarSituacao(idsBrutos: string[], ativo: boolean): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "produto")) return falha("Sem permissão.");
  const ids = idsSchema.safeParse(idsBrutos);
  if (!ids.success) return falha(ids.error.issues[0]?.message ?? "Seleção inválida.");

  return executar("produtos.situacao", async () => {
    const ip = extrairIp(await headers());
    const alterados = await prisma.$transaction(async (tx) => {
      const alvos = await tx.produto.findMany({ where: { id: { in: ids.data }, deletadoEm: null, ativo: !ativo }, select: { id: true, ativo: true } });
      for (const antes of alvos) {
        await tx.produto.update({ where: { id: antes.id }, data: { ativo, atualizadoPorId: sessao.id } });
        await registrarAuditoria(tx, { usuario: sessao, entidade: "Produto", entidadeId: antes.id, acao: ativo ? "REATIVAR" : "INATIVAR", antes: { ativo: antes.ativo }, depois: { ativo }, ip });
      }
      return alvos.length;
    });
    revalidar();
    if (alterados === 0) return sucesso(undefined, "Nada a alterar.");
    return sucesso(undefined, `${alterados} ${alterados === 1 ? "produto" : "produtos"} ${ativo ? "reativado" : "inativado"}${alterados === 1 ? "" : "s"}.`);
  });
}

export async function inativarProdutos(ids: string[]): Promise<ResultadoAcao> {
  return mudarSituacao(ids, false);
}

export async function reativarProdutos(ids: string[]): Promise<ResultadoAcao> {
  return mudarSituacao(ids, true);
}

/** Exclusão lógica (lixeira). O histórico de preços fica preservado. */
export async function excluirProdutos(idsBrutos: string[]): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "excluir", "produto")) return falha("Sem permissão.");
  const ids = idsSchema.safeParse(idsBrutos);
  if (!ids.success) return falha(ids.error.issues[0]?.message ?? "Seleção inválida.");

  return executar("produtos.excluir", async () => {
    const ip = extrairIp(await headers());
    const removidos = await prisma.$transaction(async (tx) => {
      const alvos = await tx.produto.findMany({ where: { id: { in: ids.data }, deletadoEm: null }, select: campos });
      for (const antes of alvos) {
        await tx.produto.update({ where: { id: antes.id }, data: { deletadoEm: new Date(), atualizadoPorId: sessao.id } });
        await registrarAuditoria(tx, { usuario: sessao, entidade: "Produto", entidadeId: antes.id, acao: "EXCLUIR", antes, ip });
      }
      return alvos.length;
    });
    revalidar();
    if (removidos === 0) return sucesso(undefined, "Nada a remover.");
    return sucesso(undefined, `${removidos} ${removidos === 1 ? "produto enviado" : "produtos enviados"} para a lixeira.`);
  });
}
