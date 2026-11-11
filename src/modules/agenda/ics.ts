import { gerarCalendarioIcs, type EventoIcs } from "@/lib/ics";

import type { EventoDaAgenda } from "./queries";
import { ROTULO_STATUS_EVENTO, ROTULO_TIPO_EVENTO } from "./schemas";

/**
 * Compromisso → evento do calendário. O arquivo sai do sistema (feed público por token, exportação): por isso leva
 * só o necessário para ir ao compromisso (tipo, cliente, projeto, local, responsável, observações) e NUNCA
 * telefone, valores ou dados financeiros.
 */
export function eventoParaIcs(e: EventoDaAgenda, opcoes: { semObservacoes?: boolean } = {}): EventoIcs {
  const titulo = e.titulo || `${ROTULO_TIPO_EVENTO[e.tipo]}${e.clienteNome ? ` — ${e.clienteNome}` : ""}`;
  const descricao = [
    `Tipo: ${ROTULO_TIPO_EVENTO[e.tipo]}`,
    `Situação: ${ROTULO_STATUS_EVENTO[e.status]}`,
    e.projetoCodigo ? `Projeto: ${e.projetoCodigo}${e.projetoTitulo ? ` — ${e.projetoTitulo}` : ""}` : null,
    e.clienteNome ? `Cliente: ${e.clienteNome}` : null,
    e.responsavelNome ? `Responsável: ${e.responsavelNome}` : null,
    e.equipeNome ? `Equipe: ${e.equipeNome}` : null,
    e.observacoes && !opcoes.semObservacoes ? `Observações: ${e.observacoes}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    uid: `${e.id}@agenda.gestao`,
    inicio: new Date(e.inicio),
    fim: new Date(e.fim),
    titulo,
    descricao,
    local: e.local,
    // Cancelado e "não compareceu" saem como cancelados para o calendário remover o evento já importado.
    status: e.status === "CANCELADO" || e.status === "NAO_COMPARECEU" ? "CANCELLED" : "CONFIRMED",
    // Cresce a cada alteração (segundos desde 1970): o calendário atualiza o evento em vez de duplicá-lo.
    sequencia: Math.floor(new Date(e.atualizadoEm).getTime() / 1000),
    atualizadoEm: new Date(e.atualizadoEm),
    alarmeMin: e.status === "CANCELADO" || e.status === "NAO_COMPARECEU" ? null : e.lembreteMin,
  };
}

/** `semObservacoes`: o feed público não leva texto livre das observações (só a exportação autenticada leva). */
export function calendarioDaAgenda(eventos: EventoDaAgenda[], nome: string, opcoes: { semObservacoes?: boolean } = {}): string {
  return gerarCalendarioIcs({ idProduto: "-//RM Code//Gestao - Agenda//PT-BR", nome, eventos: eventos.map((e) => eventoParaIcs(e, opcoes)) });
}
