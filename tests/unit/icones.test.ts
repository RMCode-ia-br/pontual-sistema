import fs from "node:fs";
import path from "node:path";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

/** Os ícones são arquivos gerados por `npm run icones`; este teste garante que o resultado é o prometido. */
const raiz = path.resolve(__dirname, "../..");
const ler = (p: string) => fs.readFileSync(path.join(raiz, p));

async function alfaEm(p: string, x: number, y: number): Promise<number> {
  const { data, info } = await sharp(ler(p)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return data[(y * info.width + x) * info.channels + 3];
}

describe("ícones e logo gerados", () => {
  const exatos: Array<[string, number]> = [
    ["src/app/icon.png", 32],
    ["src/app/apple-icon.png", 180],
    ["public/icons/icone-192.png", 192],
    ["public/icons/icone-512.png", 512],
    ["public/icons/icone-maskable-192.png", 192],
    ["public/icons/icone-maskable-512.png", 512],
    ["public/marca/logo-pontual.png", 512],
  ];

  it.each(exatos)("%s é PNG quadrado %ipx", async (arquivo, lado) => {
    const m = await sharp(ler(arquivo)).metadata();
    expect(m.format).toBe("png");
    expect([m.width, m.height]).toEqual([lado, lado]);
  });

  it.each(["src/app/icon.png", "public/icons/icone-192.png", "public/icons/icone-512.png", "public/marca/logo-pontual.png"])(
    "%s é transparente fora do círculo e opaco no centro",
    async (arquivo) => {
      expect(await alfaEm(arquivo, 0, 0)).toBe(0);
      const m = await sharp(ler(arquivo)).metadata();
      const meio = Math.floor((m.width ?? 0) / 2);
      expect(await alfaEm(arquivo, meio, meio)).toBe(255);
    },
  );

  it.each(["src/app/apple-icon.png", "public/icons/icone-maskable-192.png", "public/icons/icone-maskable-512.png"])(
    "%s é opaco (o iOS pinta o transparente de preto e o Android precisa de fundo no maskable)",
    async (arquivo) => {
      expect(await alfaEm(arquivo, 0, 0)).toBe(255);
    },
  );

  it("o favicon.ico é um ICO válido com as imagens de 32 e 48 px", () => {
    const ico = ler("src/app/favicon.ico");
    expect(ico.readUInt16LE(0)).toBe(0); // reservado
    expect(ico.readUInt16LE(2)).toBe(1); // tipo: ícone
    expect(ico.readUInt16LE(4)).toBe(2); // quantidade
    expect([ico.readUInt8(6), ico.readUInt8(22)]).toEqual([32, 48]);
  });

  it("a logo padrão da seed pesa pouco (carrega em toda tela)", () => {
    expect(ler("public/marca/logo-pontual.png").length).toBeLessThan(150 * 1024);
  });
});
