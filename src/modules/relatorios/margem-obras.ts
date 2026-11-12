import "server-only";

import { prisma } from "@/lib/db";
import { carregarCustoDaObra } from "@/modules/obras/queries-custo";

export type SituacaoDoRelatorio = "andamento" | "concluidas" | "todas";

export function lerFiltroDeMargem(brutos: Record<string, string | string[] | undefined>): { situacao: SituacaoDoRelatorio; busca: string | undefined } {
  const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const s = um(brutos.situacao);
  return { situacao: s === "concluidas" || s === "todas" ? s : "andamento", busca: (um(brutos.busca) ?? "").trim().slice(0, 80) || undefined };
}

export type LinhaDeMargem = {
  id: string;
  codigo: string;
  titulo: string;
  cliente: string;
  status: string;
  receitaDaMargemCentavos: number | null;
  repasseDeImpostoCentavos: number;
  custoConhecidoCentavos: number;
  /** null quando incompleta: "Incompleta", nunca zero. */
  margemCentavos: number | null;
  margemPb: number | null;
  incompleto: boolean;
  faltando: string[];
};

export type RelatorioDeMargem = {
  linhas: LinhaDeMargem[];
  /** Soma só das obras com margem COMPLETA (as incompletas ficam de fora da soma e são contadas à parte). */
  totalCompletoCentavos: number;
  receitaCompletaCentavos: number;
  completas: number;
  incompletas: number;
  truncado: boolean;
};

const LIMITE = 150;

/** Margem de cada obra (a mesma conta da aba "Custo e margem" da obra, uma obra por vez, com a origem de cada custo lá). */
export async function carregarMargemDasObras(f: { situacao: SituacaoDoRelatorio; busca: string | undefined }): Promise<RelatorioDeMargem> {
  const status = f.situacao === "andamento" ? ["APROVADO", "EM_EXECUCAO"] : f.situacao === "concluidas" ? ["CONCLUIDO"] : ["APROVADO", "EM_EXECUCAO", "CONCLUIDO"];
  const obras = await prisma.projeto.findMany({
    where: {
      deletadoEm: null,
      status: { in: status as ("APROVADO" | "EM_EXECUCAO" | "CONCLUIDO")[] },
      ...(f.busca ? { OR: [{ codigo: { contains: f.busca, mode: "insensitive" } }, { titulo: { contains: f.busca, mode: "insensitive" } }, { cliente: { nome: { contains: f.busca, mode: "insensitive" } } }] } : {}),
    },
    orderBy: [{ dataFechamento: "desc" }, { codigo: "desc" }],
    take: LIMITE + 1,
    select: { id: true, codigo: true, titulo: true, status: true, cliente: { select: { nome: true } } },
  });
  const linhas: LinhaDeMargem[] = [];
  for (const o of obras.slice(0, LIMITE)) {
    const c = (await carregarCustoDaObra(o.id)).resultado;
    linhas.push({
      id: o.id,
      codigo: o.codigo,
      titulo: o.titulo,
      cliente: o.cliente.nome,
      status: o.status,
      receitaDaMargemCentavos: c.receitaDaMargemCentavos,
      repasseDeImpostoCentavos: c.repasseDeImpostoCentavos,
      custoConhecidoCentavos: c.custoConhecidoCentavos,
      margemCentavos: c.margemCentavos,
      margemPb: c.margemPb,
      incompleto: c.incompleto,
      faltando: c.faltando,
    });
  }
  const completas = linhas.filter((l) => !l.incompleto);
  return {
    linhas,
    totalCompletoCentavos: completas.reduce((s, l) => s + (l.margemCentavos ?? 0), 0),
    receitaCompletaCentavos: completas.reduce((s, l) => s + (l.receitaDaMargemCentavos ?? 0), 0),
    completas: completas.length,
    incompletas: linhas.length - completas.length,
    truncado: obras.length > LIMITE,
  };
}
