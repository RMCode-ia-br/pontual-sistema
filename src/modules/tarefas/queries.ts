import "server-only";

import { prisma } from "@/lib/db";
import { hojeCalendario } from "@/lib/formatadores";

import { tarefaVencida, type FiltroStatus } from "./schemas";

export type TarefaLista = {
  id: string;
  titulo: string;
  descricao: string | null;
  vencimento: string | null;
  status: "ABERTA" | "CONCLUIDA" | "CANCELADA";
  responsavelId: string | null;
  responsavelNome: string | null;
  vencida: boolean;
};

export async function listarUsuariosAtivos() {
  return prisma.usuario.findMany({
    where: { ativo: true, deletadoEm: null },
    select: { id: true, nome: true },
    orderBy: { nome: "asc" },
  });
}

export async function listarTarefas(filtro: { status: FiltroStatus; responsavelId?: string }): Promise<TarefaLista[]> {
  const tarefas = await prisma.tarefa.findMany({
    where: {
      deletadoEm: null,
      ...(filtro.status === "abertas" ? { status: "ABERTA" } : filtro.status === "concluidas" ? { status: "CONCLUIDA" } : {}),
      ...(filtro.responsavelId ? { responsavelId: filtro.responsavelId } : {}),
    },
    // Abertas: vencimento mais próximo primeiro (sem data por último). Concluídas: mais recentes primeiro.
    orderBy:
      filtro.status === "concluidas"
        ? [{ concluidaEm: "desc" }]
        : [{ status: "asc" }, { vencimento: { sort: "asc", nulls: "last" } }, { criadoEm: "desc" }],
    take: 200,
  });

  const ids = Array.from(new Set(tarefas.map((t) => t.responsavelId).filter((id): id is string => !!id)));
  const usuarios = ids.length ? await prisma.usuario.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } }) : [];
  const nomes = new Map(usuarios.map((u) => [u.id, u.nome]));
  const hoje = hojeCalendario();

  return tarefas.map((t) => ({
    id: t.id,
    titulo: t.titulo,
    descricao: t.descricao,
    vencimento: t.vencimento?.toISOString() ?? null,
    status: t.status,
    responsavelId: t.responsavelId,
    responsavelNome: t.responsavelId ? (nomes.get(t.responsavelId) ?? null) : null,
    vencida: tarefaVencida(t.status, t.vencimento, hoje),
  }));
}

export type ResumoTarefas = { abertas: number; vencidas: number; minhasAbertas: number; concluidasNos7Dias: number };

/**
 * Números do painel. Definições (mostradas na tela):
 * - abertas: tarefas com status ABERTA;
 * - vencidas: abertas com vencimento ANTES de hoje (data de São Paulo);
 * - minhas: abertas cujo responsável é o usuário logado;
 * - concluídas nos 7 dias: concluídas (data/hora da conclusão) na última semana.
 */
export async function resumoDeTarefas(usuarioId: string): Promise<ResumoTarefas> {
  const hoje = hojeCalendario();
  const seteDiasAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const base = { deletadoEm: null };
  const [abertas, vencidas, minhasAbertas, concluidasNos7Dias] = await Promise.all([
    prisma.tarefa.count({ where: { ...base, status: "ABERTA" } }),
    prisma.tarefa.count({ where: { ...base, status: "ABERTA", vencimento: { lt: hoje } } }),
    prisma.tarefa.count({ where: { ...base, status: "ABERTA", responsavelId: usuarioId } }),
    prisma.tarefa.count({ where: { ...base, status: "CONCLUIDA", concluidaEm: { gte: seteDiasAtras } } }),
  ]);
  return { abertas, vencidas, minhasAbertas, concluidasNos7Dias };
}

export async function obterTarefa(id: string): Promise<TarefaLista | null> {
  const t = await prisma.tarefa.findFirst({ where: { id, deletadoEm: null } });
  if (!t) return null;
  const responsavel = t.responsavelId
    ? await prisma.usuario.findUnique({ where: { id: t.responsavelId }, select: { nome: true } })
    : null;
  return {
    id: t.id,
    titulo: t.titulo,
    descricao: t.descricao,
    vencimento: t.vencimento?.toISOString() ?? null,
    status: t.status,
    responsavelId: t.responsavelId,
    responsavelNome: responsavel?.nome ?? null,
    vencida: tarefaVencida(t.status, t.vencimento, hojeCalendario()),
  };
}
