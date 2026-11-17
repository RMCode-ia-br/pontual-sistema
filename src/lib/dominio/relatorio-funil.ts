/**
 * Indicadores do funil comercial (spec seção 8), calculados sobre uma COORTE: os projetos criados no período.
 * Em produção a coorte é contada pelo banco (`src/modules/relatorios/funil.ts`, com SQL agregado, sem limite de projetos);
 * {@link calcularFunil} é a MESMA conta feita em memória sobre linhas, usada como referência nos testes (o teste de
 * integração compara as duas). Definições (mostradas na tela):
 * - "chegou à fase" = o projeto passou por ela em algum momento (histórico de fases), mesmo que hoje esteja em outra;
 * - conversão entre fases = quantos chegaram à fase seguinte ÷ quantos chegaram à anterior;
 * - taxa de fechamento e ticket médio dependem de projetos APROVADOS: sem decisões, ficam nulos.
 * O tempo da visita à proposta saiu daqui: tem visão própria (`tempoVisitaAteProposta`, mesma regra do painel).
 */
import { COLUNAS_DO_FUNIL, type StatusProjeto } from "./funil";

export type LinhaDoFunil = {
  origem: string | null;
  status: StatusProjeto;
  valorEstimadoCentavos: number | null;
  /** Fases pelas quais passou, com a data de cada passagem. */
  fases: { para: StatusProjeto; em: Date }[];
};

/** Etapas do funil na ordem em que um projeto avança (a primeira, "Novo contato", todo projeto cumpre). */
export const ETAPAS_DO_FUNIL = ["NOVO_LEAD", "VISITA_AGENDADA", "ELABORANDO_PROPOSTA", "PROPOSTA_ENVIADA", "NEGOCIACAO", "APROVADO"] as const satisfies readonly StatusProjeto[];

const FASES_APROVADAS: StatusProjeto[] = ["APROVADO", "EM_EXECUCAO", "CONCLUIDO"];

export type ResultadoDoFunil = {
  total: number;
  porFase: { status: StatusProjeto; quantidade: number; valorCentavos: number }[];
  /** Quantos chegaram a cada etapa e a conversão em relação à etapa anterior (null sem base). */
  conversao: { etapa: StatusProjeto; chegaram: number; percentualDaAnterior: number | null; percentualDoTotal: number | null }[];
  porOrigem: { origem: string | null; leads: number; comVisita: number; comPropostaEnviada: number; aprovados: number; perdidos: number }[];
  /** Aprovados ÷ (aprovados + perdidos que chegaram a ter proposta enviada). Null sem nenhuma decisão. */
  taxaDeFechamento: number | null;
  ticketMedioCentavos: number | null;
};

export const percentualDoFunil = (parte: number, base: number): number | null => (base === 0 ? null : Math.round((parte / base) * 1000) / 10);

/**
 * As fases em que um projeto "chegou à etapa" (ela ou qualquer posterior: o funil permite pular fases). Assim a contagem
 * nunca aumenta de uma etapa para a seguinte e a conversão nunca passa de 100%. `null` para a primeira etapa (todo projeto a cumpre).
 */
export function fasesQueContamComoChegada(etapa: StatusProjeto): StatusProjeto[] | null {
  const indice = ETAPAS_DO_FUNIL.indexOf(etapa as (typeof ETAPAS_DO_FUNIL)[number]);
  if (indice <= 0) return null;
  // Etapas dali em diante; "aprovado" inclui execução e concluído (todos vêm depois de qualquer etapa do funil).
  return [...new Set<StatusProjeto>([...ETAPAS_DO_FUNIL.slice(indice), ...FASES_APROVADAS])];
}

/** A conversão a partir das contagens de quem chegou a cada etapa (na ordem de {@link ETAPAS_DO_FUNIL}). */
export function conversaoDoFunil(chegaram: readonly number[], total: number): ResultadoDoFunil["conversao"] {
  return ETAPAS_DO_FUNIL.map((etapa, i) => ({
    etapa,
    chegaram: chegaram[i],
    percentualDaAnterior: i === 0 ? null : percentualDoFunil(chegaram[i], chegaram[i - 1]),
    percentualDoTotal: percentualDoFunil(chegaram[i], total),
  }));
}

function chegouA(linha: LinhaDoFunil, etapa: StatusProjeto): boolean {
  const alcancadas = fasesQueContamComoChegada(etapa);
  if (!alcancadas) return true;
  const set = new Set(alcancadas);
  return linha.fases.some((x) => set.has(x.para)) || set.has(linha.status);
}

export function calcularFunil(linhas: LinhaDoFunil[]): ResultadoDoFunil {
  const total = linhas.length;

  const porFase = COLUNAS_DO_FUNIL.map((status) => {
    const daFase = linhas.filter((l) => l.status === status);
    return { status, quantidade: daFase.length, valorCentavos: daFase.reduce((s, l) => s + (l.valorEstimadoCentavos ?? 0), 0) };
  });

  const conversao = conversaoDoFunil(
    ETAPAS_DO_FUNIL.map((etapa) => linhas.filter((l) => chegouA(l, etapa)).length),
    total,
  );

  const origens = new Map<string | null, LinhaDoFunil[]>();
  for (const l of linhas) origens.set(l.origem, [...(origens.get(l.origem) ?? []), l]);
  const porOrigem = [...origens.entries()]
    .map(([origem, grupo]) => ({
      origem,
      leads: grupo.length,
      comVisita: grupo.filter((l) => chegouA(l, "VISITA_AGENDADA")).length,
      comPropostaEnviada: grupo.filter((l) => chegouA(l, "PROPOSTA_ENVIADA")).length,
      aprovados: grupo.filter((l) => chegouA(l, "APROVADO")).length,
      perdidos: grupo.filter((l) => l.status === "PERDIDO").length,
    }))
    .sort((a, b) => b.leads - a.leads);

  const aprovados = linhas.filter((l) => chegouA(l, "APROVADO"));
  const perdidosComProposta = linhas.filter((l) => l.status === "PERDIDO" && chegouA(l, "PROPOSTA_ENVIADA"));
  const decididos = aprovados.length + perdidosComProposta.length;
  const comValor = aprovados.filter((l) => l.valorEstimadoCentavos !== null);

  return {
    total,
    porFase,
    conversao,
    porOrigem,
    taxaDeFechamento: decididos === 0 ? null : percentualDoFunil(aprovados.length, decididos),
    ticketMedioCentavos: comValor.length === 0 ? null : Math.round(comValor.reduce((s, l) => s + (l.valorEstimadoCentavos ?? 0), 0) / comValor.length),
  };
}
