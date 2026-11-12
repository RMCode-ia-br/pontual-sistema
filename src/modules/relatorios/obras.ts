import "server-only";

import { prisma } from "@/lib/db";
import { limitesDoDia } from "@/lib/dominio/agenda";
import { somarDias } from "@/lib/dominio/calendario";
import { resumirAssistencias, resumirAtrasosDasEtapas, resumirPausasPorMotivo, type AtrasoDaEtapa, type PausasDoMotivo, type ResumoDeAssistencias } from "@/lib/dominio/relatorio-obras";
import type { ResumoDePontualidade } from "@/lib/dominio/pontualidade";
import { dataLocalDoInstante, inputParaData } from "@/lib/formatadores";
import type { ParametrosBrutos } from "@/lib/listas/parametros";
import { listarObras, type ObraDaLista } from "@/modules/obras/queries-lista";

import { DIAS_DA_JANELA_PADRAO } from "./funil";

const LIMITE_DE_REGISTROS = 20_000;
const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export type PeriodoDoRelatorio = { de: string; ate: string };

const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Período da URL (dados não confiáveis); sem ele, os últimos 90 dias como os demais relatórios. */
export function lerPeriodoDoRelatorioDeObras(brutos: ParametrosBrutos, agora: Date = new Date()): PeriodoDoRelatorio {
  const ateBruto = um(brutos.ate);
  const deBruto = um(brutos.de);
  const ate = ateBruto && inputParaData(ateBruto) ? ateBruto : dataLocalDoInstante(agora);
  const de = deBruto && inputParaData(deBruto) ? deBruto : somarDias(ate, -(DIAS_DA_JANELA_PADRAO - 1));
  return { de: de <= ate ? de : ate, ate };
}

export type ObraConcluidaDoRelatorio = {
  id: string;
  codigo: string;
  titulo: string;
  clienteNome: string;
  concluidaEm: string | null;
  prazoPrometido: string | null;
  /** Dias de atraso (positivo) ou de folga (negativo) contra o prazo prometido, já com as pausas; `null` sem prazo. */
  desvioDias: number | null;
  pontual: boolean | null;
};

export type RelatorioDeObras = {
  periodo: PeriodoDoRelatorio;
  pontualidade: ResumoDePontualidade;
  obrasConcluidas: ObraConcluidaDoRelatorio[];
  atrasosPorEtapa: AtrasoDaEtapa[];
  pausasPorMotivo: PausasDoMotivo[];
  /** Etapas bloqueadas agora em obras em andamento, por motivo (o sistema não guarda o histórico de bloqueios). */
  bloqueadasAgora: { motivo: string; quantidade: number }[];
  assistencias: ResumoDeAssistencias;
  chamadosEmAbertoHoje: number;
  truncado: boolean;
};

function linhaDaObra(o: ObraDaLista): ObraConcluidaDoRelatorio {
  const p = o.prazo.pontualidade;
  return {
    id: o.id,
    codigo: o.codigo,
    titulo: o.titulo,
    clienteNome: o.clienteNome,
    concluidaEm: o.dataConclusao,
    prazoPrometido: o.prazo.comPausas,
    desvioDias: p?.avaliavel ? p.desvioDias : null,
    pontual: p?.avaliavel ? p.pontual : null,
  };
}

/**
 * Relatório de obras do período: pontualidade (obras concluídas no período, com e sem pausas), atrasos por etapa,
 * pausas e bloqueios por motivo e assistências abertas no período. As definições estão na tela.
 */
