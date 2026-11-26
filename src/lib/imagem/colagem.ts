/**
 * Regras do navegador para o desenho do item (puras, sem servidor): escolher a imagem de uma colagem (Ctrl+V) e
 * conferir tipo e tamanho ANTES de enviar. É só conforto: o servidor refaz tudo pelo conteúdo do arquivo.
 */
import { LIMITE_BYTES_IMAGEM, TIPOS_DE_IMAGEM_ACEITOS } from "./validar";

export const MENSAGEM_COLAGEM_SEM_IMAGEM =
  "Não encontrei uma imagem no que foi colado. No Word, clique no desenho, copie e cole aqui; se não der, salve como imagem e escolha o arquivo.";
export const MENSAGEM_FORMATO_NAO_ACEITO = "Só aceitamos imagens PNG ou JPG. No Word, copie o desenho e cole aqui, ou salve como imagem.";

export type EscolhaDaColagem = { tipo: "imagem"; indice: number } | { tipo: "formato-nao-aceito" } | { tipo: "sem-imagem" };

/** Entre os arquivos colados ou soltos, pega o primeiro PNG/JPG; se só houver imagem de outro formato, avisa. */
export function escolherImagem(arquivos: readonly { type: string }[]): EscolhaDaColagem {
  const indice = arquivos.findIndex((a) => a.type in TIPOS_DE_IMAGEM_ACEITOS);
  if (indice >= 0) return { tipo: "imagem", indice };
  if (arquivos.some((a) => a.type.startsWith("image/"))) return { tipo: "formato-nao-aceito" };
  return { tipo: "sem-imagem" };
}

/** Mensagem de erro (ou null se pode enviar) para o arquivo escolhido. */
export function conferirArquivoNoNavegador(arquivo: { type: string; size: number }): string | null {
  if (!(arquivo.type in TIPOS_DE_IMAGEM_ACEITOS)) return MENSAGEM_FORMATO_NAO_ACEITO;
  if (arquivo.size <= 0) return "O arquivo está vazio.";
  if (arquivo.size > LIMITE_BYTES_IMAGEM) return `A imagem passa de ${LIMITE_BYTES_IMAGEM / 1024 / 1024} MB. Reduza o desenho e tente de novo.`;
  return null;
}
