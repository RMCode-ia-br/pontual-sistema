"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { ErroNegocio, executar, falha, falhaDeValidacao, formDataParaObjeto, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { registrarAuditoria } from "@/lib/auditoria";
import { extrairIp } from "@/lib/auth/autenticar";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissoes";
import { registrarInteracao } from "@/modules/interacoes/registrar";

import { buscarDuplicados } from "../queries";
import { idsSchema, lerCliente, lerClienteEditado } from "../schemas";

const campos = {
  id: true,
  tipoPessoa: true,
  nome: true,
  nomeFantasia: true,
  cpfCnpj: true,
  telefone: true,
  whatsapp: true,
  email: true,
  clienteFinal: true,
  arquiteto: true,
  construtora: true,
  empresa: true,
  origem: true,
  origemDetalhe: true,
  indicadoPorId: true,
  observacoes: true,
  ativo: true,
} as const;

function revalidar(id?: string) {
  revalidatePath("/clientes");
  revalidatePath("/parceiros");
  if (id) revalidatePath(`/clientes/${id}`);
  revalidatePath("/", "layout");
}

/** O indicador precisa ser um cliente existente (nunca confiar em ID vindo do navegador). */
async function conferirIndicador(indicadoPorId: string | undefined, proprioId?: string) {
  if (!indicadoPorId) return;
  if (indicadoPorId === proprioId) throw new ErroNegocio("Um cliente não pode indicar a si mesmo.", { indicadoPorId: "Escolha outro cliente." });
  const existe = await prisma.cliente.findFirst({ where: { id: indicadoPorId, deletadoEm: null }, select: { id: true } });
  if (!existe) throw new ErroNegocio("O cliente que indicou não foi encontrado.", { indicadoPorId: "Escolha um cliente da lista." });
}

/** Aviso de duplicidade: só segue se a pessoa confirmou que quer cadastrar assim mesmo. */
async function conferirDuplicidade(dados: { cpfCnpj?: string; telefone?: string; whatsapp?: string }, confirmado: boolean, exceto?: string) {
  if (confirmado) return;
  const duplicados = await buscarDuplicados(dados, exceto);
  if (duplicados.length > 0) {
    const [primeiro] = duplicados;
    throw new ErroNegocio(`Já existe um cliente com ${primeiro.motivo}: ${primeiro.nome}. Abra o cadastro existente ou confirme para cadastrar assim mesmo.`, {
      _duplicidade: "1",
    });
  }
}

export async function criarCliente(_anterior: ResultadoAcao<{ id: string }> | null, formData: FormData): Promise<ResultadoAcao<{ id: string }>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "criar", "cliente")) return falha("Sem permissão.");

  const dados = lerCliente(formDataParaObjeto(formData));
  if (!dados.success) return falhaDeValidacao(dados.error);
  const { confirmarDuplicado, ...valores } = dados.data;

  return executar("clientes.criar", async () => {
    await conferirIndicador(valores.indicadoPorId);
    await conferirDuplicidade(valores, confirmarDuplicado);
    const ip = extrairIp(await headers());
    const criado = await prisma.$transaction(async (tx) => {
      const novo = await tx.cliente.create({
        data: {
          ...valores,
          nomeFantasia: valores.nomeFantasia ?? null,
          cpfCnpj: valores.cpfCnpj ?? null,
          telefone: valores.telefone ?? null,
          whatsapp: valores.whatsapp ?? null,
          email: valores.email ?? null,
          origem: valores.origem ?? null,
          origemDetalhe: valores.origemDetalhe ?? null,
          indicadoPorId: valores.indicadoPorId ?? null,
          observacoes: valores.observacoes ?? null,
          criadoPorId: sessao.id,
          atualizadoPorId: sessao.id,
        },
        select: campos,
      });
      await registrarAuditoria(tx, { usuario: sessao, entidade: "Cliente", entidadeId: novo.id, acao: "CRIAR", depois: novo, ip });
      await registrarInteracao(tx, { tipo: "SISTEMA", texto: "Cliente cadastrado.", clienteId: novo.id, usuarioId: sessao.id });
      return novo;
    });
    revalidar();
    return sucesso({ id: criado.id }, "Cliente cadastrado.");
  });
}

