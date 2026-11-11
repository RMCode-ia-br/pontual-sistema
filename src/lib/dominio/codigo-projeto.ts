/** Código do projeto `P-AAAA-NNNN` (spec seção 6). O contador anual fica em `ContadorSequencia`. */
import { formatInTimeZone } from "date-fns-tz";

import { FUSO_PADRAO } from "../formatadores";

/** Ano civil de um instante no fuso de São Paulo (virada de ano à meia-noite local, não à UTC). */
export function anoEmSaoPaulo(instante: Date): number {
  return Number(formatInTimeZone(instante, FUSO_PADRAO, "yyyy"));
}

export function chaveContadorProjeto(ano: number): string {
  return `projeto:${ano}`;
}

/** `(2026, 7)` → `"P-2026-0007"`. Passando de 9999 o número simplesmente ganha mais dígitos. */
export function formatarCodigoProjeto(ano: number, sequencia: number): string {
  if (!Number.isInteger(ano) || ano < 2000 || ano > 9999) throw new RangeError("Ano inválido para o código do projeto.");
  if (!Number.isInteger(sequencia) || sequencia < 1) throw new RangeError("Sequência inválida para o código do projeto.");
  return `P-${ano}-${String(sequencia).padStart(4, "0")}`;
}

export function lerCodigoProjeto(codigo: string): { ano: number; sequencia: number } | null {
  const m = /^P-(\d{4})-(\d{4,})$/.exec(codigo.trim().toUpperCase());
  if (!m) return null;
  const sequencia = Number(m[2]);
  return Number.isSafeInteger(sequencia) && sequencia >= 1 ? { ano: Number(m[1]), sequencia } : null;
}
