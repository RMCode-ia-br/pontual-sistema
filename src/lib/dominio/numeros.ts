/**
 * Conversão de números vindos de planilhas e formulários. Dinheiro sempre em centavos inteiros,
 * sem ponto flutuante nos cálculos.
 */
import { parseMoedaParaCentavos } from "../formatadores";

/**
 * Valor monetário → centavos. Aceita o formato brasileiro ("1.234,56", "R$ 12,50", "12") e, quando
 * o texto não é válido em português, o formato com ponto decimal ("12.5", "1234.50", comum em planilhas).
 * Ambiguidade resolvida a favor do português: "1.500" é mil e quinhentos reais.
 * Devolve null se não for um valor válido ou se for negativo.
 */
export function valorParaCentavos(texto: string): number | null {
  const doBrasil = parseMoedaParaCentavos(texto);
  if (doBrasil !== null) return doBrasil;
  const limpo = texto.replace(/[R$\s ]/g, "");
  if (!/^\d+(\.\d{1,2})$/.test(limpo)) return null;
  const [inteiro, fracao] = limpo.split(".");
  const centavos = Number(inteiro) * 100 + Number(fracao.padEnd(2, "0"));
  return Number.isSafeInteger(centavos) ? centavos : null;
}

/**
 * Número decimal de medida/quantidade (peso, estoque mínimo). Com vírgula, vale o formato brasileiro
 * (pontos são milhar: "1.250,5"); sem vírgula, o ponto é o separador decimal ("1.25").
 * `casas` é o máximo de casas decimais aceito. Devolve null se inválido ou negativo.
 */
export function textoParaDecimal(texto: string, casas = 3): number | null {
  let t = texto.replace(/\s/g, "");
  if (t === "") return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const casasReais = t.includes(".") ? t.split(".")[1].length : 0;
  if (casasReais > casas) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Inteiro positivo ou zero ("6000", "6.000"). Devolve null se inválido. */
export function textoParaInteiro(texto: string): number | null {
  const t = texto.replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "");
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) ? n : null;
}

/** Texto de planilha → verdadeiro/falso. Vazio e valores desconhecidos viram undefined. */
export function textoParaBooleano(texto: string): boolean | undefined {
  const t = texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (["sim", "s", "1", "true", "verdadeiro", "x", "yes"].includes(t)) return true;
  if (["nao", "n", "0", "false", "falso", "no"].includes(t)) return false;
  return undefined;
}
