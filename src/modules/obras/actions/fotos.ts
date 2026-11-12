"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { executar, falha, falhaDeValidacao, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { extrairIp } from "@/lib/auth/autenticar";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { MOMENTOS_DA_FOTO } from "@/lib/dominio/portfolio";
import { can } from "@/lib/permissoes";
import { campoIdObrigatorio } from "@/lib/validadores/campos";

import { atualizarFotoDaObra, definirAutorizacaoDePortfolio, definirPublicacaoNoInstagram } from "../servico-fotos";

const diaSchema = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida.");

const fotoSchema = z.object({
  anexoId: campoIdObrigatorio(),
  momento: z.enum(MOMENTOS_DA_FOTO).optional(),
  usarNoPortfolio: z.boolean().optional(),
  descricao: z.string().trim().max(300, "Use no máximo 300 caracteres.").nullable().optional(),
});
const autorizacaoSchema = z.object({ projetoId: campoIdObrigatorio(), autoriza: z.boolean() });
const publicacaoSchema = z.object({ projetoId: campoIdObrigatorio(), publicada: z.boolean(), data: diaSchema.optional() });

function revalidar() {
  revalidatePath("/obras", "layout");
  revalidatePath("/projetos", "layout");
}

/** Momento, uso no portfólio e descrição de uma foto da obra. */
export async function atualizarFoto(entrada: unknown): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "anexo")) return falha("Sem permissão.");
  const lido = fotoSchema.safeParse(entrada);
  if (!lido.success) return falhaDeValidacao(lido.error);
  return executar("obras.atualizar_foto", async () => {
    const ip = extrairIp(await headers());
    await prisma.$transaction((tx) => atualizarFotoDaObra(tx, { ...lido.data, usuario: sessao, ip }));
    revalidar();
    return sucesso(undefined, "Foto atualizada.");
  });
}

export async function definirAutorizacaoDoCliente(entrada: unknown): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "obra")) return falha("Sem permissão.");
  const lido = autorizacaoSchema.safeParse(entrada);
  if (!lido.success) return falhaDeValidacao(lido.error);
  return executar("obras.autorizacao_portfolio", async () => {
    const ip = extrairIp(await headers());
    await prisma.$transaction((tx) => definirAutorizacaoDePortfolio(tx, { ...lido.data, usuario: sessao, ip }));
    revalidar();
    return sucesso(undefined, lido.data.autoriza ? "Uso das fotos no portfólio autorizado." : "As fotos desta obra saíram da galeria.");
  });
}

export async function marcarPublicacao(entrada: unknown): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "obra")) return falha("Sem permissão.");
  const lido = publicacaoSchema.safeParse(entrada);
  if (!lido.success) return falhaDeValidacao(lido.error);
  return executar("obras.publicacao_instagram", async () => {
    const ip = extrairIp(await headers());
    await prisma.$transaction((tx) => definirPublicacaoNoInstagram(tx, { ...lido.data, usuario: sessao, ip }));
    revalidar();
    return sucesso(undefined, lido.data.publicada ? "Obra marcada como publicada no Instagram." : "Marca de publicação removida.");
  });
}
