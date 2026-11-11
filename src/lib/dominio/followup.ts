/**
 * Datas e chaves dos follow-ups automáticos (R11). Prazos em dias CORRIDOS (dias úteis são do prazo
 * de obra, R8). As datas são de calendário (meia-noite UTC, como as colunas `@db.Date`).
 * A chave é o que torna a criação idempotente: a mesma chave nunca gera duas tarefas.
 */
import { addDays } from "date-fns";

import { hojeCalendario } from "../formatadores";

/** Soma `dias` a uma data de calendário (meia-noite UTC). */
export function somarDiasCorridos(data: Date, dias: number): Date {
  if (!Number.isInteger(dias)) throw new RangeError("Número de dias inválido.");
  return addDays(data, dias);
}

/** Vencimento de "Acompanhar proposta": D+N a partir do dia (em São Paulo) em que a proposta foi enviada. */
export function vencimentoAcompanharProposta(enviadaEm: Date, diasFollowUp: number): Date {
  return somarDiasCorridos(hojeCalendario(enviadaEm), diasFollowUp);
}

/** Vencimento de "Pedir avaliação no Google": D+N a partir do dia em que a obra foi concluída. */
export function vencimentoPedidoAvaliacao(concluidaEm: Date, diasPedido: number): Date {
  return somarDiasCorridos(hojeCalendario(concluidaEm), diasPedido);
}

/** Aviso de fim da garantia de regulagem: 7 dias antes de `conclusaoInstalacao + garantiaDias` (R11/R12). */
export function vencimentoAvisoFimGarantia(conclusaoInstalacao: Date, garantiaDias: number, antecedenciaDias = 7): Date {
  return somarDiasCorridos(hojeCalendario(conclusaoInstalacao), garantiaDias - antecedenciaDias);
}

export type TipoFollowUp = "acompanhar-proposta" | "pedir-avaliacao" | "fim-garantia";

/**
 * Chave de idempotência. `referencia` identifica o fato que originou a tarefa (ex.: id do movimento de fase
 * em que o projeto entrou em "Proposta enviada"): se o projeto sai e volta, é outro fato e outra tarefa.
 */
export function chaveFollowUp(tipo: TipoFollowUp, projetoId: string, referencia: string): string {
  return `followup:${tipo}:${projetoId}:${referencia}`;
}
