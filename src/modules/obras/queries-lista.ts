import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { etapaAtual, TIPOS_DE_ETAPA, type TipoDeEtapa } from "@/lib/dominio/etapas";
import { resumirPontualidade, type AvaliacaoDeObra, type ResumoDePontualidade } from "@/lib/dominio/pontualidade";
import type { StatusDeEtapa } from "@/lib/dominio/prazo-obra";
import { etapaAtrasada, semaforoDaObra, type Semaforo } from "@/lib/dominio/semaforo";
import { dataLocalDoInstante, inputParaData } from "@/lib/formatadores";
import { termoDeBusca } from "@/lib/listas/parametros";
import type { TipoEvento } from "@/modules/agenda/schemas";

import { carregarPeriodosDeFeriado } from "./servico";
import { visaoDoPrazo, type PrazoDaObraVisao } from "./visao";

/** A lista calcula em memória (prazo, semáforo e pontualidade são derivados): o limite protege a consulta. */
export const LIMITE_DE_OBRAS = 300;

export type SituacaoDaLista = "andamento" | "concluidas";
export const SEMAFOROS: readonly Semaforo[] = ["VERDE", "AMARELO", "VERMELHO"];

export type FiltrosDeObras = {
  situacao: SituacaoDaLista;
  busca: string;
  etapa?: TipoDeEtapa;
  semaforo?: Semaforo;
  responsavelId?: string;
  equipeId?: string;
  /** Só nas concluídas: período da conclusão (aaaa-mm-dd). */
  de?: string;
  ate?: string;
};

const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const ehId = (v: string | undefined) => (v && /^[\w-]{1,64}$/.test(v) ? v : undefined);
const ehDia = (v: string | undefined) => (v && inputParaData(v) ? v : undefined);

/** Tudo que vem da URL é dado não confiável: cada filtro é validado contra o que a lista aceita. */
export function lerFiltrosDeObras(brutos: Record<string, string | string[] | undefined>): FiltrosDeObras {
  const etapa = um(brutos.etapa);
  const semaforo = um(brutos.semaforo);
  return {
    situacao: um(brutos.situacao) === "concluidas" ? "concluidas" : "andamento",
    busca: termoDeBusca(um(brutos.busca)),
    etapa: (TIPOS_DE_ETAPA as readonly string[]).includes(etapa ?? "") ? (etapa as TipoDeEtapa) : undefined,
    semaforo: (SEMAFOROS as readonly string[]).includes(semaforo ?? "") ? (semaforo as Semaforo) : undefined,
    responsavelId: ehId(um(brutos.responsavel)),
    equipeId: ehId(um(brutos.equipe)),
    de: ehDia(um(brutos.de)),
    ate: ehDia(um(brutos.ate)),
  };
}

export type ObraDaLista = {
  id: string;
  codigo: string;
  titulo: string;
  clienteNome: string;
  responsavelNome: string | null;
  status: string;
  valorFechadoCentavos: number | null;
  etapaAtual: { id: string; tipo: TipoDeEtapa; nome: string; status: StatusDeEtapa; fimPrevisto: string | null } | null;
  etapasConcluidas: number;
  etapasTotal: number;
  atrasadas: number;
  bloqueada: boolean;
  emPausa: boolean;
  /** Equipes das etapas ainda abertas. */
  equipes: string[];
  semaforo: Semaforo | null;
  prazo: PrazoDaObraVisao;
  dataConclusao: string | null;
};

export type ResumoDaLista = { total: number; vermelhas: number; amarelas: number; semPrazo: number };

const GRAVIDADE: Record<Semaforo, number> = { VERDE: 0, AMARELO: 1, VERMELHO: 2 };
const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const encerrada = (s: StatusDeEtapa) => s === "CONCLUIDA" || s === "DISPENSADA";

