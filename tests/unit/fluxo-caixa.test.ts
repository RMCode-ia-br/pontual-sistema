import { describe, expect, it } from "vitest";

import { dataEsperadaDoRecebimento, fluxoRealizado, janelasDeDias, periodosMensais, projetarFluxo } from "../../src/lib/dominio/fluxo-caixa";

const HOJE = "2026-11-12";

describe("períodos do fluxo", () => {
  it("janelas de 30/60/90 dias contíguas (hoje é o primeiro dia)", () => {
    const p = janelasDeDias(HOJE, [30, 60, 90]);
    expect(p.map((x) => [x.inicio, x.fim])).toEqual([
      ["2026-11-12", "2026-12-12"],
      ["2026-12-13", "2027-01-11"],
      ["2027-01-12", "2027-02-10"],
    ]);
  });

  it("períodos mensais: o primeiro começa hoje, os outros no dia 1, atravessando o ano", () => {
    const p = periodosMensais(HOJE, 3);
    expect(p.map((x) => [x.inicio, x.fim, x.rotulo])).toEqual([
      ["2026-11-12", "2026-11-30", "nov/26"],
      ["2026-12-01", "2026-12-31", "dez/26"],
      ["2027-01-01", "2027-01-31", "jan/27"],
    ]);
    expect(periodosMensais("2027-01-20", 2)[1].fim).toBe("2027-02-28");
  });
});

describe("fluxo realizado", () => {
  it("soma entradas e saídas dentro de cada período", () => {
    const periodos = periodosMensais("2026-10-01", 2);
    const r = fluxoRealizado(
      [
        { data: "2026-10-05", tipo: "ENTRADA", valorCentavos: 100_000 },
        { data: "2026-10-31", tipo: "SAIDA", valorCentavos: 30_000 },
        { data: "2026-11-01", tipo: "ENTRADA", valorCentavos: 5_000 },
        { data: "2026-12-01", tipo: "ENTRADA", valorCentavos: 999 }, // fora
      ],
      periodos,
    );
    expect(r.map((x) => [x.entradasCentavos, x.saidasCentavos, x.liquidoCentavos])).toEqual([
      [100_000, 30_000, 70_000],
      [5_000, 0, 5_000],
    ]);
  });
});

