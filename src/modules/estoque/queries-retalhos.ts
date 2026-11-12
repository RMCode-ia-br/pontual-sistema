import "server-only";

import { prisma } from "@/lib/db";

import { idsDeProdutosPorBusca } from "./queries";
import { saldoDaSucata } from "./sucata-base";

const comoTexto = (d: Date): string => d.toISOString().slice(0, 10);
const milesimos = (d: { toString(): string } | null): number | null => (d === null ? null : Math.round(Number(d.toString()) * 1000));

export type StatusDoFiltro = "DISPONIVEL" | "CONSUMIDO" | "DESCARTADO" | "todos";

export type RetalhoDaLista = {
  id: string;
  produtoId: string;
  produto: string;
  codigo: string;
  comprimentoMm: number;
  local: string | null;
  status: "DISPONIVEL" | "CONSUMIDO" | "DESCARTADO";
  criadoEm: string;
  origem: string | null;
  usadoEm: string | null;
  observacao: string | null;
};

export function lerFiltroDeRetalhos(brutos: Record<string, string | string[] | undefined>): { status: StatusDoFiltro; busca: string | undefined } {
  const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const status = um(brutos.status);
  const busca = (um(brutos.busca) ?? "").trim().slice(0, 80) || undefined;
  return { status: status === "CONSUMIDO" || status === "DESCARTADO" || status === "todos" ? status : "DISPONIVEL", busca };
}

export async function listarRetalhos(f: { status: StatusDoFiltro; busca: string | undefined }, limite = 200): Promise<{ linhas: RetalhoDaLista[]; temMais: boolean }> {
  const ids = f.busca ? await idsDeProdutosPorBusca(f.busca) : null;
  if (ids && ids.length === 0) return { linhas: [], temMais: false };
  const rows = await prisma.retalho.findMany({
    where: { deletadoEm: null, ...(f.status === "todos" ? {} : { status: f.status }), ...(ids ? { produtoId: { in: ids } } : {}) },
    orderBy: [{ produto: { descricao: "asc" } }, { comprimentoMm: "desc" }, { id: "asc" }],
    take: limite + 1,
    select: {
      id: true,
      produtoId: true,
      comprimentoMm: true,
      local: true,
      status: true,
      criadoEm: true,
      consumidoEm: true,
      observacao: true,
      produto: { select: { descricao: true, codigo: true } },
      origemProjeto: { select: { codigo: true, titulo: true } },
      consumidoProjeto: { select: { codigo: true, titulo: true } },
    },
  });
  return {
    temMais: rows.length > limite,
    linhas: rows.slice(0, limite).map((r) => ({
      id: r.id,
      produtoId: r.produtoId,
      produto: r.produto.descricao,
      codigo: r.produto.codigo,
      comprimentoMm: r.comprimentoMm,
      local: r.local,
      status: r.status,
      criadoEm: comoTexto(r.criadoEm),
      origem: r.origemProjeto ? `${r.origemProjeto.codigo} · ${r.origemProjeto.titulo}` : null,
      usadoEm: r.consumidoProjeto ? `${r.consumidoProjeto.codigo} · ${r.consumidoProjeto.titulo}${r.consumidoEm ? ` (${comoTexto(r.consumidoEm)})` : ""}` : null,
      observacao: r.observacao,
    })),
  };
}

export async function contagemDeRetalhos(): Promise<Record<"DISPONIVEL" | "CONSUMIDO" | "DESCARTADO", number>> {
  const g = await prisma.retalho.groupBy({ by: ["status"], where: { deletadoEm: null }, _count: { _all: true } });
  const base = { DISPONIVEL: 0, CONSUMIDO: 0, DESCARTADO: 0 };
  for (const x of g) base[x.status] = x._count._all;
  return base;
}

export type MovimentoDeSucataDaLista = { id: string; data: string; tipo: "GERACAO" | "VENDA" | "AJUSTE"; pesoMilesimosKg: number | null; comprimentoMm: number | null; valorCentavos: number | null; observacao: string | null; produto: string | null; obra: string | null };

export async function resumoDaSucata(limite = 20) {
  const [saldo, movimentos] = await Promise.all([
    saldoDaSucata(prisma),
    prisma.movimentoSucata.findMany({
      where: { deletadoEm: null },
      orderBy: [{ data: "desc" }, { criadoEm: "desc" }],
      take: limite,
      select: { id: true, data: true, tipo: true, pesoKg: true, comprimentoMm: true, valorCentavos: true, observacao: true, produto: { select: { descricao: true } }, projeto: { select: { codigo: true } } },
    }),
  ]);
  return {
    saldo,
    movimentos: movimentos.map<MovimentoDeSucataDaLista>((m) => ({
      id: m.id,
      data: comoTexto(m.data),
      tipo: m.tipo,
      pesoMilesimosKg: milesimos(m.pesoKg),
      comprimentoMm: m.comprimentoMm,
      valorCentavos: m.valorCentavos,
      observacao: m.observacao,
      produto: m.produto?.descricao ?? null,
      obra: m.projeto?.codigo ?? null,
    })),
  };
}
