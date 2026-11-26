/**
 * Validação de imagem enviada pelo usuário (pura, sem dependências do servidor).
 * O tipo SEMPRE vem dos bytes do arquivo: extensão e tipo informado pelo navegador mentem.
 * Só PNG e JPG são aceitos (SVG, GIF, WebP, PDF, HEIC e o resto são recusados).
 */
export const LIMITE_BYTES_IMAGEM = 8 * 1024 * 1024; // 8 MB
export const LIMITE_LADO_PX = 10_000;
export const LIMITE_PIXELS = 40_000_000; // 40 megapixels (bomba de descompressão)
export const LADO_MAXIMO_REDUZIDO_PX = 1600;

export type FormatoImagem = "png" | "jpg";

export const TIPOS_DE_IMAGEM_ACEITOS: Record<string, FormatoImagem> = { "image/png": "png", "image/jpeg": "jpg" };
export const MIME_DO_FORMATO: Record<FormatoImagem, string> = { png: "image/png", jpg: "image/jpeg" };

const ASSINATURA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** PNG ou JPG pelos primeiros bytes; qualquer outra coisa (inclusive vazio) é null. */
export function formatoPelosBytes(b: Uint8Array): FormatoImagem | null {
  if (b.length >= 8 && ASSINATURA_PNG.every((v, i) => b[i] === v)) return "png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  return null;
}

function u32(b: Uint8Array, i: number): number {
  return ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
}

/** Percorre os blocos do PNG até o primeiro de dados; se achar `acTL` o arquivo é um PNG animado (APNG). */
export function pngEhAnimado(b: Uint8Array): boolean {
  let i = 8;
  while (i + 8 <= b.length) {
    const tamanho = u32(b, i);
    const tipo = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
    if (tipo === "acTL") return true;
    if (tipo === "IDAT" || tipo === "IEND") return false;
    i += 12 + tamanho;
  }
  return false;
}

/** Largura e altura lidas do cabeçalho (sem decodificar a imagem); null se o cabeçalho está truncado ou torto. */
export function lerDimensoes(b: Uint8Array, formato: FormatoImagem): { larguraPx: number; alturaPx: number } | null {
  if (formato === "png") {
    // 8 bytes de assinatura + bloco IHDR (4 de tamanho, 4 de tipo, 4 de largura, 4 de altura).
    if (b.length < 24 || String.fromCharCode(b[12], b[13], b[14], b[15]) !== "IHDR") return null;
    return { larguraPx: u32(b, 16), alturaPx: u32(b, 20) };
  }
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null;
    const marcador = b[i + 1];
    if (marcador === 0xff) {
      i += 1; // bytes de enchimento
      continue;
    }
    if (marcador === 0xd8 || marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd7)) {
      i += 2; // marcadores sem corpo
      continue;
    }
    const tamanho = (b[i + 2] << 8) | b[i + 3];
    const ehQuadro = marcador >= 0xc0 && marcador <= 0xcf && marcador !== 0xc4 && marcador !== 0xc8 && marcador !== 0xcc;
    if (ehQuadro) {
      if (i + 9 > b.length) return null;
      return { alturaPx: (b[i + 5] << 8) | b[i + 6], larguraPx: (b[i + 7] << 8) | b[i + 8] };
    }
    if (marcador === 0xda) return null; // começou a imagem sem achar o quadro
    i += 2 + tamanho;
  }
  return null;
}

export type ResultadoValidacaoImagem =
  | { ok: true; formato: FormatoImagem; larguraPx: number; alturaPx: number }
  | { ok: false; motivo: string };

/** Confere tamanho do arquivo, tipo (pelos bytes), animação e dimensões. Não decodifica a imagem. */
export function validarImagem(bytes: Uint8Array): ResultadoValidacaoImagem {
  if (bytes.length === 0) return { ok: false, motivo: "O arquivo está vazio." };
  if (bytes.length > LIMITE_BYTES_IMAGEM) return { ok: false, motivo: `A imagem passa de ${LIMITE_BYTES_IMAGEM / 1024 / 1024} MB. Reduza o desenho e tente de novo.` };
  const formato = formatoPelosBytes(bytes);
  if (!formato) return { ok: false, motivo: "Só aceitamos imagens PNG ou JPG. No Word, copie o desenho e cole aqui, ou salve como imagem." };
  if (formato === "png" && pngEhAnimado(bytes)) return { ok: false, motivo: "Imagem animada não é aceita. Use um PNG ou JPG comum." };
  const dim = lerDimensoes(bytes, formato);
  if (!dim || dim.larguraPx <= 0 || dim.alturaPx <= 0) return { ok: false, motivo: "Não consegui ler a imagem: o arquivo parece incompleto ou danificado." };
  if (dim.larguraPx > LIMITE_LADO_PX || dim.alturaPx > LIMITE_LADO_PX || dim.larguraPx * dim.alturaPx > LIMITE_PIXELS) {
    return { ok: false, motivo: "A imagem é grande demais em pixels. Reduza o desenho e tente de novo." };
  }
  return { ok: true, formato, larguraPx: dim.larguraPx, alturaPx: dim.alturaPx };
}

/** Tamanho depois da redução: lado maior no máximo `max`, mesma proporção, nunca amplia. */
export function dimensoesReduzidas(larguraPx: number, alturaPx: number, max = LADO_MAXIMO_REDUZIDO_PX): { larguraPx: number; alturaPx: number } {
  const maior = Math.max(larguraPx, alturaPx);
  if (maior <= max) return { larguraPx, alturaPx };
  const fator = max / maior;
  return { larguraPx: Math.max(1, Math.round(larguraPx * fator)), alturaPx: Math.max(1, Math.round(alturaPx * fator)) };
}
