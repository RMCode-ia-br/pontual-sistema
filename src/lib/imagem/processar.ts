import { createHash } from "node:crypto";

import sharp from "sharp";

import { ErroNegocio } from "@/lib/acoes";

import { dimensoesReduzidas, type FormatoImagem, LADO_MAXIMO_REDUZIDO_PX, LIMITE_PIXELS, MIME_DO_FORMATO, validarImagem } from "./validar";

export type ImagemProcessada = {
  bytes: Buffer;
  formato: FormatoImagem;
  mime: string;
  larguraPx: number;
  alturaPx: number;
  sha256: string;
};

/**
 * Valida e normaliza a imagem enviada (SOMENTE servidor):
 * 1. valida tipo pelos bytes, tamanho, animação e dimensões;
 * 2. decodifica de verdade (arquivo truncado ou corrompido é recusado);
 * 3. aplica a orientação do EXIF e converte para sRGB ANTES de descartar os metadados (perfil de cor do Word não muda o tom);
 * 4. reduz para no máximo `LADO_MAXIMO_REDUZIDO_PX` (nunca amplia), põe fundo branco na transparência;
 * 5. regrava no mesmo formato sem nenhum metadado (EXIF, GPS, perfil) e calcula o SHA-256 do resultado.
 */
export async function processarImagemDeDesenho(original: Uint8Array): Promise<ImagemProcessada> {
  const validada = validarImagem(original);
  if (!validada.ok) throw new ErroNegocio(validada.motivo);

  try {
    const entrada = sharp(original, { limitInputPixels: LIMITE_PIXELS, failOn: "error", animated: false });
    const meta = await entrada.metadata();
    const formatoLido = meta.format === "png" ? "png" : meta.format === "jpeg" ? "jpg" : null;
    if (formatoLido !== validada.formato) throw new ErroNegocio("O conteúdo da imagem não corresponde ao tipo do arquivo.");
    if ((meta.pages ?? 1) > 1) throw new ErroNegocio("Imagem animada não é aceita. Use um PNG ou JPG comum.");

    let pipeline = entrada
      .rotate() // aplica a orientação do EXIF
      .toColourspace("srgb") // converte pelo perfil embutido, se houver
      .resize({ width: LADO_MAXIMO_REDUZIDO_PX, height: LADO_MAXIMO_REDUZIDO_PX, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" });
    pipeline = validada.formato === "png" ? pipeline.png({ compressionLevel: 9 }) : pipeline.jpeg({ quality: 85 });

    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    // Mesma regra pura do teste: o tamanho final tem que bater com a redução esperada (considera a rotação do EXIF).
    const girou = (meta.orientation ?? 1) >= 5;
    const esperado = dimensoesReduzidas(girou ? validada.alturaPx : validada.larguraPx, girou ? validada.larguraPx : validada.alturaPx);
    if (Math.abs(info.width - esperado.larguraPx) > 1 || Math.abs(info.height - esperado.alturaPx) > 1) {
      throw new Error("Tamanho da imagem processada diferente do esperado.");
    }
    return {
      bytes: data,
      formato: validada.formato,
      mime: MIME_DO_FORMATO[validada.formato],
      larguraPx: info.width,
      alturaPx: info.height,
      sha256: createHash("sha256").update(data).digest("hex"),
    };
  } catch (erro) {
    if (erro instanceof ErroNegocio) throw erro;
    throw new ErroNegocio("Não consegui ler a imagem: o arquivo parece incompleto ou danificado. Tente copiar o desenho de novo.");
  }
}
