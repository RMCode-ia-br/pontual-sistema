import { contraste, hexParaOklch, misturar, normalizarHex, oklchParaHex, type Oklch } from "./cores";

/**
 * Deriva do hex da marca os tokens de tema (modo claro e escuro) com contraste WCAG AA garantido.
 *
 * As relações (accent, accent-foreground, chart-2) foram medidas no site da empresa, cujo azul é
 * #0064b5 (OKLCH L 0,50 / C 0,15 / H 252): accent = L 0,95 e C×0,13; accent-foreground = L−0,12 e C×0,77;
 * chart-2 = L+0,15 e C×0,67. Os neutros (fundo, cartão, bordas…) NÃO dependem da marca: ficam em `globals.css`
 * e as constantes abaixo precisam ficar iguais a eles (há um teste que confere).
 */

/** Superfícies onde a cor da marca aparece como texto ou ícone. Mantidas em sincronia com `globals.css`. */
export const SUPERFICIES = {
  claro: { fundo: "#ffffff", secundaria: "#f1f4f7", suave: "#e8ebef" },
  escuro: { fundo: "#0a0f14", cartao: "#12181e", suave: "#1f252b" },
} as const;

/** Texto sobre a cor da marca (claro: quase branco; escuro: quase preto azulado). */
export const TEXTO_SOBRE_MARCA = { claro: "#fcfcfc", escuro: "#060c13" } as const;

export const CONTRASTE_MINIMO = 4.5;
const CONTRASTE_ACENTO = 7;
const CONTRASTE_GRAFICO = 3;
const PASSO = 0.004;
/** No site, chart-2 tem matiz 7° mais perto do ciano que a cor primária (245 contra 252). */
const DESLOCAMENTO_MATIZ_GRAFICO = 7;

export type TokensDeTema = Record<string, string>;

export type TemaDaMarca = {
  /** Hex normalizado que veio de Configurações. */
  marca: string;
  claro: TokensDeTema;
  escuro: TokensDeTema;
  /** A cor foi escurecida no modo claro para manter o contraste (ex.: amarelo). */
  ajustadaNoClaro: boolean;
  /** A cor foi clareada no modo escuro para manter o contraste sobre fundo escuro. */
  ajustadaNoEscuro: boolean;
};

const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Anda na luminosidade (`direcao`) até que `cor` atinja `alvo` de contraste contra TODAS as `contra`.
 * Mantém matiz e croma (o croma encolhe sozinho se a cor sair do gamut).
 */
function ajustar(cor: Oklch, direcao: "escurecer" | "clarear", alvo: number, contra: (hex: string) => string[]): string {
  let atual = { ...cor };
  for (let i = 0; i < 400; i++) {
    const hex = oklchParaHex(atual);
    if (contra(hex).every((fundo) => contraste(hex, fundo) >= alvo)) return hex;
    const proximo = atual.l + (direcao === "escurecer" ? -PASSO : PASSO);
    if (proximo < 0 || proximo > 1) break;
    atual = { ...atual, l: proximo };
  }
  return oklchParaHex(atual);
}

const melhorTexto = (fundo: string, ...opcoes: string[]) => opcoes.reduce((a, b) => (contraste(b, fundo) > contraste(a, fundo) ? b : a));