export async function editarCliente(_anterior: ResultadoAcao<{ id: string }> | null, formData: FormData): Promise<ResultadoAcao<{ id: string }>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "cliente")) return falha("Sem permissão.");

  const dados = lerClienteEditado(formDataParaObjeto(formData));
  if (!dados.success) return falhaDeValidacao(dados.error);
  const { id, confirmarDuplicado, ...valores } = dados.data;

  return executar("clientes.editar", async () => {
    await conferirIndicador(valores.indicadoPorId, id);
    await conferirDuplicidade(valores, confirmarDuplicado, id);
    const ip = extrairIp(await headers());
    await prisma.$transaction(async (tx) => {
      const antes = await tx.cliente.findFirst({ where: { id, deletadoEm: null }, select: campos });
      if (!antes) throw new ErroNegocio("Cliente não encontrado.");
      const depois = await tx.cliente.update({
        where: { id },
        data: {
          ...valores,
          nomeFantasia: valores.nomeFantasia ?? null,
          cpfCnpj: valores.cpfCnpj ?? null,
          telefone: valores.telefone ?? null,
          whatsapp: valores.whatsapp ?? null,
          email: valores.email ?? null,
          origem: valores.origem ?? null,
          origemDetalhe: valores.origemDetalhe ?? null,
          indicadoPorId: valores.indicadoPorId ?? null,
          observacoes: valores.observacoes ?? null,
          atualizadoPorId: sessao.id,
        },
        select: campos,
      });
      await registrarAuditoria(tx, { usuario: sessao, entidade: "Cliente", entidadeId: id, acao: "ATUALIZAR", antes, depois, ip });
    });
    revalidar(id);
    return sucesso({ id }, "Cliente atualizado.");
  });
}

async function mudarSituacao(idsBrutos: string[], ativo: boolean): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "cliente")) return falha("Sem permissão.");
  const ids = idsSchema.safeParse(idsBrutos);
  if (!ids.success) return falha(ids.error.issues[0]?.message ?? "Seleção inválida.");

  return executar("clientes.situacao", async () => {
    const ip = extrairIp(await headers());
    const alterados = await prisma.$transaction(async (tx) => {
      const alvos = await tx.cliente.findMany({ where: { id: { in: ids.data }, deletadoEm: null, ativo: !ativo }, select: campos });
      for (const antes of alvos) {
        await tx.cliente.update({ where: { id: antes.id }, data: { ativo, atualizadoPorId: sessao.id } });
        await registrarAuditoria(tx, {
          usuario: sessao,
          entidade: "Cliente",
          entidadeId: antes.id,
          acao: ativo ? "REATIVAR" : "INATIVAR",
          antes: { ativo: antes.ativo },
          depois: { ativo },
          ip,
        });
        await registrarInteracao(tx, { tipo: "SISTEMA", texto: ativo ? "Cliente reativado." : "Cliente inativado.", clienteId: antes.id, usuarioId: sessao.id });
      }
      return alvos.length;
    });
    revalidar();
    if (alterados === 0) return sucesso(undefined, "Nada a alterar.");
    return sucesso(undefined, `${alterados} ${alterados === 1 ? "cliente" : "clientes"} ${ativo ? "reativado" : "inativado"}${alterados === 1 ? "" : "s"}.`);
  });
}

export async function inativarClientes(ids: string[]): Promise<ResultadoAcao> {
  return mudarSituacao(ids, false);
}

export async function reativarClientes(ids: string[]): Promise<ResultadoAcao> {
  return mudarSituacao(ids, true);
}

/** Exclusão lógica (vai para a lixeira, de onde pode ser restaurado). Nunca apaga o registro. */
export async function excluirClientes(idsBrutos: string[]): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "excluir", "cliente")) return falha("Sem permissão.");
  const ids = idsSchema.safeParse(idsBrutos);
  if (!ids.success) return falha(ids.error.issues[0]?.message ?? "Seleção inválida.");

  return executar("clientes.excluir", async () => {
    const ip = extrairIp(await headers());
    const removidos = await prisma.$transaction(async (tx) => {
      const alvos = await tx.cliente.findMany({ where: { id: { in: ids.data }, deletadoEm: null }, select: campos });
      // Projetos ativos e visitas futuras ficariam órfãos no funil e na agenda: tratar o projeto antes.
      const comProjeto = await tx.projeto.findMany({ where: { clienteId: { in: alvos.map((a) => a.id) }, deletadoEm: null }, select: { cliente: { select: { nome: true } } }, take: 3 });
      if (comProjeto.length > 0) {
        throw new ErroNegocio(`Não dá para enviar à lixeira: ${comProjeto[0].cliente.nome} tem projetos ativos. Envie os projetos para a lixeira ou marque-os como perdidos primeiro.`);
      }
      for (const antes of alvos) {
        await tx.cliente.update({ where: { id: antes.id }, data: { deletadoEm: new Date(), atualizadoPorId: sessao.id } });
        await registrarAuditoria(tx, { usuario: sessao, entidade: "Cliente", entidadeId: antes.id, acao: "EXCLUIR", antes, ip });
      }
      return alvos.length;
    });
    revalidar();
    if (removidos === 0) return sucesso(undefined, "Nada a remover.");
    return sucesso(undefined, `${removidos} ${removidos === 1 ? "cliente enviado" : "clientes enviados"} para a lixeira.`);
  });
}
