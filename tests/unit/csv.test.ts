import { describe, expect, it } from "vitest";

import { celulaCsv, gerarCsv } from "@/lib/csv";

describe("CSV", () => {
  it("texto simples, números e vazios", () => {
    expect(celulaCsv("Macaé")).toBe("Macaé");
    expect(celulaCsv(42)).toBe("42");
    expect(celulaCsv(-5)).toBe("-5"); // número de verdade não é alterado
    expect(celulaCsv(null)).toBe("");
    expect(celulaCsv(undefined)).toBe("");
  });

  it("aspas, ponto e vírgula e quebras de linha", () => {
    expect(celulaCsv('diz "oi"')).toBe('"diz ""oi"""');
    expect(celulaCsv("a;b")).toBe('"a;b"');
    expect(celulaCsv("linha1\nlinha2")).toBe('"linha1\nlinha2"');
  });

  it("neutraliza fórmulas em texto (CSV injection)", () => {
    for (const perigoso of ["=1+1", "+cmd|' /C calc'!A0", "-2+3", "@SOMA(A1)", "\t=1", "\r=1"]) {
      const saida = celulaCsv(perigoso);
      expect(saida.replace(/^"/, "").startsWith("'"), perigoso).toBe(true);
    }
    expect(celulaCsv("=HYPERLINK(\"http://x\")")).toBe(`"'=HYPERLINK(""http://x"")"`);
  });

  it("texto que só contém hífen no meio não é alterado", () => {
    expect(celulaCsv("1127-26")).toBe("1127-26");
    expect(celulaCsv("sem-prefixo")).toBe("sem-prefixo");
  });

  it("serializa Date e objetos", () => {
    expect(celulaCsv(new Date("2026-01-02T03:04:05Z"))).toBe("2026-01-02T03:04:05.000Z");
    expect(celulaCsv({ a: 1 })).toBe('"{""a"":1}"');
  });

  it("gera arquivo com BOM, separador ; e CRLF", () => {
    const csv = gerarCsv(["Nome", "Valor"], [["Ana", 1], ["=x", 2]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toBe("﻿Nome;Valor\r\nAna;1\r\n'=x;2\r\n");
  });
});
