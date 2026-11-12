// Lista de materiais da obra, derivada da composição das propostas aprovadas (Fase 6). Funções puras.
//
// Usa a MESMA conta do custo (`quantidadeDoInsumo`, com perda de corte). Tipologia sem composição não gera quantidade
// inventada: devolve o aviso. Esta lista NÃO é plano de corte (isso é evolução futura, com o programa do fornecedor): é a
// necessidade total de cada insumo, para conferir o estoque e montar a compra.
import { ErroFormula } from "./formulas";
import { quantidadeDoInsumo, type InsumoComposicao, type ParametrosItem } from "./composicao";
import type { Medida } from "./preco";

export type LinhaDeMaterial = {
  produtoId: string | null;
  descricao: string;
  /** Unidade da fórmula (M, UN, M2, KG...). */
  unidade: string;
  /** Quantidade necessária, já com a perda de corte, na unidade da fórmula (3 casas). */
  quantidade: number;
};

export type ResultadoDaLista = { ok: true; linhas: LinhaDeMaterial[] } | { ok: false; erro: string; semComposicao: boolean };

const arredondar3 = (n: number): number => Math.round(n * 1000) / 1000;

/** Barras inteiras para cima, descontando só o ruído do ponto flutuante (6 casas): 12,001 m em barras de 6 m são 3 barras, 12 m são 2. */
const barrasParaCima = (n: number): number => Math.ceil(Math.round(n * 1e6) / 1e6);

/** Quantidade de cada insumo para o item (todas as medidas somadas). */
export function quantidadesDaComposicao(insumos: readonly InsumoComposicao[], medidas: readonly Medida[], item: ParametrosItem): ResultadoDaLista {
  if (insumos.length === 0) return { ok: false, erro: "Esta tipologia ainda não tem composição cadastrada.", semComposicao: true };
  if (medidas.length === 0) return { ok: false, erro: "Informe ao menos uma medida.", semComposicao: false };
  const linhas: LinhaDeMaterial[] = [];
  for (const insumo of insumos) {
    let total = 0;
    for (const m of medidas) {
      try {
        total += quantidadeDoInsumo(insumo, m, item.folhas);
      } catch (erro) {
        const motivo = erro instanceof ErroFormula ? erro.message : "fórmula inválida";
        return { ok: false, erro: `Fórmula de "${insumo.descricao}": ${motivo}`, semComposicao: false };
      }
    }
    linhas.push({ produtoId: insumo.produtoId ?? null, descricao: insumo.descricao, unidade: insumo.unidade ?? "UN", quantidade: arredondar3(total) });
  }
  return { ok: true, linhas };
}

/** Soma as linhas do mesmo produto e unidade (insumo só texto agrupa por descrição e unidade). */
export function agruparMateriais(linhas: readonly LinhaDeMaterial[]): LinhaDeMaterial[] {
  const mapa = new Map<string, LinhaDeMaterial>();
  for (const l of linhas) {
    const chave = `${l.produtoId ?? `txt:${l.descricao.trim().toLowerCase()}`}|${l.unidade}`;
    const atual = mapa.get(chave);
    if (atual) atual.quantidade = arredondar3(atual.quantidade + l.quantidade);
    else mapa.set(chave, { ...l });
  }
  return [...mapa.values()];
}

export type DadosDeBarra = { comprimentoBarraMm: number | null; pesoMilesimosKgPorMetro: number | null };
export type EquivalenciasDoPerfil = { metros: number | null; barras: number | null; kg: number | null };

/**
 * Equivalências de um perfil: metros, barras (arredondadas para CIMA: não se compra meia barra) e kg pelo peso nominal. O que
 * depende de dado vazio (comprimento da barra, peso por metro) fica null, nunca estimado.
 */
export function equivalenciasDoPerfil(quantidade: number, unidade: string, d: DadosDeBarra): EquivalenciasDoPerfil {
  const comprimento = d.comprimentoBarraMm && d.comprimentoBarraMm > 0 ? d.comprimentoBarraMm : null;
  const peso = d.pesoMilesimosKgPorMetro && d.pesoMilesimosKgPorMetro > 0 ? d.pesoMilesimosKgPorMetro : null;
  let metros: number | null = null;
  if (unidade === "M") metros = quantidade;
  else if (unidade === "BARRA" && comprimento) metros = (quantidade * comprimento) / 1000;
  else if (unidade === "KG" && peso) metros = (quantidade * 1000) / peso;
  if (metros === null) return { metros: null, barras: unidade === "BARRA" ? Math.ceil(quantidade) : null, kg: unidade === "KG" ? quantidade : null };
  return {
    metros: arredondar3(metros),
    barras: unidade === "BARRA" ? Math.ceil(quantidade) : comprimento ? barrasParaCima((metros * 1000) / comprimento) : null,
    kg: unidade === "KG" ? quantidade : peso ? arredondar3((metros * peso) / 1000) : null,
  };
}

/** O que falta no estoque para atender a necessidade (nunca negativo). */
export const faltaNoEstoque = (necessario: number, saldo: number): number => arredondar3(Math.max(0, necessario - saldo));
