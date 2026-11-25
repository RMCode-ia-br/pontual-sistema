"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { executar, falha, falhaDeValidacao, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { extrairIp } from "@/lib/auth/autenticar";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { tentarDeNovoEmDeadlock } from "@/lib/db/deadlock";
import { can } from "@/lib/permissoes";
import { campoIdObrigatorio } from "@/lib/validadores/campos";

import { previaDaTroca, previaDoDesfazer, type PreviaDaTroca, type PreviaDoDesfazer } from "../previa-desfazer";
import { desfazerAprovacao, reabrirRevisao, trocarAprovacao, type ResultadoDesfazer, type ResultadoReabrir, type ResultadoTroca } from "../servico-desfazer";

/** Desfazer e trocar mexem em parcelas, etapas, tarefas, painel e obras: revalida tudo. */
function revalidar(propostaIds: string[], projetoId: string) {
  for (const id of propostaIds) revalidatePath(`/propostas/${id}`);
  revalidatePath("/propostas");
  revalidatePath(`/projetos/${projetoId}`);
  revalidatePath("/", "layout");
}

const idSchema = campoIdObrigatorio("Proposta inválida.");
const motivoSchema = z.string().trim().min(3, "Conte o motivo.").max(500, "Use no máximo 500 caracteres.");

const desfazerSchema = z.object({ propostaId: idSchema, motivo: motivoSchema, reabrirId: z.string().trim().max(64).optional() });

/** Desfaz a aprovação (foi engano): volta a proposta a "enviada", cancela as parcelas e tarefas e remove as etapas geradas. */
export async function desfazerAprovacaoAcao(entrada: z.input<typeof desfazerSchema>): Promise<ResultadoAcao<ResultadoDesfazer>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "desfazer", "aprovacao")) return falha("Sem permissão.");
  const lido = desfazerSchema.safeParse(entrada);
  if (!lido.success) return falhaDeValidacao(lido.error);
  const v = lido.data;
  return executar("propostas.desfazerAprovacao", async () => {
    const ip = extrairIp(await headers());
    const r = await tentarDeNovoEmDeadlock(() => prisma.$transaction((tx) => desfazerAprovacao(tx, { usuario: sessao, propostaId: v.propostaId, motivo: v.motivo, reabrirId: v.reabrirId || null, ip }), { timeout: 30_000 }));
    revalidar([v.propostaId, ...(r.reaberta ? [r.reaberta.id] : [])], r.projetoId);
    return sucesso(r, `Aprovação da proposta ${r.numero} desfeita.${r.reaberta ? ` A ${r.reaberta.revisao === 0 ? "original" : `Rev. ${r.reaberta.revisao}`} voltou como ${r.reaberta.status === "RASCUNHO" ? "rascunho" : "enviada"}.` : ""}`);
  });
}

const trocarSchema = z.object({
  deId: idSchema,
  paraId: idSchema,
  opcaoId: campoIdObrigatorio("Escolha a opção aprovada."),
  formaPagamento: z.string().trim().max(60).optional(),
  forma: z.enum(["WHATSAPP", "EMAIL", "ASSINATURA", "VERBAL"], { message: "Informe como o cliente aceitou." }),
  aceitaEm: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data do aceite."),
  observacao: z.string().trim().max(1000, "Use no máximo 1.000 caracteres.").optional(),
  motivo: motivoSchema,
});

/** Troca a aprovação: desfaz a vigente e aprova a revisão escolhida, tudo ou nada. */
export async function trocarAprovacaoAcao(entrada: z.input<typeof trocarSchema>): Promise<ResultadoAcao<ResultadoTroca>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "desfazer", "aprovacao") || !can(sessao, "aprovar", "proposta")) return falha("Sem permissão.");
  const lido = trocarSchema.safeParse(entrada);
  if (!lido.success) return falhaDeValidacao(lido.error);
  const v = lido.data;
  return executar("propostas.trocarAprovacao", async () => {
    const ip = extrairIp(await headers());
    const r = await tentarDeNovoEmDeadlock(() => prisma.$transaction((tx) => trocarAprovacao(tx, { usuario: sessao, deId: v.deId, paraId: v.paraId, opcaoId: v.opcaoId, formaPagamento: v.formaPagamento, forma: v.forma, aceitaEm: v.aceitaEm, observacao: v.observacao, motivo: v.motivo, ip }), { timeout: 30_000 }));
    revalidar([v.deId, v.paraId], r.projetoId);
    return sucesso(r, `Aprovação trocada: a proposta ${r.numero} agora está aprovada pela revisão escolhida.`);
  });
}

/** Reabre uma revisão substituída (só quando nenhuma irmã está aprovada). */
export async function reabrirRevisaoAcao(propostaIdBruto: string): Promise<ResultadoAcao<ResultadoReabrir>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "proposta")) return falha("Sem permissão.");
  const id = idSchema.safeParse(propostaIdBruto);
  if (!id.success) return falha("Proposta inválida.");
  return executar("propostas.reabrirRevisao", async () => {
    const ip = extrairIp(await headers());
    const r = await tentarDeNovoEmDeadlock(() => prisma.$transaction((tx) => reabrirRevisao(tx, { usuario: sessao, propostaId: id.data, ip }), { timeout: 30_000 }));
    revalidar([id.data], r.projetoId);
    return sucesso(r, `A ${r.revisao === 0 ? "original" : `Rev. ${r.revisao}`} foi reaberta como ${r.status === "RASCUNHO" ? "rascunho" : "enviada"}.`);
  });
}

/** Prévia (só leitura) do que desfazer a aprovação causa. O servidor recalcula tudo ao desfazer. */
export async function previaDesfazerAcao(propostaIdBruto: string): Promise<ResultadoAcao<PreviaDoDesfazer>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "desfazer", "aprovacao")) return falha("Sem permissão.");
  const id = idSchema.safeParse(propostaIdBruto);
  if (!id.success) return falha("Proposta inválida.");
  return executar("propostas.previaDesfazer", async () => sucesso(await previaDoDesfazer(prisma, id.data)));
}

const previaTrocaSchema = z.object({ deId: idSchema, paraId: idSchema, opcaoId: z.string().trim().max(64).optional(), formaPagamento: z.string().trim().max(60).optional() });

/** Prévia (só leitura) do que trocar a aprovação muda: parcelas, valor fechado, etapas, prazo e tarefas. */
export async function previaTrocaAcao(entrada: z.input<typeof previaTrocaSchema>): Promise<ResultadoAcao<PreviaDaTroca>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "desfazer", "aprovacao")) return falha("Sem permissão.");
  const lido = previaTrocaSchema.safeParse(entrada);
  if (!lido.success) return falhaDeValidacao(lido.error);
  return executar("propostas.previaTroca", async () => sucesso(await previaDaTroca(prisma, { deId: lido.data.deId, paraId: lido.data.paraId, opcaoId: lido.data.opcaoId || null, formaPagamento: lido.data.formaPagamento })));
}
