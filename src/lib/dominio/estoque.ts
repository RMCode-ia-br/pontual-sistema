// Estoque (R14). Quantidades em MILÉSIMOS inteiros (1,5 m = 1500), dinheiro em centavos. Funções puras.
//
// Saldo do produto = soma dos movimentos (o banco guarda também o cache, atualizado na mesma transação). Saída sem saldo
// exige confirmação explícita e justificativa. Estorno é o movimento inverso, nunca uma edição.

import { lerEscalado } from "../validadores/numero-br";

export type TipoDeMovimento = "INVENTARIO_INICIAL" | "ENTRADA_COMPRA" | "SAIDA_OBRA" | "DEVOLUCAO" | "AJUSTE" | "PERDA";

export const ROTULO_TIPO_DE_MOVIMENTO: Record<TipoDeMovimento, string> = {
  INVENTARIO_INICIAL: "Contagem inicial",
  ENTRADA_COMPRA: "Entrada de compra",
  SAIDA_OBRA: "Saída para obra",
  DEVOLUCAO: "Devolução da obra",
  AJUSTE: "Ajuste",
  PERDA: "Perda",
};

/** Sinal natural do tipo: entradas +1, saídas −1; ajuste não tem (a pessoa escolhe entre + e −). */
export function sinalDoTipo(tipo: TipoDeMovimento): 1 | -1 | null {
  switch (tipo) {
    case "INVENTARIO_INICIAL":
    case "ENTRADA_COMPRA":
    case "DEVOLUCAO":
      return 1;
    case "SAIDA_OBRA":
    case "PERDA":
      return -1;
    case "AJUSTE":
      return null;
  }
}

export const paraMilesimos = (n: number): number => Math.round(n * 1000);
export const deMilesimos = (m: number): number => m / 1000;

/**
 * "1.234,5" digitado → milésimos; vazio, negativo ou inválido → null. Aceita até 3 casas decimais. O ponto só é separador de
 * milhar quando o agrupamento é válido ("1.234", "1.234.567,5"); "2.5" e "0.75" (ponto com 1 ou 2 casas) são decimais — nunca
 * "25" ou "75" por engano. Ambíguo de outro jeito ("2.5000", "1.23.4") → null.
 */
export function lerQuantidade(texto: string): number | null {
  // Regra única de leitura (`lerNumeroBr`): o resultado já sai em milésimos inteiros, sem ponto flutuante.
  return lerEscalado(texto, { casas: 3 });
}

/** Quantidade em milésimos → texto pt-BR sem zeros à direita ("1,5"). */
export function formatarQuantidade(milesimos: number): string {
  const n = milesimos / 1000;
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

export function saldoDosMovimentos(movimentos: readonly { quantidadeMilesimos: number }[]): number {
  return movimentos.reduce((s, m) => s + m.quantidadeMilesimos, 0);
}

export type ResultadoDeSaida = { ok: true; semSaldo: boolean } | { ok: false; erro: string };

/**
 * Confere uma saída (quantidade positiva). Maior que o saldo → só com confirmação explícita E justificativa (mínimo 3
 * letras): o saldo fica negativo de propósito, nunca por descuido.
 */
export function conferirSaida(e: { saldoMilesimos: number; quantidadeMilesimos: number; confirmarSemSaldo: boolean; justificativa: string | null }): ResultadoDeSaida {
  if (!Number.isInteger(e.quantidadeMilesimos) || e.quantidadeMilesimos <= 0) return { ok: false, erro: "Informe uma quantidade maior que zero." };
  const semSaldo = e.saldoMilesimos - e.quantidadeMilesimos < 0;
  if (!semSaldo) return { ok: true, semSaldo: false };
  if (!e.confirmarSemSaldo) return { ok: false, erro: `Saída maior que o saldo (${formatarQuantidade(e.saldoMilesimos)}): confirme que quer deixar o saldo negativo.` };
  if (!e.justificativa || e.justificativa.trim().length < 3) return { ok: false, erro: "Saída sem saldo exige uma justificativa." };
  return { ok: true, semSaldo: true };
}

/** Valor de uma saída ao custo da época: quantidade × custo unitário; sem custo, null ("sem custo", nunca zero). */
export function valorDoMovimento(quantidadeMilesimos: number, custoUnitarioCentavos: number | null): number | null {
  if (custoUnitarioCentavos === null) return null;
  return Math.round((Math.abs(quantidadeMilesimos) * custoUnitarioCentavos) / 1000);
}

/** Estoque abaixo do mínimo: só quando o produto TEM mínimo (campo vazio = sem alerta). */
export function abaixoDoMinimo(saldoMilesimos: number, minimoMilesimos: number | null): boolean {
  return minimoMilesimos !== null && saldoMilesimos < minimoMilesimos;
}

export type MovimentoParaEstorno = { tipo: TipoDeMovimento; quantidadeMilesimos: number; custoUnitarioCentavos: number | null; projetoId: string | null };

/** O movimento que desfaz outro: mesma quantidade com o sinal trocado, mesmo custo e mesma obra. */
export function movimentoInverso(m: MovimentoParaEstorno): MovimentoParaEstorno {
  return { tipo: "AJUSTE", quantidadeMilesimos: -m.quantidadeMilesimos, custoUnitarioCentavos: m.custoUnitarioCentavos, projetoId: m.projetoId };
}

/** A contagem inicial só vale para produto sem nenhum movimento (depois dela, a correção é um ajuste). */
export function podeContarEstoqueInicial(totalDeMovimentos: number): boolean {
  return totalDeMovimentos === 0;
}
