/**
 * Regras do funil comercial (spec 7.3, R4/R5/R10/R11). Código puro e testável: quem chama
 * (Server Actions, Kanban) só traduz o resultado em tela ou gravação.
 */
import { differenceInCalendarDays } from "date-fns";
import { toZonedTime } from "date-fns-tz";

import { FUSO_PADRAO } from "../formatadores";

export type StatusProjeto =
  | "NOVO_LEAD"
  | "VISITA_AGENDADA"
  | "ELABORANDO_PROPOSTA"
  | "PROPOSTA_ENVIADA"
  | "NEGOCIACAO"
  | "APROVADO"
  | "EM_EXECUCAO"
  | "CONCLUIDO"
  | "PERDIDO"
  | "CANCELADO";

export const TODOS_OS_STATUS = [
  "NOVO_LEAD",
  "VISITA_AGENDADA",
  "ELABORANDO_PROPOSTA",
  "PROPOSTA_ENVIADA",
  "NEGOCIACAO",
  "APROVADO",
  "EM_EXECUCAO",
  "CONCLUIDO",
  "PERDIDO",
  "CANCELADO",
] as const satisfies readonly StatusProjeto[];

/** Fases em que o projeto ainda está sendo vendido (o Kanban comercial). */
export const FASES_ABERTAS = ["NOVO_LEAD", "VISITA_AGENDADA", "ELABORANDO_PROPOSTA", "PROPOSTA_ENVIADA", "NEGOCIACAO"] as const satisfies readonly StatusProjeto[];

/** Colunas do Kanban, na ordem (spec 7.3): as abertas, "Aprovado" (somente leitura) e "Perdidos". */
export const COLUNAS_DO_FUNIL = [...FASES_ABERTAS, "APROVADO", "PERDIDO"] as const satisfies readonly StatusProjeto[];

/** Fases que já saíram do funil comercial (aparecem em Obras). */
export const FASES_DE_OBRA = ["APROVADO", "EM_EXECUCAO", "CONCLUIDO"] as const satisfies readonly StatusProjeto[];

export const ROTULO_STATUS_PROJETO: Record<StatusProjeto, string> = {
  NOVO_LEAD: "Novo contato",
  VISITA_AGENDADA: "Visita agendada",
  ELABORANDO_PROPOSTA: "Elaborando proposta",
  PROPOSTA_ENVIADA: "Proposta enviada",
  NEGOCIACAO: "Negociação",
  APROVADO: "Aprovado",
  EM_EXECUCAO: "Em execução",
  CONCLUIDO: "Concluído",
  PERDIDO: "Perdido",
  CANCELADO: "Cancelado",
};

export function ehFaseAberta(status: StatusProjeto): boolean {
  return (FASES_ABERTAS as readonly string[]).includes(status);
}

export type ResultadoMovimento =
  | { ok: true; /** Mover para "Perdido" exige motivo (R10). */ exigeMotivo: boolean; /** Saindo de "Perdido": limpar motivo e data da perda. */ reabre: boolean }
  | { ok: false; motivo: string };

/**
 * Pode o projeto ir de `de` para `para` pelo funil?
 * - Entre as fases abertas, livre (nos dois sentidos).
 * - `PERDIDO` exige motivo; sair de `PERDIDO` para uma fase aberta é reabrir.
 * - `APROVADO` (e o que vem depois) só pela aprovação de uma proposta (R5): o funil nunca o concede.
 */
export function avaliarMovimento(de: StatusProjeto, para: StatusProjeto): ResultadoMovimento {
  if (de === para) return { ok: false, motivo: "O projeto já está nessa fase." };

  if ((FASES_DE_OBRA as readonly string[]).includes(de) || de === "CANCELADO") {
    return { ok: false, motivo: "Este projeto já saiu do funil comercial; o andamento dele é acompanhado em Obras." };
  }
  if ((FASES_DE_OBRA as readonly string[]).includes(para)) {
    return { ok: false, motivo: "Um projeto só vai para \"Aprovado\" aprovando uma proposta (na tela da proposta)." };
  }
  if (para === "CANCELADO") {
    return { ok: false, motivo: "Para encerrar um projeto no funil, marque-o como perdido e informe o motivo." };
  }
  if (para === "PERDIDO") return { ok: true, exigeMotivo: true, reabre: false };
  return { ok: true, exigeMotivo: false, reabre: de === "PERDIDO" };
}

/** Dias de calendário (fuso de São Paulo) desde a última movimentação. Nunca negativo. */
export function diasParado(ultimaMovimentacaoEm: Date, agora: Date = new Date()): number {
  const dias = differenceInCalendarDays(toZonedTime(agora, FUSO_PADRAO), toZonedTime(ultimaMovimentacaoEm, FUSO_PADRAO));
  return Math.max(0, dias);
}

/** Lista "Sem retorno" (R11): proposta enviada ou em negociação, parada há mais de `limiteDias`. */
export function estaSemRetorno(status: StatusProjeto, ultimaMovimentacaoEm: Date, limiteDias: number, agora: Date = new Date()): boolean {
  if (status !== "PROPOSTA_ENVIADA" && status !== "NEGOCIACAO") return false;
  return diasParado(ultimaMovimentacaoEm, agora) > limiteDias;
}

/**
 * Fase que o sistema SUGERE depois de um fato (nunca muda sozinho, exceto o agendamento de visita):
 * - visita agendada com o projeto em "Novo contato" → "Visita agendada" (automático);
 * - visita realizada com o projeto em "Novo contato"/"Visita agendada" → sugere "Elaborando proposta".
 */
export function faseAposAgendarVisita(atual: StatusProjeto): StatusProjeto | null {
  return atual === "NOVO_LEAD" ? "VISITA_AGENDADA" : null;
}

export function faseSugeridaAposVisitaRealizada(atual: StatusProjeto): StatusProjeto | null {
  return atual === "NOVO_LEAD" || atual === "VISITA_AGENDADA" ? "ELABORANDO_PROPOSTA" : null;
}