describe("fluxo projetado", () => {
  const periodos = janelasDeDias(HOJE, [30, 60, 90]);
  const fluxo = projetarFluxo({
    hoje: HOJE,
    saldoAtualCentavos: 100_000,
    periodos,
    aReceber: [
      { data: "2026-11-20", valorCentavos: 50_000 },
      { data: "2026-12-20", valorCentavos: 30_000 },
      { data: "2026-11-01", valorCentavos: 10_000, vencidoNoOriginal: true }, // vencido
      { data: null, valorCentavos: 7_000 }, // etapa sem data
      { data: "2026-12-01", valorCentavos: 25_000, previsto: true }, // previsão pela etapa
      { data: "2027-05-01", valorCentavos: 9_999 }, // além do horizonte
    ],
    aPagar: [
      { data: "2026-11-15", valorCentavos: 20_000 },
      { data: "2027-01-05", valorCentavos: 40_000 },
      { data: "2026-10-01", valorCentavos: 3_000 }, // vencido
    ],
  });

  it("distribui cada título no período do seu vencimento e acumula o saldo projetado (vencidos entram no primeiro período)", () => {
    expect(fluxo.linhas.map((l) => [l.entradasCentavos, l.saidasCentavos, l.liquidoCentavos, l.saldoProjetadoCentavos])).toEqual([
      [85_000, 23_000, 62_000, 162_000], // 50.000 + 25.000 (etapa) a vencer… e 10.000 vencidos a receber; 20.000 + 3.000 vencidos a pagar
      [30_000, 40_000, -10_000, 152_000],
      [0, 0, 0, 152_000],
    ]);
    expect(fluxo.linhas[0].entradasVencidasCentavos).toBe(10_000);
    expect(fluxo.linhas[1].entradasVencidasCentavos).toBe(0);
    expect(fluxo.linhas[0].saidasVencidasCentavos).toBe(3_000);
    expect(fluxo.linhas[1].saidasVencidasCentavos).toBe(0);
  });

  it("a receber vencido ENTRA no saldo como esperado para hoje (o dono conta com ele), junto com a pagar vencido", () => {
    const f = projetarFluxo({ hoje: HOJE, saldoAtualCentavos: 10_000, periodos: janelasDeDias(HOJE, [30]), aReceber: [{ data: "2026-11-01", valorCentavos: 5_000, vencidoNoOriginal: true }], aPagar: [{ data: "2026-11-05", valorCentavos: 3_000 }] });
    expect(f.linhas[0].saldoProjetadoCentavos).toBe(10_000 + 5_000 - 3_000);
    expect(f.vencidos).toEqual({ aReceberCentavos: 5_000, aReceberPrometidoCentavos: 0, aPagarCentavos: 3_000 });
  });

  it("promessa do cliente: entra na data prometida, continua contada como vencida no original e não vai para hoje", () => {
    const f = projetarFluxo({
      hoje: HOJE,
      saldoAtualCentavos: 0,
      periodos: janelasDeDias(HOJE, [30, 60]),
      aReceber: [
        { data: "2026-12-20", valorCentavos: 8_000, vencidoNoOriginal: true, prometido: true }, // pediu até 20/12 (2º período)
        { data: "2026-11-01", valorCentavos: 2_000, vencidoNoOriginal: true }, // vencida sem promessa: hoje
      ],
      aPagar: [],
    });
    expect(f.linhas.map((l) => l.entradasCentavos)).toEqual([2_000, 8_000]);
    expect(f.linhas[0].entradasVencidasCentavos).toBe(2_000);
    expect(f.vencidos).toEqual({ aReceberCentavos: 10_000, aReceberPrometidoCentavos: 8_000, aPagarCentavos: 0 });
  });

  it("promessa além do horizonte cai em 'após o horizonte', mas segue contada como vencida", () => {
    const f = projetarFluxo({ hoje: HOJE, saldoAtualCentavos: 0, periodos: janelasDeDias(HOJE, [30]), aReceber: [{ data: "2027-03-01", valorCentavos: 4_000, vencidoNoOriginal: true, prometido: true }], aPagar: [] });
    expect(f.linhas[0].entradasCentavos).toBe(0);
    expect(f.aposOHorizonte.aReceberCentavos).toBe(4_000);
    expect(f.vencidos.aReceberPrometidoCentavos).toBe(4_000);
  });

  it("marca quanto da entrada vem só da previsão de uma etapa", () => {
    expect(fluxo.linhas[0].entradasPrevistasPorEtapaCentavos).toBe(25_000);
    expect(fluxo.linhas[1].entradasPrevistasPorEtapaCentavos).toBe(0);
  });

  it("sem previsão e além do horizonte ficam FORA dos períodos, mostrados à parte; os vencidos entram no primeiro e também aparecem à parte", () => {
    expect(fluxo.vencidos).toEqual({ aReceberCentavos: 10_000, aReceberPrometidoCentavos: 0, aPagarCentavos: 3_000 });
    expect(fluxo.semPrevisao).toEqual({ aReceberCentavos: 7_000 });
    expect(fluxo.aposOHorizonte).toEqual({ aReceberCentavos: 9_999, aPagarCentavos: 0 });
  });

  it("vence hoje entra no primeiro período; o último dia do período fica nele", () => {
    const f = projetarFluxo({
      hoje: HOJE,
      saldoAtualCentavos: 0,
      periodos,
      aReceber: [
        { data: HOJE, valorCentavos: 100 },
        { data: "2026-12-12", valorCentavos: 200 }, // último dia do 1º período
        { data: "2026-12-13", valorCentavos: 400 }, // primeiro do 2º
      ],
      aPagar: [],
    });
    expect(f.linhas.map((l) => l.entradasCentavos)).toEqual([300, 400, 0]);
  });

  it("a soma de tudo bate: nada some nem se repete", () => {
    // Os vencidos a receber e a pagar já estão dentro da primeira linha: não se somam de novo.
    const entradas = fluxo.linhas.reduce((s, l) => s + l.entradasCentavos, 0) + fluxo.semPrevisao.aReceberCentavos + fluxo.aposOHorizonte.aReceberCentavos;
    expect(entradas).toBe(50_000 + 30_000 + 10_000 + 7_000 + 25_000 + 9_999);
    const saidas = fluxo.linhas.reduce((s, l) => s + l.saidasCentavos, 0) + fluxo.aposOHorizonte.aPagarCentavos;
    expect(saidas).toBe(20_000 + 40_000 + 3_000);
  });
});

describe("dataEsperadaDoRecebimento", () => {
  it("sem promessa vale o vencimento (se já passou, o fluxo leva para hoje)", () => {
    expect(dataEsperadaDoRecebimento({ vencimento: "2026-11-01", dataPrometida: null }, HOJE)).toEqual({ data: "2026-11-01", vencidoNoOriginal: true, prometido: false });
    expect(dataEsperadaDoRecebimento({ vencimento: "2026-12-01", dataPrometida: null }, HOJE)).toEqual({ data: "2026-12-01", vencidoNoOriginal: false, prometido: false });
  });
  it("promessa de hoje em diante vale no lugar do vencimento, que continua sendo o original", () => {
    expect(dataEsperadaDoRecebimento({ vencimento: "2026-11-01", dataPrometida: "2026-11-20" }, HOJE)).toEqual({ data: "2026-11-20", vencidoNoOriginal: true, prometido: true });
    expect(dataEsperadaDoRecebimento({ vencimento: "2026-11-01", dataPrometida: HOJE }, HOJE).prometido).toBe(true);
  });
  it("promessa já vencida volta ao vencimento (e o fluxo leva para hoje)", () => {
    expect(dataEsperadaDoRecebimento({ vencimento: "2026-11-01", dataPrometida: "2026-11-05" }, HOJE)).toEqual({ data: "2026-11-01", vencidoNoOriginal: true, prometido: false });
  });
  it("promessa antes de vencer também vale (cliente pediu mais prazo antes do vencimento)", () => {
    expect(dataEsperadaDoRecebimento({ vencimento: "2026-12-01", dataPrometida: "2026-12-10" }, HOJE)).toEqual({ data: "2026-12-10", vencidoNoOriginal: false, prometido: true });
  });
});
