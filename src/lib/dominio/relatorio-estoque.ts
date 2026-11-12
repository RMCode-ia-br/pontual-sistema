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
