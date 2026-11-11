"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type { z } from "zod";

import { ErroNegocio, executar, falha, falhaDeValidacao, formDataParaObjeto, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { registrarAuditoria } from "@/lib/auditoria";
import { extrairIp } from "@/lib/auth/autenticar";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissoes";
import { campoIdObrigatorio } from "@/lib/validadores/campos";

import { editarEnderecoSchema, enderecoSchema } from "../schemas";

type EnderecoValidado = z.output<typeof enderecoSchema>;

const campos = {
  id: true,
  clienteId: true,
  tipo: true,
  apelido: true,
  logradouro: true,
  numero: true,
  complemento: true,
  bairro: true,
  cidade: true,
  uf: true,
  cep: true,
  condominio: true,
  condominioNome: true,
  exigeAprovacaoFachada: true,
  fachadaAprovada: true,
  horariosPermitidos: true,
  sindicoNome: true,
  sindicoTelefone: true,
} as const;

function revalidar(clienteId: string) {
  revalidatePath(`/clientes/${clienteId}`);
}

/** Dados do condomínio só valem quando o endereço é de condomínio (evita lixo escondido). */
function aplicarRegraDeCondominio<T extends EnderecoValidado>(v: T): T {
  if (v.condominio) return v;
  return {
    ...v,
    condominioNome: undefined,
    exigeAprovacaoFachada: false,
    fachadaAprovada: false,
    horariosPermitidos: undefined,
    sindicoNome: undefined,
    sindicoTelefone: undefined,
  };
}

function paraBanco(v: EnderecoValidado) {
  return {
    tipo: v.tipo,
    apelido: v.apelido ?? null,
    logradouro: v.logradouro ?? null,
    numero: v.numero ?? null,
    complemento: v.complemento ?? null,
    bairro: v.bairro ?? null,
    cidade: v.cidade ?? null,
    uf: v.uf ?? null,
    cep: v.cep ?? null,
    condominio: v.condominio,
    condominioNome: v.condominioNome ?? null,
    exigeAprovacaoFachada: v.exigeAprovacaoFachada,
    fachadaAprovada: v.fachadaAprovada,
    horariosPermitidos: v.horariosPermitidos ?? null,
    sindicoNome: v.sindicoNome ?? null,
    sindicoTelefone: v.sindicoTelefone ?? null,
  };
}

export async function criarEndereco(_anterior: ResultadoAcao | null, formData: FormData): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "criar", "endereco")) return falha("Sem permissão.");

  const lido = enderecoSchema.safeParse(formDataParaObjeto(formData));
  if (!lido.success) return falhaDeValidacao(lido.error);
  const dados = aplicarRegraDeCondominio(lido.data);

  return executar("clientes.endereco.criar", async () => {
    const ip = extrairIp(await headers());
    await prisma.$transaction(async (tx) => {
      const cliente = await tx.cliente.findFirst({ where: { id: dados.clienteId, deletadoEm: null }, select: { id: true } });
      if (!cliente) throw new ErroNegocio("Cliente não encontrado.");
      const novo = await tx.enderecoCliente.create({
        data: { clienteId: cliente.id, ...paraBanco(dados), criadoPorId: sessao.id, atualizadoPorId: sessao.id },
        select: campos,
      });
      await registrarAuditoria(tx, { usuario: sessao, entidade: "EnderecoCliente", entidadeId: novo.id, acao: "CRIAR", depois: novo, ip });
    });
    revalidar(dados.clienteId);
    return sucesso(undefined, "Endereço adicionado.");
  });
}

export async function editarEndereco(_anterior: ResultadoAcao | null, formData: FormData): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "endereco")) return falha("Sem permissão.");

  const lido = editarEnderecoSchema.safeParse(formDataParaObjeto(formData));
  if (!lido.success) return falhaDeValidacao(lido.error);
  const dados = aplicarRegraDeCondominio(lido.data);

  return executar("clientes.endereco.editar", async () => {
    const ip = extrairIp(await headers());
    await prisma.$transaction(async (tx) => {
      // O endereço precisa pertencer ao cliente informado: nunca confiar no par de IDs do navegador.
      const antes = await tx.enderecoCliente.findFirst({
        where: { id: dados.id, clienteId: dados.clienteId, deletadoEm: null, cliente: { deletadoEm: null } },
        select: campos,
      });
      if (!antes) throw new ErroNegocio("Endereço não encontrado.");
      const depois = await tx.enderecoCliente.update({
        where: { id: antes.id },
        data: { ...paraBanco(dados), atualizadoPorId: sessao.id },
        select: campos,
      });
      await registrarAuditoria(tx, { usuario: sessao, entidade: "EnderecoCliente", entidadeId: antes.id, acao: "ATUALIZAR", antes, depois, ip });
    });
    revalidar(dados.clienteId);
    return sucesso(undefined, "Endereço atualizado.");
  });
}

export async function excluirEndereco(idBruto: string): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "excluir", "endereco")) return falha("Sem permissão.");
  const id = campoIdObrigatorio("Endereço inválido.").safeParse(idBruto);
  if (!id.success) return falha("Endereço inválido.");

  return executar("clientes.endereco.excluir", async () => {
    const ip = extrairIp(await headers());
    const clienteId = await prisma.$transaction(async (tx) => {
      const antes = await tx.enderecoCliente.findFirst({ where: { id: id.data, deletadoEm: null }, select: campos });
      if (!antes) throw new ErroNegocio("Endereço não encontrado.");
      await tx.enderecoCliente.update({ where: { id: antes.id }, data: { deletadoEm: new Date(), atualizadoPorId: sessao.id } });
      await registrarAuditoria(tx, { usuario: sessao, entidade: "EnderecoCliente", entidadeId: antes.id, acao: "EXCLUIR", antes, ip });
      return antes.clienteId;
    });
    revalidar(clienteId);
    return sucesso(undefined, "Endereço removido.");
  });
}
