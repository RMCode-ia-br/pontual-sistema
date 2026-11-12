import { describe, expect, it } from "vitest";

import {
  competenciaDe,
  gerarParcelamento,
  horizonteDaRecorrencia,
  ocorrenciasDaRecorrencia,
  somarMeses,
  ultimoDiaDoMes,
} from "../../src/lib/dominio/parcelamento";

describe("datas mensais", () => {
  it("soma meses mantendo o dia pedido e usando o último dia nos meses curtos", () => {
    expect(somarMeses("2026-01-31", 1)).toBe("2026-02-28");
    expect(somarMeses("2026-01-31", 2)).toBe("2026-03-31"); // não "encolhe" de fevereiro para março
    expect(somarMeses("2028-01-31", 1)).toBe("2028-02-29"); // bissexto
    expect(somarMeses("2026-11-30", 3)).toBe("2027-02-28");
    expect(somarMeses("2026-01-31", 13)).toBe("2027-02-28");
    expect(somarMeses("2026-12-15", 1)).toBe("2027-01-15");
    expect(somarMeses("2026-03-15", -3)).toBe("2025-12-15");
  });

  it("último dia do mês e competência", () => {
    expect(ultimoDiaDoMes(2026, 2)).toBe(28);
    expect(ultimoDiaDoMes(2028, 2)).toBe(29);
    expect(ultimoDiaDoMes(2026, 4)).toBe(30);
    expect(competenciaDe("2026-11-12")).toBe("2026-11-01");
  });

  it("data inexistente é recusada", () => {
    expect(() => somarMeses("2026-02-30", 1)).toThrow();
  });
});

