/**
 * Desenho esquemático da esquadria (proposta e PDF). Código PURO: devolve formas geométricas num quadro fixo
 * (viewBox 0 0 LARGURA_QUADRO × ALTURA_QUADRO) e quem desenha (SVG no navegador, SVG do @react-pdf) só as
 * percorre. A proporção respeita largura × altura reais do vão (limitada para não ficar fino demais).
 */

export const LARGURA_QUADRO = 120;
export const ALTURA_QUADRO = 90;

export type Forma =
  | { t: "rect"; x: number; y: number; w: number; h: number; vidro?: boolean }
  | { t: "linha"; x1: number; y1: number; x2: number; y2: number; tracejada?: boolean };

export type TipoDesenho =
  | "JANELA_CORRER"
  | "PORTA_CORRER"
  | "BASCULA"
  | "PAINEL_FIXO"
  | "PORTA_GIRO"
  | "BOX_FRONTAL"
  | "GUARDA_CORPO"
  | "FECHAMENTO_SACADA"
  | "PORTAO"
  | "PERGOLADO"
  | "ESPELHO"
  | "GENERICO";

export type EntradaDesenho = { tipo: TipoDesenho; folhas?: number | null; larguraMm: number; alturaMm: number };

const MARGEM = 6;

/** Caixa do desenho dentro do quadro, na proporção do vão (entre 1:3 e 3:1). */
function caixa(larguraMm: number, alturaMm: number) {
  const razao = Math.min(3, Math.max(1 / 3, larguraMm / Math.max(1, alturaMm)));
  const dispW = LARGURA_QUADRO - MARGEM * 2;
  const dispH = ALTURA_QUADRO - MARGEM * 2;
  let w = dispW;
  let h = w / razao;
  if (h > dispH) {
    h = dispH;
    w = h * razao;
  }
  return { x: (LARGURA_QUADRO - w) / 2, y: (ALTURA_QUADRO - h) / 2, w, h };
}

const r = (n: number) => Math.round(n * 100) / 100;

