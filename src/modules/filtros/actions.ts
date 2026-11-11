"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { executar, falha, falhaDeValidacao, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { registrarAuditoria } from "@/lib/auditoria";
import { extrairIp } from "@/lib/auth/autenticar";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissoes";
import { campoIdObrigatorio } from "@/lib/validadores/campos";

import { limparConsulta, TELAS_COM_FILTRO_SALVO } from "./schemas";

const salvarSchema = z.object({
  tela: z.enum(TELAS_COM_FILTRO_SALVO, { message: "Lista desconhecida." }),
  nome: z.string().trim().min(2, "Dê um nome ao filtro.").max(60, "Use no máximo 60 caracteres."),
  consulta: z.string().max(1000),
});

/** Guarda a combinação atual de filtros desta lista, para esta pessoa. */
export async function salvarFiltro(entrada: unknown): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "criar", "filtro")) return falha("Sem permissão.");
  const dados = salvarSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error);

  const consulta = limparConsulta(dados.data.consulta);
  if (consulta === "") return falha("Escolha ao menos um filtro ou uma busca antes de salvar.");

  return executar(
    "filtros.salvar",
    async () => {
      const ip = extrairIp(await headers());
      await prisma.$transaction(async (tx) => {
        const criado = await tx.filtroSalvo.create({
          data: { usuarioId: sessao.id, tela: dados.data.tela, nome: dados.data.nome, consulta, criadoPorId: sessao.id, atualizadoPorId: sessao.id },
          select: { id: true, tela: true, nome: true, consulta: true },
        });
        await registrarAuditoria(tx, { usuario: sessao, entidade: "FiltroSalvo", entidadeId: criado.id, acao: "CRIAR", depois: criado, ip });
      });
      revalidatePath(`/${dados.data.tela}`);
      return sucesso(undefined, "Filtro salvo.");
    },
    "Você já tem um filtro com esse nome nesta lista.",
  );
}

/** Remove um filtro salvo da própria pessoa. É preferência pessoal sem vínculos, então a exclusão é física. */
export async function excluirFiltroSalvo(idBruto: string): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "excluir", "filtro")) return falha("Sem permissão.");
  const id = campoIdObrigatorio("Filtro inválido.").safeParse(idBruto);
  if (!id.success) return falha("Filtro inválido.");

  return executar("filtros.excluir", async () => {
    const ip = extrairIp(await headers());
    const tela = await prisma.$transaction(async (tx) => {
      // Só apaga se for DESTA pessoa.
      const antes = await tx.filtroSalvo.findFirst({ where: { id: id.data, usuarioId: sessao.id }, select: { id: true, tela: true, nome: true, consulta: true } });
      if (!antes) return null;
      await tx.filtroSalvo.delete({ where: { id: antes.id } });
      await registrarAuditoria(tx, { usuario: sessao, entidade: "FiltroSalvo", entidadeId: antes.id, acao: "EXCLUIR", antes, ip });
      return antes.tela;
    });
    if (tela) revalidatePath(`/${tela}`);
    return sucesso(undefined, "Filtro removido.");
  });
}
