import "server-only";

import { prisma } from "@/lib/db";

const selecaoParcelas = {
  where: { deletadoEm: null },
  orderBy: { ordem: "asc" as const },
  select: { id: true, ordem: true, descricao: true, percentualPb: true, gatilho: true, forma: true, diasApos: true, parcelasCartao: true },
};

export async function listarCondicoes(incluirInativas = false) {
  return prisma.condicaoPagamento.findMany({
    where: { deletadoEm: null, ...(incluirInativas ? {} : { ativo: true }) },
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
    select: { id: true, nome: true, descricao: true, textoLivre: true, ativo: true, parcelas: selecaoParcelas },
  });
}

export type CondicaoDaLista = Awaited<ReturnType<typeof listarCondicoes>>[number];

export async function obterCondicao(id: string) {
  return prisma.condicaoPagamento.findFirst({
    where: { id, deletadoEm: null },
    select: { id: true, nome: true, descricao: true, textoLivre: true, ativo: true, parcelas: selecaoParcelas },
  });
}
