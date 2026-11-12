import "server-only";

import { prisma } from "@/lib/db";

import { saldoDaSucata } from "./sucata-base";

export type ResumoDeEstoque = {
  comprasEmAberto: number;
  comprasRascunho: number;
  comprasAtrasadas: number;
  retalhosDisponiveis: number;
  sucataMilesimosKg: number;
  /** Produtos COM estoque mínimo definido e saldo abaixo dele (campo vazio = sem alerta, não entra). */
  abaixoDoMinimo: number;
  /** Perfis por kg ainda sem custo (falta preço do kg, peso por metro ou comprimento). */
  perfisSemCusto: number;
  /** Quantos produtos ativos existem (para o texto de estado vazio do painel). */
  produtos: number;
};

/**
 * Números do painel (seção "Estoque e compras"). Definições (mostradas na tela): compras em aberto = pedidos feitos e recebidos em
 * parte; atrasadas = em aberto com a previsão de entrega já passada (derivado de hoje); abaixo do mínimo só conta produto que
 * tem mínimo definido; sucata = kg registrados para vender.
 */
export async function resumoDeEstoque(hoje: string): Promise<ResumoDeEstoque> {
  const [emAberto, rascunho, atrasadas, retalhos, sucata, abaixo, perfis, produtos] = await Promise.all([
    prisma.compra.count({ where: { deletadoEm: null, status: { in: ["PEDIDO", "RECEBIDO_PARCIAL"] } } }),
    prisma.compra.count({ where: { deletadoEm: null, status: "RASCUNHO" } }),
    prisma.compra.count({ where: { deletadoEm: null, status: { in: ["PEDIDO", "RECEBIDO_PARCIAL"] }, previsaoEntrega: { lt: new Date(`${hoje}T00:00:00Z`) } } }),
    prisma.retalho.count({ where: { deletadoEm: null, status: "DISPONIVEL" } }),
    saldoDaSucata(prisma),
    prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM "Produto" WHERE "deletadoEm" IS NULL AND "ativo" AND "estoqueMinimo" IS NOT NULL AND "saldoCache" < "estoqueMinimo"`,
    prisma.produto.count({ where: { deletadoEm: null, ativo: true, custoPorKg: true, custoUnitarioCentavos: null } }),
    prisma.produto.count({ where: { deletadoEm: null, ativo: true } }),
  ]);
  return {
    comprasEmAberto: emAberto,
    comprasRascunho: rascunho,
    comprasAtrasadas: atrasadas,
    retalhosDisponiveis: retalhos,
    sucataMilesimosKg: sucata.pesoMilesimosKg,
    abaixoDoMinimo: abaixo[0]?.n ?? 0,
    perfisSemCusto: perfis,
    produtos,
  };
}
