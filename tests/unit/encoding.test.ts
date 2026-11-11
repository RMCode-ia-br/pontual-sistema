import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Guarda contra texto corrompido: o PowerShell 5.1 (Get-Content/Set-Content) le UTF-8 como ANSI e
 * regrava duplamente codificado (palavras com acento passam a aparecer com simbolos estranhos), sem
 * nenhum erro de compilacao ou lint. Tambem barra BOM no inicio dos arquivos.
 *
 * Este arquivo e propositalmente so ASCII: monta os caracteres por codigo, para nao ser ele mesmo
 * detectado como corrompido.
 */
const RAIZ = path.resolve(__dirname, "../..");
const PASTAS = ["src", "tests", "docs", "prisma", "scripts", ".github"];
const IGNORAR = new Set(["node_modules", ".next", "generated", "referencias"]);
const EXTENSOES = /\.(tsx?|mts|mjs|cjs|md|json|css|ya?ml|sql|prisma)$/;

const c = (...codigos: number[]) => String.fromCharCode(...codigos);

// Rastro tipico de UTF-8 lido como Windows-1252: A-til (0xC3) ou A-circunflexo (0xC2) seguido de
// simbolo, ou a-circunflexo + euro (0xE2 0x20AC).
const CORROMPIDO = new RegExp(
  `${c(0xc3)}[${c(0x80)}-${c(0xbf)}${c(0x2018)}-${c(0x203a)}${c(0x152, 0x153, 0x17d, 0x17e, 0x178, 0x2c6, 0x2dc, 0x2020, 0x2021, 0x2022)}]` +
    `|${c(0xc2)}[${c(0xa0)}-${c(0xbf)}]` +
    `|${c(0xe2, 0x20ac)}`,
);

function arquivos(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (IGNORAR.has(e.name)) return [];
    const p = path.join(dir, e.name);
    return e.isDirectory() ? arquivos(p) : EXTENSOES.test(e.name) ? [p] : [];
  });
}

describe("codificacao dos arquivos do projeto", () => {
  const todos = PASTAS.flatMap((p) => arquivos(path.join(RAIZ, p)));

  it("encontra arquivos para verificar", () => {
    expect(todos.length).toBeGreaterThan(50);
  });

  it("nenhum arquivo tem texto UTF-8 corrompido", () => {
    const ruins = todos.filter((f) => CORROMPIDO.test(fs.readFileSync(f, "utf8"))).map((f) => path.relative(RAIZ, f));
    expect(ruins).toEqual([]);
  });

  it("nenhum arquivo comeca com BOM", () => {
    const ruins = todos.filter((f) => fs.readFileSync(f, "utf8").charCodeAt(0) === 0xfeff).map((f) => path.relative(RAIZ, f));
    expect(ruins).toEqual([]);
  });

  it("o detector reconhece a corrupcao tipica (o teste nao e vazio)", () => {
    expect(CORROMPIDO.test(`A${c(0xc3, 0xa7, 0xc3, 0xb5)}es`)).toBe(true);
    expect(CORROMPIDO.test(`J${c(0xc3, 0xa1)} existem`)).toBe(true);
    expect(CORROMPIDO.test(`x${c(0xe2, 0x20ac, 0x201c)}y`)).toBe(true);
  });

  it("o detector nao acusa texto correto em portugues", () => {
    expect(CORROMPIDO.test(`A${c(0xe7, 0xf5)}es, J${c(0xe1)} existem, Voc${c(0xea)}, ${c(0xda)}ltimo, ${c(0xc7)}`)).toBe(false);
    expect(CORROMPIDO.test("texto simples sem acentos")).toBe(false);
  });
});
