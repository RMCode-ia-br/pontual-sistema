"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { ErroNegocio, executar, falha, falhaDeValidacao, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { registrarAuditoria } from "@/lib/auditoria";
import { extrairIp } from "@/lib/auth/autenticar";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { podeCriarRevisao, podeTransitar } from "@/lib/dominio/ciclo-proposta";
import { can } from "@/lib/permissoes";
import { campoIdObrigatorio } from "@/lib/validadores/campos";
import { registrarInteracao } from "@/modules/interacoes/registrar";

import { aprovarProposta as aprovarNaTransacao, copiarProposta, enviarProposta as enviarNaTransacao } from "../servico-ciclo";

function revalidar(id: string, projetoId: string) {
  revalidatePath(`/propostas/${id}`);
  revalidatePath("/propostas");
  revalidatePath(`/projetos/${projetoId}`);
  revalidatePath("/funil");
  revalidatePath("/tarefas");
  revalidatePath("/", "layout");
}

const idSchema = campoIdObrigatorio("Proposta inválida.");

/** Marca como enviada: congela o conteúdo (R4), move o projeto no funil e cria o acompanhamento (R11). */
export async function marcarComoEnviada(propostaIdBruto: string): Promise<ResultadoAcao<{ numero: string }>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "proposta")) return falha("Sem permissão.");
  const id = idSchema.safeParse(propostaIdBruto);
  if (!id.success) return falha("Proposta inválida.");
  return executar("propostas.enviar", async () => {
    const ip = extrairIp(await headers());
    const r = await prisma.$transaction((tx) => enviarNaTransacao(tx, { usuario: sessao, propostaId: id.data, ip }));
    revalidar(id.data, r.projetoId);
    return sucesso({ numero: r.numero }, `Proposta ${r.numero} marcada como enviada e congelada.`);
  });
}

const aprovacaoSchema = z.object({
  propostaId: idSchema,
  opcaoId: campoIdObrigatorio("Escolha a opção aprovada."),
  forma: z.enum(["WHATSAPP", "EMAIL", "ASSINATURA", "VERBAL"], { message: "Informe como o cliente aceitou." }),
  aceitaEm: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data do aceite."),
  observacao: z.string().trim().max(1000, "Use no máximo 1.000 caracteres.").optional(),
});

export type ResultadoAprovacao = { numero: string; valorAprovadoCentavos: number; parcelasGeradas: number; semParcelas: boolean; outrasEmAberto: number; valorFechadoCentavos: number };

/** Aprova a proposta (R5): uma transação única com aceite, projeto, parcelas, tarefas e linha do tempo. */
export async function aprovarPropostaAcao(entrada: z.input<typeof aprovacaoSchema>): Promise<ResultadoAcao<ResultadoAprovacao>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "aprovar", "proposta")) return falha("Sem permissão.");
  const lido = aprovacaoSchema.safeParse(entrada);
  if (!lido.success) return falhaDeValidacao(lido.error);
  const v = lido.data;
  return executar("propostas.aprovar", async () => {
    const ip = extrairIp(await headers());
    const r = await prisma.$transaction((tx) => aprovarNaTransacao(tx, { usuario: sessao, propostaId: v.propostaId, opcaoId: v.opcaoId, forma: v.forma, aceitaEm: v.aceitaEm, observacao: v.observacao, ip }), { timeout: 30_000 });
    revalidar(v.propostaId, r.projetoId);
    return sucesso(r, `Proposta ${r.numero} aprovada.`);
  });
}

const recusaSchema = z.object({ propostaId: idSchema, motivoPerdaId: campoIdObrigatorio("Escolha o motivo."), detalhe: z.string().trim().max(500).optional() });

