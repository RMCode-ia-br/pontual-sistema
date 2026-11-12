import { describe, expect, it } from "vitest";

import { centavosParaCsv, csvDoRelatorio, valorDeCsv, type ColunaDeCsv } from "@/lib/csv/colunas";
import { lerCsv } from "@/lib/csv/ler";

/** CSV de relatório (Fase 7, Bloco 2): datas dd/mm/aaaa, dinheiro no padrão brasileiro, acentos, aviso e coluna interna. */

type Linha = { obra: string; fechada: string; aprovadaEm: Date; valor: number | null; custo: number | null; margemPb: number | null; metros: number | null };

const COLUNAS: ColunaDeCsv<Linha>[] = [
  { titulo: "Obra", tipo: "texto", valor: (l) => l.obra },
  { titulo: "Fechada em", tipo: "data", valor: (l) => l.fechada },
  { titulo: "Aprovada em", tipo: "data", valor: (l) => l.aprovadaEm },
  { titulo: "Valor (R$)", tipo: "dinheiro", valor: (l) => l.valor },
  { titulo: "Custo (R$)", tipo: "dinheiro", valor: (l) => l.custo, interna: true },
  { titulo: "Margem (%)", tipo: "percentual", valor: (l) => (l.margemPb === null ? null : l.margemPb / 100), interna: true },
  { titulo: "Metros", tipo: "numero", valor: (l) => l.metros },
];

const LINHAS: Linha[] = [
  { obra: "Casa da Praia — Macaé", fechada: "2026-11-05", aprovadaEm: new Date("2026-11-05T00:00:00Z"), valor: 8_972_500, custo: 5_000_050, margemPb: 4425, metros: 12.5 },
  { obra: "=SOMA(A1)", fechada: "2026-01-31", aprovadaEm: new Date("2026-01-31T00:00:00Z"), valor: 5, custo: null, margemPb: null, metros: null },
];

describe("formatação por tipo", () => {
  it("dinheiro: centavos viram reais com vírgula, sem símbolo e sem ponto de milhar", () => {
    expect(centavosParaCsv(8_972_500)).toBe("89725,00");
    expect(centavosParaCsv(5)).toBe("0,05");
    expect(centavosParaCsv(-1999)).toBe("-19,99");
    expect(centavosParaCsv(0)).toBe("0,00");
  });

  it("data: dd/mm/aaaa sem andar um dia (texto de calendário e coluna @db.Date em UTC)", () => {
    expect(valorDeCsv("data", "2026-11-05")).toBe("05/11/2026");
    expect(valorDeCsv("data", new Date("2026-11-05T00:00:00Z"))).toBe("05/11/2026");
    expect(valorDeCsv("data", new Date("2026-01-01T00:00:00Z"))).toBe("01/01/2026");
  });

  it("data e hora: no fuso de São Paulo", () => {
    expect(valorDeCsv("dataHora", new Date("2026-11-11T02:00:00Z"))).toBe("10/11/2026 23:00");
  });

  it("número e percentual: vírgula decimal e sem zeros sobrando", () => {
    expect(valorDeCsv("numero", 12.5)).toBe("12,5");
    expect(valorDeCsv("numero", 3)).toBe("3");
    expect(valorDeCsv("numero", 0.125)).toBe("0,125");
    expect(valorDeCsv("percentual", 44.25)).toBe("44,3");
    expect(valorDeCsv("percentual", 44.25, 2)).toBe("44,25");
    expect(valorDeCsv("inteiro", 7.9)).toBe("7");
  });

  it("vazio é vazio, nunca zero", () => {
    expect(valorDeCsv("dinheiro", null)).toBeNull();
    expect(valorDeCsv("dinheiro", undefined)).toBeNull();
    expect(valorDeCsv("numero", "")).toBeNull();
    expect(valorDeCsv("dinheiro", 0)).toBe("0,00"); // zero de verdade é zero
  });
});

describe("csvDoRelatorio", () => {
  const ler = (csv: string) => lerCsv(csv);

  it("gera o arquivo com BOM, cabeçalho, acentos e valores no padrão brasileiro", () => {
    const csv = csvDoRelatorio(COLUNAS, LINHAS, { podeVerInterno: true });
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
    const p = ler(csv);
    expect(p.cabecalho).toEqual(["Obra", "Fechada em", "Aprovada em", "Valor (R$)", "Custo (R$)", "Margem (%)", "Metros"]);
    expect(p.linhas[0]).toEqual(["Casa da Praia — Macaé", "05/11/2026", "05/11/2026", "89725,00", "50000,50", "44,3", "12,5"]);
  });

  it("neutraliza fórmula em texto e deixa vazio o que não tem valor", () => {
    const p = ler(csvDoRelatorio(COLUNAS, LINHAS, { podeVerInterno: true }));
    expect(p.linhas[1][0]).toBe("'=SOMA(A1)");
    expect(p.linhas[1].slice(4)).toEqual(["", "", ""]); // custo, margem e metros sem valor: vazio, não zero
  });

  it("sem permissão para ver custo, a coluna interna NÃO sai (nem o título)", () => {
    const csv = csvDoRelatorio(COLUNAS, LINHAS, { podeVerInterno: false });
    const p = ler(csv);
    expect(p.cabecalho).toEqual(["Obra", "Fechada em", "Aprovada em", "Valor (R$)", "Metros"]);
    expect(csv).not.toContain("Custo");
    expect(csv).not.toContain("Margem");
    expect(csv).not.toContain("50000,50");
    expect(csv).not.toContain("44,3");
  });

  it("exportação truncada leva o aviso na primeira linha, antes do cabeçalho", () => {
    const csv = csvDoRelatorio(COLUNAS, LINHAS, { podeVerInterno: true, aviso: "mostrando só as 5.000 primeiras linhas; use o filtro." });
    const linhas = csv.replace("﻿", "").split("\r\n");
    // O aviso tem ";" (o separador do arquivo), então a célula vai entre aspas: o Excel a mostra sem elas.
    expect(linhas[0]).toBe('"AVISO: mostrando só as 5.000 primeiras linhas; use o filtro."');
    expect(linhas[1].startsWith("Obra;")).toBe(true);
  });

  it("o texto do aviso com $ e aspas não quebra o arquivo", () => {
    const csv = csvDoRelatorio(COLUNAS, [], { podeVerInterno: true, aviso: 'custo "R$ 1,00" $& teste' });
    expect(csv.split("\r\n")[0]).toContain('"AVISO: custo ""R$ 1,00"" $& teste"');
  });
});