export async function carregarRelatorioDeObras(periodo: PeriodoDoRelatorio, agora: Date = new Date()): Promise<RelatorioDeObras> {
  const hoje = dataLocalDoInstante(agora);
  const inicio = limitesDoDia(periodo.de).inicio;
  const fim = limitesDoDia(periodo.ate).fim;
  const de = inputParaData(periodo.de)!;
  const ate = inputParaData(periodo.ate)!;

  const [concluidas, etapas, pausas, bloqueadas, chamados, emAbertoHoje] = await Promise.all([
    listarObras({ situacao: "concluidas", busca: "", de: periodo.de, ate: periodo.ate }, agora),
    prisma.etapaProjeto.findMany({
      where: {
        deletadoEm: null,
        projeto: { deletadoEm: null },
        OR: [
          { status: "CONCLUIDA", fimReal: { gte: de, lte: ate } },
          { status: { in: ["PENDENTE", "EM_ANDAMENTO", "BLOQUEADA"] }, projeto: { deletadoEm: null, status: { in: ["APROVADO", "EM_EXECUCAO"] } } },
        ],
      },
      take: LIMITE_DE_REGISTROS + 1,
      select: { tipo: true, status: true, fimPrevisto: true, fimReal: true },
    }),
    prisma.pausaProjeto.findMany({
      where: { deletadoEm: null, projeto: { deletadoEm: null }, inicio: { gte: de, lte: ate } },
      take: LIMITE_DE_REGISTROS + 1,
      select: { inicio: true, fim: true, justificada: true, motivoBloqueio: { select: { nome: true } } },
    }),
    prisma.etapaProjeto.groupBy({
      by: ["motivoBloqueioId"],
      where: { deletadoEm: null, status: "BLOQUEADA", projeto: { deletadoEm: null, status: { in: ["APROVADO", "EM_EXECUCAO"] } } },
      _count: { _all: true },
    }),
    prisma.chamado.findMany({
      where: { deletadoEm: null, abertoEm: { gte: inicio, lt: fim } },
      take: LIMITE_DE_REGISTROS + 1,
      select: { classificacao: true, tipoProblema: true, status: true, abertoEm: true, resolvidoEm: true, cobrarVisita: true, valorCobradoCentavos: true, contaReceberId: true },
    }),
    prisma.chamado.count({ where: { deletadoEm: null, status: { in: ["ABERTO", "AGENDADO", "EM_ATENDIMENTO"] } } }),
  ]);

  const idsDeMotivo = bloqueadas.map((b) => b.motivoBloqueioId).filter((i): i is string => !!i);
  const motivos = idsDeMotivo.length ? await prisma.motivoBloqueio.findMany({ where: { id: { in: idsDeMotivo } }, select: { id: true, nome: true } }) : [];
  const nomeDoMotivo = new Map(motivos.map((m) => [m.id, m.nome]));

  const truncado = concluidas.truncado || etapas.length > LIMITE_DE_REGISTROS || pausas.length > LIMITE_DE_REGISTROS || chamados.length > LIMITE_DE_REGISTROS;

  return {
    periodo,
    pontualidade: concluidas.pontualidade!,
    obrasConcluidas: concluidas.linhas.map(linhaDaObra),
    atrasosPorEtapa: resumirAtrasosDasEtapas(
      etapas.slice(0, LIMITE_DE_REGISTROS).map((e) => ({ tipo: e.tipo, status: e.status, fimPrevisto: dia(e.fimPrevisto), fimReal: dia(e.fimReal) })),
      hoje,
      periodo.de,
      periodo.ate,
    ),
    pausasPorMotivo: resumirPausasPorMotivo(
      pausas.slice(0, LIMITE_DE_REGISTROS).map((p) => ({ motivo: p.motivoBloqueio.nome, inicio: dia(p.inicio)!, fim: dia(p.fim), justificada: p.justificada })),
      hoje,
    ),
    bloqueadasAgora: bloqueadas
      .map((b) => ({ motivo: b.motivoBloqueioId ? (nomeDoMotivo.get(b.motivoBloqueioId) ?? "Motivo removido") : "Sem motivo informado", quantidade: b._count._all }))
      .sort((a, b) => b.quantidade - a.quantidade || a.motivo.localeCompare(b.motivo, "pt-BR")),
    assistencias: resumirAssistencias(
      chamados.slice(0, LIMITE_DE_REGISTROS).map((c) => ({
        classificacao: c.classificacao,
        tipoProblema: c.tipoProblema,
        status: c.status,
        abertoEm: dataLocalDoInstante(c.abertoEm),
        resolvidoEm: c.resolvidoEm ? dataLocalDoInstante(c.resolvidoEm) : null,
        cobrarVisita: c.cobrarVisita,
        valorCobradoCentavos: c.valorCobradoCentavos,
        temCobranca: c.contaReceberId !== null,
      })),
    ),
    chamadosEmAbertoHoje: emAbertoHoje,
    truncado,
  };
}
