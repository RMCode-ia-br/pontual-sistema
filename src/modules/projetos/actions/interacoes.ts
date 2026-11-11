"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { ErroNegocio, executar, falha, falhaDeValidacao, formDataParaObjeto, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { registrarAuditoria } from "@/lib/auditoria";
import { extrairIp } from "@/lib/auth/autenticar";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissoes";
import { campoIdObrigatorio } from "@/lib/validadores/campos";
import { registrarInteracao } from "@/modules/interacoes/registrar";

import { interacaoProjetoSchema } from "../schemas";

/** Registro manual na linha do tempo do projeto. Também aparece na linha do tempo do cliente. */
export async function registrarInteracaoDoProjeto(_anterior: ResultadoAcao | null, formData: FormData): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "criar", "interacao")) return falha("Sem permissão.");

  const dados = interacaoProjetoSchema.safeParse(formDataParaObjeto(formData));
  if (!dados.success) return falhaDeValidacao(dados.error);

  return executar("projetos.interacao.criar", async () => {
    const ip = extrairIp(await headers());
    await prisma.$transaction(async (tx) => {
      const projeto = await tx.projeto.findFirst({ where: { id: dados.data.projetoId, deletadoEm: null }, select: { id: true, clienteId: true } });
      if (!projeto) throw new ErroNegocio("Projeto não encontrado.");
      const id = await registrarInteracao(tx, { tipo: dados.data.tipo, texto: dados.data.texto, clienteId: projeto.clienteId, projetoId: projeto.id, usuarioId: sessao.id });
      await registrarAuditoria(tx, {
        usuario: sessao,
        entidade: "Interacao",
        entidadeId: id,
        acao: "CRIAR",
        depois: { projetoId: projeto.id, clienteId: projeto.clienteId, tipo: dados.data.tipo, texto: dados.data.texto },
        ip,
      });
    });
    revalidatePath(`/projetos/${dados.data.projetoId}`);
    return sucesso(undefined, "Registro adicionado à linha do tempo.");
  });
}

/** Remove um registro manual (erro de digitação). Eventos do sistema não podem ser apagados. */
export async function excluirInteracaoDoProjeto(idBruto: string): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "excluir", "interacao")) return falha("Sem permissão.");
  const id = campoIdObrigatorio("Registro inválido.").safeParse(idBruto);
  if (!id.success) return falha("Registro inválido.");

  return executar("projetos.interacao.excluir", async () => {
    const ip = extrairIp(await headers());
    const projetoId = await prisma.$transaction(async (tx) => {
      const antes = await tx.interacao.findFirst({ where: { id: id.data, deletadoEm: null }, select: { id: true, tipo: true, texto: true, projetoId: true } });
      if (!antes || !antes.projetoId) throw new ErroNegocio("Registro não encontrado.");
      if (antes.tipo === "SISTEMA") throw new ErroNegocio("Eventos do sistema não podem ser removidos.");
      await tx.interacao.update({ where: { id: antes.id }, data: { deletadoEm: new Date(), atualizadoPorId: sessao.id } });
      await registrarAuditoria(tx, { usuario: sessao, entidade: "Interacao", entidadeId: antes.id, acao: "EXCLUIR", antes, ip });
      return antes.projetoId;
    });
    revalidatePath(`/projetos/${projetoId}`);
    return sucesso(undefined, "Registro removido.");
  });
}
