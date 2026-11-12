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

import { empresaSchema } from "../schemas/empresa";

export async function salvarEmpresa(_anterior: ResultadoAcao | null, formData: FormData): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "configuracao")) return falha("Sem permissão.");

  const dados = empresaSchema.safeParse(formDataParaObjeto(formData));
  if (!dados.success) return falhaDeValidacao(dados.error);

  return executar("configuracao.salvar", async () => {
    const ip = extrairIp(await headers());
    if (dados.data.categoriaReceitaPadraoId) {
      const categoria = await prisma.categoriaFinanceira.findFirst({
        where: { id: dados.data.categoriaReceitaPadraoId, tipo: "RECEITA", ativo: true, deletadoEm: null },
        select: { id: true },
      });
      if (!categoria) throw new ErroNegocio("Escolha uma categoria de receita ativa.", { categoriaReceitaPadraoId: "Categoria inválida." });
    }
    await prisma.$transaction(async (tx) => {
      const antes = await tx.configuracaoEmpresa.findUnique({ where: { id: "singleton" } });
      const depois = await tx.configuracaoEmpresa.upsert({
        where: { id: "singleton" },
        create: { id: "singleton", ...dados.data, criadoPorId: sessao.id, atualizadoPorId: sessao.id },
        update: { ...dados.data, atualizadoPorId: sessao.id },
      });
      await registrarAuditoria(tx, {
        usuario: sessao,
        entidade: "ConfiguracaoEmpresa",
        entidadeId: "singleton",
        acao: antes ? "ATUALIZAR" : "CRIAR",
        antes,
        depois,
        ip,
      });
    });
    // Nome e logo aparecem em todas as telas.
    revalidatePath("/", "layout");
    return sucesso(undefined, "Configurações salvas.");
  });
}

/** Usa um anexo (imagem) já enviado como logo da empresa. */
export async function definirLogoEmpresa(anexoIdBruto: string): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "configuracao")) return falha("Sem permissão.");

  const anexoId = z.string().min(1).max(64).safeParse(anexoIdBruto);
  if (!anexoId.success) return falha("Arquivo inválido.");

  return executar("configuracao.logo", async () => {
    const ip = extrairIp(await headers());
    await prisma.$transaction(async (tx) => {
      const anexo = await tx.anexo.findFirst({
        where: { id: anexoId.data, entidadeTipo: "ConfiguracaoEmpresa", entidadeId: "singleton", deletadoEm: null },
        select: { caminho: true, mime: true },
      });
      if (!anexo || !anexo.mime.startsWith("image/")) throw new ErroNegocio("Escolha um arquivo de imagem (PNG, JPG ou WebP).");

      const antes = await tx.configuracaoEmpresa.findUnique({ where: { id: "singleton" }, select: { logoCaminho: true } });
      await tx.configuracaoEmpresa.upsert({
        where: { id: "singleton" },
        create: { id: "singleton", logoCaminho: anexo.caminho, criadoPorId: sessao.id, atualizadoPorId: sessao.id },
        update: { logoCaminho: anexo.caminho, atualizadoPorId: sessao.id },
      });
      await registrarAuditoria(tx, {
        usuario: sessao,
        entidade: "ConfiguracaoEmpresa",
        entidadeId: "singleton",
        acao: "ATUALIZAR",
        antes,
        depois: { logoCaminho: anexo.caminho },
        ip,
      });
    });
    revalidatePath("/", "layout");
    return sucesso(undefined, "Logo atualizado.");
  });
}
