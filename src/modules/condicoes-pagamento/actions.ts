"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { ErroNegocio, executar, falha, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { registrarAuditoria } from "@/lib/auditoria";
import { extrairIp } from "@/lib/auth/autenticar";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissoes";

import { condicaoSchema, idsSchema, lerParcelasDaCondicao, type EntradaCondicao } from "./schemas";

const MENSAGEM_NOME = "Já existe uma condição de pagamento com esse nome.";

function revalidar(id?: string) {
  revalidatePath("/configuracoes/condicoes-pagamento");
  if (id) revalidatePath(`/configuracoes/condicoes-pagamento/${id}`);
}

/** Cria ou atualiza a condição (e substitui o cronograma de parcelas) numa transação. */
export async function salvarCondicao(entrada: EntradaCondicao): Promise<ResultadoAcao<{ id: string }>> {
  const sessao = await exigirSessao();
  if (!can(sessao, entrada.id ? "editar" : "criar", "condicao-pagamento")) return falha("Sem permissão.");

  const lido = condicaoSchema.safeParse(entrada);
  if (!lido.success) return falha(lido.error.issues[0]?.message ?? "Dados inválidos.");
  const dados = lido.data;
  const cronograma = lerParcelasDaCondicao(dados);
  if ("erro" in cronograma) return falha(cronograma.erro);

  return executar(
    "condicoes.salvar",
    async () => {
      const repetida = await prisma.condicaoPagamento.findFirst({
        where: { deletadoEm: null, nome: { equals: dados.nome, mode: "insensitive" }, ...(dados.id ? { id: { not: dados.id } } : {}) },
        select: { id: true },
      });
      if (repetida) throw new ErroNegocio(MENSAGEM_NOME);

      const ip = extrairIp(await headers());
      const agora = new Date();
      const id = await prisma.$transaction(async (tx) => {
        const campos = { nome: dados.nome, descricao: dados.descricao || null, textoLivre: dados.textoLivre || null };
        let condicaoId: string;
        let antes: unknown = null;
        if (dados.id) {
          const atual = await tx.condicaoPagamento.findFirst({
            where: { id: dados.id, deletadoEm: null },
            select: { nome: true, descricao: true, textoLivre: true, parcelas: { where: { deletadoEm: null }, orderBy: { ordem: "asc" }, select: { descricao: true, percentualPb: true, gatilho: true, forma: true, diasApos: true, parcelasCartao: true } } },
          });
          if (!atual) throw new ErroNegocio("Condição não encontrada.");
          antes = atual;
          await tx.condicaoPagamento.update({ where: { id: dados.id }, data: { ...campos, atualizadoPorId: sessao.id } });
          await tx.condicaoParcela.updateMany({ where: { condicaoId: dados.id, deletadoEm: null }, data: { deletadoEm: agora, atualizadoPorId: sessao.id } });
          condicaoId = dados.id;
        } else {
          const ultima = await tx.condicaoPagamento.aggregate({ where: { deletadoEm: null }, _max: { ordem: true } });
          const nova = await tx.condicaoPagamento.create({ data: { ...campos, ordem: (ultima._max.ordem ?? 0) + 1, criadoPorId: sessao.id, atualizadoPorId: sessao.id }, select: { id: true } });
          condicaoId = nova.id;
        }
        if (cronograma.parcelas.length > 0) {
          await tx.condicaoParcela.createMany({
            data: cronograma.parcelas.map((p) => ({
              condicaoId,
              ordem: p.ordem,
              descricao: p.descricao,
              percentualPb: p.percentualPb,
              gatilho: p.gatilho,
              forma: p.forma,
              diasApos: p.diasApos ?? null,
              parcelasCartao: p.parcelasCartao ?? null,
              criadoPorId: sessao.id,
              atualizadoPorId: sessao.id,
            })),
          });
        }
        await registrarAuditoria(tx, {
          usuario: sessao,
          entidade: "CondicaoPagamento",
          entidadeId: condicaoId,
          acao: dados.id ? "ATUALIZAR" : "CRIAR",
          antes: antes as Record<string, unknown> | null,
          depois: { ...campos, parcelas: cronograma.parcelas },
          ip,
        });
        return condicaoId;
      });
      revalidar(id);
      return sucesso({ id }, dados.id ? "Condição atualizada." : "Condição criada.");
    },
    MENSAGEM_NOME,
  );
}

async function mudarSituacao(idsBrutos: string[], ativo: boolean): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "condicao-pagamento")) return falha("Sem permissão.");
  const ids = idsSchema.safeParse(idsBrutos);
  if (!ids.success) return falha("Seleção inválida.");

  return executar("condicoes.situacao", async () => {
    const ip = extrairIp(await headers());
    await prisma.$transaction(async (tx) => {
      const alvos = await tx.condicaoPagamento.findMany({ where: { id: { in: ids.data }, deletadoEm: null, ativo: !ativo }, select: { id: true } });
      for (const a of alvos) {
        await tx.condicaoPagamento.update({ where: { id: a.id }, data: { ativo, atualizadoPorId: sessao.id } });
        await registrarAuditoria(tx, { usuario: sessao, entidade: "CondicaoPagamento", entidadeId: a.id, acao: ativo ? "REATIVAR" : "INATIVAR", antes: { ativo: !ativo }, depois: { ativo }, ip });
      }
    });
    revalidar();
    return sucesso(undefined, ativo ? "Condição reativada." : "Condição inativada. Propostas já feitas não mudam.");
  });
}

export async function inativarCondicoes(ids: string[]): Promise<ResultadoAcao> {
  return mudarSituacao(ids, false);
}

export async function reativarCondicoes(ids: string[]): Promise<ResultadoAcao> {
  return mudarSituacao(ids, true);
}

/** Exclusão lógica: as propostas guardam uma cópia do cronograma, então nada nelas muda. */
export async function excluirCondicoes(idsBrutos: string[]): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "excluir", "condicao-pagamento")) return falha("Sem permissão.");
  const ids = idsSchema.safeParse(idsBrutos);
  if (!ids.success) return falha("Seleção inválida.");

  return executar("condicoes.excluir", async () => {
    const ip = extrairIp(await headers());
    await prisma.$transaction(async (tx) => {
      const alvos = await tx.condicaoPagamento.findMany({ where: { id: { in: ids.data }, deletadoEm: null }, select: { id: true, nome: true } });
      for (const a of alvos) {
        await tx.condicaoPagamento.update({ where: { id: a.id }, data: { deletadoEm: new Date(), atualizadoPorId: sessao.id } });
        await registrarAuditoria(tx, { usuario: sessao, entidade: "CondicaoPagamento", entidadeId: a.id, acao: "EXCLUIR", antes: a, ip });
      }
    });
    revalidar();
    return sucesso(undefined, "Condição enviada para a lixeira.");
  });
}
