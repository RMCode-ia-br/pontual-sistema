/**
 * Qual desenho um item da proposta mostra (regra pura, usada pela tela, pelo PDF e pela folha de produção).
 * Prioridade: imagem do item > desenho da tipologia (futuro, Fase 3.6b-3) > desenho automático por tipo.
 */

/** Referência imutável à imagem (vai para o snapshot ao enviar: o arquivo nunca é apagado e o hash confere na leitura). */
export type ImagemDoDesenho = {
  anexoId: string;
  caminho: string;
  sha256: string;
  mime: string;
  larguraPx: number;
  alturaPx: number;
};

export type DesenhoDoItem =
  | { tipo: "imagem"; imagem: ImagemDoDesenho }
  | { tipo: "automatico"; tipoDesenho: string; folhas: number | null };

export const CATEGORIA_DESENHO_DO_ITEM = "desenho-item";
export const ENTIDADE_DO_DESENHO_DO_ITEM = "ItemProposta";

export function resolverDesenhoDoItem(item: { tipoDesenho: string; folhas: number | null; desenhoImagem?: ImagemDoDesenho | null }): DesenhoDoItem {
  if (item.desenhoImagem) return { tipo: "imagem", imagem: item.desenhoImagem };
  // Ponto de extensão da 3.6b-3: aqui entraria o desenho salvo na tipologia, antes do automático.
  return { tipo: "automatico", tipoDesenho: item.tipoDesenho, folhas: item.folhas };
}

/** Marca do desenho para comparar revisões: "automatico" ou "personalizado:<sha256>". */
export function marcaDoDesenho(item: { desenhoImagem?: Pick<ImagemDoDesenho, "sha256"> | null }): string {
  return item.desenhoImagem ? `personalizado:${item.desenhoImagem.sha256}` : "automatico";
}
