/**
 * Galeria de obras e kit de postagem (spec 7.8). Código puro.
 *
 * A legenda sugerida só recebe tipo de serviço, linha de alumínio, cidade e UF: NUNCA o nome, o telefone nem o
 * endereço do cliente. Isso vale por construção (esses dados nem entram na função), e mesmo que alguém edite o
 * modelo de texto e ponha `{{cliente}}` nele, a variável fica sem valor e aparece como pendente, nunca preenchida.
 */
import { preencherModelo } from "./modelos-texto";

export const MOMENTOS_DA_FOTO = ["ANTES", "DURANTE", "DEPOIS"] as const;
export type MomentoDaFoto = (typeof MOMENTOS_DA_FOTO)[number];

export const ROTULO_MOMENTO: Record<MomentoDaFoto, string> = { ANTES: "Antes", DURANTE: "Durante", DEPOIS: "Depois" };

/** Categoria dos anexos do projeto que são fotos da obra (as demais imagens do projeto não vão para a galeria). */
export const CATEGORIA_FOTO_DE_OBRA = "foto-obra";

/** Modelo usado se o gestor apagar o de Configurações (o mesmo da seed). */
export const MODELO_PADRAO_DA_LEGENDA = "{{tipoServico}} em alumínio linha {{linha}}, entregues em {{cidade}}/{{regiao}}. Pontualidade, qualidade e entrega em cada obra.";

export type DadosDaLegenda = {
  tipoServico: string | null;
  linha: string | null;
  cidade: string | null;
  /** UF do endereço da obra (não há cadastro de regiões). */
  regiao: string | null;
};

/** Variáveis sem valor ficam visíveis no texto e em `faltando`: o gestor completa antes de postar. */
export function montarLegenda(modelo: string, dados: DadosDaLegenda): { texto: string; faltando: string[] } {
  return preencherModelo(modelo, {
    tipoServico: dados.tipoServico ?? undefined,
    linha: dados.linha ?? undefined,
    cidade: dados.cidade ?? undefined,
    regiao: dados.regiao ?? undefined,
  });
}

/**
 * ["Janelas", "Guarda-corpo", "Box"] → "Janelas, guarda-corpo e box". Com `nomesProprios`, preserva as maiúsculas
 * (["Gold", "Suprema"] → "Gold e Suprema").
 */
export function listaEmTexto(itens: readonly string[], opcoes: { nomesProprios?: boolean } = {}): string {
  const limpos = itens.map((i) => i.trim()).filter(Boolean);
  const minusculo = (t: string, i: number) => (i === 0 || opcoes.nomesProprios ? t : t.charAt(0).toLowerCase() + t.slice(1));
  const formatados = limpos.map(minusculo);
  if (formatados.length <= 1) return formatados[0] ?? "";
  return `${formatados.slice(0, -1).join(", ")} e ${formatados[formatados.length - 1]}`;
}

type FotoParaSelecionar = { id: string; momento: MomentoDaFoto | null; criadoEm: string };

/**
 * Seleção sugerida para a postagem: o par antes/depois (a foto mais recente de cada) e, se não há par, as até 4
 * fotos "depois" (ou, na falta delas, as mais recentes). O gestor ajusta.
 */
export function selecionarParaPostagem(fotos: readonly FotoParaSelecionar[]): string[] {
  const maisRecentesPrimeiro = [...fotos].sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : a.criadoEm > b.criadoEm ? -1 : 0));
  const antes = maisRecentesPrimeiro.find((f) => f.momento === "ANTES");
  const depois = maisRecentesPrimeiro.find((f) => f.momento === "DEPOIS");
  if (antes && depois) return [antes.id, depois.id];
  const dosDepois = maisRecentesPrimeiro.filter((f) => f.momento === "DEPOIS");
  return (dosDepois.length > 0 ? dosDepois : maisRecentesPrimeiro).slice(0, 4).map((f) => f.id);
}

const EXTENSAO_DO_TIPO: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Nome do arquivo dentro do kit: "01-antes.jpg", "02-depois.jpg" (sem nada do cliente nem do arquivo original). */
export function nomeNoKit(posicao: number, momento: MomentoDaFoto | null, mime: string): string {
  const extensao = EXTENSAO_DO_TIPO[mime] ?? "jpg";
  return `${String(posicao).padStart(2, "0")}-${(momento ?? "foto").toLowerCase()}.${extensao}`;
}
