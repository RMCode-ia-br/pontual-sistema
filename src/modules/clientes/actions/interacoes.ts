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

import { interacaoSchema } from "../schemas";

/** Registro manual na linha do tempo do cliente: anotação, ligação, WhatsApp, visita ou e-mail. */
export async function registrarInteracaoDoCliente(_anterior: ResultadoAcao | null, formData: FormData): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "criar", "interacao")) return falha("Sem permissão.");

  const dados = interacaoSchema.safeParse(formDataParaObjeto(formData));
  if (!dados.success) return falhaDeValidacao(dados.error);

  return executar("clientes.interacao.criar", async () => {
    const ip = extrairIp(await headers());
    await prisma.$transaction(async (tx) => {
      const cliente = await tx.cliente.findFirst({ where: { id: dados.data.clienteId, deletadoEm: null }, select: { id: true } });
      if (!cliente) throw new ErroNegocio("Cliente não encontrado.");
      const id = await registrarInteracao(tx, {
        tipo: dados.data.tipo,
        texto: dados.data.texto,
        clienteId: cliente.id,
        usuarioId: sessao.id,
      });
      await registrarAuditoria(tx, {
        usuario: sessao,
        entidade: "Interacao",
        entidadeId: id,
        acao: "CRIAR",
        depois: { clienteId: cliente.id, tipo: dados.data.tipo, texto: dados.data.texto },
        ip,
      });
    });
    revalidatePath(`/clientes/${dados.data.clienteId}`);
    return sucesso(undefined, "Registro adicionado à linha do tempo.");
  });
}

/** Remove um registro manual (erro de digitação). Eventos do sistema não podem ser apagados. */
export async function excluirInteracaoDoCliente(idBruto: string): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "excluir", "interacao")) return falha("Sem permissão.");
  const id = campoIdObrigatorio("Registro inválido.").safeParse(idBruto);
  if (!id.success) return falha("Registro inválido.");

  return executar("clientes.interacao.excluir", async () => {
    const ip = extrairIp(await headers());
    const clienteId = await prisma.$transaction(async (tx) => {
      const antes = await tx.interacao.findFirst({
        where: { id: id.data, deletadoEm: null },
        select: { id: true, tipo: true, texto: true, clienteId: true },
      });
      if (!antes || !antes.clienteId) throw new ErroNegocio("Registro não encontrado.");
      if (antes.tipo === "SISTEMA") throw new ErroNegocio("Eventos do sistema não podem ser removidos.");
      await tx.interacao.update({ where: { id: antes.id }, data: { deletadoEm: new Date(), atualizadoPorId: sessao.id } });
      await registrarAuditoria(tx, { usuario: sessao, entidade: "Interacao", entidadeId: antes.id, acao: "EXCLUIR", antes, ip });
      return antes.clienteId;
    });
    revalidatePath(`/clientes/${clienteId}`);
    return sucesso(undefined, "Registro removido.");
  });
}
