import { formatInTimeZone } from "date-fns-tz";

export const FUSO_PADRAO = "America/Sao_Paulo";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Centavos (inteiro) → "R$ 1.234,56". A divisão é só para exibição; os cálculos ficam em inteiros. */
export function formatarMoeda(centavos: number): string {
  return moeda.format(centavos / 100);
}

/**
 * "1.234,56", "1234,5", "R$ 12,00" ou "12" → centavos inteiros, sem usar ponto flutuante.
 * Devolve null se o texto não for um valor monetário válido (ou for negativo).
 */
export function parseMoedaParaCentavos(texto: string): number | null {
  const limpo = texto.replace(/[R$\s ]/g, "");
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(limpo)) return null;
  const [inteiro, fracao = ""] = limpo.replace(/\./g, "").split(",");
  const centavos = Number(inteiro) * 100 + Number(fracao.padEnd(2, "0"));
  return Number.isSafeInteger(centavos) ? centavos : null;
}

/** Instante (UTC) → "dd/mm/aaaa" no fuso de São Paulo. */
export function formatarData(instante: Date | string | number): string {
  return formatInTimeZone(instante, FUSO_PADRAO, "dd/MM/yyyy");
}

/** Instante (UTC) → "dd/mm/aaaa HH:mm" no fuso de São Paulo. */
export function formatarDataHora(instante: Date | string | number): string {
  return formatInTimeZone(instante, FUSO_PADRAO, "dd/MM/yyyy HH:mm");
}

/**
 * Data de calendário (coluna `@db.Date`, guardada como meia-noite UTC) → "dd/mm/aaaa".
 * Usa UTC de propósito: converter para o fuso de São Paulo mostraria o dia anterior.
 */
export function formatarDataCalendario(data: Date | string): string {
  return formatInTimeZone(data, "UTC", "dd/MM/yyyy");
}

/** Data de calendário → "aaaa-mm-dd" (valor de `<input type="date">`). */
export function dataParaInput(data: Date | null | undefined): string {
  return data ? formatInTimeZone(data, "UTC", "yyyy-MM-dd") : "";
}

/** "aaaa-mm-dd" → Date em meia-noite UTC (para gravar em `@db.Date`). Null se inválida. */
export function inputParaData(texto: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return null;
  const data = new Date(`${texto}T00:00:00.000Z`);
  return Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== texto ? null : data;
}

/**
 * Telefone brasileiro → E.164 ("+5522999583288"). Aceita máscara e o 55 opcional.
 * Devolve null se não tiver 10 ou 11 dígitos (DDD + número).
 */
export function normalizarTelefone(texto: string): string | null {
  let digitos = texto.replace(/\D/g, "");
  if (digitos.length >= 12 && digitos.startsWith("55")) digitos = digitos.slice(2);
  if (digitos.length !== 10 && digitos.length !== 11) return null;
  if (digitos.startsWith("0")) return null;
  // Celular (11 dígitos) tem o 9 depois do DDD.
  if (digitos.length === 11 && digitos[2] !== "9") return null;
  return `+55${digitos}`;
}

/** "+5522999583288" → "(22) 99958-3288". Texto fora do padrão volta como veio. */
export function formatarTelefone(valor: string | null | undefined): string {
  if (!valor) return "";
  const digitos = valor.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (digitos.length === 11) return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
  if (digitos.length === 10) return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
  return valor;
}

/** "Hoje" como data de calendário (meia-noite UTC) no fuso de São Paulo, para comparar com colunas `@db.Date`. */
export function hojeCalendario(agora: Date = new Date()): Date {
  return new Date(`${formatInTimeZone(agora, FUSO_PADRAO, "yyyy-MM-dd")}T00:00:00.000Z`);
}
