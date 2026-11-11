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

export async function listarFeriados(ano: number): Promise<FeriadoLista[]> {
  return prisma.feriado.findMany({
    where: { deletadoEm: null, data: { gte: new Date(Date.UTC(ano, 0, 1)), lte: new Date(Date.UTC(ano, 11, 31)) } },
    orderBy: [{ data: "asc" }, { nome: "asc" }],
    select: { id: true, data: true, dataFim: true, nome: true, tipo: true, ativo: true },
  });
}

export async function anosComFeriados(): Promise<number[]> {
  const linhas = await prisma.$queryRaw<{ ano: number }[]>`
    SELECT DISTINCT EXTRACT(YEAR FROM "data")::int AS ano FROM "Feriado" WHERE "deletadoEm" IS NULL ORDER BY ano`;
  return linhas.map((l) => l.ano);
}
