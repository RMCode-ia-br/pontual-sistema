"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { ErroNegocio, executar, falha, falhaDeValidacao, formDataParaObjeto, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { registrarAuditoria } from "@/lib/auditoria";
import { extrairIp } from "@/lib/auth/autenticar";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissoes";

import { dadosDaObraSchema, idSchema, medidaSchema } from "./schemas";

const camposMedida = { id: true, projetoId: true, eventoId: true, ambiente: true, tipologia: true, larguraMm: true, alturaMm: true, quantidade: true, observacao: true, ordem: true } as const;

function revalidar(eventoId: string | undefined, projetoId: string) {
  if (eventoId) revalidatePath(`/agenda/${eventoId}/visita`);
  revalidatePath(`/projetos/${projetoId}`);
}

/**
 * Salva uma medida-rascunho (cria ou atualiza). Cada vão é salvo sozinho, para nada se perder na obra.
 * Vale também para vãos sem medida ainda (só ambiente/foto): as medidas podem ser completadas depois.
 */
export async function salvarMedida(_anterior: ResultadoAcao<{ id: string }> | null, formData: FormData): Promise<ResultadoAcao<{ id: string }>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "medidaRascunho")) return falha("Sem permissão.");
  const lido = medidaSchema.safeParse(formDataParaObjeto(formData));
  if (!lido.success) return falhaDeValidacao(lido.error);
  const d = lido.data;

  return executar("visitas.medida.salvar", async () => {
    const ip = extrairIp(await headers());
    const id = await prisma.$transaction(async (tx) => {
      const projeto = await tx.projeto.findFirst({ where: { id: d.projetoId, deletadoEm: null }, select: { id: true } });
      if (!projeto) throw new ErroNegocio("Projeto não encontrado.");
      if (d.eventoId) {
        const evento = await tx.eventoAgenda.findFirst({ where: { id: d.eventoId, projetoId: projeto.id, deletadoEm: null }, select: { id: true } });
        if (!evento) throw new ErroNegocio("Essa visita não pertence ao projeto.");
      }
      const dados = {
        ambiente: d.ambiente ?? null,
        tipologia: d.tipologia ?? null,
        larguraMm: d.larguraMm ?? null,
        alturaMm: d.alturaMm ?? null,
        quantidade: d.quantidade,
        observacao: d.observacao ?? null,
      };
      if (d.id) {
        const antes = await tx.medidaRascunho.findFirst({ where: { id: d.id, projetoId: projeto.id, deletadoEm: null }, select: camposMedida });
        if (!antes) throw new ErroNegocio("Medida não encontrada.");
        const depois = await tx.medidaRascunho.update({ where: { id: d.id }, data: { ...dados, atualizadoPorId: sessao.id }, select: camposMedida });
        await registrarAuditoria(tx, { usuario: sessao, entidade: "MedidaRascunho", entidadeId: d.id, acao: "ATUALIZAR", antes, depois, ip });
        return d.id;
      }
      const ultima = await tx.medidaRascunho.aggregate({ where: { projetoId: projeto.id, deletadoEm: null }, _max: { ordem: true } });
      const nova = await tx.medidaRascunho.create({
        data: { ...dados, projetoId: projeto.id, eventoId: d.eventoId ?? null, ordem: (ultima._max.ordem ?? 0) + 1, criadoPorId: sessao.id, atualizadoPorId: sessao.id },
        select: camposMedida,
      });
      await registrarAuditoria(tx, { usuario: sessao, entidade: "MedidaRascunho", entidadeId: nova.id, acao: "CRIAR", depois: nova, ip });
      return nova.id;
    });
    revalidar(d.eventoId, d.projetoId);
    return sucesso({ id }, "Medida salva.");
  });
}

export async function excluirMedida(idBruto: string): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "excluir", "medidaRascunho")) return falha("Sem permissão.");
  const id = idSchema.safeParse(idBruto);
  if (!id.success) return falha("Medida inválida.");

  return executar("visitas.medida.excluir", async () => {
    const ip = extrairIp(await headers());
    const antes = await prisma.$transaction(async (tx) => {
      const a = await tx.medidaRascunho.findFirst({ where: { id: id.data, deletadoEm: null }, select: camposMedida });
      if (!a) throw new ErroNegocio("Medida não encontrada.");
      await tx.medidaRascunho.update({ where: { id: a.id }, data: { deletadoEm: new Date(), atualizadoPorId: sessao.id } });
      await registrarAuditoria(tx, { usuario: sessao, entidade: "MedidaRascunho", entidadeId: a.id, acao: "EXCLUIR", antes: a, ip });
      return a;
    });
    revalidar(antes.eventoId ?? undefined, antes.projetoId);
    return sucesso(undefined, "Medida removida.");
  });
}

