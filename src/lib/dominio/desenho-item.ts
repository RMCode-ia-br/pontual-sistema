/**
 * Qual desenho um item da proposta mostra (regra pura, usada pela tela, pelo PDF e pela folha de produção).
 * Prioridade (única, Fase 3.6b-3): imagem do ITEM > imagem da TIPOLOGIA > desenho automático por tipo.
 */

import { z } from "zod";

/** Referência imutável à imagem (vai para o snapshot ao enviar: o arquivo nunca é apagado e o hash confere na leitura). */
export type ImagemDoDesenho = {
  anexoId: string;
  caminho: string;
  sha256: string;
  mime: string;
  larguraPx: number;
  alturaPx: number;
};

/** De onde veio a imagem: do próprio item ou herdada da tipologia (o tamanho segue a origem). */
export type OrigemDoDesenho = "ITEM" | "TIPOLOGIA";

/** `I` é a forma da imagem de quem chama: a referência completa do snapshot (PDF) ou só o que a tela precisa (id, medidas e link). */
export type DesenhoDoItem<I = ImagemDoDesenho> =
  | { tipo: "imagem"; imagem: I; tamanho: TamanhoDoDesenho; origem: OrigemDoDesenho }
  | { tipo: "automatico"; tipoDesenho: string; folhas: number | null };

export const CATEGORIA_DESENHO_DO_ITEM = "desenho-item";
export const ENTIDADE_DO_DESENHO_DO_ITEM = "ItemProposta";
export const CATEGORIA_DESENHO_DA_TIPOLOGIA = "desenho-tipologia";
export const ENTIDADE_DO_DESENHO_DA_TIPOLOGIA = "Tipologia";

/** Imagem (e tamanho) guardados na tipologia, já lidos do banco. */
export type DesenhoDaTipologia<I = ImagemDoDesenho> = { imagem: I; tamanho?: TamanhoDoDesenho | null };

/**
 * Regra única do desenho. Quem já tem o item resolvido (PDF de proposta enviada: o snapshot guarda a imagem JÁ resolvida em
 * `desenhoImagem`) não passa `desenhoDaTipologia`; quem monta o conteúdo de um rascunho ou a tela passa a imagem da tipologia.
 * Tipologia arquivada continua valendo (quem decide se passa a imagem é o leitor); sem imagem em nenhum dos dois, automático.
 */
export function resolverDesenhoDoItem<I = ImagemDoDesenho>(item: {
  tipoDesenho: string;
  folhas: number | null;
  desenhoImagem?: I | null;
  tamanhoDesenho?: TamanhoDoDesenho | null;
  desenhoDaTipologia?: DesenhoDaTipologia<I> | null;
}): DesenhoDoItem<I> {
  if (item.desenhoImagem) return { tipo: "imagem", imagem: item.desenhoImagem, tamanho: marcaDoTamanho(item), origem: "ITEM" };
  if (item.desenhoDaTipologia) return { tipo: "imagem", imagem: item.desenhoDaTipologia.imagem, tamanho: marcaDoTamanho({ tamanhoDesenho: item.desenhoDaTipologia.tamanho }), origem: "TIPOLOGIA" };
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

/**
 * Configuração do desenho (item e tipologia), validada no servidor ANTES de gravar: só a chave "tamanhoDesenho" com "GRANDE"
 * (Normal = sem configuração). Qualquer outra chave ou valor é recusado.
 */
export const configDoDesenhoSchema = z.object({ tamanhoDesenho: z.literal("GRANDE") }).strict().nullable();

/** Marca do tamanho para comparar revisões ("NORMAL" quando o snapshot não tem o campo). */
export function marcaDoTamanho(item: { tamanhoDesenho?: TamanhoDoDesenho | null }): TamanhoDoDesenho {
  return item.tamanhoDesenho === "GRANDE" ? "GRANDE" : "NORMAL";
}
