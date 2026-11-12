import type { TipoDiasDoPrazo } from "@/lib/dominio/dias-uteis";
import { formatarDataCalendario } from "@/lib/formatadores";

import type { PrazoDaObraVisao } from "./visao";

/** "1 dia útil", "5 dias corridos": a unidade do prazo da obra, com o plural certo. */
export function dias(n: number, tipo: TipoDiasDoPrazo): string {
  const abs = Math.abs(n);
  return `${abs} ${tipo === "UTEIS" ? (abs === 1 ? "dia útil" : "dias úteis") : abs === 1 ? "dia corrido" : "dias corridos"}`;
}

/** Frase curta sobre o prazo para listas e cartões ("Prazo 27/11/2026 · faltam 5 dias úteis"). */
export function resumoDoPrazo(prazo: PrazoDaObraVisao, concluidaEm: string | null): string {
  if (concluidaEm && prazo.pontualidade?.avaliavel) {
    const p = prazo.pontualidade;
    const quando = `Concluída em ${formatarDataCalendario(concluidaEm)}`;
    if (p.pontual) return `${quando} · pontual`;
    return `${quando} · atrasada ${dias(p.desvioDias, prazo.tipoDias)}`;
  }
  if (concluidaEm) return `Concluída em ${formatarDataCalendario(concluidaEm)}`;
  if (!prazo.definido) return "Sem prazo definido";
  if (!prazo.relogioIniciado) return prazo.previsaoProvisoria ? `Previsão provisória ${formatarDataCalendario(prazo.previsaoProvisoria)}` : "Prazo ainda não começou a contar";
  const resto = prazo.diasRestantes!;
  const situacao = resto > 0 ? `faltam ${dias(resto, prazo.tipoDias)}` : resto === 0 ? "vence hoje" : `${dias(resto, prazo.tipoDias)} de atraso`;
  return `Prazo ${formatarDataCalendario(prazo.comPausas!)} · ${situacao}`;
}
