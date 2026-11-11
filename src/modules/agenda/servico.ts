import "server-only";

import { formatInTimeZone } from "date-fns-tz";

import { avisosDoAgendamento, detectarConflitos, type Intervalo } from "@/lib/dominio/agenda";
import { dataLocalDoInstante, formatarDataHora, FUSO_PADRAO } from "@/lib/formatadores";

import { eventosOcupando, obterExpediente, periodosDoCalendario } from "./queries";
import { ROTULO_TIPO_EVENTO } from "./schemas";

/**
 * Avisos de um agendamento (texto pronto): conflito de horário do mesmo responsável/equipe, fora do expediente,
 * feriado e férias coletivas. São ALERTAS (R9): quem agenda confirma e segue; nada bloqueia.
 */
export async function avisosDoEvento(entrada: Intervalo & { id?: string | null; responsavelId?: string | null; equipeId?: string | null }): Promise<string[]> {
  const dia = dataLocalDoInstante(entrada.inicio);
  const [expediente, periodos, ocupando] = await Promise.all([
    obterExpediente(),
    periodosDoCalendario(dia, dia),
    eventosOcupando(entrada, { responsavelId: entrada.responsavelId, equipeId: entrada.equipeId }),
  ]);

  const avisos: string[] = [];
  for (const conflito of detectarConflitos(entrada, ocupando)) {
    const evento = ocupando.find((o) => o.id === conflito.id);
    const nome = evento?.titulo || (evento ? ROTULO_TIPO_EVENTO[evento.tipo] : "outro compromisso");
    const fim = formatInTimeZone(conflito.fim, FUSO_PADRAO, "HH:mm");
    avisos.push(`Conflito de horário com “${nome}”${evento?.clienteNome ? ` (${evento.clienteNome})` : ""}, ${formatarDataHora(conflito.inicio)} às ${fim}.`);
  }
  avisos.push(...avisosDoAgendamento(entrada, expediente, periodos));
  return avisos;
}