/** Recusa: pede o motivo. NÃO perde o projeto sozinho (outras propostas podem seguir); a tela só avisa. */
export async function recusarProposta(entrada: z.input<typeof recusaSchema>): Promise<ResultadoAcao<{ outrasEmAberto: number }>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "proposta")) return falha("Sem permissão.");
  const lido = recusaSchema.safeParse(entrada);
  if (!lido.success) return falhaDeValidacao(lido.error);
  const v = lido.data;
  return executar("propostas.recusar", async () => {
    const ip = extrairIp(await headers());
    const r = await prisma.$transaction(async (tx) => {
      const p = await tx.proposta.findFirst({ where: { id: v.propostaId, deletadoEm: null }, select: { id: true, numero: true, status: true, projetoId: true, projeto: { select: { clienteId: true } } } });
      if (!p) throw new ErroNegocio("Proposta não encontrada.");
      if (!podeTransitar(p.status, "RECUSADA")) throw new ErroNegocio("Só uma proposta enviada pode ser recusada.");
      const motivo = await tx.motivoPerda.findFirst({ where: { id: v.motivoPerdaId, ativo: true, deletadoEm: null }, select: { nome: true } });
      if (!motivo) throw new ErroNegocio("O motivo escolhido não está disponível.", { motivoPerdaId: "Escolha um motivo da lista." });
      const mudou = await tx.proposta.updateMany({ where: { id: p.id, status: "ENVIADA" }, data: { status: "RECUSADA", recusadaEm: new Date(), motivoPerdaId: v.motivoPerdaId, motivoRecusaDetalhe: v.detalhe || null, atualizadoPorId: sessao.id } });
      if (mudou.count === 0) throw new ErroNegocio("Esta proposta mudou enquanto você decidia. Atualize a página.");
      await registrarInteracao(tx, { tipo: "SISTEMA", texto: `Proposta ${p.numero} recusada. Motivo: ${motivo.nome}${v.detalhe ? ` (${v.detalhe})` : ""}.`, clienteId: p.projeto.clienteId, projetoId: p.projetoId, usuarioId: sessao.id });
      await registrarAuditoria(tx, { usuario: sessao, entidade: "Proposta", entidadeId: p.id, acao: "RECUSAR", antes: { status: "ENVIADA" }, depois: { status: "RECUSADA", motivo: motivo.nome }, ip });
      const outras = await tx.proposta.count({ where: { projetoId: p.projetoId, id: { not: p.id }, status: { in: ["RASCUNHO", "ENVIADA"] }, deletadoEm: null } });
      return { projetoId: p.projetoId, outrasEmAberto: outras };
    });
    revalidar(v.propostaId, r.projetoId);
    return sucesso({ outrasEmAberto: r.outrasEmAberto }, r.outrasEmAberto === 0 ? "Proposta recusada. Se o cliente desistiu, marque o projeto como perdido no funil." : "Proposta recusada. O projeto continua aberto (há outras propostas).");
  });
}

export async function cancelarProposta(propostaIdBruto: string): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "proposta")) return falha("Sem permissão.");
  const id = idSchema.safeParse(propostaIdBruto);
  if (!id.success) return falha("Proposta inválida.");
  return executar("propostas.cancelar", async () => {
    const ip = extrairIp(await headers());
    const projetoId = await prisma.$transaction(async (tx) => {
      const p = await tx.proposta.findFirst({ where: { id: id.data, deletadoEm: null }, select: { id: true, numero: true, status: true, projetoId: true, projeto: { select: { clienteId: true } } } });
      if (!p) throw new ErroNegocio("Proposta não encontrada.");
      if (!podeTransitar(p.status, "CANCELADA")) throw new ErroNegocio("Esta proposta não pode ser cancelada.");
      const mudou = await tx.proposta.updateMany({ where: { id: p.id, status: p.status }, data: { status: "CANCELADA", atualizadoPorId: sessao.id } });
      if (mudou.count === 0) throw new ErroNegocio("Esta proposta mudou enquanto você decidia. Atualize a página.");
      await registrarInteracao(tx, { tipo: "SISTEMA", texto: `Proposta ${p.numero} cancelada.`, clienteId: p.projeto.clienteId, projetoId: p.projetoId, usuarioId: sessao.id });
      await registrarAuditoria(tx, { usuario: sessao, entidade: "Proposta", entidadeId: p.id, acao: "CANCELAR", antes: { status: p.status }, depois: { status: "CANCELADA" }, ip });
      return p.projetoId;
    });
    revalidar(id.data, projetoId);
    return sucesso(undefined, "Proposta cancelada.");
  });
}