export function gerarDesenho(entrada: EntradaDesenho): Forma[] {
  const { x, y, w, h } = caixa(entrada.larguraMm, entrada.alturaMm);
  const folhas = Math.min(8, Math.max(1, Math.round(entrada.folhas ?? 2)));
  const moldura: Forma = { t: "rect", x: r(x), y: r(y), w: r(w), h: r(h) };
  const e = Math.min(w, h) * 0.06; // espessura do perfil
  const interno = { x: x + e, y: y + e, w: w - 2 * e, h: h - 2 * e };
  const formas: Forma[] = [moldura];

  const vidro = (rx: number, ry: number, rw: number, rh: number): Forma => ({ t: "rect", x: r(rx), y: r(ry), w: r(rw), h: r(rh), vidro: true });
  const seta = (cx: number, cy: number, dir: 1 | -1): Forma[] => [
    { t: "linha", x1: r(cx - 5 * dir), y1: r(cy), x2: r(cx + 5 * dir), y2: r(cy) },
    { t: "linha", x1: r(cx + 5 * dir), y1: r(cy), x2: r(cx + 2 * dir), y2: r(cy - 2.5) },
    { t: "linha", x1: r(cx + 5 * dir), y1: r(cy), x2: r(cx + 2 * dir), y2: r(cy + 2.5) },
  ];
  const brilho = (a: { x: number; y: number; w: number; h: number }): Forma[] => [
    { t: "linha", x1: r(a.x + a.w * 0.15), y1: r(a.y + a.h * 0.85), x2: r(a.x + a.w * 0.4), y2: r(a.y + a.h * 0.55), tracejada: true },
    { t: "linha", x1: r(a.x + a.w * 0.3), y1: r(a.y + a.h * 0.9), x2: r(a.x + a.w * 0.55), y2: r(a.y + a.h * 0.6), tracejada: true },
  ];

  switch (entrada.tipo) {
    case "JANELA_CORRER":
    case "PORTA_CORRER":
    case "BOX_FRONTAL":
    case "FECHAMENTO_SACADA": {
      const n = Math.max(2, folhas);
      const sobreposicao = interno.w * 0.04;
      const largura = (interno.w + sobreposicao * (n - 1)) / n;
      for (let i = 0; i < n; i++) {
        const fx = interno.x + i * (largura - sobreposicao);
        formas.push(vidro(fx, interno.y, largura, interno.h));
        // Setas nas folhas móveis (alternadas), nada nas fixas das pontas pares.
        if (i % 2 === 0) formas.push(...seta(fx + largura / 2, interno.y + interno.h / 2, i < n / 2 ? 1 : -1));
      }
      break;
    }
    case "BASCULA": {
      formas.push(vidro(interno.x, interno.y, interno.w, interno.h));
      formas.push({ t: "linha", x1: r(interno.x), y1: r(interno.y + interno.h), x2: r(interno.x + interno.w / 2), y2: r(interno.y), tracejada: true });
      formas.push({ t: "linha", x1: r(interno.x + interno.w), y1: r(interno.y + interno.h), x2: r(interno.x + interno.w / 2), y2: r(interno.y), tracejada: true });
      break;
    }
    case "PORTA_GIRO": {
      const n = Math.min(2, folhas);
      const largura = interno.w / n;
      for (let i = 0; i < n; i++) {
        const fx = interno.x + i * largura;
        formas.push(vidro(fx, interno.y, largura, interno.h));
        const dobradicaEsquerda = n === 1 || i === 0;
        const px = dobradicaEsquerda ? fx : fx + largura;
        const qx = dobradicaEsquerda ? fx + largura : fx;
        formas.push({ t: "linha", x1: r(px), y1: r(interno.y), x2: r(qx), y2: r(interno.y + interno.h / 2), tracejada: true });
        formas.push({ t: "linha", x1: r(px), y1: r(interno.y + interno.h), x2: r(qx), y2: r(interno.y + interno.h / 2), tracejada: true });
      }
      break;
    }
    case "GUARDA_CORPO": {
      const poste = Math.max(1.6, w * 0.025);
      formas.length = 0;
      const vidros = Math.max(1, Math.min(6, Math.round(entrada.larguraMm / 1200)));
      const vao = (w - poste) / vidros;
      for (let i = 0; i < vidros; i++) {
        formas.push(vidro(x + poste + i * vao + 0.8, y + h * 0.08, vao - poste - 1.6 + poste, h * 0.84));
      }
      for (let i = 0; i <= vidros; i++) formas.push({ t: "rect", x: r(x + i * vao), y: r(y), w: r(poste), h: r(h) });
      break;
    }
    case "PORTAO": {
      const barras = Math.max(4, Math.min(14, Math.round(w / 9)));
      for (let i = 1; i < barras; i++) formas.push({ t: "linha", x1: r(x + (w * i) / barras), y1: r(y), x2: r(x + (w * i) / barras), y2: r(y + h) });
      formas.push({ t: "linha", x1: r(x), y1: r(y + h * 0.5), x2: r(x + w), y2: r(y + h * 0.5) });
      break;
    }
    case "PERGOLADO": {
      const ripas = Math.max(5, Math.min(16, Math.round(h / 5)));
      for (let i = 1; i < ripas; i++) formas.push({ t: "linha", x1: r(x), y1: r(y + (h * i) / ripas), x2: r(x + w), y2: r(y + (h * i) / ripas) });
      break;
    }
    case "ESPELHO": {
      formas.push(vidro(interno.x, interno.y, interno.w, interno.h));
      formas.push(...brilho(interno));
      break;
    }
    case "PAINEL_FIXO": {
      formas.push(vidro(interno.x, interno.y, interno.w, interno.h));
      formas.push(...brilho(interno));
      break;
    }
    default: {
      formas.push(vidro(interno.x, interno.y, interno.w, interno.h));
      formas.push({ t: "linha", x1: r(interno.x), y1: r(interno.y), x2: r(interno.x + interno.w), y2: r(interno.y + interno.h), tracejada: true });
      formas.push({ t: "linha", x1: r(interno.x + interno.w), y1: r(interno.y), x2: r(interno.x), y2: r(interno.y + interno.h), tracejada: true });
    }
  }
  return formas;
}
