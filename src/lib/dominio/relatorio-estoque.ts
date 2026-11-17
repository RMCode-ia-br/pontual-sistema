/**
 * Regras puras do relatório de estoque. Quantidades em milésimos inteiros, dinheiro em centavos.
 * Produto sem custo informado NUNCA entra no valor como zero: é contado à parte ("sem custo").
 */

export type LinhaDePosicao = {
  saldoMilesimos: number;
  custoUnitarioCentavos: number | null;
  estoqueMinimoMilesimos: number | null;
};

export type ResumoDaPosicao = {
  /** Soma de saldo × custo dos produtos com saldo positivo E custo informado. */
  valorCentavos: number;
  /** Produtos com saldo positivo e sem custo: ficam fora do valor, nunca como zero. */
  semCusto: number;
  /** Produtos com saldo positivo (com ou sem custo). */
  comSaldo: number;
  /** Produtos com saldo negativo (saída sem saldo confirmada): aparecem à parte, não reduzem o valor. */
  saldoNegativo: number;
  /** Só conta quem TEM mínimo definido (vazio = sem alerta). */
  abaixoDoMinimo: number;
};

/** Valor de uma linha: saldo (milésimos) × custo unitário, arredondado em centavos. */
export function valorDaLinha(saldoMilesimos: number, custoUnitarioCentavos: number): number {
  return Math.round((saldoMilesimos * custoUnitarioCentavos) / 1000);
}

export function resumirPosicao(linhas: readonly LinhaDePosicao[]): ResumoDaPosicao {
  const r: ResumoDaPosicao = { valorCentavos: 0, semCusto: 0, comSaldo: 0, saldoNegativo: 0, abaixoDoMinimo: 0 };
  for (const l of linhas) {
    if (l.estoqueMinimoMilesimos !== null && l.saldoMilesimos < l.estoqueMinimoMilesimos) r.abaixoDoMinimo += 1;
    if (l.saldoMilesimos < 0) {
      r.saldoNegativo += 1;
      continue;
    }
    if (l.saldoMilesimos === 0) continue;
    r.comSaldo += 1;
    if (l.custoUnitarioCentavos === null) r.semCusto += 1;
    else r.valorCentavos += valorDaLinha(l.saldoMilesimos, l.custoUnitarioCentavos);
  }
  return r;
}

export type RecebimentoDeFornecedor = { fornecedorId: string; valorCentavos: number | null };

export type TotalDoFornecedor = { fornecedorId: string; valorCentavos: number; itens: number; semValor: number };

/** Total recebido por fornecedor; item recebido sem valor conta à parte (nunca soma como zero). Maior valor primeiro. */
export function totalizarPorFornecedor(recebimentos: readonly RecebimentoDeFornecedor[]): TotalDoFornecedor[] {
  const mapa = new Map<string, TotalDoFornecedor>();
  for (const r of recebimentos) {
    const t = mapa.get(r.fornecedorId) ?? { fornecedorId: r.fornecedorId, valorCentavos: 0, itens: 0, semValor: 0 };
    t.itens += 1;
    if (r.valorCentavos === null) t.semValor += 1;
    else t.valorCentavos += r.valorCentavos;
    mapa.set(r.fornecedorId, t);
  }
  return [...mapa.values()].sort((a, b) => b.valorCentavos - a.valorCentavos || a.fornecedorId.localeCompare(b.fornecedorId));
}

// ---------------------------------------------------------------------------------------------------------------------
// Curva ABC (valor das saídas de estoque no período)
// ---------------------------------------------------------------------------------------------------------------------

export type ClasseAbc = "A" | "B" | "C";
export const CORTES_ABC_PADRAO = { a: 80, b: 15 } as const;
export type CortesAbc = { a: number; b: number };

/**
 * Lê os cortes da URL (dado não confiável): A = % do valor que a classe A cobre, B = % da classe B (o resto é C).
 * Inteiros de 1 a 98, com A + B no máximo 99. Qualquer outra coisa volta ao padrão (80 / 15).
 */
export function lerCortesAbc(a: string | undefined, b: string | undefined): CortesAbc {
  const na = Number(a);
  const nb = Number(b);
  const valido = (n: number) => Number.isInteger(n) && n >= 1 && n <= 98;
  if (!valido(na) || !valido(nb) || na + nb > 99) return { ...CORTES_ABC_PADRAO };
  return { a: na, b: nb };
}

export type ItemDaCurva<T> = T & { valorCentavos: number };
export type LinhaDaCurva<T> = ItemDaCurva<T> & { classe: ClasseAbc; percentual: number; acumulado: number };

/**
 * Curva ABC: ordena do maior valor para o menor e dá a classe pelo acumulado ANTES do item: enquanto o acumulado anterior for
 * menor que o corte de A, o item é A (o item que atravessa os 80% fica em A); depois, enquanto for menor que A + B, é B; o resto é C.
 * Valor zero ou negativo não entra (quem não saiu nada não tem classe). Percentuais com uma casa.
 */
export function curvaAbc<T>(itens: readonly ItemDaCurva<T>[], cortes: CortesAbc = CORTES_ABC_PADRAO): { linhas: LinhaDaCurva<T>[]; totalCentavos: number } {
  const validos = itens.filter((i) => i.valorCentavos > 0).sort((x, y) => y.valorCentavos - x.valorCentavos);
  const total = validos.reduce((s, i) => s + i.valorCentavos, 0);
  let antes = 0;
  const linhas = validos.map((i) => {
    const pctAntes = (antes / total) * 100;
    const classe: ClasseAbc = pctAntes < cortes.a ? "A" : pctAntes < cortes.a + cortes.b ? "B" : "C";
    antes += i.valorCentavos;
    return { ...i, classe, percentual: Math.round((i.valorCentavos / total) * 1000) / 10, acumulado: Math.round((antes / total) * 1000) / 10 };
  });
  return { linhas, totalCentavos: total };
}

/** Variação percentual do custo (uma casa); `null` quando não há custo anterior ou ele é zero ("sem base": nunca infinito). */
export function variacaoDeCusto(anteriorCentavos: number | null, novoCentavos: number): number | null {
  if (anteriorCentavos === null || anteriorCentavos <= 0) return null;
  return Math.round(((novoCentavos - anteriorCentavos) / anteriorCentavos) * 1000) / 10;
}
