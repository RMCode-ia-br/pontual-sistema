import "server-only";

import { prisma } from "@/lib/db";
import { limitesDoDia } from "@/lib/dominio/agenda";
import { somarDias } from "@/lib/dominio/calendario";
import { STATUS_EM_ABERTO } from "@/lib/dominio/chamados";
import { TIPOS_DE_ETAPA, type TipoDeEtapa } from "@/lib/dominio/etapas";
import type { ResumoDePontualidade } from "@/lib/dominio/pontualidade";
import { dataLocalDoInstante } from "@/lib/formatadores";
import type { Periodo } from "@/lib/periodo";
import { listarObras } from "./queries-lista";

/** Janela da pontualidade no painel: obras concluídas nos últimos 90 dias (a mesma do funil). */
export const DIAS_DA_PONTUALIDADE_NO_PAINEL = 90;

export type ResumoDeObras = {
  emAndamento: number;
  verdes: number;
  amarelas: number;
  vermelhas: number;
  semPrazo: number;
  /** Obras em andamento por etapa atual (só as etapas com obra), na ordem do fluxo. */
  porEtapa: { tipo: TipoDeEtapa; quantidade: number }[];
  /** Obras com alguma etapa atrasada, as mais urgentes primeiro (no máximo 5). */
  atrasadas: { id: string; titulo: string; clienteNome: string; etapaAtual: string | null; etapasAtrasadas: number }[];
  pontualidade: ResumoDePontualidade;
  periodoDaPontualidade: { de: string; ate: string };
  proximasInstalacoes: { id: string; tipo: string; inicio: string; clienteNome: string | null; projetoId: string | null; projetoTitulo: string | null; equipeNome: string | null }[];
  chamadosEmAberto: number;
  chamadosEmAbertoEmGarantia: number;
};

/**
 * Números de obras do painel. Definições (mostradas na tela):
 * - em andamento: obras aprovadas ou em execução; semáforo = a pior cor entre as etapas abertas e o prazo prometido;
 * - por etapa: a etapa atual de cada obra (a primeira ainda aberta);
 * - pontualidade: obras concluídas no período escolhido (padrão: últimos 90 dias) até o prazo prometido (já com as pausas justificadas);
 * - próximas instalações: compromissos de instalação, entrega e medição dos vidros ainda em aberto, a partir de hoje;
 * - chamados: assistências ainda não resolvidas nem canceladas.
 */
export async function resumoDeObras(agora: Date = new Date(), periodo?: Periodo): Promise<ResumoDeObras> {
  const hoje = dataLocalDoInstante(agora);
  // A pontualidade segue o período escolhido no painel; sem período, os últimos 90 dias (a janela de antes).
  const de = periodo?.de ?? somarDias(hoje, -(DIAS_DA_PONTUALIDADE_NO_PAINEL - 1));
  const ate = periodo?.ate ?? hoje;

  const [andamento, concluidas, instalacoes, chamadosEmAberto, emGarantia] = await Promise.all([
    listarObras({ situacao: "andamento", busca: "" }, agora),
    listarObras({ situacao: "concluidas", busca: "", de, ate }, agora),
    prisma.eventoAgenda.findMany({
      where: {
        deletadoEm: null,
        tipo: { in: ["INSTALACAO", "ENTREGA", "MEDICAO_VIDROS"] },
        status: { in: ["AGENDADO", "CONFIRMADO", "REMARCADO"] },
        inicio: { gte: limitesDoDia(hoje).inicio },
      },
      orderBy: { inicio: "asc" },
      take: 5,
      select: { id: true, tipo: true, inicio: true, cliente: { select: { nome: true } }, projeto: { select: { id: true, titulo: true } }, equipe: { select: { nome: true } } },
    }),
    prisma.chamado.count({ where: { deletadoEm: null, status: { in: [...STATUS_EM_ABERTO] } } }),
    prisma.chamado.count({ where: { deletadoEm: null, status: { in: [...STATUS_EM_ABERTO] }, classificacao: "EM_GARANTIA" } }),
  ]);

  const linhas = andamento.linhas;
  const porEtapa = TIPOS_DE_ETAPA.map((tipo) => ({ tipo, quantidade: linhas.filter((l) => l.etapaAtual?.tipo === tipo).length })).filter((e) => e.quantidade > 0);

  return {
    emAndamento: linhas.length,
    verdes: linhas.filter((l) => l.semaforo === "VERDE").length,
    amarelas: andamento.resumo.amarelas,
    vermelhas: andamento.resumo.vermelhas,
    semPrazo: andamento.resumo.semPrazo,
    porEtapa,
    // A lista já vem do mais urgente para o menos urgente.
    atrasadas: linhas
      .filter((l) => l.atrasadas > 0)
      .slice(0, 5)
      .map((l) => ({ id: l.id, titulo: l.titulo, clienteNome: l.clienteNome, etapaAtual: l.etapaAtual?.nome ?? null, etapasAtrasadas: l.atrasadas })),
    pontualidade: concluidas.pontualidade!,
    periodoDaPontualidade: { de, ate },
    proximasInstalacoes: instalacoes.map((e) => ({
      id: e.id,
      tipo: e.tipo,
      inicio: e.inicio.toISOString(),
      clienteNome: e.cliente?.nome ?? null,
      projetoId: e.projeto?.id ?? null,
      projetoTitulo: e.projeto?.titulo ?? null,
      equipeNome: e.equipe?.nome ?? null,
    })),
    chamadosEmAberto,
    chamadosEmAbertoEmGarantia: emGarantia,
  };
}
