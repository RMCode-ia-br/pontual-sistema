import sharp from "sharp";

/** Decodifica e regrava uma imagem mínima gerada em memória (sem dado nenhum de cliente). */
async function sondaDoSharp(): Promise<void> {
  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#336699" } })
    .png()
    .toBuffer();
  const { data, info } = await sharp(png).rotate().toColourspace("srgb").jpeg({ quality: 80 }).toBuffer({ resolveWithObject: true });
  if (info.width !== 8 || info.height !== 8 || data.length === 0) throw new Error("sonda");
}

/**
 * Diz se o `sharp` carrega e processa imagem neste ambiente (função da Vercel). Devolve só "ok" ou "falhou":
 * nunca a versão, a mensagem do erro nem caminho. Nunca lança e tem limite de tempo, para não derrubar quem a chama.
 */
export async function verificarSharp(opcoes: { executar?: () => Promise<void>; limiteMs?: number } = {}): Promise<"ok" | "falhou"> {
  const { executar = sondaDoSharp, limiteMs = 3000 } = opcoes;
  let relogio: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      executar(),
      new Promise<never>((_, rejeitar) => {
        relogio = setTimeout(() => rejeitar(new Error("tempo")), limiteMs);
      }),
    ]);
    return "ok";
  } catch {
    return "falhou";
  } finally {
    if (relogio) clearTimeout(relogio);
  }
}
