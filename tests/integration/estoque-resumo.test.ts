import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { criarClientePrisma } from "@/lib/db/criar-cliente";
import { resumoDeEstoque } from "@/modules/estoque/resumo";
import { carregarRelatorioDeEstoque } from "@/modules/relatorios/estoque";

import { comConexao } from "./banco-teste";

/**
 * Painel "Estoque e compras" e relatório de estoque (Fase 6, Bloco 7B). Os números são conferidos por DIFERENÇA contra o que já
 * existe no banco (há dados reais): só registros "Int Res" / INT-RES-* são criados e removidos.
 */
const PREFIXO = "Int Res";
const prisma = criarClientePrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL);
const dia = (d: string) => new Date(`${d}T00:00:00Z`);
const HOJE = "2026-11-20";
let numero = 960_000 + Math.floor(Math.random() * 30_000);
const proximoNumero = () => ++numero;
const periodo = { de: "2026-11-01", ate: "2026-11-30" };

async function limpar() {
  await comConexao(async (c) => {
    const compras = `SELECT id FROM "Compra" WHERE "fornecedorId" IN (SELECT id FROM "Fornecedor" WHERE "razaoSocial" LIKE '${PREFIXO}%')`;
    await c.query(`DELETE FROM "ItemRecebimento" WHERE "itemCompraId" IN (SELECT id FROM "ItemCompra" WHERE "compraId" IN (${compras}))`);
    await c.query(`DELETE FROM "RecebimentoCompra" WHERE "compraId" IN (${compras})`);
    await c.query(`DELETE FROM "ItemCompra" WHERE "compraId" IN (${compras})`);
    await c.query(`DELETE FROM "Compra" WHERE id IN (${compras})`);
    await c.query(`DELETE FROM "Retalho" WHERE "produtoId" IN (SELECT id FROM "Produto" WHERE codigo LIKE 'INT-RES-%')`);
    await c.query(`DELETE FROM "Produto" WHERE codigo LIKE 'INT-RES-%'`);
    await c.query(`DELETE FROM "Fornecedor" WHERE "razaoSocial" LIKE '${PREFIXO}%'`);
  });
}

const produto = (nome: string, extra: { saldo: string; minimo?: string; custo?: number | null; custoPorKg?: boolean }) =>
  prisma.produto.create({
    data: {
      codigo: `INT-RES-${randomUUID().slice(0, 8)}`,
      descricao: `${PREFIXO} ${nome}`,
      unidade: "UN",
      saldoCache: extra.saldo,
      estoqueMinimo: extra.minimo ?? null,
      custoUnitarioCentavos: extra.custo ?? null,
      custoPorKg: extra.custoPorKg ?? false,
    },
  });

beforeAll(limpar);
afterAll(async () => {
  await limpar();
  await prisma.$disconnect();
});

