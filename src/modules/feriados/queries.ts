import "server-only";

import { prisma } from "@/lib/db";

export type FeriadoLista = {
  id: string;
  data: Date;
  dataFim: Date | null;
  nome: string;
  tipo: "FERIADO" | "FERIAS_COLETIVA_FORNECEDORES" | "OUTRO";
  ativo: boolean;
};

/**
 * Itens que tocam o ano: começam nele OU são períodos (férias coletivas) que começaram antes e terminam nele
 * (ex.: 22/12/2030 a 05/01/2031 aparece em 2030 e em 2031).
 */
export function filtroDoAno(ano: number) {
  const inicio = new Date(Date.UTC(ano, 0, 1));
  const fim = new Date(Date.UTC(ano, 11, 31));
  return { data: { lte: fim }, OR: [{ data: { gte: inicio } }, { dataFim: { gte: inicio } }] };
}

export async function listarFeriados(ano: number): Promise<FeriadoLista[]> {
  return prisma.feriado.findMany({
    where: { deletadoEm: null, ...filtroDoAno(ano) },
    orderBy: [{ data: "asc" }, { nome: "asc" }],
    select: { id: true, data: true, dataFim: true, nome: true, tipo: true, ativo: true },
  });
}

export async function anosComFeriados(): Promise<number[]> {
  const linhas = await prisma.$queryRaw<{ ano: number }[]>`
    SELECT DISTINCT EXTRACT(YEAR FROM "data")::int AS ano FROM "Feriado" WHERE "deletadoEm" IS NULL ORDER BY ano`;
  return linhas.map((l) => l.ano);
}
