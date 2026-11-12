import { describe, expect, it } from "vitest";

import { contaNoSaldo, contasSemSaldoInformado, montarExtrato, saldoEm, type LancamentoParaSaldo } from "../../src/lib/dominio/saldo";

const conta = { saldoInicialCentavos: 100_000, saldoInicialInformado: true, dataSaldoInicial: "2026-11-10" };

const l = (id: string, data: string, tipo: "ENTRADA" | "SAIDA", valorCentavos: number, estornado = false): LancamentoParaSaldo => ({ id, data, tipo, valorCentavos, estornado });

// l1 é anterior ao saldo inicial (já está dentro dele); l4 foi estornado.
const lancamentos = [
  l("l1", "2026-11-08", "ENTRADA", 5_000),
  l("l2", "2026-11-10", "SAIDA", 20_000),
  l("l3", "2026-11-12", "ENTRADA", 30_000),
  l("l4", "2026-11-12", "ENTRADA", 7_000, true),
  l("l5", "2026-11-15", "SAIDA", 1_000),
];

describe("saldo da conta financeira", () => {
  it("saldo inicial + lançamentos do dia do saldo em diante (anteriores e estornados ficam de fora)", () => {
    expect(saldoEm(conta, lancamentos, "2026-11-09")).toBe(100_000); // nada depois do saldo ainda; o de 08/11 já está dentro dele
    expect(saldoEm(conta, lancamentos, "2026-11-10")).toBe(80_000);
    expect(saldoEm(conta, lancamentos, "2026-11-12")).toBe(110_000);
    expect(saldoEm(conta, lancamentos, "2026-11-30")).toBe(109_000);
  });

  it("quem conta no saldo: não estornado e não anterior à data do saldo", () => {
    expect(contaNoSaldo(conta, lancamentos[0])).toBe(false);
    expect(contaNoSaldo(conta, lancamentos[1])).toBe(true);
    expect(contaNoSaldo(conta, lancamentos[3])).toBe(false);
  });

  it("conta sem saldo informado: saldo zero e sem data; mostra só o movimento acumulado", () => {
    const semSaldo = { saldoInicialCentavos: 0, saldoInicialInformado: false, dataSaldoInicial: null };
    expect(saldoEm(semSaldo, lancamentos, "2026-11-30")).toBe(5_000 - 20_000 + 30_000 - 1_000);
  });

  it("informar ou corrigir o saldo depois não apaga histórico: os lançamentos antigos só passam a 'já incluídos'", () => {
    const corrigida = { ...conta, dataSaldoInicial: "2026-11-12" };
    expect(saldoEm(corrigida, lancamentos, "2026-11-30")).toBe(100_000 + 30_000 - 1_000);
    const { linhas } = montarExtrato(corrigida, lancamentos, "2026-11-01", "2026-11-30");
    expect(linhas).toHaveLength(5); // nenhum lançamento some do extrato
    expect(linhas.filter((x) => x.incluidoNoSaldoInicial).map((x) => x.lancamento.id)).toEqual(["l1", "l2"]);
  });

  it("valor informado como zero conta como informado (zero é um saldo real)", () => {
    const zero = { saldoInicialCentavos: 0, saldoInicialInformado: true, dataSaldoInicial: "2026-11-12" };
    expect(saldoEm(zero, lancamentos, "2026-11-30")).toBe(30_000 - 1_000);
  });
});

describe("extrato com saldo corrido", () => {
  it("lista o período, com o saldo depois de cada linha", () => {
    const e = montarExtrato(conta, lancamentos, "2026-11-01", "2026-11-30");
    expect(e.saldoAnteriorCentavos).toBe(100_000);
    expect(e.linhas.map((x) => [x.lancamento.id, x.saldoAposCentavos, x.incluidoNoSaldoInicial])).toEqual([
      ["l1", 100_000, true],
      ["l2", 80_000, false],
      ["l3", 110_000, false],
      ["l4", 110_000, false], // estornado: aparece, mas não mexe no saldo
      ["l5", 109_000, false],
    ]);
    expect(e.saldoFinalCentavos).toBe(109_000);
  });

  it("período que começa depois: o saldo anterior já traz o que veio antes", () => {
    const e = montarExtrato(conta, lancamentos, "2026-11-12", "2026-11-30");
    expect(e.saldoAnteriorCentavos).toBe(80_000);
    expect(e.linhas.map((x) => x.lancamento.id)).toEqual(["l3", "l4", "l5"]);
    expect(e.saldoFinalCentavos).toBe(109_000);
  });

  it("ignora o que vem depois do fim do período", () => {
    const e = montarExtrato(conta, lancamentos, "2026-11-01", "2026-11-12");
    expect(e.linhas.map((x) => x.lancamento.id)).toEqual(["l1", "l2", "l3", "l4"]);
    expect(e.saldoFinalCentavos).toBe(110_000);
  });

  it("ordena por data mantendo a ordem de criação no mesmo dia", () => {
    const desordenados = [lancamentos[2], lancamentos[1], lancamentos[0]];
    expect(montarExtrato(conta, desordenados, "2026-11-01", "2026-11-30").linhas.map((x) => x.lancamento.id)).toEqual(["l1", "l2", "l3"]);
  });
});

describe("aviso de saldo não informado", () => {
  it("lista só as contas ativas sem saldo informado", () => {
    const contas = [
      { nome: "Banco", saldoInicialInformado: false, ativo: true },
      { nome: "Caixa", saldoInicialInformado: true, ativo: true },
      { nome: "Antiga", saldoInicialInformado: false, ativo: false },
    ];
    expect(contasSemSaldoInformado(contas).map((c) => c.nome)).toEqual(["Banco"]);
  });
});