export async function listarObras(filtros: FiltrosDeObras, agora: Date = new Date()): Promise<{ linhas: ObraDaLista[]; truncado: boolean; resumo: ResumoDaLista; pontualidade: ResumoDePontualidade | null }> {
  const andamento = filtros.situacao === "andamento";
  const de = filtros.de ? inputParaData(filtros.de) : null;
  const ate = filtros.ate ? inputParaData(filtros.ate) : null;
  const busca = filtros.busca;

  const where: Prisma.ProjetoWhereInput = {
    deletadoEm: null,
    status: andamento ? { in: ["APROVADO", "EM_EXECUCAO"] } : "CONCLUIDO",
    ...(filtros.responsavelId ? { responsavelId: filtros.responsavelId } : {}),
    ...(!andamento && (de || ate) ? { dataConclusao: { ...(de ? { gte: de } : {}), ...(ate ? { lte: ate } : {}) } } : {}),
    ...(busca ? { OR: [{ titulo: { contains: busca, mode: "insensitive" } }, { codigo: { contains: busca, mode: "insensitive" } }, { cliente: { nome: { contains: busca, mode: "insensitive" } } }] } : {}),
  };

  const [projetos, periodos, cfg] = await Promise.all([
    prisma.projeto.findMany({
      where,
      orderBy: andamento ? [{ prazoFinalPrometido: { sort: "asc", nulls: "last" } }, { criadoEm: "desc" }] : [{ dataConclusao: "desc" }],
      take: LIMITE_DE_OBRAS,
      include: {
        cliente: { select: { nome: true } },
        responsavel: { select: { nome: true } },
        etapas: { where: { deletadoEm: null }, orderBy: { ordem: "asc" }, select: { id: true, tipo: true, nome: true, ordem: true, status: true, inicioPrevisto: true, fimPrevisto: true, equipeId: true, equipe: { select: { nome: true } } } },
        pausas: { where: { deletadoEm: null }, select: { inicio: true, fim: true, justificada: true } },
      },
    }),
    carregarPeriodosDeFeriado(prisma),
    prisma.configuracaoEmpresa.findUnique({ where: { id: "singleton" }, select: { diasAlertaPrazoAmarelo: true } }),
  ]);

  const hoje = dataLocalDoInstante(agora);
  const diasAlerta = cfg?.diasAlertaPrazoAmarelo ?? 3;

  let linhas: ObraDaLista[] = projetos.map((p) => {
    const prazo = visaoDoPrazo({
      projeto: {
        status: p.status,
        prazoModo: p.prazoModo,
        prazoDias: p.prazoDias,
        prazoMaterialDias: p.prazoMaterialDias,
        prazoExecucaoDias: p.prazoExecucaoDias,
        prazoVidrosDias: p.prazoVidrosDias,
        tipoDiasPrazo: p.tipoDiasPrazo,
        dataInicioPrazo: dia(p.dataInicioPrazo),
        dataConclusao: dia(p.dataConclusao),
      },
      etapas: p.etapas.map((e) => ({ status: e.status, fimPrevisto: dia(e.fimPrevisto) })),
      pausas: p.pausas.map((x) => ({ inicio: dia(x.inicio)!, fim: dia(x.fim), justificada: x.justificada })),
      periodos,
      hoje,
      diasAlerta,
    });
    const etapas = p.etapas.map((e) => ({ ...e, fimPrevisto: dia(e.fimPrevisto), inicioPrevisto: dia(e.inicioPrevisto) }));
    const atual = etapaAtual(etapas);
    const ativas = etapas.filter((e) => e.status !== "DISPENSADA");
    const abertas = etapas.filter((e) => !encerrada(e.status));
    return {
      id: p.id,
      codigo: p.codigo,
      titulo: p.titulo,
      clienteNome: p.cliente.nome,
      responsavelNome: p.responsavel?.nome ?? null,
      status: p.status,
      valorFechadoCentavos: p.valorFechadoCentavos,
      etapaAtual: atual ? { id: atual.id, tipo: atual.tipo, nome: atual.nome, status: atual.status, fimPrevisto: atual.fimPrevisto } : null,
      etapasConcluidas: ativas.filter((e) => e.status === "CONCLUIDA").length,
      etapasTotal: ativas.length,
      atrasadas: etapas.filter((e) => etapaAtrasada(e, hoje)).length,
      bloqueada: etapas.some((e) => e.status === "BLOQUEADA"),
      emPausa: p.pausas.some((x) => x.fim === null),
      equipes: [...new Set(abertas.flatMap((e) => (e.equipe ? [e.equipe.nome] : [])))],
      semaforo: semaforoDaObra(etapas, prazo.comPausas, p.status === "CONCLUIDO", hoje, diasAlerta),
      prazo,
      dataConclusao: dia(p.dataConclusao),
    };
  });

  // Filtros que dependem do que foi calculado.
  const equipeEscolhida = filtros.equipeId;
  if (filtros.etapa) linhas = linhas.filter((l) => l.etapaAtual?.tipo === filtros.etapa);
  if (filtros.semaforo) linhas = linhas.filter((l) => l.semaforo === filtros.semaforo);
  if (equipeEscolhida) {
    const ids = new Map(projetos.map((p) => [p.id, p.etapas.filter((e) => !encerrada(e.status)).map((e) => e.equipeId)]));
    linhas = linhas.filter((l) => ids.get(l.id)?.includes(equipeEscolhida));
  }

  // Em andamento: o mais urgente primeiro (vermelho, amarelo, verde), depois o prazo mais próximo.
  if (andamento) {
    linhas.sort((a, b) => {
      const g = (b.semaforo ? GRAVIDADE[b.semaforo] : -1) - (a.semaforo ? GRAVIDADE[a.semaforo] : -1);
      if (g !== 0) return g;
      const pa = a.prazo.comPausas ?? "9999-12-31";
      const pb = b.prazo.comPausas ?? "9999-12-31";
      return pa < pb ? -1 : pa > pb ? 1 : 0;
    });
  }

  const resumo: ResumoDaLista = {
    total: linhas.length,
    vermelhas: linhas.filter((l) => l.semaforo === "VERMELHO").length,
    amarelas: linhas.filter((l) => l.semaforo === "AMARELO").length,
    semPrazo: linhas.filter((l) => !l.prazo.definido).length,
  };
  const pontualidade = andamento ? null : resumirPontualidade(linhas.map((l): AvaliacaoDeObra => l.prazo.pontualidade ?? { avaliavel: false }));
  return { linhas, truncado: projetos.length >= LIMITE_DE_OBRAS, resumo, pontualidade };
}

