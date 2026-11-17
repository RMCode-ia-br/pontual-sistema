import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { somarDias } from "@/lib/dominio/calendario";
import { COLUNAS_DO_FUNIL, type StatusProjeto } from "@/lib/dominio/funil";
import { conversaoDoFunil, ETAPAS_DO_FUNIL, fasesQueContamComoChegada, percentualDoFunil, type ResultadoDoFunil } from "@/lib/dominio/relatorio-funil";
import { dataLocalDoInstante, inputParaData } from "@/lib/formatadores";
import type { ParametrosBrutos } from "@/lib/listas/parametros";
import { motivosDePerdaNoPeriodo } from "@/modules/indicadores/perdas";
import { filtroDeProjetos, lerFiltrosProjetos, type FiltrosProjetos } from "@/modules/projetos/queries";

/** Dias da janela padrão do relatório (a spec usa 90 dias para fechamento). */
export const DIAS_DA_JANELA_PADRAO = 90;

export type FiltrosDoRelatorio = Pick<FiltrosProjetos, "origem" | "responsavelId" | "porte"> & { de: string; ate: string };

/** `hoje` é a data de referência (parâmetro: os testes não dependem do relógio); sem ela vale o dia de hoje em São Paulo. */
export function lerFiltrosDoRelatorio(brutos: ParametrosBrutos, hoje: string = dataLocalDoInstante(new Date())): FiltrosDoRelatorio {
  const f = lerFiltrosProjetos(brutos);
  const ate = f.ate && inputParaData(f.ate) ? f.ate : hoje;
  const de = f.de && inputParaData(f.de) ? f.de : somarDias(ate, -(DIAS_DA_JANELA_PADRAO - 1));
  return { de: de <= ate ? de : ate, ate, origem: f.origem, responsavelId: f.responsavelId, porte: f.porte };
}

export type RelatorioDoFunil = ResultadoDoFunil & {
  motivos: { nome: string; quantidade: number }[];
  /** Projetos (de qualquer data) em "Proposta enviada"/"Negociação" parados além do prazo configurado. */
  semRetorno: number;
};

/** "Chegou à etapa": o projeto passou por ela ou por uma posterior (histórico de fases ou fase atual). */
function chegouA(etapa: StatusProjeto): Prisma.ProjetoWhereInput {
  const fases = fasesQueContamComoChegada(etapa);
  return fases ? { OR: [{ status: { in: fases } }, { historicoFases: { some: { para: { in: fases } } } }] } : {};
}

/**
 * Funil da COORTE (projetos criados no período, com os filtros de origem, responsável e porte), contado pelo banco com
 * agrupamentos e contagens em SQL: não há mais limite de projetos em memória. Os motivos de perda vêm da fonte única do
 * painel (perdidos NO período, pela data da perda), de propósito diferente da coorte.
 */
export async function carregarRelatorioDoFunil(filtros: FiltrosDoRelatorio): Promise<RelatorioDoFunil> {
  const base = await filtroDeProjetos({ busca: "" }, { ...filtros });
  const e = (...partes: Prisma.ProjetoWhereInput[]): Prisma.ProjetoWhereInput => ({ AND: [base ?? { id: "__nenhum__" }, ...partes] });
  const semRetornoWhere = await filtroDeProjetos({ busca: "" }, { semRetorno: true });

  const [total, porFaseG, chegaramEtapas, perdidosComProposta, ticket, origensTotal, origensVisita, origensProposta, origensAprovados, origensPerdidos, motivos, semRetorno] = await Promise.all([
    prisma.projeto.count({ where: e() }),
    prisma.projeto.groupBy({ by: ["status"], where: e(), _count: { _all: true }, _sum: { valorEstimadoCentavos: true } }),
    Promise.all(ETAPAS_DO_FUNIL.map((etapa) => prisma.projeto.count({ where: e(chegouA(etapa)) }))),
    prisma.projeto.count({ where: e({ status: "PERDIDO" }, chegouA("PROPOSTA_ENVIADA")) }),
    prisma.projeto.aggregate({ where: e(chegouA("APROVADO"), { valorEstimadoCentavos: { not: null } }), _avg: { valorEstimadoCentavos: true }, _count: { _all: true } }),
    prisma.projeto.groupBy({ by: ["origem"], where: e(), _count: { _all: true } }),
    prisma.projeto.groupBy({ by: ["origem"], where: e(chegouA("VISITA_AGENDADA")), _count: { _all: true } }),
    prisma.projeto.groupBy({ by: ["origem"], where: e(chegouA("PROPOSTA_ENVIADA")), _count: { _all: true } }),
    prisma.projeto.groupBy({ by: ["origem"], where: e(chegouA("APROVADO")), _count: { _all: true } }),
    prisma.projeto.groupBy({ by: ["origem"], where: e({ status: "PERDIDO" }), _count: { _all: true } }),
    motivosDePerdaNoPeriodo({ de: filtros.de, ate: filtros.ate }, filtros),
    semRetornoWhere ? prisma.projeto.count({ where: semRetornoWhere }) : Promise.resolve(0),
  ]);

  const porFase = COLUNAS_DO_FUNIL.map((status) => {
    const g = porFaseG.find((x) => x.status === status);
    return { status, quantidade: g?._count._all ?? 0, valorCentavos: g?._sum.valorEstimadoCentavos ?? 0 };
  });
  const contagem = (grupos: { origem: string | null; _count: { _all: number } }[], origem: string | null) => grupos.find((g) => g.origem === origem)?._count._all ?? 0;
  const porOrigem = origensTotal
    .map((g) => ({
      origem: g.origem as string | null,
      leads: g._count._all,
      comVisita: contagem(origensVisita, g.origem),
      comPropostaEnviada: contagem(origensProposta, g.origem),
      aprovados: contagem(origensAprovados, g.origem),
      perdidos: contagem(origensPerdidos, g.origem),
    }))
    .sort((a, b) => b.leads - a.leads || String(a.origem).localeCompare(String(b.origem)));

  const aprovados = chegaramEtapas[ETAPAS_DO_FUNIL.indexOf("APROVADO")];
  const decididos = aprovados + perdidosComProposta;
  return {
    total,
    porFase,
    conversao: conversaoDoFunil(chegaramEtapas, total),
    porOrigem,
    taxaDeFechamento: decididos === 0 ? null : percentualDoFunil(aprovados, decididos),
    ticketMedioCentavos: ticket._count._all === 0 || ticket._avg.valorEstimadoCentavos === null ? null : Math.round(ticket._avg.valorEstimadoCentavos),
    motivos: motivos.motivos.map((m) => ({ nome: m.nome, quantidade: m.quantidade })),
    semRetorno,
  };
}