/** Nova revisão: mesma numeração, `Rev. N`, como rascunho. A anterior só sai de vigor quando a nova for enviada. */
export async function criarRevisao(propostaIdBruto: string): Promise<ResultadoAcao<{ id: string }>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "criar", "proposta")) return falha("Sem permissão.");
  const id = idSchema.safeParse(propostaIdBruto);
  if (!id.success) return falha("Proposta inválida.");
  return executar("propostas.revisao", async () => {
    const ip = extrairIp(await headers());
    const nova = await prisma.$transaction(async (tx) => {
      const o = await tx.proposta.findFirst({ where: { id: id.data, deletadoEm: null }, select: { numero: true, status: true } });
      if (!o) throw new ErroNegocio("Proposta não encontrada.");
      if (!podeCriarRevisao(o.status)) throw new ErroNegocio("Só uma proposta enviada pode ganhar nova revisão.");
      const pendente = await tx.proposta.count({ where: { numero: o.numero, status: "RASCUNHO", deletadoEm: null } });
      if (pendente > 0) throw new ErroNegocio("Já existe uma revisão em rascunho desta proposta. Continue nela.");
      const c = await copiarProposta(tx, { usuarioId: sessao.id, origemId: id.data, modo: "REVISAO" });
      const projeto = await tx.projeto.findUniqueOrThrow({ where: { id: c.projetoId }, select: { clienteId: true } });
      await registrarInteracao(tx, { tipo: "SISTEMA", texto: `Revisão ${c.revisao} da proposta ${c.numero} criada (rascunho).`, clienteId: projeto.clienteId, projetoId: c.projetoId, usuarioId: sessao.id });
      await registrarAuditoria(tx, { usuario: sessao, entidade: "Proposta", entidadeId: c.id, acao: "CRIAR_REVISAO", depois: { numero: c.numero, revisao: c.revisao, origem: id.data }, ip });
      return c;
    });
    revalidar(nova.id, nova.projetoId);
    return sucesso({ id: nova.id }, `Revisão ${nova.revisao} criada. Faça as alterações e envie de novo.`);
  });
}

/** R13: o gestor marca a validade como encerrada por reajuste de fornecedor (proposta já enviada). */
export async function encerrarValidadePorReajuste(propostaIdBruto: string): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "proposta")) return falha("Sem permissão.");
  const id = idSchema.safeParse(propostaIdBruto);
  if (!id.success) return falha("Proposta inválida.");
  return executar("propostas.validade", async () => {
    const ip = extrairIp(await headers());
    const projetoId = await prisma.$transaction(async (tx) => {
      const p = await tx.proposta.findFirst({ where: { id: id.data, deletadoEm: null, status: { in: ["RASCUNHO", "ENVIADA"] } }, select: { id: true, numero: true, projetoId: true } });
      if (!p) throw new ErroNegocio("Proposta não encontrada ou já decidida.");
      await tx.proposta.update({ where: { id: p.id }, data: { validadeEncerradaPorReajuste: true, atualizadoPorId: sessao.id } });
      await registrarAuditoria(tx, { usuario: sessao, entidade: "Proposta", entidadeId: p.id, acao: "VALIDADE_ENCERRADA_REAJUSTE", depois: { validadeEncerradaPorReajuste: true }, ip });
      return p.projetoId;
    });
    revalidar(id.data, projetoId);
    return sucesso(undefined, "Validade marcada como encerrada por reajuste de fornecedor.");
  });
}
