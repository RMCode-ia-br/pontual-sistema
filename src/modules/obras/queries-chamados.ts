import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { STATUS_DE_CHAMADO, STATUS_EM_ABERTO, TIPOS_DE_PROBLEMA, type StatusDoChamado, type TipoDoProblema } from "@/lib/dominio/chamados";
import { somarDias } from "@/lib/dominio/calendario";
import type { Classificacao } from "@/lib/dominio/garantia";
import { dataLocalDoInstante } from "@/lib/formatadores";
import { termoDeBusca } from "@/lib/listas/parametros";

/** A lista calcula "dias em aberto" na consulta; o limite protege a tela. */
export const LIMITE_DE_CHAMADOS = 300;

export type SituacaoDosChamados = "abertos" | "resolvidos" | "todos";
export type FiltrosDeChamados = { situacao: SituacaoDosChamados; classificacao?: Classificacao; busca: string; clienteId?: string; projetoId?: string };

const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const ehId = (v: string | undefined) => (v && /^[\w-]{1,64}$/.test(v) ? v : undefined);

/** Tudo que vem da URL é dado não confiável: cada filtro é validado contra o que a lista aceita. */
export function lerFiltrosDeChamados(brutos: Record<string, string | string[] | undefined>): FiltrosDeChamados {
  const situacao = um(brutos.situacao);
  const classificacao = um(brutos.classificacao);
  return {
    situacao: situacao === "resolvidos" || situacao === "todos" ? situacao : "abertos",
    classificacao: classificacao === "EM_GARANTIA" || classificacao === "FORA_DA_GARANTIA" ? classificacao : undefined,
    busca: termoDeBusca(um(brutos.busca)),
    clienteId: ehId(um(brutos.cliente)),
    projetoId: ehId(um(brutos.projeto)),
  };
}

export type ChamadoDaLista = {
  id: string;
  numero: number;
  clienteId: string;
  clienteNome: string;
  projetoId: string | null;
  projetoTitulo: string | null;
  tipoProblema: TipoDoProblema;
  descricao: string;
  classificacao: Classificacao;
  cobrarVisita: boolean;
  valorCobradoCentavos: number | null;
  temCobranca: boolean;
  status: StatusDoChamado;
  abertoEm: string;
  resolvidoEm: string | null;
  /** Derivado: dias corridos desde a abertura (até a resolução, se já resolvido). */
  diasEmAberto: number;
};