/** Dados da obra levantados na visita: fase, arquiteto, prazo, investimento e condomínio (R9). */
export async function salvarDadosDaObra(_anterior: ResultadoAcao | null, formData: FormData): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "projeto")) return falha("Sem permissão.");
  const lido = dadosDaObraSchema.safeParse(formDataParaObjeto(formData));
  if (!lido.success) return falhaDeValidacao(lido.error);
  const d = lido.data;
  const eventoId = String(formData.get("eventoId") ?? "");

  return executar("visitas.obra.salvar", async () => {
    const ip = extrairIp(await headers());
    await prisma.$transaction(async (tx) => {
      const antes = await tx.projeto.findFirst({
        where: { id: d.projetoId, deletadoEm: null },
        select: { id: true, faseDaObra: true, arquitetoId: true, prazoDesejado: true, investimentoPrevistoCentavos: true, enderecoObraId: true },
      });
      if (!antes) throw new ErroNegocio("Projeto não encontrado.");
      if (d.arquitetoId) {
        const arq = await tx.cliente.findFirst({ where: { id: d.arquitetoId, deletadoEm: null }, select: { id: true } });
        if (!arq) throw new ErroNegocio("O arquiteto escolhido não foi encontrado.", { arquitetoId: "Escolha um cadastro da lista." });
      }
      const depois = await tx.projeto.update({
        where: { id: d.projetoId },
        data: {
          faseDaObra: d.faseDaObra ?? null,
          arquitetoId: d.arquitetoId ?? null,
          prazoDesejado: d.prazoDesejado ?? null,
          investimentoPrevistoCentavos: d.investimentoPrevistoCentavos ?? null,
          atualizadoPorId: sessao.id,
        },
        select: { faseDaObra: true, arquitetoId: true, prazoDesejado: true, investimentoPrevistoCentavos: true },
      });
      await registrarAuditoria(tx, { usuario: sessao, entidade: "Projeto", entidadeId: d.projetoId, acao: "ATUALIZAR", antes, depois, ip });

      // O condomínio fica no endereço da obra (se o projeto tiver um).
      if (antes.enderecoObraId) {
        const endAntes = await tx.enderecoCliente.findFirst({
          where: { id: antes.enderecoObraId, deletadoEm: null },
          select: { id: true, condominio: true, condominioNome: true, exigeAprovacaoFachada: true, fachadaAprovada: true, horariosPermitidos: true, sindicoNome: true, sindicoTelefone: true },
        });
        if (endAntes) {
          const endDepois = await tx.enderecoCliente.update({
            where: { id: endAntes.id },
            data: {
              condominio: d.condominio,
              condominioNome: d.condominio ? (d.condominioNome ?? null) : null,
              exigeAprovacaoFachada: d.condominio && d.exigeAprovacaoFachada,
              fachadaAprovada: d.condominio && d.exigeAprovacaoFachada && d.fachadaAprovada,
              horariosPermitidos: d.condominio ? (d.horariosPermitidos ?? null) : null,
              sindicoNome: d.condominio ? (d.sindicoNome ?? null) : null,
              sindicoTelefone: d.condominio ? (d.sindicoTelefone ?? null) : null,
              atualizadoPorId: sessao.id,
            },
            select: { condominio: true, condominioNome: true, exigeAprovacaoFachada: true, fachadaAprovada: true, horariosPermitidos: true, sindicoNome: true, sindicoTelefone: true },
          });
          await registrarAuditoria(tx, { usuario: sessao, entidade: "EnderecoCliente", entidadeId: endAntes.id, acao: "ATUALIZAR", antes: endAntes, depois: endDepois, ip });
        }
      }
    });
    revalidar(eventoId || undefined, d.projetoId);
    return sucesso(undefined, "Dados da obra salvos.");
  });
}
