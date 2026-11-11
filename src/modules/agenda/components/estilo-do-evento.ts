import { cn } from "@/lib/utils";

import type { StatusEvento, TipoEvento } from "../schemas";

const COR_DO_TIPO: Record<TipoEvento, string> = {
  VISITA_TECNICA: "bg-blue-500/15 text-blue-900 border-blue-500/40 dark:text-blue-200",
  MEDICAO_EXATA: "bg-teal-500/15 text-teal-900 border-teal-500/40 dark:text-teal-200",
  MEDICAO_VIDROS: "bg-cyan-500/15 text-cyan-900 border-cyan-500/40 dark:text-cyan-200",
  INSTALACAO: "bg-emerald-500/15 text-emerald-900 border-emerald-500/40 dark:text-emerald-200",
  ENTREGA: "bg-violet-500/15 text-violet-900 border-violet-500/40 dark:text-violet-200",
  ASSISTENCIA: "bg-amber-500/20 text-amber-900 border-amber-500/50 dark:text-amber-200",
  REUNIAO: "bg-slate-500/15 text-slate-900 border-slate-500/40 dark:text-slate-200",
};

/** Cor pelo tipo; compromisso encerrado sem acontecer (cancelado, não compareceu) fica riscado e apagado. */
export function estiloDoEvento(tipo: TipoEvento, status: StatusEvento): string {
  return cn("border-l-4", COR_DO_TIPO[tipo], (status === "CANCELADO" || status === "NAO_COMPARECEU") && "line-through opacity-60", status === "REALIZADO" && "opacity-80");
}