describe("resumo e relatório de estoque", () => {
  it("abaixo do mínimo só conta produto COM mínimo; valor ignora sem custo; perfil por kg sem custo é apontado", async () => {
    const antesResumo = await resumoDeEstoque(HOJE);
    const antesRel = await carregarRelatorioDeEstoque(periodo);

    const a = await produto("Abaixo", { saldo: "3", minimo: "10", custo: 1000 }); // abaixo; vale R$ 30,00
    await produto("Sem custo", { saldo: "4" }); // sem custo; sem mínimo: sem alerta
    await produto("Sem mínimo zerado", { saldo: "0", custo: 500 }); // sem mínimo: nunca alerta
    await produto("Perfil kg sem custo", { saldo: "0", custoPorKg: true });
    await prisma.retalho.create({ data: { produtoId: a.id, comprimentoMm: 1800, status: "DISPONIVEL" } });
    await prisma.retalho.create({ data: { produtoId: a.id, comprimentoMm: 900, status: "DESCARTADO" } });

    const resumo = await resumoDeEstoque(HOJE);
    expect(resumo.produtos - antesResumo.produtos).toBe(4);
    expect(resumo.abaixoDoMinimo - antesResumo.abaixoDoMinimo).toBe(1);
    expect(resumo.perfisSemCusto - antesResumo.perfisSemCusto).toBe(1);
    expect(resumo.retalhosDisponiveis - antesResumo.retalhosDisponiveis).toBe(1);

    const rel = await carregarRelatorioDeEstoque(periodo);
    expect(rel.posicao.valorCentavos - antesRel.posicao.valorCentavos).toBe(3000);
    expect(rel.posicao.semCusto - antesRel.posicao.semCusto).toBe(1);
    expect(rel.posicao.abaixoDoMinimo - antesRel.posicao.abaixoDoMinimo).toBe(1);
    const linha = rel.linhas.find((l) => l.id === a.id);
    expect(linha?.valorCentavos).toBe(3000);
    expect(linha?.abaixoDoMinimo).toBe(true);
    const semCusto = rel.linhas.find((l) => l.descricao === `${PREFIXO} Sem custo`);
    expect(semCusto?.valorCentavos).toBeNull(); // sem custo nunca vira zero
  });

  it("compras: aberta, rascunho e atrasada (previsão passada, derivada de hoje); recebido por fornecedor no período", async () => {
    const antes = await resumoDeEstoque(HOJE);
    const antesRel = await carregarRelatorioDeEstoque(periodo);
    const f = await prisma.fornecedor.create({ data: { razaoSocial: `${PREFIXO} Fornecedor` } });
    const base = { fornecedorId: f.id, tipo: "MATERIAL" as const, destino: "ESTOQUE" as const };
    await prisma.compra.create({ data: { ...base, numero: proximoNumero(), status: "RASCUNHO" } });
    const atrasada = await prisma.compra.create({ data: { ...base, numero: proximoNumero(), status: "PEDIDO", dataPedido: dia("2026-11-10"), previsaoEntrega: dia("2026-11-15") } });
    await prisma.compra.create({ data: { ...base, numero: proximoNumero(), status: "PEDIDO", dataPedido: dia("2026-11-10"), previsaoEntrega: dia("2026-11-25") } });
    await prisma.compra.create({ data: { ...base, numero: proximoNumero(), status: "CANCELADO" } });
    const p = await produto("Item comprado", { saldo: "0" });

    const item = await prisma.itemCompra.create({ data: { compraId: atrasada.id, produtoId: p.id, descricao: `${PREFIXO} item`, unidadeCompra: "UN", quantidade: "2", ordem: 1 } });
    const rec = await prisma.recebimentoCompra.create({ data: { compraId: atrasada.id, data: dia("2026-11-18") } });
    await prisma.itemRecebimento.create({ data: { recebimentoId: rec.id, itemCompraId: item.id, quantidadeCompra: "1", quantidadeEstoque: "1", valorCentavos: 4500, custoUnitarioCentavos: 4500 } });
    await prisma.itemRecebimento.create({ data: { recebimentoId: rec.id, itemCompraId: item.id, quantidadeCompra: "1", quantidadeEstoque: "1", valorCentavos: null, custoUnitarioCentavos: null } });

    const resumo = await resumoDeEstoque(HOJE);
    expect(resumo.comprasRascunho - antes.comprasRascunho).toBe(1);
    expect(resumo.comprasEmAberto - antes.comprasEmAberto).toBe(2); // cancelada e rascunho não são "em aberto"
    expect(resumo.comprasAtrasadas - antes.comprasAtrasadas).toBe(1); // só a de 15/11; a de 25/11 ainda não
    // Derivado de hoje: no dia 14 nenhuma das duas está atrasada.
    expect((await resumoDeEstoque("2026-11-14")).comprasAtrasadas - antes.comprasAtrasadas).toBe(0);

    const rel = await carregarRelatorioDeEstoque(periodo);
    const nosso = rel.fornecedores.find((x) => x.fornecedorId === f.id);
    expect(nosso).toMatchObject({ valorCentavos: 4500, itens: 2, semValor: 1 }); // item sem preço conta à parte, nunca como zero
    expect(rel.comprasNoPeriodo - antesRel.comprasNoPeriodo).toBe(1);
    // Fora do período não entra.
    const fora = await carregarRelatorioDeEstoque({ de: "2026-10-01", ate: "2026-10-31" });
    expect(fora.fornecedores.find((x) => x.fornecedorId === f.id)).toBeUndefined();
  });
});
