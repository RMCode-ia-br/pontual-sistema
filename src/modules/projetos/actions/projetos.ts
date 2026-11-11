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

import { idsSchema, lerProjeto, lerProjetoEditado, type DadosProjeto } from "../schemas";
import { proximoCodigoDoProjeto } from "../servico";

const campos = {
  id: true,
  codigo: true,
  titulo: true,
  clienteId: true,
  enderecoObraId: true,
  arquitetoId: true,
  construtoraId: true,
  responsavelId: true,
  status: true,
  tiposServico: true,
  origem: true,
  origemDetalhe: true,
  porte: true,
  interesse: true,
  temperatura: true,
  faseDaObra: true,
  investimentoPrevistoCentavos: true,
  valorEstimadoCentavos: true,
  prazoDesejado: true,
  observacoes: true,
} as const;

function revalidar(id?: string) {
  revalidatePath("/projetos");
  revalidatePath("/funil");
  if (id) revalidatePath(`/projetos/${id}`);
  revalidatePath("/", "layout");
}

/** Nunca confiar em IDs vindos do navegador: cliente, endereço, parceiros e responsável precisam existir e combinar. */
async function conferirVinculos(dados: DadosProjeto) {
  const cliente = await prisma.cliente.findFirst({ where: { id: dados.clienteId, deletadoEm: null }, select: { id: true, origem: true } });
  if (!cliente) throw new ErroNegocio("O cliente escolhido não foi encontrado.", { clienteId: "Escolha um cliente da lista." });

  if (dados.enderecoObraId) {
    const endereco = await prisma.enderecoCliente.findFirst({ where: { id: dados.enderecoObraId, clienteId: cliente.id, deletadoEm: null }, select: { id: true } });
    if (!endereco) throw new ErroNegocio("O endereço da obra não pertence a esse cliente.", { enderecoObraId: "Escolha um endereço do cliente." });
  }
  for (const [campo, id] of [["arquitetoId", dados.arquitetoId], ["construtoraId", dados.construtoraId]] as const) {
    if (!id) continue;
    const parceiro = await prisma.cliente.findFirst({ where: { id, deletadoEm: null }, select: { id: true } });
    if (!parceiro) throw new ErroNegocio("O parceiro escolhido não foi encontrado.", { [campo]: "Escolha um cadastro da lista." });
  }
  if (dados.responsavelId) {
    const usuario = await prisma.usuario.findFirst({ where: { id: dados.responsavelId, ativo: true, deletadoEm: null }, select: { id: true } });
    if (!usuario) throw new ErroNegocio("O responsável escolhido não está disponível.", { responsavelId: "Escolha um usuário ativo." });
  }
  return cliente;
}

export async function criarProjeto(_anterior: ResultadoAcao<{ id: string }> | null, formData: FormData): Promise<ResultadoAcao<{ id: string }>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "criar", "projeto")) return falha("Sem permissão.");

  const lido = lerProjeto(formDataParaObjeto(formData));
  if (!lido.success) return falhaDeValidacao(lido.error);
  const dados = lido.data;

  return executar("projetos.criar", async () => {
    const cliente = await conferirVinculos(dados);
    const ip = extrairIp(await headers());
    const criado = await prisma.$transaction(async (tx) => {
      const novo = await tx.projeto.create({
        data: {
          codigo: await proximoCodigoDoProjeto(tx),
          titulo: dados.titulo,
          clienteId: dados.clienteId,
          enderecoObraId: dados.enderecoObraId ?? null,
          arquitetoId: dados.arquitetoId ?? null,
          construtoraId: dados.construtoraId ?? null,
          responsavelId: dados.responsavelId ?? null,
          tiposServico: dados.tiposServico,
          // Sem origem informada, herda a do cadastro do cliente (a pessoa pode trocar depois).
          origem: dados.origem ?? cliente.origem ?? null,
          origemDetalhe: dados.origemDetalhe ?? null,
          porte: dados.porte ?? null,
          interesse: dados.interesse,
          temperatura: dados.temperatura ?? null,
          faseDaObra: dados.faseDaObra ?? null,
          investimentoPrevistoCentavos: dados.investimentoPrevistoCentavos ?? null,
          valorEstimadoCentavos: dados.valorEstimadoCentavos ?? null,
          prazoDesejado: dados.prazoDesejado ?? null,
          observacoes: dados.observacoes ?? null,
          criadoPorId: sessao.id,
          atualizadoPorId: sessao.id,
        },
        select: campos,
      });
      await tx.historicoFaseProjeto.create({ data: { projetoId: novo.id, de: null, para: "NOVO_LEAD", criadoPorId: sessao.id } });
      await registrarAuditoria(tx, { usuario: sessao, entidade: "Projeto", entidadeId: novo.id, acao: "CRIAR", depois: novo, ip });
      await registrarInteracao(tx, { tipo: "SISTEMA", texto: `Projeto ${novo.codigo} criado.`, clienteId: novo.clienteId, projetoId: novo.id, usuarioId: sessao.id });
      return novo;
    });
    revalidar();
    revalidatePath(`/clientes/${dados.clienteId}`);
    return sucesso({ id: criado.id }, `Projeto ${criado.codigo} criado.`);
  });
}

