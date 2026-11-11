import "server-only";

import { fromZonedTime } from "date-fns-tz";

import { prisma } from "@/lib/db";
import { FUSO_PADRAO, inputParaData } from "@/lib/formatadores";

import type { Prisma } from "../../generated/prisma/client";

export const POR_PAGINA = 25;
export const LIMITE_EXPORTACAO = 5000;

export type FiltrosAuditoria = {
  entidade?: string;
  acao?: string;
  usuarioId?: string;
  de?: string;
  ate?: string;
  pagina: number;
};

type Bruto = Record<string, string | string[] | undefined>;

const um = (v: string | string[] | undefined): string | undefined => {
  const valor = Array.isArray(v) ? v[0] : v;
  return valor && valor.trim() !== "" ? valor.trim().slice(0, 80) : undefined;
};

/** Lê e sanitiza os filtros vindos da URL (nunca confia no texto bruto). */
export function lerFiltrosAuditoria(bruto: Bruto): FiltrosAuditoria {
  const de = um(bruto.de);
  const ate = um(bruto.ate);
  const pagina = Number(um(bruto.pagina));
  return {
    entidade: um(bruto.entidade),
    acao: um(bruto.acao),
    usuarioId: um(bruto.usuarioId),
    de: de && inputParaData(de) ? de : undefined,
    ate: ate && inputParaData(ate) ? ate : undefined,
    pagina: Number.isInteger(pagina) && pagina >= 1 && pagina <= 100000 ? pagina : 1,
  };
}

function montarWhere(f: FiltrosAuditoria): Prisma.LogAuditoriaWhereInput {
  const criadoEm: { gte?: Date; lt?: Date } = {};
  // Dias inteiros no fuso de São Paulo: "até" inclui o dia todo.
  if (f.de) criadoEm.gte = fromZonedTime(`${f.de}T00:00:00`, FUSO_PADRAO);
  if (f.ate) {
    const fim = fromZonedTime(`${f.ate}T00:00:00`, FUSO_PADRAO);
    criadoEm.lt = new Date(fim.getTime() + 24 * 60 * 60 * 1000);
  }
  return {
    ...(f.entidade ? { entidade: f.entidade } : {}),
    ...(f.acao ? { acao: f.acao } : {}),
    ...(f.usuarioId ? { usuarioId: f.usuarioId } : {}),
    ...(criadoEm.gte || criadoEm.lt ? { criadoEm } : {}),
  };
}

export type LinhaAuditoria = {
  id: string;
  criadoEm: Date;
  usuarioNome: string | null;
  entidade: string;
  entidadeId: string;
  acao: string;
  antes: unknown;
  depois: unknown;
  ip: string | null;
};

export async function buscarAuditoria(f: FiltrosAuditoria): Promise<{ linhas: LinhaAuditoria[]; total: number }> {
  const where = montarWhere(f);
  const [linhas, total] = await Promise.all([
    prisma.logAuditoria.findMany({
      where,
      orderBy: [{ criadoEm: "desc" }, { id: "desc" }],
      skip: (f.pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
    }),
    prisma.logAuditoria.count({ where }),
  ]);
  return { linhas, total };
}

/**
 * Linhas dos filtros (sem paginar) para exportar, limitadas a LIMITE_EXPORTACAO. Busca uma a mais só para
 * saber se há mais do que o limite: o arquivo precisa AVISAR quando está incompleto (é um registro de auditoria).
 */
export async function buscarAuditoriaParaExportar(f: FiltrosAuditoria): Promise<{ linhas: LinhaAuditoria[]; truncado: boolean }> {
  const encontradas = await prisma.logAuditoria.findMany({
    where: montarWhere(f),
    orderBy: [{ criadoEm: "desc" }, { id: "desc" }],
    take: LIMITE_EXPORTACAO + 1,
  });
  const truncado = encontradas.length > LIMITE_EXPORTACAO;
  return { linhas: truncado ? encontradas.slice(0, LIMITE_EXPORTACAO) : encontradas, truncado };
}

export async function opcoesDeFiltro() {
  const [entidades, acoes, usuarios] = await Promise.all([
    prisma.logAuditoria.findMany({ distinct: ["entidade"], select: { entidade: true }, orderBy: { entidade: "asc" } }),
    prisma.logAuditoria.findMany({ distinct: ["acao"], select: { acao: true }, orderBy: { acao: "asc" } }),
    prisma.usuario.findMany({ where: { deletadoEm: null }, select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
  ]);
  return { entidades: entidades.map((e) => e.entidade), acoes: acoes.map((a) => a.acao), usuarios };
}
