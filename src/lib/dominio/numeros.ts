/**
 * Conversão de números vindos de planilhas e formulários. Dinheiro sempre em centavos inteiros,
 * sem ponto flutuante nos cálculos.
 */
import { parseMoedaParaCentavos } from "../formatadores";
import { lerEscalado, lerNumeroBr } from "../validadores/numero-br";

/**
 * Valor monetário → centavos. Mesma regra de `parseMoedaParaCentavos` (a leitura é única, `lerNumeroBr`): aceita
 * "1.234,56", "R$ 12,50", "12" e o ponto decimal de planilhas ("12.5", "1234.50"). Ambiguidade resolvida a favor do
 * português: "1.500" é mil e quinhentos reais. Devolve null se não for um valor válido ou se for negativo.
 */
export function valorParaCentavos(texto: string): number | null {
  return parseMoedaParaCentavos(texto);
}

/**
 * Número decimal de medida/quantidade (peso, estoque mínimo), pela regra única `lerNumeroBr`: com vírgula, a vírgula é o
 * decimal e os pontos são milhar ("1.250,5"); sem vírgula, "1.250" é milhar e "1.25" ou "2.5" são decimais.
 * `casas` é o máximo de casas decimais aceito. Devolve null se inválido ou negativo.
 */
export function textoParaDecimal(texto: string, casas = 3): number | null {
  const r = lerNumeroBr(texto, { casas });
  return r.ok ? r.escalado / 10 ** casas : null;
}

/** Inteiro positivo ou zero ("6000", "6.000"). Devolve null se inválido. */
export function textoParaInteiro(texto: string): number | null {
  return lerEscalado(texto, { casas: 0 });
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
