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

import { contatoSchema, editarContatoSchema } from "../schemas";

const campos = { id: true, clienteId: true, nome: true, cargo: true, telefone: true, whatsapp: true, email: true, observacoes: true } as const;

function revalidar(clienteId: string) {
  revalidatePath(`/clientes/${clienteId}`);
}

export async function criarContato(_anterior: ResultadoAcao | null, formData: FormData): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "criar", "contato")) return falha("Sem permissão.");

  const dados = contatoSchema.safeParse(formDataParaObjeto(formData));
  if (!dados.success) return falhaDeValidacao(dados.error);

  return executar("clientes.contato.criar", async () => {
    const ip = extrairIp(await headers());
    await prisma.$transaction(async (tx) => {
      const cliente = await tx.cliente.findFirst({ where: { id: dados.data.clienteId, deletadoEm: null }, select: { id: true } });
      if (!cliente) throw new ErroNegocio("Cliente não encontrado.");
      const novo = await tx.contatoCliente.create({
        data: {
          clienteId: cliente.id,
          nome: dados.data.nome,
          cargo: dados.data.cargo ?? null,
          telefone: dados.data.telefone ?? null,
          whatsapp: dados.data.whatsapp ?? null,
          email: dados.data.email ?? null,
          observacoes: dados.data.observacoes ?? null,
          criadoPorId: sessao.id,
          atualizadoPorId: sessao.id,
        },
        select: campos,
      });
      await registrarAuditoria(tx, { usuario: sessao, entidade: "ContatoCliente", entidadeId: novo.id, acao: "CRIAR", depois: novo, ip });
    });
    revalidar(dados.data.clienteId);
    return sucesso(undefined, "Contato adicionado.");
  });
}

export async function editarContato(_anterior: ResultadoAcao | null, formData: FormData): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "contato")) return falha("Sem permissão.");

  const dados = editarContatoSchema.safeParse(formDataParaObjeto(formData));
  if (!dados.success) return falhaDeValidacao(dados.error);

  return executar("clientes.contato.editar", async () => {
    const ip = extrairIp(await headers());
    await prisma.$transaction(async (tx) => {
      const antes = await tx.contatoCliente.findFirst({
        where: { id: dados.data.id, clienteId: dados.data.clienteId, deletadoEm: null, cliente: { deletadoEm: null } },
        select: campos,
      });
      if (!antes) throw new ErroNegocio("Contato não encontrado.");
      const depois = await tx.contatoCliente.update({
        where: { id: antes.id },
        data: {
          nome: dados.data.nome,
          cargo: dados.data.cargo ?? null,
          telefone: dados.data.telefone ?? null,
          whatsapp: dados.data.whatsapp ?? null,
          email: dados.data.email ?? null,
          observacoes: dados.data.observacoes ?? null,
          atualizadoPorId: sessao.id,
        },
        select: campos,
      });
      await registrarAuditoria(tx, { usuario: sessao, entidade: "ContatoCliente", entidadeId: antes.id, acao: "ATUALIZAR", antes, depois, ip });
    });
    revalidar(dados.data.clienteId);
    return sucesso(undefined, "Contato atualizado.");
  });
}

export async function excluirContato(idBruto: string): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "excluir", "contato")) return falha("Sem permissão.");
  const id = campoIdObrigatorio("Contato inválido.").safeParse(idBruto);
  if (!id.success) return falha("Contato inválido.");

  return executar("clientes.contato.excluir", async () => {
    const ip = extrairIp(await headers());
    const clienteId = await prisma.$transaction(async (tx) => {
      const antes = await tx.contatoCliente.findFirst({ where: { id: id.data, deletadoEm: null }, select: campos });
      if (!antes) throw new ErroNegocio("Contato não encontrado.");
      await tx.contatoCliente.update({ where: { id: antes.id }, data: { deletadoEm: new Date(), atualizadoPorId: sessao.id } });
      await registrarAuditoria(tx, { usuario: sessao, entidade: "ContatoCliente", entidadeId: antes.id, acao: "EXCLUIR", antes, ip });
      return antes.clienteId;
    });
    revalidar(clienteId);
    return sucesso(undefined, "Contato removido.");
  });
}
