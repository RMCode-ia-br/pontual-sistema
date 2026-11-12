// Saldo e extrato de uma conta financeira. Funções puras (datas "aaaa-mm-dd", dinheiro em centavos).
//
// O saldo inicial é o saldo no INÍCIO do dia `dataSaldoInicial`. Saldo(t) = saldo inicial + lançamentos não
// estornados de `dataSaldoInicial` até t. Lançamentos de datas ANTERIORES continuam no extrato, marcados como
// "já incluídos no saldo inicial" (nada é apagado nem recusado quando o saldo é informado ou corrigido depois).
// Conta sem saldo informado (nasce assim): saldo inicial zero e sem data; o saldo mostrado é só o movimento
// acumulado, e a tela avisa "saldo não informado".

export type ContaParaSaldo = {
  saldoInicialCentavos: number;
  saldoInicialInformado: boolean;
  dataSaldoInicial: string | null;
};

export type LancamentoParaSaldo = {
  id: string;
  data: string;
  tipo: "ENTRADA" | "SAIDA";
  valorCentavos: number;
  estornado: boolean;
};

export function efeitoDoLancamento(l: Pick<LancamentoParaSaldo, "tipo" | "valorCentavos">): number {
  return l.tipo === "ENTRADA" ? l.valorCentavos : -l.valorCentavos;
}

/** O lançamento conta no saldo (não está estornado e não é anterior ao saldo inicial)? */
export function contaNoSaldo(conta: ContaParaSaldo, l: Pick<LancamentoParaSaldo, "data" | "estornado">): boolean {
  if (l.estornado) return false;
  if (conta.saldoInicialInformado && conta.dataSaldoInicial !== null && l.data < conta.dataSaldoInicial) return false;
  return true;
}

/** Saldo ao FIM do dia `ate` (inclusive). */
export function saldoEm(conta: ContaParaSaldo, lancamentos: readonly LancamentoParaSaldo[], ate: string): number {
  let saldo = conta.saldoInicialInformado ? conta.saldoInicialCentavos : 0;
  for (const l of lancamentos) {
    if (l.data <= ate && contaNoSaldo(conta, l)) saldo += efeitoDoLancamento(l);
  }
  return saldo;
}

export type LinhaDoExtrato<T extends LancamentoParaSaldo> = {
  lancamento: T;
  /** Saldo logo depois deste lançamento (não muda nos estornados nem nos anteriores ao saldo inicial). */
  saldoAposCentavos: number;
  /** Anterior à data do saldo inicial: já está dentro dele. */
  incluidoNoSaldoInicial: boolean;
};

/**
 * Extrato do período [de, ate] com saldo corrido. A ordem de entrada (`data`, depois criação) é mantida para
 * lançamentos do mesmo dia. `saldoAnteriorCentavos` é o saldo ao fim do dia anterior a `de`.
 */
export function montarExtrato<T extends LancamentoParaSaldo>(
  conta: ContaParaSaldo,
  lancamentos: readonly T[],
  de: string,
  ate: string,
): { saldoAnteriorCentavos: number; linhas: LinhaDoExtrato<T>[]; saldoFinalCentavos: number } {
  const ordenados = lancamentos.map((l, i) => ({ l, i })).sort((a, b) => (a.l.data === b.l.data ? a.i - b.i : a.l.data < b.l.data ? -1 : 1));

  let saldo = conta.saldoInicialInformado ? conta.saldoInicialCentavos : 0;
  let saldoAnterior = saldo;
  const linhas: LinhaDoExtrato<T>[] = [];
  for (const { l } of ordenados) {
    if (l.data > ate) continue;
    const conta_ = contaNoSaldo(conta, l);
    if (l.data < de) {
      if (conta_) saldo += efeitoDoLancamento(l);
      saldoAnterior = saldo;
      continue;
    }
    if (conta_) saldo += efeitoDoLancamento(l);
    linhas.push({
      lancamento: l,
      saldoAposCentavos: saldo,
      incluidoNoSaldoInicial: !l.estornado && !conta_,
    });
  }
  return { saldoAnteriorCentavos: saldoAnterior, linhas, saldoFinalCentavos: saldo };
}

/** Contas ativas que ainda não têm saldo informado (para o aviso no fluxo de caixa e no DRE). */
export function contasSemSaldoInformado<T extends { saldoInicialInformado: boolean; ativo: boolean }>(contas: readonly T[]): T[] {
  return contas.filter((c) => c.ativo && !c.saldoInicialInformado);
}
