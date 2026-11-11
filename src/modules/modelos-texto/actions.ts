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

const schema = z.object({
  id: z.string().min(1).max(64),
  titulo: z.string().trim().min(2, "Informe o título.").max(120, "Use no máximo 120 caracteres."),
  conteudo: z.string().trim().min(1, "O texto não pode ficar vazio.").max(6000, "Use no máximo 6.000 caracteres."),
  ativo: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
});

const campos = { id: true, chave: true, titulo: true, conteudo: true, ativo: true } as const;

export async function salvarModeloTexto(_anterior: ResultadoAcao | null, formData: FormData): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "modelo-texto")) return falha("Sem permissão.");

  const dados = schema.safeParse(formDataParaObjeto(formData));
  if (!dados.success) return falhaDeValidacao(dados.error);

  return executar("modelosTexto.salvar", async () => {
    const ip = extrairIp(await headers());
    await prisma.$transaction(async (tx) => {
      const antes = await tx.modeloTexto.findFirst({ where: { id: dados.data.id, deletadoEm: null }, select: campos });
      if (!antes) throw new ErroNegocio("Modelo não encontrado.");
      const depois = await tx.modeloTexto.update({
        where: { id: antes.id },
        data: { titulo: dados.data.titulo, conteudo: dados.data.conteudo, ativo: dados.data.ativo, atualizadoPorId: sessao.id },
        select: campos,
      });
      await registrarAuditoria(tx, { usuario: sessao, entidade: "ModeloTexto", entidadeId: antes.id, acao: "ATUALIZAR", antes, depois, ip });
    });
    revalidatePath("/configuracoes/modelos-texto");
    return sucesso(undefined, "Modelo salvo.");
  });
}
