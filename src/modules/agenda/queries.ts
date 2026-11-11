import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { horariosLivres, limitesDoDia, type ConfigExpediente, type EventoOcupando, type Intervalo, type PeriodoDoCalendario } from "@/lib/dominio/agenda";
import { formatInTimeZone } from "date-fns-tz";

import { dataLocalDoInstante, FUSO_PADRAO, inputParaData } from "@/lib/formatadores";
import { obterConfiguracao } from "@/modules/configuracoes/queries";

import { STATUS_EVENTO, TIPOS_EVENTO, type StatusEvento, type TipoEvento } from "./schemas";

export type FiltrosAgenda = { responsavelId?: string; equipeId?: string; tipo?: TipoEvento };

function um(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

export function lerFiltrosAgenda(brutos: Record<string, string | string[] | undefined>): FiltrosAgenda {
  const responsavel = um(brutos.responsavel);
  const equipe = um(brutos.equipe);
  const tipo = um(brutos.tipo);
  return {
    responsavelId: responsavel && /^[\w-]{1,64}$/.test(responsavel) ? responsavel : undefined,
    equipeId: equipe && /^[\w-]{1,64}$/.test(equipe) ? equipe : undefined,
    tipo: (TIPOS_EVENTO as readonly string[]).includes(tipo ?? "") ? (tipo as TipoEvento) : undefined,
  };
}

export type EventoDaAgenda = {
  id: string;
  tipo: TipoEvento;
  titulo: string | null;
  inicio: string;
  fim: string;
  status: StatusEvento;
  responsavelId: string | null;
  responsavelNome: string | null;
  equipeId: string | null;
  equipeNome: string | null;
  clienteId: string | null;
  clienteNome: string | null;
  projetoId: string | null;
  projetoCodigo: string | null;
  projetoTitulo: string | null;
  enderecoId: string | null;
  local: string | null;
  lembreteMin: number | null;
  observacoes: string | null;
  realizadoEm: string | null;
  atualizadoEm: string;
};

const selecao = {
  id: true,
  tipo: true,
  titulo: true,
  inicio: true,
  fim: true,
  status: true,
  responsavelId: true,
  equipeId: true,
  clienteId: true,
  projetoId: true,
  enderecoId: true,
  local: true,
  lembreteMin: true,
  observacoes: true,
  realizadoEm: true,
  atualizadoEm: true,
  responsavel: { select: { nome: true } },
  equipe: { select: { nome: true } },
  cliente: { select: { nome: true } },
  projeto: { select: { codigo: true, titulo: true } },
} satisfies Prisma.EventoAgendaSelect;

type Bruto = Prisma.EventoAgendaGetPayload<{ select: typeof selecao }>;

export function eventoParaAgenda(e: Bruto): EventoDaAgenda {
  return {
    id: e.id,
    tipo: e.tipo,
    titulo: e.titulo,
    inicio: e.inicio.toISOString(),
    fim: e.fim.toISOString(),
    status: e.status,
    responsavelId: e.responsavelId,
    responsavelNome: e.responsavel?.nome ?? null,
    equipeId: e.equipeId,
    equipeNome: e.equipe?.nome ?? null,
    clienteId: e.clienteId,
    clienteNome: e.cliente?.nome ?? null,
    projetoId: e.projetoId,
    projetoCodigo: e.projeto?.codigo ?? null,
    projetoTitulo: e.projeto?.titulo ?? null,
    enderecoId: e.enderecoId,
    local: e.local,
    lembreteMin: e.lembreteMin,
    observacoes: e.observacoes,
    realizadoEm: e.realizadoEm?.toISOString() ?? null,
    atualizadoEm: e.atualizadoEm.toISOString(),
  };
}

const LIMITE_EVENTOS = 1000;

/** Compromissos que tocam o período (um evento que começa antes e termina dentro também entra). */
export async function listarEventos(periodo: Intervalo, filtros: FiltrosAgenda = {}): Promise<EventoDaAgenda[]> {
  const eventos = await prisma.eventoAgenda.findMany({
    where: {
      deletadoEm: null,
      inicio: { lt: periodo.fim },
      fim: { gt: periodo.inicio },
      ...(filtros.responsavelId ? { responsavelId: filtros.responsavelId } : {}),
      ...(filtros.equipeId ? { equipeId: filtros.equipeId } : {}),
      ...(filtros.tipo ? { tipo: filtros.tipo } : {}),
    },
    orderBy: [{ inicio: "asc" }, { id: "asc" }],
    take: LIMITE_EVENTOS,
    select: selecao,
  });
  return eventos.map(eventoParaAgenda);
}

export async function obterEvento(id: string): Promise<EventoDaAgenda | null> {
  const e = await prisma.eventoAgenda.findFirst({ where: { id, deletadoEm: null }, select: selecao });
  return e ? eventoParaAgenda(e) : null;
}

/** Eventos que ocupam o responsável ou a equipe dentro de um intervalo (base da detecção de conflito). */
export async function eventosOcupando(
  intervalo: Intervalo,
  quem: { responsavelId?: string | null; equipeId?: string | null },
  db: Pick<typeof prisma, "eventoAgenda"> = prisma,
): Promise<(EventoOcupando & { titulo: string | null; tipo: TipoEvento; clienteNome: string | null })[]> {
  const donos: Prisma.EventoAgendaWhereInput[] = [];
  if (quem.responsavelId) donos.push({ responsavelId: quem.responsavelId });
  if (quem.equipeId) donos.push({ equipeId: quem.equipeId });
  if (donos.length === 0) return [];
  const eventos = await db.eventoAgenda.findMany({
    where: { deletadoEm: null, inicio: { lt: intervalo.fim }, fim: { gt: intervalo.inicio }, OR: donos },
    select: { id: true, inicio: true, fim: true, responsavelId: true, equipeId: true, status: true, titulo: true, tipo: true, cliente: { select: { nome: true } } },
    take: 200,
  });
  return eventos.map((e) => ({ id: e.id, inicio: e.inicio, fim: e.fim, responsavelId: e.responsavelId, equipeId: e.equipeId, status: e.status, titulo: e.titulo, tipo: e.tipo, clienteNome: e.cliente?.nome ?? null }));
}

/** Feriados e férias coletivas que tocam um intervalo de datas de calendário (faixas da Agenda e avisos). */
export async function periodosDoCalendario(deDia: string, ateDia: string): Promise<PeriodoDoCalendario[]> {
  const de = inputParaData(deDia);
  const ate = inputParaData(ateDia);
  if (!de || !ate) return [];
  const linhas = await prisma.feriado.findMany({
    where: { deletadoEm: null, ativo: true, data: { lte: ate }, OR: [{ dataFim: null, data: { gte: de } }, { dataFim: { gte: de } }] },
    orderBy: { data: "asc" },
    select: { data: true, dataFim: true, tipo: true, nome: true },
  });
  return linhas.map((l) => ({ data: l.data, dataFim: l.dataFim, tipo: l.tipo, nome: l.nome }));
}

export async function obterExpediente(): Promise<ConfigExpediente & { visitaDuracaoMin: number }> {
  const c = await obterConfiguracao();
  return {
    horarioSemanaInicio: c?.horarioSemanaInicio ?? null,
    horarioSemanaFim: c?.horarioSemanaFim ?? null,
    horarioSabadoInicio: c?.horarioSabadoInicio ?? null,
    horarioSabadoFim: c?.horarioSabadoFim ?? null,
    visitaDuracaoMin: c?.visitaDuracaoMin ?? 60,
  };
}

/** Horários livres de um dia ("aaaa-mm-dd") para o responsável/equipe, dentro do expediente e fora de feriados. */
export async function horariosLivresDoDia(entrada: { data: string; duracaoMin: number; responsavelId?: string | null; equipeId?: string | null }): Promise<Date[]> {
  if (!inputParaData(entrada.data)) return [];
  const [expediente, periodos] = await Promise.all([obterExpediente(), periodosDoCalendario(entrada.data, entrada.data)]);
  // Feriado de verdade não recebe sugestão de horário (o gestor ainda pode agendar à mão, com aviso).
  if (periodos.some((p) => p.tipo === "FERIADO")) return [];
  const ocupados = await eventosOcupando(limitesDoDia(entrada.data), { responsavelId: entrada.responsavelId, equipeId: entrada.equipeId });
  return horariosLivres({ data: entrada.data, duracaoMin: entrada.duracaoMin, cfg: expediente, ocupados: ocupados.filter((o) => o.status !== "CANCELADO" && o.status !== "NAO_COMPARECEU"), agora: new Date() });
}

export type FeedDaAgenda = { id: string; nome: string | null; criadoEm: string; ultimoAcessoEm: string | null };

/** Links assinados ativos do usuário (o token em si nunca é guardado nem mostrado de novo). */
export async function listarFeedsDoUsuario(usuarioId: string): Promise<FeedDaAgenda[]> {
  const feeds = await prisma.feedAgenda.findMany({ where: { usuarioId, revogadoEm: null, deletadoEm: null }, orderBy: { criadoEm: "desc" }, select: { id: true, nome: true, criadoEm: true, ultimoAcessoEm: true } });
  return feeds.map((f) => ({ id: f.id, nome: f.nome, criadoEm: f.criadoEm.toISOString(), ultimoAcessoEm: f.ultimoAcessoEm?.toISOString() ?? null }));
}

/** Dia local (aaaa-mm-dd) do início do evento: onde ele aparece na grade. */
export function diaDoEvento(e: Pick<EventoDaAgenda, "inicio">): string {
  return dataLocalDoInstante(e.inicio);
}

export { STATUS_EVENTO };

/** Compromissos de um projeto (visitas, medições, instalações...), os mais recentes primeiro. */
export async function listarEventosDoProjeto(projetoId: string): Promise<EventoDaAgenda[]> {
  const eventos = await prisma.eventoAgenda.findMany({ where: { projetoId, deletadoEm: null }, orderBy: { inicio: "desc" }, take: 100, select: selecao });
  return eventos.map(eventoParaAgenda);
}

/** Variáveis dos modelos de WhatsApp de visita (`{{dataVisita}}`, `{{horaVisita}}`, `{{enderecoObra}}`). */
export function variaveisDaVisita(e: Pick<EventoDaAgenda, "inicio" | "local">): Record<string, string | undefined> {
  const dia = dataLocalDoInstante(e.inicio).split("-").reverse().join("/");
  return { dataVisita: dia, horaVisita: formatInTimeZone(e.inicio, FUSO_PADRAO, "HH:mm"), enderecoObra: e.local ?? undefined };
}

/** Próxima visita técnica em aberto do projeto (para as mensagens de confirmação e lembrete). */
export async function proximaVisitaDoProjeto(projetoId: string): Promise<EventoDaAgenda | null> {
  const e = await prisma.eventoAgenda.findFirst({
    where: { projetoId, tipo: "VISITA_TECNICA", deletadoEm: null, status: { in: ["AGENDADO", "CONFIRMADO", "REMARCADO"] }, fim: { gte: new Date() } },
    orderBy: { inicio: "asc" },
    select: selecao,
  });
  return e ? eventoParaAgenda(e) : null;
}
