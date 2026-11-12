"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { executar, falha, falhaDeValidacao, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { extrairIp } from "@/lib/auth/autenticar";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissoes";
import { revalidarEstoque } from "@/modules/estoque/rodar";
import { revalidarFinanceiro } from "@/modules/financeiro/rodar";

import { cancelarCompraSchema, compraIdSchema, compraSchema, estornoDeRecebimentoSchema, lerCompra, lerRecebimento, recebimentoSchema } from "./schemas";
import { atualizarCompra, cancelarCompra, criarCompra, estornarRecebimento, fazerPedido, receberCompra } from "./servico";

async function rodar<T>(nome: string, fn: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], ip: string | null) => Promise<{ dados?: T; mensagem: string }>): Promise<ResultadoAcao<T>> {
  return executar(nome, async () => {
    const ip = extrairIp(await headers());
    const r = await prisma.$transaction((tx) => fn(tx, ip), { timeout: 30_000 });
    revalidarEstoque();
    revalidarFinanceiro();
    revalidatePath("/compras", "layout");
    return sucesso(r.dados, r.mensagem);
  });
}

/** Cria a compra (rascunho, ou já como pedido). Devolve o id para abrir a página dela. */
export async function criarCompraAcao(entrada: unknown): Promise<ResultadoAcao<{ id: string }>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "criar", "compra")) return falha("Sem permissão.");
  const dados = compraSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error);
  const lida = lerCompra(dados.data);
  if (!lida.ok) return falha(lida.erro, lida.campos);
  return rodar("compras.criar", async (tx, ip) => {
    const c = await criarCompra(tx, { ...lida.entrada, fazerPedido: dados.data.fazerPedido === true }, { usuario: sessao, ip });
    return { dados: { id: c.id }, mensagem: dados.data.fazerPedido ? "Pedido registrado." : "Compra salva como rascunho." };
  });
}

export async function atualizarCompraAcao(compraId: string, entrada: unknown): Promise<ResultadoAcao<{ id: string }>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "compra")) return falha("Sem permissão.");
  const id = compraIdSchema.safeParse({ compraId });
  if (!id.success) return falhaDeValidacao(id.error);
  const dados = compraSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error);
  const lida = lerCompra(dados.data);
  if (!lida.ok) return falha(lida.erro, lida.campos);
  return rodar("compras.atualizar", async (tx, ip) => {
    await atualizarCompra(tx, id.data.compraId, lida.entrada, { usuario: sessao, ip });
    return { dados: { id: id.data.compraId }, mensagem: "Compra atualizada." };
  });
}

export async function fazerPedidoAcao(entrada: unknown): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "compra")) return falha("Sem permissão.");
  const dados = compraIdSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error);
  return rodar("compras.pedir", async (tx, ip) => {
    await fazerPedido(tx, dados.data.compraId, { usuario: sessao, ip });
    return { mensagem: "Pedido registrado." };
  });
}

export async function cancelarCompraAcao(entrada: unknown): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "compra")) return falha("Sem permissão.");
  const dados = cancelarCompraSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error);
  return rodar("compras.cancelar", async (tx, ip) => {
    await cancelarCompra(tx, dados.data.compraId, dados.data.motivo, { usuario: sessao, ip });
    return { mensagem: "Compra cancelada." };
  });
}

/** Recebimento total ou parcial; opcionalmente gera a conta a pagar. */
export async function receberCompraAcao(entrada: unknown): Promise<ResultadoAcao<{ contaPagarId: string | null }>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "compra")) return falha("Sem permissão.");
  const dados = recebimentoSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error);
  const lida = lerRecebimento(dados.data);
  if (!lida.ok) return falha(lida.erro, lida.campos);
  return rodar("compras.receber", async (tx, ip) => {
    const r = await receberCompra(tx, lida.entrada, { usuario: sessao, ip });
    return { dados: { contaPagarId: r.contaPagarId }, mensagem: r.status === "RECEBIDO" ? "Recebimento registrado: compra recebida por inteiro." : "Recebimento parcial registrado." };
  });
}

export async function estornarRecebimentoAcao(entrada: unknown): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "compra")) return falha("Sem permissão.");
  const dados = estornoDeRecebimentoSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error);
  return rodar("compras.estornar-recebimento", async (tx, ip) => {
    await estornarRecebimento(tx, dados.data.recebimentoId, dados.data.motivo, { usuario: sessao, ip });
    return { mensagem: "Recebimento estornado." };
  });
}
