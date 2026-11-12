import { describe, expect, it } from "vitest";

import { feriadosDoSeed } from "../../prisma/seed-dados";

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe("feriados do seed (nacionais, estadual RJ e municipais de Macaé)", () => {
  const lista = feriadosDoSeed(2026, 2030);
  const doAno = (ano: number) => lista.filter((f) => f.data.getUTCFullYear() === ano);
  const achar = (ano: number, trecho: string) => doAno(ano).find((f) => f.nome.includes(trecho));

  it("gera 17 por ano, 85 em 5 anos, sem datas+nomes repetidos (o seed depende da unicidade)", () => {
    expect(doAno(2026)).toHaveLength(17);
    expect(lista).toHaveLength(85);
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

  it("São Jorge (estadual RJ, 23/04) e Corpus Christi (Páscoa + 60) descontam dia útil", () => {
    const jorge = achar(2026, "São Jorge")!;
    expect(iso(jorge.data)).toBe("2026-04-23");
    expect(jorge.tipo).toBe("FERIADO");
    const corpus = achar(2026, "Corpus Christi")!;
    expect(iso(corpus.data)).toBe("2026-06-04");
    expect(corpus.tipo).toBe("FERIADO");
    expect(iso(achar(2027, "Corpus Christi")!.data)).toBe("2027-05-27");
  });

  it("Macaé: São João Batista (24/06) e emancipação (29/07) são datas fixas", () => {
    for (const ano of [2026, 2027, 2028, 2029, 2030]) {
      const joao = achar(ano, "São João Batista")!;
      expect(iso(joao.data), String(ano)).toBe(`${ano}-06-24`);
      expect(joao.tipo).toBe("FERIADO");
      expect(joao.nome).toContain("Lei Municipal 513/1975");
      expect(iso(achar(ano, "emancipação")!.data), String(ano)).toBe(`${ano}-07-29`);
    }
  });

  it("Macaé: Dia do Comerciário é a 3ª segunda-feira de outubro e a data muda a cada ano", () => {
    const esperadas: [number, string][] = [
      [2026, "2026-10-19"],
      [2027, "2027-10-18"],
      [2028, "2028-10-16"],
      [2029, "2029-10-15"],
      [2030, "2030-10-21"],
    ];
    for (const [ano, data] of esperadas) {
      const f = achar(ano, "Comerciário")!;
      expect(iso(f.data), String(ano)).toBe(data);
      expect(f.tipo).toBe("FERIADO");
      expect(f.data.getUTCDay(), String(ano)).toBe(1);
    }
  });

  it("só os feriados de verdade descontam dias úteis (15 por ano: 9 nacionais fixos, Sexta-feira Santa, Corpus Christi, São Jorge e 3 de Macaé)", () => {
    expect(doAno(2026).filter((f) => f.tipo === "FERIADO")).toHaveLength(15);
    expect(doAno(2026).filter((f) => f.tipo === "OUTRO")).toHaveLength(2);
  });

  it("não cadastra férias coletivas (ainda não definidas): o gestor cadastra em Configurações", () => {
    expect(lista.some((f) => /férias|ferias/i.test(f.nome))).toBe(false);
  });
});