// ---------------------------------------------------------------------------------------------------------
// Instalações previstas, ainda sem agendamento (calendário de instalação)
// ---------------------------------------------------------------------------------------------------------

/** Etapa que se cumpre com um compromisso na agenda → tipo do compromisso. */
export const EVENTO_DA_ETAPA: Partial<Record<TipoDeEtapa, TipoEvento>> = {
  INSTALACAO_ESQUADRIAS: "INSTALACAO",
  INSTALACAO_VIDROS: "INSTALACAO",
  MEDICAO_VIDROS: "MEDICAO_VIDROS",
  ENTREGA: "ENTREGA",
};

export type EtapaSemAgendamento = {
  etapaId: string;
  etapaNome: string;
  etapaTipo: TipoDeEtapa;
  eventoTipo: TipoEvento;
  status: StatusDeEtapa;
  projetoId: string;
  projetoCodigo: string;
  projetoTitulo: string;
  clienteNome: string;
  inicioPrevisto: string | null;
  fimPrevisto: string | null;
  equipeId: string | null;
  equipeNome: string | null;
  atrasada: boolean;
};

const LIMITE_SEM_AGENDAMENTO = 100;

/** Etapas abertas de obras em andamento (instalação, medição dos vidros e entrega) que ainda não têm compromisso na agenda. */
export async function listarEtapasSemAgendamento(agora: Date = new Date()): Promise<EtapaSemAgendamento[]> {
  const hoje = dataLocalDoInstante(agora);
  const etapas = await prisma.etapaProjeto.findMany({
    where: {
      deletadoEm: null,
      tipo: { in: Object.keys(EVENTO_DA_ETAPA) as TipoDeEtapa[] },
      status: { in: ["PENDENTE", "EM_ANDAMENTO", "BLOQUEADA"] },
      projeto: { deletadoEm: null, status: { in: ["APROVADO", "EM_EXECUCAO"] } },
      // Compromisso vivo = agendado, confirmado ou já realizado; cancelado ou remarcado não conta.
      eventos: { none: { deletadoEm: null, status: { in: ["AGENDADO", "CONFIRMADO", "REALIZADO"] } } },
    },
    orderBy: [{ inicioPrevisto: { sort: "asc", nulls: "last" } }, { ordem: "asc" }],
    take: LIMITE_SEM_AGENDAMENTO,
    select: {
      id: true,
      nome: true,
      tipo: true,
      status: true,
      inicioPrevisto: true,
      fimPrevisto: true,
      equipeId: true,
      equipe: { select: { nome: true } },
      projeto: { select: { id: true, codigo: true, titulo: true, cliente: { select: { nome: true } } } },
    },
  });
  return etapas.map((e) => ({
    etapaId: e.id,
    etapaNome: e.nome,
    etapaTipo: e.tipo,
    eventoTipo: EVENTO_DA_ETAPA[e.tipo]!,
    status: e.status,
    projetoId: e.projeto.id,
    projetoCodigo: e.projeto.codigo,
    projetoTitulo: e.projeto.titulo,
    clienteNome: e.projeto.cliente.nome,
    inicioPrevisto: dia(e.inicioPrevisto),
    fimPrevisto: dia(e.fimPrevisto),
    equipeId: e.equipeId,
    equipeNome: e.equipe?.nome ?? null,
    atrasada: etapaAtrasada({ status: e.status, fimPrevisto: dia(e.fimPrevisto) }, hoje),
  }));
}
