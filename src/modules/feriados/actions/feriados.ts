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

import { feriadoSchema } from "../schemas";

const CAMINHO = "/configuracoes/feriados";
const idSchema = z.string().min(1).max(64);
const campos = { id: true, data: true, dataFim: true, nome: true, tipo: true, ativo: true } as const;

export async function criarFeriado(_anterior: ResultadoAcao | null, formData: FormData): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "criar", "feriado")) return falha("Sem permissão.");

  const dados = feriadoSchema.safeParse(formDataParaObjeto(formData));
  if (!dados.success) return falhaDeValidacao(dados.error);

  return executar(
    "feriados.criar",
    async () => {
      const ip = extrairIp(await headers());
      await prisma.$transaction(async (tx) => {
        // Só férias coletivas têm período; para um dia só, ignora a data final.
        const dataFim = dados.data.tipo === "FERIAS_COLETIVA_FORNECEDORES" ? (dados.data.dataFim ?? null) : null;

        // A unicidade (data + nome) vale também para registros removidos (exclusão lógica): em vez de
        // recusar com "já existe" por algo que a pessoa não vê, restaura o registro removido.
        const removido = await tx.feriado.findFirst({
          where: { data: dados.data.data, nome: dados.data.nome, deletadoEm: { not: null } },
          select: campos,
        });
        if (removido) {
          const restaurado = await tx.feriado.update({
            where: { id: removido.id },
            data: { deletadoEm: null, ativo: true, tipo: dados.data.tipo, dataFim, atualizadoPorId: sessao.id },
            select: campos,
          });
          await registrarAuditoria(tx, {
            usuario: sessao,
            entidade: "Feriado",
            entidadeId: removido.id,
            acao: "RESTAURAR",
            antes: removido,
            depois: restaurado,
            ip,
          });
          return;
        }

        const criado = await tx.feriado.create({
          data: {
            data: dados.data.data,
            nome: dados.data.nome,
            tipo: dados.data.tipo,
            dataFim,
            criadoPorId: sessao.id,
            atualizadoPorId: sessao.id,
          },
          select: campos,
        });
        await registrarAuditoria(tx, { usuario: sessao, entidade: "Feriado", entidadeId: criado.id, acao: "CRIAR", depois: criado, ip });
      });
      revalidatePath(CAMINHO);
      return sucesso(undefined, "Adicionado.");
    },
    "Já existe um feriado com essa data e esse nome.",
  );
}

export async function alternarAtivoFeriado(idBruto: string, ativo: boolean): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "feriado")) return falha("Sem permissão.");
  const id = idSchema.safeParse(idBruto);
  if (!id.success) return falha("Item inválido.");

  return executar("feriados.alternarAtivo", async () => {
    const ip = extrairIp(await headers());
    await prisma.$transaction(async (tx) => {
      const antes = await tx.feriado.findFirst({ where: { id: id.data, deletadoEm: null }, select: campos });
      if (!antes) throw new ErroNegocio("Item não encontrado.");
      const depois = await tx.feriado.update({ where: { id: antes.id }, data: { ativo, atualizadoPorId: sessao.id }, select: campos });
      await registrarAuditoria(tx, { usuario: sessao, entidade: "Feriado", entidadeId: antes.id, acao: ativo ? "ATIVAR" : "DESATIVAR", antes, depois, ip });
    });
    revalidatePath(CAMINHO);
    return sucesso(undefined, ativo ? "Ativado." : "Desativado: não conta mais nos prazos.");
  });
}

export async function excluirFeriado(idBruto: string): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "excluir", "feriado")) return falha("Sem permissão.");
  const id = idSchema.safeParse(idBruto);
  if (!id.success) return falha("Item inválido.");

  return executar("feriados.excluir", async () => {
    const ip = extrairIp(await headers());
    await prisma.$transaction(async (tx) => {
      const antes = await tx.feriado.findFirst({ where: { id: id.data, deletadoEm: null }, select: campos });
      if (!antes) throw new ErroNegocio("Item não encontrado.");
      await tx.feriado.update({ where: { id: antes.id }, data: { deletadoEm: new Date(), atualizadoPorId: sessao.id } });
      await registrarAuditoria(tx, { usuario: sessao, entidade: "Feriado", entidadeId: antes.id, acao: "EXCLUIR", antes, ip });
    });
    revalidatePath(CAMINHO);
    return sucesso(undefined, "Removido.");
  });
}
