import { describe, expect, it } from "vitest";

import {
  dataDaRegra,
  domingoDePascoa,
  expandirRegras,
  type DefinicaoDeFeriado,
} from "../../src/lib/dominio/regras-feriado";

const diaDaSemana = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();

describe("domingoDePascoa", () => {
  const conhecidas: [number, string][] = [
    [2024, "2024-03-31"],
    [2025, "2025-04-20"],
    [2026, "2026-04-05"],
    [2027, "2027-03-28"],
    [2028, "2028-04-16"],
    [2029, "2029-04-01"],
    [2030, "2030-04-21"],
    [2038, "2038-04-25"], // limite alto do calendário gregoriano
  ];
  it.each(conhecidas)("em %i cai em %s", (ano, esperado) => {
    expect(domingoDePascoa(ano)).toBe(esperado);
  });

  it("é sempre domingo", () => {
    for (let ano = 2020; ano <= 2060; ano++) expect(diaDaSemana(domingoDePascoa(ano)), String(ano)).toBe(0);
  });
});

describe("regra FIXA", () => {
  it("cai no mesmo dia e mês todo ano", () => {
    expect(dataDaRegra({ tipo: "FIXA", mes: 6, dia: 24 }, 2026)).toBe("2026-06-24");
    expect(dataDaRegra({ tipo: "FIXA", mes: 7, dia: 29 }, 2031)).toBe("2031-07-29");
  });

  it("recusa data que não existe (31/04; 29/02 em ano comum)", () => {
    expect(() => dataDaRegra({ tipo: "FIXA", mes: 4, dia: 31 }, 2026)).toThrow();
    expect(() => dataDaRegra({ tipo: "FIXA", mes: 2, dia: 29 }, 2027)).toThrow();
    expect(dataDaRegra({ tipo: "FIXA", mes: 2, dia: 29 }, 2028)).toBe("2028-02-29");
  });
});

describe("regra PASCOA", () => {
  it("Sexta-feira Santa (−2), Carnaval (−48 e −47) e Corpus Christi (+60)", () => {
    expect(dataDaRegra({ tipo: "PASCOA", deslocamento: -2 }, 2026)).toBe("2026-04-03");
    expect(dataDaRegra({ tipo: "PASCOA", deslocamento: -47 }, 2026)).toBe("2026-02-17");
    expect(dataDaRegra({ tipo: "PASCOA", deslocamento: -48 }, 2026)).toBe("2026-02-16");
    expect(dataDaRegra({ tipo: "PASCOA", deslocamento: 60 }, 2026)).toBe("2026-06-04");
    expect(dataDaRegra({ tipo: "PASCOA", deslocamento: 60 }, 2027)).toBe("2027-05-27");
  });

  it("Corpus Christi é sempre quinta-feira", () => {
    for (let ano = 2020; ano <= 2060; ano++) {
      expect(diaDaSemana(dataDaRegra({ tipo: "PASCOA", deslocamento: 60 }, ano)), String(ano)).toBe(4);
    }
  });
});

describe("regra NESIMO_DIA_DA_SEMANA (Dia do Comerciário: 3ª segunda-feira de outubro)", () => {
  const comerciario = { tipo: "NESIMO_DIA_DA_SEMANA", mes: 10, ordem: 3, diaSemana: 1 } as const;

  // Conferidas no calendário, ano a ano: a data muda, a regra não.
  const esperadas: [number, string][] = [
    [2026, "2026-10-19"],
    [2027, "2027-10-18"],
    [2028, "2028-10-16"],
    [2029, "2029-10-15"], // outubro começa numa segunda: a 3ª é dia 15
    [2030, "2030-10-21"], // outubro começa numa terça: a 1ª segunda é dia 7
  ];
  it.each(esperadas)("em %i cai em %s", (ano, esperada) => {
    expect(dataDaRegra(comerciario, ano)).toBe(esperada);
  });

  it("é sempre segunda-feira, entre os dias 15 e 21 de outubro (qualquer ano)", () => {
    for (let ano = 2020; ano <= 2100; ano++) {
      const d = dataDaRegra(comerciario, ano);
      expect(diaDaSemana(d), d).toBe(1);
      const dia = Number(d.slice(8));
      expect(d.slice(0, 7), d).toBe(`${ano}-10`);
      expect(dia >= 15 && dia <= 21, d).toBe(true);
    }
  });

  it("1ª e 4ª ocorrências seguem a mesma conta (1ª terça de março de 2026 = dia 3; 4ª quinta de novembro de 2026 = dia 26)", () => {
    expect(dataDaRegra({ tipo: "NESIMO_DIA_DA_SEMANA", mes: 3, ordem: 1, diaSemana: 2 }, 2026)).toBe("2026-03-03");
    expect(dataDaRegra({ tipo: "NESIMO_DIA_DA_SEMANA", mes: 11, ordem: 4, diaSemana: 4 }, 2026)).toBe("2026-11-26");
  });

  it("dia da semana inválido é recusado", () => {
    expect(() => dataDaRegra({ tipo: "NESIMO_DIA_DA_SEMANA", mes: 10, ordem: 3, diaSemana: 7 }, 2026)).toThrow();
  });
});

describe("expandirRegras", () => {
  const defs: DefinicaoDeFeriado[] = [
    { nome: "B", tipo: "FERIADO", regra: { tipo: "FIXA", mes: 12, dia: 25 } },
    { nome: "A", tipo: "OUTRO", regra: { tipo: "FIXA", mes: 1, dia: 1 } },
  ];

  it("gera todos os anos do intervalo, em ordem de data", () => {
    const r = expandirRegras(defs, 2026, 2027);
    expect(r.map((f) => f.data)).toEqual(["2026-01-01", "2026-12-25", "2027-01-01", "2027-12-25"]);
    expect(r[0]).toEqual({ data: "2026-01-01", nome: "A", tipo: "OUTRO" });
  });

  it("intervalo invertido gera lista vazia", () => {
    expect(expandirRegras(defs, 2030, 2029)).toEqual([]);
  });
});
