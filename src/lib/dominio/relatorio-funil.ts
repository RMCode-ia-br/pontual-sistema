/**
 * Indicadores do funil comercial (spec seção 8), calculados sobre uma COORTE: os projetos criados no período.
 * Código puro: a consulta só entrega as linhas e este módulo conta. Definições (mostradas na tela):
 * - "chegou à fase" = o projeto passou por ela em algum momento (histórico de fases), mesmo que hoje esteja em outra;
 * - conversão entre fases = quantos chegaram à fase seguinte ÷ quantos chegaram à anterior;
 * - tempo visita → proposta = data de envio da primeira proposta − data da primeira visita realizada (dias, só
 *   projetos que têm as duas datas);
 * - taxa de fechamento e ticket médio dependem de projetos APROVADOS (propostas, Fase 3): sem decisões, ficam nulos.
 */
import { differenceInCalendarDays } from "date-fns";
import { toZonedTime } from "date-fns-tz";

import { FUSO_PADRAO } from "../formatadores";
import { COLUNAS_DO_FUNIL, type StatusProjeto } from "./funil";

export type LinhaDoFunil = {
  origem: string | null;
  status: StatusProjeto;
  valorEstimadoCentavos: number | null;
  motivoPerdaId: string | null;
  /** Fases pelas quais passou, com a data de cada passagem. */
  fases: { para: StatusProjeto; em: Date }[];
  primeiraVisitaRealizadaEm: Date | null;
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
  motivosDePerda: { motivoPerdaId: string | null; quantidade: number }[];
  tempoVisitaPropostaDias: { media: number; amostra: number } | null;
  /** Aprovados ÷ (aprovados + perdidos que chegaram a ter proposta enviada). Null sem nenhuma decisão. */
  taxaDeFechamento: number | null;
  ticketMedioCentavos: number | null;
};

const percentual = (parte: number, base: number): number | null => (base === 0 ? null : Math.round((parte / base) * 1000) / 10);

/**
 * "Chegou à etapa" = passou por ela OU por qualquer etapa posterior (o funil permite pular fases). Assim a contagem
 * nunca aumenta de uma etapa para a seguinte e a conversão nunca passa de 100%.
 */
function chegouA(linha: LinhaDoFunil, etapa: StatusProjeto): boolean {
  const indice = ETAPAS_DO_FUNIL.indexOf(etapa as (typeof ETAPAS_DO_FUNIL)[number]);
  if (indice <= 0) return true;
  // Etapas dali em diante; "aprovado" inclui execução e concluído (todos vêm depois de qualquer etapa do funil).
  const alcancadas = new Set<StatusProjeto>([...ETAPAS_DO_FUNIL.slice(indice), ...FASES_APROVADAS]);
  return linha.fases.some((x) => alcancadas.has(x.para)) || alcancadas.has(linha.status);
}

export function calcularFunil(linhas: LinhaDoFunil[]): ResultadoDoFunil {
  const total = linhas.length;

  const porFase = COLUNAS_DO_FUNIL.map((status) => {
    const daFase = linhas.filter((l) => l.status === status);
    return { status, quantidade: daFase.length, valorCentavos: daFase.reduce((s, l) => s + (l.valorEstimadoCentavos ?? 0), 0) };
  });

  const chegaram = ETAPAS_DO_FUNIL.map((etapa) => linhas.filter((l) => chegouA(l, etapa)).length);
  const conversao = ETAPAS_DO_FUNIL.map((etapa, i) => ({
    etapa,
    chegaram: chegaram[i],
    percentualDaAnterior: i === 0 ? null : percentual(chegaram[i], chegaram[i - 1]),
    percentualDoTotal: percentual(chegaram[i], total),
  }));

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

  const motivos = new Map<string | null, number>();
  for (const l of linhas) if (l.status === "PERDIDO") motivos.set(l.motivoPerdaId, (motivos.get(l.motivoPerdaId) ?? 0) + 1);
  const motivosDePerda = [...motivos.entries()].map(([motivoPerdaId, quantidade]) => ({ motivoPerdaId, quantidade })).sort((a, b) => b.quantidade - a.quantidade);

  // Visita → proposta: só projetos com as duas datas; nunca negativo (proposta enviada antes da visita registrada).
  const dias: number[] = [];
  for (const l of linhas) {
    const envio = l.fases.filter((f) => f.para === "PROPOSTA_ENVIADA").sort((a, b) => a.em.getTime() - b.em.getTime())[0]?.em;
    if (!envio || !l.primeiraVisitaRealizadaEm) continue;
    const d = differenceInCalendarDays(toZonedTime(envio, FUSO_PADRAO), toZonedTime(l.primeiraVisitaRealizadaEm, FUSO_PADRAO));
    dias.push(Math.max(0, d));
  }
  const tempoVisitaPropostaDias = dias.length ? { media: Math.round((dias.reduce((s, d) => s + d, 0) / dias.length) * 10) / 10, amostra: dias.length } : null;

  const aprovados = linhas.filter((l) => chegouA(l, "APROVADO"));
  const perdidosComProposta = linhas.filter((l) => l.status === "PERDIDO" && chegouA(l, "PROPOSTA_ENVIADA"));
  const decididos = aprovados.length + perdidosComProposta.length;
  const comValor = aprovados.filter((l) => l.valorEstimadoCentavos !== null);

  return {
    total,
    porFase,
    conversao,
    porOrigem,
    motivosDePerda,
    tempoVisitaPropostaDias,
    taxaDeFechamento: decididos === 0 ? null : percentual(aprovados.length, decididos),
    ticketMedioCentavos: comValor.length === 0 ? null : Math.round(comValor.reduce((s, l) => s + (l.valorEstimadoCentavos ?? 0), 0) / comValor.length),
  };
}