function derivarClaro(marca: string, o: Oklch) {
  const { fundo, secundaria, suave } = SUPERFICIES.claro;
  const texto = TEXTO_SOBRE_MARCA.claro;
  const ok = (hex: string) => contraste(hex, texto) >= CONTRASTE_MINIMO && [fundo, secundaria, suave, misturar(hex, fundo, 0.1)].every((f) => contraste(hex, f) >= CONTRASTE_MINIMO);
  // Cor que já passa fica EXATAMENTE como o gestor digitou (sem erro de arredondamento do OKLCH).
  const primaria = ok(marca)
    ? marca
    : ajustar(o, "escurecer", CONTRASTE_MINIMO, (hex) => [texto, fundo, secundaria, suave, misturar(hex, fundo, 0.1)]);
  const p = hexParaOklch(primaria);

  const accent = oklchParaHex({ l: 0.95, c: limitar(p.c * 0.133, 0.01, 0.03), h: p.h });
  const accentFg = ajustar({ l: p.l - 0.12, c: p.c * 0.77, h: p.h }, "escurecer", CONTRASTE_ACENTO, () => [accent]);
  const grafico2 = ajustar({ l: Math.min(0.85, p.l + 0.148), c: p.c * 0.667, h: p.h - DESLOCAMENTO_MATIZ_GRAFICO }, "escurecer", CONTRASTE_GRAFICO, () => [fundo]);

  const tokens: TokensDeTema = {
    "--primary": primaria,
    "--primary-foreground": texto,
    "--ring": primaria,
    "--accent": accent,
    "--accent-foreground": accentFg,
    "--chart-1": primaria,
    "--chart-2": grafico2,
    "--sidebar-primary": primaria,
    "--sidebar-primary-foreground": texto,
    "--sidebar-ring": primaria,
  };
  return { tokens, ajustada: primaria !== marca };
}

function derivarEscuro(marca: string, o: Oklch) {
  const { fundo, cartao, suave } = SUPERFICIES.escuro;
  const ok = (hex: string) => [fundo, cartao, suave, misturar(hex, fundo, 0.1), misturar(hex, cartao, 0.1)].every((f) => contraste(hex, f) >= CONTRASTE_MINIMO);
  const primaria = ok(marca)
    ? marca
    : ajustar(o, "clarear", CONTRASTE_MINIMO, (hex) => [fundo, cartao, suave, misturar(hex, fundo, 0.1), misturar(hex, cartao, 0.1)]);
  const p = hexParaOklch(primaria);
  const textoSobre = melhorTexto(primaria, TEXTO_SOBRE_MARCA.escuro, TEXTO_SOBRE_MARCA.claro);

  const accent = oklchParaHex({ l: 0.27, c: limitar(p.c * 0.2, 0.02, 0.05), h: p.h });
  const accentFg = ajustar({ l: 0.88, c: limitar(p.c * 0.35, 0.02, 0.06), h: p.h }, "clarear", CONTRASTE_ACENTO, () => [accent]);
  const grafico2 = ajustar({ l: Math.max(0.3, p.l - 0.12), c: p.c * 0.667, h: p.h - DESLOCAMENTO_MATIZ_GRAFICO }, "clarear", CONTRASTE_GRAFICO, () => [fundo]);

  const tokens: TokensDeTema = {
    "--primary": primaria,
    "--primary-foreground": textoSobre,
    "--ring": primaria,
    "--accent": accent,
    "--accent-foreground": accentFg,
    "--chart-1": primaria,
    "--chart-2": grafico2,
    "--sidebar-primary": primaria,
    "--sidebar-primary-foreground": textoSobre,
    "--sidebar-ring": primaria,
  };
  return { tokens, ajustada: primaria !== marca };
}

/** `null` se o hex for inválido: quem chama deixa valer o padrão do `globals.css`. */
export function derivarTemaDaMarca(hex: string | null | undefined): TemaDaMarca | null {
  const marca = normalizarHex(hex);
  if (!marca) return null;
  const o = hexParaOklch(marca);
  const claro = derivarClaro(marca, o);
  const escuro = derivarEscuro(marca, o);
  return { marca, claro: claro.tokens, escuro: escuro.tokens, ajustadaNoClaro: claro.ajustada, ajustadaNoEscuro: escuro.ajustada };
}

const bloco = (seletor: string, tokens: TokensDeTema) => `${seletor}{${Object.entries(tokens).map(([k, v]) => `${k}:${v}`).join(";")}}`;

/**
 * CSS para injetar no `<head>`. `:root:root` (especificidade 0,2,0) vence o `:root` do `globals.css`;
 * `:root:root.dark` (0,3,0) vence o bloco claro daqui quando o tema escuro está ativo.
 * Só contém hex validado (`#rrggbb`), então não há como injetar CSS por esta via.
 */
export function cssDoTema(tema: TemaDaMarca): string {
  return `${bloco(":root:root", tema.claro)}${bloco(":root:root.dark", tema.escuro)}`;
}
