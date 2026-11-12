/**
 * Variação entre um valor atual e o de comparação (mês anterior, mesmo mês do ano passado). Regra pura.
 * Nunca inventa percentual: sem valor de comparação, ou com base zero, a variação é "sem base" (a tela diz "sem base
 * para comparar", em vez de "+∞%" ou "0%").
 */
export type Variacao =
  | { tipo: "sem-base" }
  | { tipo: "igual" }
  | { tipo: "subiu"; percentual: number; diferenca: number }
  | { tipo: "caiu"; percentual: number; diferenca: number };

export function variacaoEntre(atual: number | null | undefined, comparacao: number | null | undefined): Variacao {
  if (atual === null || atual === undefined || comparacao === null || comparacao === undefined) return { tipo: "sem-base" };
  if (comparacao === 0) return atual === 0 ? { tipo: "igual" } : { tipo: "sem-base" };
  if (atual === comparacao) return { tipo: "igual" };
  const diferenca = atual - comparacao;
  // Percentual sobre o valor de comparação, inteiro (45,6% → 46%); a base negativa usa o valor absoluto.
  const percentual = Math.round((Math.abs(diferenca) * 100) / Math.abs(comparacao));
  return diferenca > 0 ? { tipo: "subiu", percentual, diferenca } : { tipo: "caiu", percentual, diferenca: Math.abs(diferenca) };
}
