/** Maior palavra que o PDF mantém inteira; acima disso ela passa a poder quebrar na borda da linha. */
export const MAXIMO_DE_PALAVRA_INTEIRA = 40;

/**
 * Pontos onde o react-pdf pode quebrar uma palavra (o callback de hifenização). Palavra comum fica inteira
 * ("TEMPERADO" nunca vira "TEM-PERADO"). Só uma palavra MUITO longa, sem espaço (chave Pix, endereço de e-mail ou link
 * colado), é repartida em pedaços: sem isso o react-pdf não a quebra e o que passa da borda da página se perde.
 */
export function quebrasDaPalavra(palavra: string, maximo: number = MAXIMO_DE_PALAVRA_INTEIRA): string[] {
  if (palavra.length <= maximo) return [palavra];
  const pedacos: string[] = [];
  for (let i = 0; i < palavra.length; i += maximo) pedacos.push(palavra.slice(i, i + maximo));
  return pedacos;
}
