import type { ImagemDoDesenho } from "@/lib/dominio/desenho-item";

/** Imagem do desenho já baixada e conferida (bytes + formato que o react-pdf lê). */
export type ImagemCarregada = { data: Buffer; format: "png" | "jpg" };
/** Imagens carregadas, pelo SHA-256 da referência congelada no snapshot. */
export type ImagensDoDesenho = Record<string, ImagemCarregada>;

export type CaixaDoDesenho = { largura: number; altura: number };
/** Caixa (em pontos) que o desenho ocupa no PDF da proposta e na folha de produção. */
export type CaixasDoDesenho = { proposta: CaixaDoDesenho; producao: CaixaDoDesenho };

/**
 * Caixas de hoje (a do desenho automático: 120 × 90 de quadro, na largura de cada PDF). A imagem personalizada usa a
 * mesma caixa por padrão; o tamanho final para itens com imagem ainda está em decisão (Fase 3.6b-1, Bloco 3).
 */
export const CAIXAS_ATUAIS: CaixasDoDesenho = { proposta: { largura: 170, altura: 127.5 }, producao: { largura: 110, altura: 82.5 } };

/**
 * A imagem do desenho de um item não pôde ser carregada ou não confere com o hash congelado. O PDF NÃO sai com o
 * desenho automático no lugar (seria outro desenho): a geração falha com esta mensagem.
 */
export class ErroDesenhoIndisponivel extends Error {
  constructor(public readonly numeroDoItem: number) {
    super(`Não foi possível carregar o desenho do item ${numeroDoItem}; tente de novo.`);
    this.name = "ErroDesenhoIndisponivel";
  }
}

/** Pega a imagem já carregada da referência; sem ela, falha (nunca cai no desenho automático). */
export function imagemParaPdf(imagens: ImagensDoDesenho, referencia: ImagemDoDesenho, numeroDoItem: number): ImagemCarregada {
  const imagem = imagens[referencia.sha256];
  if (!imagem) throw new ErroDesenhoIndisponivel(numeroDoItem);
  return imagem;
}