describe("parcelamento (a última parcela absorve a diferença)", () => {
  it("R$ 100,00 em 3x: 33,33 + 33,33 + 33,34, vencendo no fim do mês de cada vez", () => {
    const p = gerarParcelamento(10_000, 3, "2026-01-31");
    expect(p.map((x) => x.valorCentavos)).toEqual([3_333, 3_333, 3_334]);
    expect(p.map((x) => x.vencimento)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
    expect(p.map((x) => x.competencia)).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
    expect(p.map((x) => `${x.numero}/${x.total}`)).toEqual(["1/3", "2/3", "3/3"]);
  });

  it("R$ 200,00 em 3x: arredonda para cima nas primeiras (66,67) e a última fica com 66,66", () => {
    const p = gerarParcelamento(20_000, 3, "2026-05-10");
    expect(p.map((x) => x.valorCentavos)).toEqual([6_667, 6_667, 6_666]);
  });

  it("a soma é sempre o total (varre totais e quantidades)", () => {
    for (let total = 1; total <= 200; total += 7) {
      for (let n = 1; n <= Math.min(total, 24); n++) {
        const soma = gerarParcelamento(total, n, "2026-02-28").reduce((s, p) => s + p.valorCentavos, 0);
        expect(soma, `${total} em ${n}`).toBe(total);
      }
    }
  });

  it("12x atravessa a virada do ano", () => {
    const p = gerarParcelamento(100_000, 12, "2026-11-15");
    expect(p[0].vencimento).toBe("2026-11-15");
    expect(p[2].vencimento).toBe("2027-01-15");
    expect(p[11].vencimento).toBe("2027-10-15");
    expect(p.reduce((s, x) => s + x.valorCentavos, 0)).toBe(100_000);
    expect(p[11].valorCentavos).toBe(8_337); // 11 × 8.333 = 91.663; sobram 8.337
  });

  it("1x é o próprio valor", () => {
    expect(gerarParcelamento(12_345, 1, "2026-06-01")).toEqual([{ numero: 1, total: 1, valorCentavos: 12_345, vencimento: "2026-06-01", competencia: "2026-06-01" }]);
  });

  it("recusa valor inválido, quantidade fora de 1 a 60 e valor menor que o número de parcelas", () => {
    expect(() => gerarParcelamento(0, 3, "2026-01-01")).toThrow();
    expect(() => gerarParcelamento(100.5, 3, "2026-01-01")).toThrow();
    expect(() => gerarParcelamento(1_000, 0, "2026-01-01")).toThrow();
    expect(() => gerarParcelamento(100_000, 61, "2026-01-01")).toThrow();
    expect(() => gerarParcelamento(2, 3, "2026-01-01")).toThrow();
  });
});

describe("recorrência", () => {
  it("mensal, dia 10, começando em 12/11: a primeira ocorrência é 10/12 (10/11 seria antes do início)", () => {
    const o = ocorrenciasDaRecorrencia({ diaVencimento: 10, periodicidade: "MENSAL", inicio: "2026-11-12", fim: null }, "2026-11-12", "2027-02-28");
    expect(o.map((x) => x.vencimento)).toEqual(["2026-12-10", "2027-01-10", "2027-02-10"]);
    expect(o.map((x) => x.competencia)).toEqual(["2026-12-01", "2027-01-01", "2027-02-01"]);
  });

  it("dia 31: usa o último dia dos meses curtos", () => {
    const o = ocorrenciasDaRecorrencia({ diaVencimento: 31, periodicidade: "MENSAL", inicio: "2026-01-01", fim: null }, "2026-01-01", "2026-04-30");
    expect(o.map((x) => x.vencimento)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("respeita o fim da recorrência", () => {
    const o = ocorrenciasDaRecorrencia({ diaVencimento: 31, periodicidade: "MENSAL", inicio: "2026-01-01", fim: "2026-04-30" }, "2026-01-01", "2026-12-31");
    expect(o).toHaveLength(4);
    const antes = ocorrenciasDaRecorrencia({ diaVencimento: 10, periodicidade: "MENSAL", inicio: "2026-01-01", fim: "2026-04-09" }, "2026-01-01", "2026-12-31");
    expect(antes.map((x) => x.vencimento)).toEqual(["2026-01-10", "2026-02-10", "2026-03-10"]); // 10/04 passa do fim
  });

  it("só devolve o que vence a partir de `de` (a geração não refaz o passado já gerado)", () => {
    const o = ocorrenciasDaRecorrencia({ diaVencimento: 31, periodicidade: "MENSAL", inicio: "2026-01-01", fim: null }, "2026-03-01", "2026-05-31");
    expect(o.map((x) => x.vencimento)).toEqual(["2026-03-31", "2026-04-30", "2026-05-31"]);
  });

  it("trimestral começa no mês do início e anda de 3 em 3", () => {
    const o = ocorrenciasDaRecorrencia({ diaVencimento: 5, periodicidade: "TRIMESTRAL", inicio: "2026-01-20", fim: null }, "2026-01-01", "2026-12-31");
    expect(o.map((x) => x.vencimento)).toEqual(["2026-04-05", "2026-07-05", "2026-10-05"]); // 05/01 é antes do início
  });

  it("anual com dia 31 em fevereiro: 28 em ano comum, 29 em bissexto", () => {
    const o = ocorrenciasDaRecorrencia({ diaVencimento: 31, periodicidade: "ANUAL", inicio: "2026-02-10", fim: null }, "2026-01-01", "2028-12-31");
    expect(o.map((x) => x.vencimento)).toEqual(["2026-02-28", "2027-02-28", "2028-02-29"]);
  });

  it("é idempotente: pedir o mesmo intervalo de novo devolve as mesmas ocorrências", () => {
    const r = { diaVencimento: 15, periodicidade: "MENSAL" as const, inicio: "2026-06-01", fim: null };
    expect(ocorrenciasDaRecorrencia(r, "2026-06-01", "2027-01-31")).toEqual(ocorrenciasDaRecorrencia(r, "2026-06-01", "2027-01-31"));
  });

  it("dia de vencimento inválido é recusado", () => {
    expect(() => ocorrenciasDaRecorrencia({ diaVencimento: 0, periodicidade: "MENSAL", inicio: "2026-01-01", fim: null }, "2026-01-01", "2026-12-31")).toThrow();
    expect(() => ocorrenciasDaRecorrencia({ diaVencimento: 32, periodicidade: "MENSAL", inicio: "2026-01-01", fim: null }, "2026-01-01", "2026-12-31")).toThrow();
  });

  it("horizonte: último dia do mês N meses à frente", () => {
    expect(horizonteDaRecorrencia("2026-11-12", 3)).toBe("2027-02-28");
    expect(horizonteDaRecorrencia("2027-11-12", 3)).toBe("2028-02-29");
    expect(horizonteDaRecorrencia("2026-11-12", 0)).toBe("2026-11-30");
    expect(() => horizonteDaRecorrencia("2026-11-12", -1)).toThrow();
  });
});
