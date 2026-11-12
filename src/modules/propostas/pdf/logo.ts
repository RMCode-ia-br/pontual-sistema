/** Formato de imagem que o react-pdf aceita (PNG e JPEG; WebP não). */
export type FormatoDeLogo = "png" | "jpg";

/**
 * Descobre o formato pelos primeiros bytes, não pela extensão do caminho: o arquivo `logo-pontual.png` que a
 * empresa recebeu era, na verdade, um JPEG, e a extensão enganosa fazia o PDF falhar ou ficar sem logo.
 */
export function formatoDaImagem(bytes: Uint8Array): FormatoDeLogo | null {
  const e = (...valores: number[]) => valores.every((v, i) => bytes[i] === v);
  if (e(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "png";
  if (e(0xff, 0xd8, 0xff)) return "jpg";
  return null;
}
