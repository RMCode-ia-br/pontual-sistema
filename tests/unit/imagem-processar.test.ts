import { createHash } from "node:crypto";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { processarImagemDeDesenho } from "@/lib/imagem/processar";

const base = (largura: number, altura: number, cor: string | { r: number; g: number; b: number } = "#336699") => ({ create: { width: largura, height: altura, channels: 3 as const, background: cor } });

async function pixel(bytes: Uint8Array, x = 1, y = 1): Promise<number[]> {
  const { data, info } = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return [data[i], data[i + 1], data[i + 2]];
}

describe("processarImagemDeDesenho", () => {
  it("PNG pequeno continua PNG, do mesmo tamanho, com hash do resultado", async () => {
    const r = await processarImagemDeDesenho(await sharp(base(120, 80)).png().toBuffer());
    expect(r).toMatchObject({ formato: "png", mime: "image/png", larguraPx: 120, alturaPx: 80 });
    expect(r.sha256).toBe(createHash("sha256").update(r.bytes).digest("hex"));
  });

  it("JPG continua JPG", async () => {
    const r = await processarImagemDeDesenho(await sharp(base(120, 80)).jpeg().toBuffer());
    expect(r).toMatchObject({ formato: "jpg", mime: "image/jpeg", larguraPx: 120, alturaPx: 80 });
  });

  it("imagem grande é reduzida para 1600 px no lado maior, mantendo a proporção", async () => {
    const horizontal = await processarImagemDeDesenho(await sharp(base(3200, 1600)).png().toBuffer());
    expect([horizontal.larguraPx, horizontal.alturaPx]).toEqual([1600, 800]);
    const vertical = await processarImagemDeDesenho(await sharp(base(1000, 4000)).jpeg().toBuffer());
    expect([vertical.larguraPx, vertical.alturaPx]).toEqual([400, 1600]);
  });

  it("nunca amplia imagem pequena", async () => {
    const r = await processarImagemDeDesenho(await sharp(base(50, 30)).png().toBuffer());
    expect([r.larguraPx, r.alturaPx]).toEqual([50, 30]);
  });

  it("remove metadados: EXIF (inclusive GPS e descrição) e perfil de cor somem", async () => {
    const comExif = await sharp(base(60, 40))
      .jpeg()
      .withExif({ IFD0: { ImageDescription: "Obra do cliente X", Copyright: "segredo" } })
      .toBuffer();
    expect((await sharp(comExif).metadata()).exif).toBeDefined();
    const r = await processarImagemDeDesenho(comExif);
    const meta = await sharp(r.bytes).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(Buffer.from(r.bytes).includes(Buffer.from("Obra do cliente X"))).toBe(false);
  });

  it("aplica a orientação do EXIF antes de descartá-la (JPG deitado vira em pé)", async () => {
    const deitado = await sharp(base(200, 100)).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const r = await processarImagemDeDesenho(deitado);
    expect([r.larguraPx, r.alturaPx]).toEqual([100, 200]);
    expect((await sharp(r.bytes).metadata()).orientation).toBeUndefined();
  });

  it("converte para sRGB antes de descartar o perfil: perfil não-sRGB (Display P3) não muda o tom", async () => {
    const original = [200, 50, 50];
    // A imagem é gravada EM Display P3 (os números do arquivo mudam, o perfil vai junto).
    const emP3 = await sharp(base(8, 8, { r: original[0], g: original[1], b: original[2] }))
      .withIccProfile("p3")
      .png()
      .toBuffer();
    expect((await sharp(emP3).metadata()).icc).toBeDefined();
    // `keepIccProfile` impede a conversão automática: são os números que realmente estão no arquivo.
    const brutoP3 = await sharp(emP3).keepIccProfile().removeAlpha().raw().toBuffer();
    expect(Math.abs(brutoP3[0] - original[0]) + Math.abs(brutoP3[1] - original[1]) + Math.abs(brutoP3[2] - original[2])).toBeGreaterThan(8); // o teste só vale se o P3 mexeu nos números

    const r = await processarImagemDeDesenho(emP3);
    expect((await sharp(r.bytes).metadata()).icc).toBeUndefined();
    const [vermelho, verde, azul] = await pixel(r.bytes);
    expect(Math.abs(vermelho - original[0])).toBeLessThanOrEqual(3);
    expect(Math.abs(verde - original[1])).toBeLessThanOrEqual(3);
    expect(Math.abs(azul - original[2])).toBeLessThanOrEqual(3);
  });

  it("transparência vira fundo branco", async () => {
    const transparente = await sharp({ create: { width: 10, height: 10, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const r = await processarImagemDeDesenho(transparente);
    expect(await pixel(r.bytes)).toEqual([255, 255, 255]);
  });

  it("mesma imagem de entrada dá o mesmo hash (resultado estável)", async () => {
    const entrada = await sharp(base(300, 200)).png().toBuffer();
    expect((await processarImagemDeDesenho(entrada)).sha256).toBe((await processarImagemDeDesenho(entrada)).sha256);
  });

  describe("recusas", () => {
    it("PNG truncado no meio dos dados (cabeçalho bom, corpo cortado)", async () => {
      const inteiro = await sharp(base(400, 300)).png().toBuffer();
      await expect(processarImagemDeDesenho(inteiro.subarray(0, Math.floor(inteiro.length / 2)))).rejects.toThrow(/incompleto|danificado/);
    });
    it("JPG truncado no meio dos dados", async () => {
      const inteiro = await sharp(base(400, 300)).jpeg().toBuffer();
      await expect(processarImagemDeDesenho(inteiro.subarray(0, Math.floor(inteiro.length / 2)))).rejects.toThrow(/incompleto|danificado/);
    });
    it("SVG, GIF, WebP e vazio", async () => {
      await expect(processarImagemDeDesenho(Buffer.from("<svg/>"))).rejects.toThrow(/PNG ou JPG/);
      await expect(processarImagemDeDesenho(await sharp(base(10, 10)).gif().toBuffer())).rejects.toThrow(/PNG ou JPG/);
      await expect(processarImagemDeDesenho(await sharp(base(10, 10)).webp().toBuffer())).rejects.toThrow(/PNG ou JPG/);
      await expect(processarImagemDeDesenho(new Uint8Array(0))).rejects.toThrow(/vazio/);
    });
    it("cabeçalho que mente sobre o tamanho (bomba de descompressão) não é decodificado", async () => {
      const real = await sharp(base(20, 20)).png().toBuffer();
      const mentira = Buffer.from(real);
      mentira.writeUInt32BE(30_000, 16); // diz 30.000 px de largura
      await expect(processarImagemDeDesenho(mentira)).rejects.toThrow(/grande demais/);
    });
  });
});
