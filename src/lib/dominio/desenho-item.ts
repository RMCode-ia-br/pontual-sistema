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
  | { tipo: "imagem"; imagem: ImagemDoDesenho; tamanho: TamanhoDoDesenho }
  | { tipo: "automatico"; tipoDesenho: string; folhas: number | null };

export const CATEGORIA_DESENHO_DO_ITEM = "desenho-item";
export const ENTIDADE_DO_DESENHO_DO_ITEM = "ItemProposta";

export function resolverDesenhoDoItem(item: { tipoDesenho: string; folhas: number | null; desenhoImagem?: ImagemDoDesenho | null; tamanhoDesenho?: TamanhoDoDesenho | null }): DesenhoDoItem {
  if (item.desenhoImagem) return { tipo: "imagem", imagem: item.desenhoImagem, tamanho: marcaDoTamanho(item) };
  // Ponto de extensão da 3.6b-3: aqui entraria o desenho salvo na tipologia, antes do automático.
  return { tipo: "automatico", tipoDesenho: item.tipoDesenho, folhas: item.folhas };
}

/** Marca do desenho para comparar revisões: "automatico" ou "personalizado:<sha256>". */
export function marcaDoDesenho(item: { desenhoImagem?: Pick<ImagemDoDesenho, "sha256"> | null }): string {
  return item.desenhoImagem ? `personalizado:${item.desenhoImagem.sha256}` : "automatico";
}

// ----- Tamanho do desenho personalizado (Fase 3.6b-1, Bloco 5) -----

export const TAMANHOS_DO_DESENHO = ["NORMAL", "GRANDE"] as const;
export type TamanhoDoDesenho = (typeof TAMANHOS_DO_DESENHO)[number];
export const ROTULO_DO_TAMANHO: Record<TamanhoDoDesenho, string> = { NORMAL: "Normal", GRANDE: "Grande" };

/** Chave dentro de `ItemProposta.desenhoConfig` (JSON; a coluna já existia e nada a usava). Normal = sem a chave. */
const CHAVE_DO_TAMANHO = "tamanhoDesenho";

/** Lê o tamanho do JSON da configuração; qualquer coisa que não seja "GRANDE" (ausente, torto, outro tipo) é Normal. */
export function lerTamanhoDoDesenho(config: unknown): TamanhoDoDesenho {
  if (config && typeof config === "object" && !Array.isArray(config) && (config as Record<string, unknown>)[CHAVE_DO_TAMANHO] === "GRANDE") return "GRANDE";
  return "NORMAL";
}

/**
 * Devolve a nova configuração com o tamanho aplicado, preservando as outras chaves. Normal tira a chave (e a configuração
 * vira null se não sobrar nada): item que nunca mexeu no tamanho continua com `desenhoConfig` nulo. `undefined` = não mexer.
 */
export function aplicarTamanhoNaConfig(config: unknown, tamanho: TamanhoDoDesenho | undefined): Record<string, unknown> | null {
  const atual = config && typeof config === "object" && !Array.isArray(config) ? { ...(config as Record<string, unknown>) } : {};
  if (tamanho !== undefined) {
    if (tamanho === "GRANDE") atual[CHAVE_DO_TAMANHO] = "GRANDE";
    else delete atual[CHAVE_DO_TAMANHO];
  }
  return Object.keys(atual).length > 0 ? atual : null;
}

/** Marca do tamanho para comparar revisões ("NORMAL" quando o snapshot não tem o campo). */
export function marcaDoTamanho(item: { tamanhoDesenho?: TamanhoDoDesenho | null }): TamanhoDoDesenho {
  return item.tamanhoDesenho === "GRANDE" ? "GRANDE" : "NORMAL";
}