export async function editarProjeto(_anterior: ResultadoAcao<{ id: string }> | null, formData: FormData): Promise<ResultadoAcao<{ id: string }>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "projeto")) return falha("Sem permissão.");

  const lido = lerProjetoEditado(formDataParaObjeto(formData));
  if (!lido.success) return falhaDeValidacao(lido.error);
  const { id, ...dados } = lido.data;

  return executar("projetos.editar", async () => {
    await conferirVinculos(dados);
    const ip = extrairIp(await headers());
    await prisma.$transaction(async (tx) => {
      const antes = await tx.projeto.findFirst({ where: { id, deletadoEm: null }, select: campos });
      if (!antes) throw new ErroNegocio("Projeto não encontrado.");
      // O cliente é a identidade do projeto (linha do tempo, visitas, financeiro): não muda depois de criado.
      if (antes.clienteId !== dados.clienteId) throw new ErroNegocio("O cliente do projeto não pode ser trocado.", { clienteId: "Crie um novo projeto para outro cliente." });
      const depois = await tx.projeto.update({
        where: { id },
        data: {
          titulo: dados.titulo,
          enderecoObraId: dados.enderecoObraId ?? null,
          arquitetoId: dados.arquitetoId ?? null,
          construtoraId: dados.construtoraId ?? null,
          responsavelId: dados.responsavelId ?? null,
          tiposServico: dados.tiposServico,
          origem: dados.origem ?? null,
          origemDetalhe: dados.origemDetalhe ?? null,
          porte: dados.porte ?? null,
          interesse: dados.interesse,
          temperatura: dados.temperatura ?? null,
          faseDaObra: dados.faseDaObra ?? null,
          investimentoPrevistoCentavos: dados.investimentoPrevistoCentavos ?? null,
          valorEstimadoCentavos: dados.valorEstimadoCentavos ?? null,
          prazoDesejado: dados.prazoDesejado ?? null,
          observacoes: dados.observacoes ?? null,
          atualizadoPorId: sessao.id,
        },
        select: campos,
      });
      await registrarAuditoria(tx, { usuario: sessao, entidade: "Projeto", entidadeId: id, acao: "ATUALIZAR", antes, depois, ip });
    });
    revalidar(id);
    revalidatePath(`/clientes/${dados.clienteId}`);
    return sucesso({ id }, "Projeto atualizado.");
  });
}

/** Envia para a lixeira (exclusão lógica). Tarefas, visitas e histórico continuam guardados. */
export async function excluirProjetos(idsBrutos: string[]): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "excluir", "projeto")) return falha("Sem permissão.");
  const ids = idsSchema.safeParse(idsBrutos);
  if (!ids.success) return falha(ids.error.issues[0]?.message ?? "Seleção inválida.");

  return executar("projetos.excluir", async () => {
    const ip = extrairIp(await headers());
    const excluidos = await prisma.$transaction(async (tx) => {
      const alvo = await tx.projeto.findMany({ where: { id: { in: ids.data }, deletadoEm: null }, select: { id: true, codigo: true, titulo: true, status: true, clienteId: true } });
      for (const p of alvo) {
        await tx.projeto.update({ where: { id: p.id }, data: { deletadoEm: new Date(), atualizadoPorId: sessao.id } });
        await registrarAuditoria(tx, { usuario: sessao, entidade: "Projeto", entidadeId: p.id, acao: "EXCLUIR", antes: p, ip });
      }
      return alvo;
    });
    revalidar();
    for (const clienteId of new Set(excluidos.map((p) => p.clienteId))) revalidatePath(`/clientes/${clienteId}`);
    revalidatePath("/lixeira");
    return sucesso(undefined, excluidos.length === 1 ? "Projeto enviado para a lixeira." : `${excluidos.length} projetos enviados para a lixeira.`);
  });
}
