import "server-only";

import { prisma } from "@/lib/db";
import { limitesDoDia } from "@/lib/dominio/agenda";
import { somarDias } from "@/lib/dominio/calendario";
import { FASES_ABERTAS, type StatusProjeto } from "@/lib/dominio/funil";
import { cortarMotivosDePerda } from "@/lib/dominio/indicadores";
import { dataLocalDoInstante } from "@/lib/formatadores";
import { limitesEmInstantes, mesDaData, type Periodo } from "@/lib/periodo";
import { obterConfiguracao } from "@/modules/configuracoes/queries";
import { motivosDePerdaNoPeriodo } from "@/modules/indicadores/perdas";
import { limiteSemRetorno } from "@/modules/projetos/queries";

export type ResumoComercial = {
  funil: { status: StatusProjeto; quantidade: number; valorCentavos: number }[];
  semRetorno: number;
  visitas: { id: string; inicio: string; clienteNome: string | null; projetoTitulo: string | null; local: string | null; dia: "hoje" | "amanha" }[];
  origensDoPeriodo: { origem: string | null; quantidade: number }[];
  perdasDoPeriodo: { nome: string; quantidade: number }[];
  /** O que ficou fora dos {@link MOTIVOS_NO_PAINEL} primeiros motivos (a tela avisa, nunca corta em silêncio). */
  perdasOcultas: { motivos: number; projetos: number };
};

/** Quantos motivos de perda o painel mostra; o resto fica no relatório do funil. */
export const MOTIVOS_NO_PAINEL = 6;

/**
 * Números do painel comercial. Definições (mostradas na tela):
 * - funil: projetos em cada fase aberta e a soma dos valores estimados;
 * - sem retorno: em "Proposta enviada"/"Negociação" parados há mais que o prazo configurado;
 * - visitas: visitas técnicas ainda em aberto hoje e amanhã (horário de São Paulo);
 * - origens e perdas do período: projetos CRIADOS / PERDIDOS dentro do período escolhido (padrão: o mês atual).
 */
export async function resumoComercial(periodo?: Periodo): Promise<ResumoComercial> {
  const agora = new Date();
  const hoje = dataLocalDoInstante(agora);
  const amanha = somarDias(hoje, 1);
  const { inicio, fimExclusivo } = limitesEmInstantes(periodo ?? mesDaData(hoje));
  const config = await obterConfiguracao();

  const [porFase, semRetorno, visitas, origens, perdas] = await Promise.all([
    prisma.projeto.groupBy({ by: ["status"], where: { deletadoEm: null, status: { in: [...FASES_ABERTAS] } }, _count: { _all: true }, _sum: { valorEstimadoCentavos: true } }),
    prisma.projeto.count({
      where: { deletadoEm: null, status: { in: ["PROPOSTA_ENVIADA", "NEGOCIACAO"] }, ultimaMovimentacaoEm: { lt: limiteSemRetorno(config?.diasSemRetornoProposta ?? 7, agora) } },
    }),
    prisma.eventoAgenda.findMany({
      where: { deletadoEm: null, tipo: "VISITA_TECNICA", status: { in: ["AGENDADO", "CONFIRMADO", "REMARCADO"] }, inicio: { gte: limitesDoDia(hoje).inicio, lt: limitesDoDia(amanha).fim } },
      orderBy: { inicio: "asc" },
      take: 20,
      select: { id: true, inicio: true, local: true, cliente: { select: { nome: true } }, projeto: { select: { titulo: true } } },
    }),
    prisma.projeto.groupBy({ by: ["origem"], where: { deletadoEm: null, criadoEm: { gte: inicio, lt: fimExclusivo } }, _count: { _all: true }, orderBy: { _count: { origem: "desc" } }, take: 6 }),
    motivosDePerdaNoPeriodo(periodo ?? mesDaData(hoje)), // a MESMA fonte do relatório do funil (pela data da perda)
  ]);

  const { mostrados: perdasMostradas, ocultos: perdasOcultas } = cortarMotivosDePerda(perdas.motivos, MOTIVOS_NO_PAINEL);
  const limiteDeHoje = limitesDoDia(amanha).inicio;

  return {
    funil: FASES_ABERTAS.map((status) => {
      const g = porFase.find((f) => f.status === status);
      return { status, quantidade: g?._count._all ?? 0, valorCentavos: g?._sum.valorEstimadoCentavos ?? 0 };
    }),
    semRetorno,
    visitas: visitas.map((v) => ({ id: v.id, inicio: v.inicio.toISOString(), clienteNome: v.cliente?.nome ?? null, projetoTitulo: v.projeto?.titulo ?? null, local: v.local, dia: v.inicio < limiteDeHoje ? "hoje" : "amanha" })),
    origensDoPeriodo: origens.map((o) => ({ origem: o.origem, quantidade: o._count._all })),
    perdasDoPeriodo: perdasMostradas.map((p) => ({ nome: p.nome, quantidade: p.quantidade })),
    perdasOcultas,
  };
}
