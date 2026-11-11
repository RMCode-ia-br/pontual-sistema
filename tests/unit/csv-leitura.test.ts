import { describe, expect, it } from "vitest";

import { decodificarTexto, detectarSeparador, ErroPlanilha, LIMITES_PLANILHA, lerCsv, planilhaDeMatriz } from "@/lib/csv/ler";
import { gerarCsv } from "@/lib/csv";

describe("detectarSeparador", () => {
  it("reconhece ponto e vírgula, vírgula e tabulação", () => {
    expect(detectarSeparador("a;b;c\n1;2;3")).toBe(";");
    expect(detectarSeparador("a,b,c\n1,2,3")).toBe(",");
    expect(detectarSeparador("a\tb\tc\n1\t2\t3")).toBe("\t");
  });

  it("ignora separadores dentro de aspas", () => {
    expect(detectarSeparador('"a,b,c";d;e')).toBe(";");
  });

  it("sem nenhum separador, assume ponto e vírgula (Excel em português)", () => {
    expect(detectarSeparador("so uma coluna\nvalor")).toBe(";");
  });

  it("ignora linhas em branco antes do cabeçalho", () => {
    expect(detectarSeparador("\n\nnome,valor\nx,1")).toBe(",");
  });
});

describe("lerCsv", () => {
  it("lê cabeçalho e linhas", () => {
    const p = lerCsv("codigo;descricao;custo\nA1;Perfil 6m;12,50\nA2;Vidro;99,90\n");
    expect(p.cabecalho).toEqual(["codigo", "descricao", "custo"]);
    expect(p.linhas).toEqual([
      ["A1", "Perfil 6m", "12,50"],
      ["A2", "Vidro", "99,90"],
    ]);
  });

  it("ignora o BOM do Excel e aceita CRLF, LF e CR", () => {
    expect(lerCsv("﻿a;b\r\n1;2\r\n3;4").linhas).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
    expect(lerCsv("a;b\n1;2\n").linhas).toEqual([["1", "2"]]);
    expect(lerCsv("a;b\r1;2\r").linhas).toEqual([["1", "2"]]);
  });

  it("trata aspas, separador e quebra de linha dentro do campo e aspas duplicadas", () => {
    const p = lerCsv('nome;obs\n"Silva; João";"disse ""oi""\nna porta"\n');
    expect(p.linhas).toEqual([["Silva; João", 'disse "oi"\nna porta']]);
  });

  it("pula linhas totalmente em branco e completa colunas faltantes", () => {
    const p = lerCsv("a;b;c\n1;2\n\n;;\n3;4;5\n");
    expect(p.linhas).toEqual([
      ["1", "2", ""],
      ["3", "4", "5"],
    ]);
  });

  it("dá nome às colunas sem título", () => {
    expect(lerCsv("a;;c\n1;2;3").cabecalho).toEqual(["a", "Coluna 2", "c"]);
  });

  it("não interpreta conteúdo: fórmulas ficam como texto", () => {
    expect(lerCsv("a\n=1+1\n+cmd").linhas).toEqual([["=1+1"], ["+cmd"]]);
  });

  it("recusa aspas sem fechar", () => {
    expect(() => lerCsv('a;b\n"1;2\n')).toThrow(ErroPlanilha);
  });

  it("recusa arquivo vazio e arquivo só com cabeçalho", () => {
    expect(() => lerCsv("")).toThrow(/vazio/);
    expect(() => lerCsv("\n\n;;\n")).toThrow(/vazio/);
    expect(() => lerCsv("a;b\n")).toThrow(/só tem o cabeçalho/);
  });

  it("respeita o limite de linhas e de colunas", () => {
    const muitas = ["a", ...Array.from({ length: LIMITES_PLANILHA.linhas + 1 }, (_, i) => String(i))].join("\n");
    expect(() => lerCsv(muitas)).toThrow(/limite/);
    const colunas = Array.from({ length: LIMITES_PLANILHA.colunas + 1 }, (_, i) => `c${i}`).join(";");
    expect(() => lerCsv(`${colunas}\n1`)).toThrow(/colunas/);
  });

  it("aceita exatamente o limite de linhas", () => {
    const todas = ["a", ...Array.from({ length: LIMITES_PLANILHA.linhas }, (_, i) => String(i))].join("\n");
    expect(lerCsv(todas).linhas).toHaveLength(LIMITES_PLANILHA.linhas);
  });

  it("recusa célula gigante", () => {
    expect(() => lerCsv(`a\n${"x".repeat(LIMITES_PLANILHA.caracteresPorCelula + 1)}`)).toThrow(/célula/);
  });

  it("lê de volta o que o gerador de CSV escreve (ida e volta)", () => {
    const csv = gerarCsv(["Nome", "Obs"], [["Ana; \"A\"", "linha 1\nlinha 2"], ["José", "ç ã é"]]);
    const p = lerCsv(csv);
    expect(p.cabecalho).toEqual(["Nome", "Obs"]);
    expect(p.linhas).toEqual([["Ana; \"A\"", "linha 1\nlinha 2"], ["José", "ç ã é"]]);
  });
});

describe("planilhaDeMatriz", () => {
  it("usa a primeira linha não vazia como cabeçalho", () => {
    const p = planilhaDeMatriz([["", ""], ["x", "y"], ["1", "2"]]);
    expect(p.cabecalho).toEqual(["x", "y"]);
    expect(p.linhas).toEqual([["1", "2"]]);
  });
});

describe("decodificarTexto", () => {
  it("lê UTF-8", () => {
    expect(decodificarTexto(new TextEncoder().encode("João, ação"))).toBe("João, ação");
  });

  it("cai para Windows-1252 quando não é UTF-8 válido (Excel antigo)", () => {
    // "João" em Windows-1252: 4A 6F E3 6F
    expect(decodificarTexto(new Uint8Array([0x4a, 0x6f, 0xe3, 0x6f]))).toBe("João");
  });
});
