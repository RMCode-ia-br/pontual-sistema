/**
 * Matemática de cor genérica (sem conhecimento do negócio): hex ↔ OKLCH, luminância e contraste WCAG.
 * Funções puras; usadas para derivar o tema a partir da cor da marca com contraste garantido.
 */

export type Oklch = { l: number; c: number; h: number };
type Rgb = [number, number, number];

/** Aceita `#rgb` ou `#rrggbb` (com ou sem `#`) e devolve `#rrggbb` minúsculo; `null` se inválido. */
export function normalizarHex(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(valor.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].replace(/./g, (d) => d + d) : m[1];
  return `#${h.toLowerCase()}`;
}

function hexParaRgb(hex: string): Rgb {
  const h = normalizarHex(hex);
  if (!h) throw new Error("Cor inválida.");
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as Rgb;
}

function rgbParaHex([r, g, b]: Rgb): string {
  const byte = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0");
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}

const paraLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const deLinear = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.max(v, 0) ** (1 / 2.4) - 0.055);

export function hexParaOklch(hex: string): Oklch {
  const [r, g, b] = hexParaRgb(hex).map(paraLinear) as Rgb;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { l: L, c: Math.hypot(a, bb), h: (Math.atan2(bb, a) * 180) / Math.PI + (bb < 0 ? 360 : 0) };
}

function oklchParaLinear({ l, c, h }: Oklch): Rgb {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

const dentroDoGamut = (rgb: Rgb) => rgb.every((v) => v >= -0.0005 && v <= 1.0005);

/** OKLCH → hex. Se a cor sai do gamut sRGB, reduz o croma (bisseção) mantendo luminosidade e matiz. */
export function oklchParaHex(cor: Oklch): string {
  const l = Math.min(1, Math.max(0, cor.l));
  if (l >= 1) return "#ffffff";
  if (l <= 0) return "#000000";
  let alvo = oklchParaLinear({ ...cor, l });
  if (!dentroDoGamut(alvo)) {
    let baixo = 0;
    let alto = cor.c;
    for (let i = 0; i < 24; i++) {
      const meio = (baixo + alto) / 2;
      if (dentroDoGamut(oklchParaLinear({ l, c: meio, h: cor.h }))) baixo = meio;
      else alto = meio;
    }
    alvo = oklchParaLinear({ l, c: baixo, h: cor.h });
  }
  return rgbParaHex(alvo.map(deLinear) as Rgb);
}

/** Luminância relativa WCAG (0 a 1). */
export function luminancia(hex: string): number {
  const [r, g, b] = hexParaRgb(hex).map(paraLinear) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razão de contraste WCAG (1 a 21). */
export function contraste(a: string, b: string): number {
  const [maior, menor] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (maior + 0.05) / (menor + 0.05);
}

/** Mistura `cor` sobre `base` com opacidade `alfa` (0 a 1): o que o navegador mostra para `bg-cor/10`. */
export function misturar(cor: string, base: string, alfa: number): string {
  const c = hexParaRgb(cor);
  const b = hexParaRgb(base);
  return rgbParaHex(c.map((v, i) => v * alfa + b[i] * (1 - alfa)) as Rgb);
}
