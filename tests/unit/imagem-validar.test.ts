import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";

import { dimensoesReduzidas, formatoPelosBytes, LIMITE_BYTES_IMAGEM, lerDimensoes, pngEhAnimado, validarImagem } from "@/lib/imagem/validar";

const ASSINATURA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const texto = (s: string) => Array.from(Buffer.from(s, "latin1"));

/** Cabeçalho de PNG só com a assinatura e o IHDR (suficiente para a validação, que não decodifica). */
function cabecalhoPng(l: number, a: number, extra: number[] = []): Uint8Array {
  return Uint8Array.from([...ASSINATURA_PNG, ...u32(13), ...texto("IHDR"), ...u32(l), ...u32(a), 8, 6, 0, 0, 0, 0, 0, 0, 0, ...extra]);
}

/** Cabeçalho de JPG só com o quadro (SOF0) com as dimensões. */
function cabecalhoJpg(l: number, a: number): Uint8Array {
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 8, (a >> 8) & 255, a & 255, (l >> 8) & 255, l & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
}

let pngReal: Buffer;
let jpgReal: Buffer;

beforeAll(async () => {
  const base = { create: { width: 40, height: 20, channels: 3 as const, background: "#336699" } };
  pngReal = await sharp(base).png().toBuffer();
  jpgReal = await sharp(base).jpeg().toBuffer();
});

describe("tipo pelos bytes", () => {
  it("reconhece PNG e JPG reais", () => {
    expect(formatoPelosBytes(pngReal)).toBe("png");
    expect(formatoPelosBytes(jpgReal)).toBe("jpg");
  });
  it("JPG renomeado .png continua sendo JPG (vale o conteúdo, não o nome)", () => {
    expect(formatoPelosBytes(jpgReal)).toBe("jpg");
    const r = validarImagem(jpgReal);
    expect(r).toMatchObject({ ok: true, formato: "jpg", larguraPx: 40, alturaPx: 20 });
  });
});

describe("validarImagem (tabela)", () => {
  const casos: [string, () => Uint8Array, RegExp | null][] = [
    ["PNG real", () => pngReal, null],
    ["JPG real", () => jpgReal, null],
    ["arquivo vazio", () => new Uint8Array(0), /vazio/i],
    ["SVG", () => Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>'), /PNG ou JPG/],
    ["GIF", () => Buffer.from("GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;", "latin1"), /PNG ou JPG/],
    ["WebP", () => Buffer.from("RIFF\x1a\x00\x00\x00WEBPVP8 \x0e\x00\x00\x00", "latin1"), /PNG ou JPG/],
    ["PDF", () => Buffer.from("%PDF-1.7\n1 0 obj\n"), /PNG ou JPG/],
    ["executável com extensão de imagem", () => Buffer.from("MZ\x90\x00\x03\x00\x00\x00", "latin1"), /PNG ou JPG/],
    ["PNG truncado no cabeçalho", () => pngReal.subarray(0, 20), /incompleto/],
    ["PNG só com a assinatura", () => Uint8Array.from(ASSINATURA_PNG), /incompleto/],
    ["JPG truncado antes do quadro", () => jpgReal.subarray(0, 6), /incompleto/],
    ["PNG com dimensão zero", () => cabecalhoPng(0, 10), /incompleto/],
    ["dimensão enorme (20.000 px)", () => cabecalhoPng(20_000, 100), /grande demais/],
    ["muitos pixels (9.000 × 9.000)", () => cabecalhoPng(9_000, 9_000), /grande demais/],
    ["JPG de 12.000 px", () => cabecalhoJpg(12_000, 500), /grande demais/],
    ["PNG animado (acTL antes do IDAT)", () => Uint8Array.from([...cabecalhoPng(10, 10), ...u32(8), ...texto("acTL"), 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0]), /animada/],
  ];
  for (const [nome, entrada, erro] of casos) {
    it(nome, () => {
      const r = validarImagem(entrada());
      if (erro === null) expect(r.ok).toBe(true);
      else {
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.motivo).toMatch(erro);
      }
    });
  }

  it("arquivo acima de 8 MB é recusado antes de qualquer leitura", () => {
    const grande = new Uint8Array(LIMITE_BYTES_IMAGEM + 1);
    grande.set(ASSINATURA_PNG);
    const r = validarImagem(grande);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/8 MB/);
  });

  it("exatamente 8 MB com cabeçalho válido passa pela regra de tamanho", () => {
    const limite = new Uint8Array(LIMITE_BYTES_IMAGEM);
    limite.set(cabecalhoPng(100, 100));
    expect(validarImagem(limite).ok).toBe(true);
  });
});

describe("cabeçalhos", () => {
  it("lê as dimensões do PNG e do JPG sem decodificar", () => {
    expect(lerDimensoes(pngReal, "png")).toEqual({ larguraPx: 40, alturaPx: 20 });
    expect(lerDimensoes(jpgReal, "jpg")).toEqual({ larguraPx: 40, alturaPx: 20 });
    expect(lerDimensoes(cabecalhoJpg(3000, 2000), "jpg")).toEqual({ larguraPx: 3000, alturaPx: 2000 });
  });
  it("PNG comum não é animado", () => expect(pngEhAnimado(pngReal)).toBe(false));
});

describe("dimensoesReduzidas", () => {
  it.each([
    [800, 600, 800, 600],
    [1600, 1600, 1600, 1600],
    [3200, 1600, 1600, 800],
    [1000, 4000, 400, 1600],
    [10_000, 1, 1600, 1],
  ])("%i × %i → %i × %i", (l, a, el, ea) => expect(dimensoesReduzidas(l, a)).toEqual({ larguraPx: el, alturaPx: ea }));
  it("nunca amplia", () => expect(dimensoesReduzidas(100, 50)).toEqual({ larguraPx: 100, alturaPx: 50 }));
});
