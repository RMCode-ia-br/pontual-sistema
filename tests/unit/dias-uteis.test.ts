import { describe, expect, it } from "vitest";

import {
  anoSemFeriados,
  datasDeFeriado,
  diasEntreDoTipo,
  diasUteisEntre,
  ehDiaUtil,
  somarDiasDoTipo,
  somarDiasUteis,
  type PeriodoDeFeriado,
} from "../../src/lib/dominio/dias-uteis";

// Abril de 2026: 02 quinta, 03 sexta (Sexta-feira Santa, feriado), 04 sábado, 05 domingo, 06 segunda,
// 20 segunda, 21 terça (Tiradentes, feriado).
const FERIADOS = datasDeFeriado([
  { data: "2026-04-03", tipo: "FERIADO" },
  { data: "2026-04-21", tipo: "FERIADO" },
]);
const NENHUM = new Set<string>();

describe("datasDeFeriado", () => {
  it("só o tipo FERIADO desconta; férias coletivas e pontos facultativos não", () => {
    const periodos: PeriodoDeFeriado[] = [
      { data: "2026-12-24", dataFim: "2027-01-04", tipo: "FERIAS_COLETIVA_FORNECEDORES" },
      { data: "2026-02-16", tipo: "OUTRO" },
      { data: "2026-04-03", tipo: "FERIADO" },
    ];
    expect([...datasDeFeriado(periodos)]).toEqual(["2026-04-03"]);
  });

  it("expande um feriado com data final", () => {
    const set = datasDeFeriado([{ data: "2026-09-07", dataFim: "2026-09-09", tipo: "FERIADO" }]);
    expect([...set]).toEqual(["2026-09-07", "2026-09-08", "2026-09-09"]);
  });

  it("recusa um período absurdo", () => {
    expect(() => datasDeFeriado([{ data: "2026-01-01", dataFim: "2030-01-01", tipo: "FERIADO" }])).toThrow(RangeError);
  });
});

describe("ehDiaUtil", () => {
  it("segunda a sexta sem feriado", () => {
    expect(ehDiaUtil("2026-04-06", FERIADOS)).toBe(true);
    expect(ehDiaUtil("2026-04-02", FERIADOS)).toBe(true);
  });
  it("sábado, domingo e feriado não", () => {
    expect(ehDiaUtil("2026-04-04", FERIADOS)).toBe(false);
    expect(ehDiaUtil("2026-04-05", FERIADOS)).toBe(false);
    expect(ehDiaUtil("2026-04-03", FERIADOS)).toBe(false);
  });
});

describe("somarDiasUteis", () => {
  it("pula fim de semana e feriado: 1 dia útil depois de quinta (sexta é feriado) é a segunda", () => {
    expect(somarDiasUteis("2026-04-02", 1, FERIADOS)).toBe("2026-04-06");
  });
  it("sem feriado, 5 dias úteis depois de uma segunda é a segunda seguinte", () => {
    expect(somarDiasUteis("2026-04-06", 5, NENHUM)).toBe("2026-04-13");
  });
  it("zero devolve a própria data, mesmo que não seja útil", () => {
    expect(somarDiasUteis("2026-04-04", 0, FERIADOS)).toBe("2026-04-04");
  });
  it("partindo de um sábado, o 1º dia útil é a segunda", () => {
    expect(somarDiasUteis("2026-04-04", 1, FERIADOS)).toBe("2026-04-06");
  });
  it("feriado no meio do caminho empurra a data (Tiradentes numa terça)", () => {
    expect(somarDiasUteis("2026-04-20", 1, FERIADOS)).toBe("2026-04-22");
  });
  it("aceita negativo (para trás)", () => {
    expect(somarDiasUteis("2026-04-06", -1, FERIADOS)).toBe("2026-04-02");
  });
  it("atravessa a virada de ano respeitando o feriado de 1º de janeiro", () => {
    const comAnoNovo = datasDeFeriado([{ data: "2027-01-01", tipo: "FERIADO" }]);
    expect(somarDiasUteis("2026-12-31", 1, NENHUM)).toBe("2027-01-01");
    expect(somarDiasUteis("2026-12-31", 1, comAnoNovo)).toBe("2027-01-04");
  });
  it("recusa número de dias inválido", () => {
    expect(() => somarDiasUteis("2026-04-06", 1.5, NENHUM)).toThrow(RangeError);
    expect(() => somarDiasUteis("2026-04-06", Number.NaN, NENHUM)).toThrow(RangeError);
    expect(() => somarDiasUteis("2026-04-06", 1_000_000, NENHUM)).toThrow(RangeError);
  });
});

describe("diasUteisEntre", () => {
  it("conta os dias úteis depois de `a` até `b` inclusive", () => {
    expect(diasUteisEntre("2026-04-02", "2026-04-06", FERIADOS)).toBe(1);
    expect(diasUteisEntre("2026-04-06", "2026-04-13", NENHUM)).toBe(5);
  });
  it("é negativo quando `b` é antes de `a`, e zero quando iguais", () => {
    expect(diasUteisEntre("2026-04-06", "2026-04-02", FERIADOS)).toBe(-1);
    expect(diasUteisEntre("2026-04-06", "2026-04-06", FERIADOS)).toBe(0);
  });
  it("um fim de semana inteiro vale zero", () => {
    expect(diasUteisEntre("2026-04-10", "2026-04-12", NENHUM)).toBe(0);
  });
  it("é o inverso de somarDiasUteis para datas úteis", () => {
    const base = "2026-04-06";
    for (let n = 0; n <= 40; n++) {
      const fim = somarDiasUteis(base, n, FERIADOS);
      expect(diasUteisEntre(base, fim, FERIADOS), `n=${n}`).toBe(n);
    }
  });
});

describe("tipo de dias (úteis ou corridos)", () => {
  it("corridos ignoram fim de semana e feriado", () => {
    expect(somarDiasDoTipo("2026-04-02", 1, "CORRIDOS", FERIADOS)).toBe("2026-04-03");
    expect(somarDiasDoTipo("2026-04-02", 1, "UTEIS", FERIADOS)).toBe("2026-04-06");
  });
  it("diferença entre datas na mesma convenção", () => {
    expect(diasEntreDoTipo("2026-04-02", "2026-04-06", "CORRIDOS", FERIADOS)).toBe(4);
    expect(diasEntreDoTipo("2026-04-02", "2026-04-06", "UTEIS", FERIADOS)).toBe(1);
  });
  it("corridos também recusam número inválido", () => {
    expect(() => somarDiasDoTipo("2026-04-02", 0.5, "CORRIDOS", NENHUM)).toThrow(RangeError);
  });
});

describe("anoSemFeriados (horizonte dos feriados cadastrados)", () => {
  const periodos: PeriodoDeFeriado[] = [
    { data: "2026-04-03", tipo: "FERIADO" },
    { data: "2027-01-01", tipo: "FERIADO" },
    { data: "2029-02-12", tipo: "OUTRO" },
  ];
  it("anos com feriado cadastrado estão cobertos", () => {
    expect(anoSemFeriados("2026-11-02", periodos)).toBeNull();
    expect(anoSemFeriados("2027-03-01", periodos)).toBeNull();
  });
  it("devolve o ano que ficou sem feriados (a conta de dias úteis ficaria errada em silêncio)", () => {
    expect(anoSemFeriados("2028-05-01", periodos)).toBe(2028);
  });
  it("ponto facultativo não conta como cobertura do ano", () => {
    expect(anoSemFeriados("2029-05-01", periodos)).toBe(2029);
  });
});
