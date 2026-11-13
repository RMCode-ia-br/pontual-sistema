/**
 * CSV para o Excel em português: separador ";", quebra de linha CRLF e BOM UTF-8 (acentos corretos).
 */
const BOM = "﻿";

/** Caracteres que fazem o Excel/Planilhas interpretarem a célula como fórmula (CSV injection). */
const INICIO_DE_FORMULA = /^[=+\-@\t\r]/;

/**
 * Número JÁ formatado para o Excel em português ("-19,99", "1234,5"): só dígitos, vírgula e sinal. Não passa pela neutralização de
 * fórmula, senão o sinal de menos viraria apóstrofo e a célula, texto que não soma.
 */
export class NumeroFormatado {
  constructor(readonly texto: string) {}
}

/** Prepara uma célula: neutraliza fórmulas em texto e aplica aspas quando necessário. */
export function celulaCsv(valor: unknown): string {
  if (valor instanceof NumeroFormatado) return valor.texto;
  if (valor === null || valor === undefined) return "";
  let texto: string;
  if (valor instanceof Date) texto = valor.toISOString();
  else if (typeof valor === "number" || typeof valor === "boolean" || typeof valor === "bigint") texto = String(valor);
  else if (typeof valor === "object") texto = JSON.stringify(valor);
  else {
    texto = String(valor);
    // Só em texto: números negativos de verdade (typeof number) não são alterados.
    if (INICIO_DE_FORMULA.test(texto)) texto = `'${texto}`;
  }
  return /[";\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export function gerarCsv(cabecalho: string[], linhas: unknown[][]): string {
  const todas = [cabecalho, ...linhas].map((linha) => linha.map(celulaCsv).join(";"));
  return BOM + todas.join("\r\n") + "\r\n";
}
