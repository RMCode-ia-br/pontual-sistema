import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { contraste, hexParaOklch, misturar, normalizarHex, oklchParaHex } from "@/lib/tema/cores";
import { cssDoTema, derivarTemaDaMarca, SUPERFICIES, TEXTO_SOBRE_MARCA } from "@/lib/tema/derivar";

const AZUL_DO_SITE = "#0064b5";

describe("cores: conversões e contraste", () => {
  it("normaliza hex e rejeita lixo", () => {
    expect(normalizarHex("#ABC")).toBe("#aabbcc");
    expect(normalizarHex(" 0064B5 ")).toBe("#0064b5");
    for (const ruim of ["", "azul", "#12345", "#gggggg", "url(x)", null, undefined]) expect(normalizarHex(ruim)).toBeNull();
  });

  it("OKLCH do azul do site: L≈0,50, C≈0,15, H≈252", () => {
    const o = hexParaOklch(AZUL_DO_SITE);
    expect(o.l).toBeCloseTo(0.501, 2);
    expect(o.c).toBeCloseTo(0.15, 2);
    expect(o.h).toBeCloseTo(252, 0);
  });

  it("vai e volta sem perder a cor (±1 por canal)", () => {
    for (const hex of ["#0064b5", "#e5f0fc", "#f5c400", "#2e7d32", "#121921"]) {
      const volta = oklchParaHex(hexParaOklch(hex));
      for (const i of [1, 3, 5]) expect(Math.abs(parseInt(volta.slice(i, i + 2), 16) - parseInt(hex.slice(i, i + 2), 16))).toBeLessThanOrEqual(1);
    }
  });

  it("contraste WCAG: branco/preto = 21 e valores conhecidos", () => {
    expect(contraste("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(contraste("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(contraste(AZUL_DO_SITE, "#ffffff")).toBeCloseTo(6.02, 1);
  });

  it("cor fora do gamut perde croma, não luminosidade", () => {
    const hex = oklchParaHex({ l: 0.9, c: 0.4, h: 150 });
    expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(hexParaOklch(hex).l).toBeCloseTo(0.9, 1);
  });
});

describe("derivarTemaDaMarca: reproduz o site para o azul da Pontual", () => {
  const tema = derivarTemaDaMarca(AZUL_DO_SITE)!;

  it("mantém o azul exatamente como digitado e não acusa ajuste no claro", () => {
    expect(tema.claro["--primary"]).toBe(AZUL_DO_SITE);
    expect(tema.claro["--ring"]).toBe(AZUL_DO_SITE);
    expect(tema.claro["--primary-foreground"]).toBe(TEXTO_SOBRE_MARCA.claro);
    expect(tema.ajustadaNoClaro).toBe(false);
  });

  it("gera os mesmos accent, accent-foreground e chart-2 medidos no site", () => {
    expect(tema.claro["--accent"]).toBe("#e5f0fc");
    expect(tema.claro["--accent-foreground"]).toBe("#00437d");
    expect(tema.claro["--chart-1"]).toBe(AZUL_DO_SITE);
    expect(tema.claro["--chart-2"]).toBe("#5795c8");
  });

  it("no escuro o azul é clareado (o original não passa) e isso é sinalizado", () => {
    expect(contraste(AZUL_DO_SITE, SUPERFICIES.escuro.fundo)).toBeLessThan(4.5);
    expect(tema.ajustadaNoEscuro).toBe(true);
    expect(contraste(tema.escuro["--primary"], SUPERFICIES.escuro.fundo)).toBeGreaterThanOrEqual(4.5);
  });
});

/** Cores difíceis: claras, escuras, saturadas, neutras e extremos. */
const CORES_DIFICEIS = [
  AZUL_DO_SITE, "#f5c400", "#ffff00", "#7fdbff", "#00ffff", "#a8e6a3", "#ffffff", "#000000", "#001f5c", "#0a0a2a",
  "#808080", "#777777", "#ff0000", "#00ff00", "#0000ff", "#ff00ff", "#2e7d32", "#e40014", "#ff9800", "#6a1b9a",
];

describe.each(CORES_DIFICEIS)("contraste AA com a cor da marca %s", (marca) => {
  const tema = derivarTemaDaMarca(marca)!;

  it("modo claro: texto sobre a primária e primária sobre as superfícies ≥ 4,5", () => {
    const p = tema.claro["--primary"];
    expect(contraste(tema.claro["--primary-foreground"], p), "texto sobre a primária").toBeGreaterThanOrEqual(4.5);
    const { fundo, secundaria, suave } = SUPERFICIES.claro;
    for (const f of [fundo, secundaria, suave, misturar(p, fundo, 0.1)]) expect(contraste(p, f), `primária sobre ${f}`).toBeGreaterThanOrEqual(4.5);
    expect(contraste(tema.claro["--accent-foreground"], tema.claro["--accent"]), "accent").toBeGreaterThanOrEqual(4.5);
    expect(contraste(tema.claro["--chart-2"], fundo), "gráfico").toBeGreaterThanOrEqual(3);
  });

  it("modo escuro: texto sobre a primária e primária sobre as superfícies ≥ 4,5", () => {
    const p = tema.escuro["--primary"];
    expect(contraste(tema.escuro["--primary-foreground"], p), "texto sobre a primária").toBeGreaterThanOrEqual(4.5);
    const { fundo, cartao, suave } = SUPERFICIES.escuro;
    for (const f of [fundo, cartao, suave, misturar(p, fundo, 0.1), misturar(p, cartao, 0.1)]) expect(contraste(p, f), `primária sobre ${f}`).toBeGreaterThanOrEqual(4.5);
    expect(contraste(tema.escuro["--accent-foreground"], tema.escuro["--accent"]), "accent").toBeGreaterThanOrEqual(4.5);
    expect(contraste(tema.escuro["--chart-2"], fundo), "gráfico").toBeGreaterThanOrEqual(3);
  });

  it("só gera hex #rrggbb (nada que permita injetar CSS)", () => {
    for (const v of [...Object.values(tema.claro), ...Object.values(tema.escuro)]) expect(v).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("derivarTemaDaMarca: entradas inválidas e CSS gerado", () => {
  it("hex inválido ou vazio devolve null (vale o padrão do globals.css)", () => {
    for (const ruim of [null, undefined, "", "azul", "#12", "red; } body { display:none", "javascript:alert(1)"]) expect(derivarTemaDaMarca(ruim)).toBeNull();
  });

  it("aceita #rgb e maiúsculas", () => {
    expect(derivarTemaDaMarca("#06B")!.marca).toBe("#0066bb");
  });

  it("CSS: bloco claro com :root:root e escuro com :root:root.dark", () => {
    const css = cssDoTema(derivarTemaDaMarca(AZUL_DO_SITE)!);
    expect(css).toMatch(/^:root:root\{--primary:#0064b5;/);
    expect(css).toContain(":root:root.dark{--primary:#");
    expect(css).not.toMatch(/[<>"']/);
  });
});

/** Lê um bloco de variáveis (`:root` ou `.dark`) do globals.css. */
function lerTokens(seletor: string): Record<string, string> {
  const css = fs.readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
  const m = new RegExp(`(?:^|\\n)${seletor.replace(".", "\\.")} \\{([^}]*)\\}`).exec(css);
  if (!m) throw new Error(`Bloco ${seletor} não encontrado`);
  return Object.fromEntries([...m[1].matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map((x) => [x[1], x[2].trim()]));
}

describe("contrato com o globals.css", () => {
  const claro = lerTokens(":root");
  const escuro = lerTokens(".dark");

  it("as superfícies de SUPERFICIES são as do CSS", () => {
    expect(claro.background).toBe(SUPERFICIES.claro.fundo);
    expect(claro.foreground).toBe(SUPERFICIES.claro.texto);
    expect(escuro.foreground).toBe(SUPERFICIES.escuro.texto);
    expect(claro.secondary).toBe(SUPERFICIES.claro.secundaria);
    expect(claro.muted).toBe(SUPERFICIES.claro.suave);
    expect(escuro.background).toBe(SUPERFICIES.escuro.fundo);
    expect(escuro.card).toBe(SUPERFICIES.escuro.cartao);
    expect(escuro.muted).toBe(SUPERFICIES.escuro.suave);
  });

  it("o padrão do CSS é exatamente o que derivarTemaDaMarca gera para o azul do site", () => {
    const tema = derivarTemaDaMarca(AZUL_DO_SITE)!;
    for (const [nome, alvo] of [["claro", claro], ["escuro", escuro]] as const) {
      for (const [k, v] of Object.entries(tema[nome])) expect(alvo[k.slice(2)], `${nome} ${k}`).toBe(v);
    }
  });

  it("a paleta neutra passa em AA nos dois modos", () => {
    for (const [nome, t] of [["claro", claro], ["escuro", escuro]] as const) {
      const pares: Array<[string, string]> = [
        ["foreground", "background"], ["card-foreground", "card"], ["popover-foreground", "popover"], ["secondary-foreground", "secondary"],
        ["muted-foreground", "background"], ["muted-foreground", "muted"], ["muted-foreground", "card"], ["destructive", "background"],
        ["destructive", "card"], ["sidebar-foreground", "sidebar"], ["sidebar-accent-foreground", "sidebar-accent"],
      ];
      for (const [fg, bg] of pares) expect(contraste(t[fg], t[bg]), `${nome}: ${fg} sobre ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("todo token do tema claro existe também no escuro", () => {
    for (const k of Object.keys(claro)) if (k !== "radius") expect(escuro, k).toHaveProperty(k);
  });
});