function filtroDoBanco(f: FiltrosDeChamados): Prisma.ChamadoWhereInput {
  const busca = f.busca;
  const numero = /^#?\d{1,9}$/.test(busca) ? Number(busca.replace("#", "")) : null;
  return {
    deletadoEm: null,
    ...(f.situacao === "abertos" ? { status: { in: [...STATUS_EM_ABERTO] } } : f.situacao === "resolvidos" ? { status: { in: ["RESOLVIDO", "CANCELADO"] as StatusDoChamado[] } } : {}),
    ...(f.classificacao ? { classificacao: f.classificacao } : {}),
    ...(f.clienteId ? { clienteId: f.clienteId } : {}),
    ...(f.projetoId ? { projetoId: f.projetoId } : {}),
    ...(busca
      ? {
          OR: [
            ...(numero !== null ? [{ numero }] : []),
            { descricao: { contains: busca, mode: "insensitive" as const } },
            { cliente: { nome: { contains: busca, mode: "insensitive" as const } } },
            { projeto: { titulo: { contains: busca, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };
}

export async function listarChamados(filtros: FiltrosDeChamados, agora: Date = new Date()): Promise<{ linhas: ChamadoDaLista[]; truncado: boolean }> {
  const brutos = await prisma.chamado.findMany({
    where: filtroDoBanco(filtros),
    // Em aberto: o mais antigo primeiro (é o que mais espera). Encerrados: o mais recente primeiro.
    orderBy: filtros.situacao === "abertos" ? [{ abertoEm: "asc" }] : [{ abertoEm: "desc" }],
    take: LIMITE_DE_CHAMADOS,
    include: { cliente: { select: { nome: true } }, projeto: { select: { titulo: true } } },
  });
  const linhas = brutos.map((c) => paraLinha(c, agora));
  return { linhas, truncado: brutos.length >= LIMITE_DE_CHAMADOS };
}

type ChamadoDoBanco = Prisma.ChamadoGetPayload<{ include: { cliente: { select: { nome: true } }; projeto: { select: { titulo: true } } } }>;

function paraLinha(c: ChamadoDoBanco, agora: Date): ChamadoDaLista {
  const ate = c.resolvidoEm ? dataLocalDoInstante(c.resolvidoEm) : dataLocalDoInstante(agora);
  const de = dataLocalDoInstante(c.abertoEm);
  return {
    id: c.id,
    numero: c.numero,
    clienteId: c.clienteId,
    clienteNome: c.cliente.nome,
    projetoId: c.projetoId,
    projetoTitulo: c.projeto?.titulo ?? null,
    tipoProblema: c.tipoProblema,
    descricao: c.descricao,
    classificacao: c.classificacao,
    cobrarVisita: c.cobrarVisita,
    valorCobradoCentavos: c.valorCobradoCentavos,
    temCobranca: c.contaReceberId !== null,
    status: c.status,
    abertoEm: c.abertoEm.toISOString(),
    resolvidoEm: c.resolvidoEm?.toISOString() ?? null,
    diasEmAberto: Math.max(0, Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000)),
  };
}

export type ChamadoDetalhe = ChamadoDaLista & {
  motivoClassificacao: string | null;
  classificacaoSugerida: Classificacao;
  solucao: string | null;
  cliente: { id: string; nome: string; telefone: string | null; whatsapp: string | null };
  projeto: { id: string; codigo: string; titulo: string } | null;
  eventos: { id: string; inicio: string; status: string; equipeNome: string | null; responsavelNome: string | null }[];
  conta: { id: string; status: string; valorCentavos: number; vencimento: string | null } | null;
  /** Garantia de regulagem da obra, ao vivo (a classificação gravada é a da abertura). */
  garantia: { marcoConcluidoEm: string; garantiaAte: string; garantiaDias: number } | null;
};

export async function obterChamado(id: string, agora: Date = new Date()): Promise<ChamadoDetalhe | null> {
  const c = await prisma.chamado.findFirst({
    where: { id, deletadoEm: null },
    include: {
      cliente: { select: { id: true, nome: true, telefone: true, whatsapp: true } },
      projeto: { select: { id: true, codigo: true, titulo: true } },
      contaReceber: { select: { id: true, status: true, valorCentavos: true, vencimento: true } },
      eventos: { where: { deletadoEm: null }, orderBy: { inicio: "desc" }, select: { id: true, inicio: true, status: true, equipe: { select: { nome: true } }, responsavel: { select: { nome: true } } } },
    },
  });
  if (!c) return null;
  const [marco, cfg] = await Promise.all([
    c.projetoId ? prisma.etapaProjeto.findFirst({ where: { projetoId: c.projetoId, marcoGarantia: true, status: "CONCLUIDA", deletadoEm: null, fimReal: { not: null } }, orderBy: { fimReal: "desc" }, select: { fimReal: true } }) : null,
    prisma.configuracaoEmpresa.findUnique({ where: { id: "singleton" }, select: { garantiaRegulagemDias: true } }),
  ]);
  const base = paraLinha(c, agora);
  const marcoEm = marco?.fimReal ? marco.fimReal.toISOString().slice(0, 10) : null;
  const garantiaDias = cfg?.garantiaRegulagemDias ?? 90;
  return {
    ...base,
    motivoClassificacao: c.motivoClassificacao,
    classificacaoSugerida: c.classificacaoSugerida,
    solucao: c.solucao,
    cliente: c.cliente,
    projeto: c.projeto,
    eventos: c.eventos.map((e) => ({ id: e.id, inicio: e.inicio.toISOString(), status: e.status, equipeNome: e.equipe?.nome ?? null, responsavelNome: e.responsavel?.nome ?? null })),
    conta: c.contaReceber ? { id: c.contaReceber.id, status: c.contaReceber.status, valorCentavos: c.contaReceber.valorCentavos, vencimento: c.contaReceber.vencimento?.toISOString().slice(0, 10) ?? null } : null,
    garantia: marcoEm ? { marcoConcluidoEm: marcoEm, garantiaAte: somarDias(marcoEm, garantiaDias), garantiaDias } : null,
  };
}

export { STATUS_DE_CHAMADO, TIPOS_DE_PROBLEMA };
