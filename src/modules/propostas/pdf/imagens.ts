import type { ImagemDoDesenho, TamanhoDoDesenho } from "@/lib/dominio/desenho-item";

/** Imagem do desenho já baixada e conferida (bytes + formato que o react-pdf lê). */
export type ImagemCarregada = { data: Buffer; format: "png" | "jpg" };
/** Imagens carregadas, pelo SHA-256 da referência congelada no snapshot. */
export type ImagensDoDesenho = Record<string, ImagemCarregada>;

export type CaixaDoDesenho = { largura: number; altura: number };
/** Caixa (em pontos) que o desenho ocupa no PDF da proposta e na folha de produção. */
export type CaixasDoDesenho = { proposta: CaixaDoDesenho; producao: CaixaDoDesenho };
/** Uma caixa por tamanho que o usuário escolhe no item. */
export type CaixasPorTamanho = Record<TamanhoDoDesenho, CaixasDoDesenho>;

/**
 * Caixa do DESENHO AUTOMÁTICO (quadro de 120 × 90, na largura de cada PDF). É a de sempre e não muda: item sem imagem
 * personalizada sai exatamente como antes.
 */
export const CAIXAS_DO_DESENHO_AUTOMATICO: CaixasDoDesenho = { proposta: { largura: 170, altura: 127.5 }, producao: { largura: 110, altura: 82.5 } };

/**
 * Caixas da IMAGEM PERSONALIZADA, só para item que tem imagem (PONTO ÚNICO de ajuste: PDF, folha de produção, editor e
 * testes leem daqui). A imagem cabe inteira na caixa, centralizada, sem esticar nem cortar.
 * - NORMAL: proposta 200 × 150 pt; produção 190 × 142,5 pt (ao lado do texto, como o desenho automático).
 * - GRANDE: até 340 × 255 pt nos dois; na folha de produção a imagem vai ABAIXO do texto, na largura da coluna.
 * Valores provisórios: podem mudar depois do teste real com desenhos do Word.
 */
export const CAIXAS_DA_IMAGEM: CaixasPorTamanho = {
  NORMAL: { proposta: { largura: 200, altura: 150 }, producao: { largura: 190, altura: 142.5 } },
  GRANDE: { proposta: { largura: 340, altura: 255 }, producao: { largura: 340, altura: 255 } },
};

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
