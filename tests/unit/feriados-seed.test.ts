import { describe, expect, it } from "vitest";

import { domingoDePascoa, feriadosNacionais } from "../../prisma/seed-dados";

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe("Domingo de Páscoa (base de Sexta-feira Santa e Carnaval)", () => {
  // Datas oficiais conhecidas.
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
    expect(iso(domingoDePascoa(ano))).toBe(esperado);
  });

  it("é sempre domingo", () => {
    for (let ano = 2020; ano <= 2060; ano++) expect(domingoDePascoa(ano).getUTCDay(), String(ano)).toBe(0);
  });
});

describe("feriados nacionais do seed", () => {
  const lista = feriadosNacionais(2026, 2030);
  const doAno = (ano: number) => lista.filter((f) => f.data.getUTCFullYear() === ano);
  const achar = (ano: number, trecho: string) => doAno(ano).find((f) => f.nome.includes(trecho));

  it("gera 12 por ano, 60 em 5 anos, sem datas+nomes repetidos (o seed depende da unicidade)", () => {
    expect(doAno(2026)).toHaveLength(12);
    expect(lista).toHaveLength(60);
    const chaves = lista.map((f) => `${iso(f.data)}|${f.nome}`);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it("feriados fixos nas datas certas", () => {
    expect(iso(achar(2026, "Tiradentes")!.data)).toBe("2026-04-21");
    expect(iso(achar(2026, "Natal")!.data)).toBe("2026-12-25");
    expect(iso(achar(2027, "Independência")!.data)).toBe("2027-09-07");
    expect(iso(achar(2026, "Consciência Negra")!.data)).toBe("2026-11-20");
  });

  it("Sexta-feira Santa é 2 dias antes da Páscoa e conta como feriado", () => {
    const sexta = achar(2026, "Sexta-feira Santa")!;
    expect(iso(sexta.data)).toBe("2026-04-03");
    expect(sexta.tipo).toBe("FERIADO");
    expect(iso(achar(2028, "Sexta-feira Santa")!.data)).toBe("2028-04-14");
  });

  it("Carnaval é ponto facultativo (OUTRO): aparece como aviso e NÃO desconta dias úteis", () => {
    const segunda = achar(2026, "Carnaval (segunda")!;
    const terca = achar(2026, "Carnaval (terça")!;
    expect(iso(segunda.data)).toBe("2026-02-16");
    expect(iso(terca.data)).toBe("2026-02-17");
    expect(segunda.tipo).toBe("OUTRO");
    expect(terca.tipo).toBe("OUTRO");
    expect(iso(achar(2027, "Carnaval (terça")!.data)).toBe("2027-02-09");
  });

  it("só os feriados de verdade descontam dias úteis (9 fixos + Sexta-feira Santa = 10 por ano)", () => {
    expect(doAno(2026).filter((f) => f.tipo === "FERIADO")).toHaveLength(10);
  });

  it("não inventa feriados municipais (Macaé fica para o gestor cadastrar)", () => {
    expect(lista.some((f) => /Macaé|São João|Municipal/i.test(f.nome))).toBe(false);
  });
});
