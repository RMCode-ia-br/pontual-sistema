/** Numeração de propostas `NNNN-AA` (R3): contador global (ou por ano, se configurado) e AA = ano de emissão. */

export const NUMERO_INICIAL_PADRAO = 2000;
export const NUMERO_MAXIMO = 999_999;

export function formatarNumeroProposta(sequencial: number, ano: number): string {
  if (!Number.isInteger(sequencial) || sequencial < 1) throw new Error("Número de proposta inválido.");
  return `${String(sequencial).padStart(4, "0")}-${String(ano % 100).padStart(2, "0")}`;
}

/** "2000-26" → { sequencial: 2000, ano: 2026 }. Devolve null se não estiver no formato. */
export function lerNumeroProposta(texto: string): { sequencial: number; ano: number } | null {
  const m = /^(\d{4,6})-(\d{2})$/.exec(texto.trim());
  if (!m) return null;
  return { sequencial: Number(m[1]), ano: 2000 + Number(m[2]) };
}

export function formatarRevisao(revisao: number): string {
  return revisao > 0 ? `Rev. ${revisao}` : "";
}

/**
 * Decide o número a usar e o próximo contador. Com reinício por ano, a primeira proposta de um ano novo volta a 1
 * (e nunca reinicia sem a opção ligada). `anoDoContador` é o ano em que o contador foi usado pela última vez.
 */
export function proximoNumero(entrada: { proximo: number | null; anoDoContador: number | null; anoAtual: number; reiniciaPorAno: boolean }): {
  sequencial: number;
  novoProximo: number;
} {
  const base = entrada.proximo && entrada.proximo >= 1 ? entrada.proximo : NUMERO_INICIAL_PADRAO;
  const reiniciar = entrada.reiniciaPorAno && entrada.anoDoContador !== null && entrada.anoDoContador !== entrada.anoAtual;
  const sequencial = reiniciar ? 1 : base;
  if (sequencial > NUMERO_MAXIMO) throw new Error("A numeração de propostas chegou ao limite.");
  return { sequencial, novoProximo: sequencial + 1 };
}
