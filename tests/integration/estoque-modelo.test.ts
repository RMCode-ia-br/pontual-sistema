import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { criarClientePrisma } from "@/lib/db/criar-cliente";

import { comConexao } from "./banco-teste";

/**
 * Garantias do banco da Fase 6 (modelo de estoque e compras): o que vale MESMO se o código falhar. Só toca registros "Int Mod".
 */
const PREFIXO = "Int Mod";
const prisma = criarClientePrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL);

let fornecedorId: string;
let acabamentoId: string;
let produtoId: string;
let numero = 900_000 + Math.floor(Math.random() * 50_000);
const proximoNumero = () => ++numero;
const dia = (d: string) => new Date(`${d}T00:00:00Z`);

async function limpar() {
  await comConexao(async (c) => {
    const compras = `SELECT id FROM "Compra" WHERE "fornecedorId" IN (SELECT id FROM "Fornecedor" WHERE "razaoSocial" LIKE '${PREFIXO}%')`;
    await c.query(`DELETE FROM "ItemRecebimento" WHERE "itemCompraId" IN (SELECT id FROM "ItemCompra" WHERE "compraId" IN (${compras}))`);
    await c.query(`DELETE FROM "RecebimentoCompra" WHERE "compraId" IN (${compras})`);
    await c.query(`DELETE FROM "ItemCompra" WHERE "compraId" IN (${compras})`);
    await c.query(`DELETE FROM "Compra" WHERE id IN (${compras})`);
    await c.query(`UPDATE "MovimentoEstoque" SET "estornoDeId" = NULL WHERE "produtoId" IN (SELECT id FROM "Produto" WHERE codigo LIKE 'INT-MOD-%')`);
    await c.query(`DELETE FROM "MovimentoEstoque" WHERE "produtoId" IN (SELECT id FROM "Produto" WHERE codigo LIKE 'INT-MOD-%')`);
    await c.query(`DELETE FROM "Retalho" WHERE "produtoId" IN (SELECT id FROM "Produto" WHERE codigo LIKE 'INT-MOD-%')`);
    await c.query(`DELETE FROM "HistoricoPrecoKg" WHERE "precoKgId" IN (SELECT id FROM "PrecoKgAluminio" WHERE "acabamentoId" IN (SELECT id FROM "AcabamentoAluminio" WHERE nome LIKE '${PREFIXO}%'))`);
    await c.query(`DELETE FROM "PrecoKgAluminio" WHERE "acabamentoId" IN (SELECT id FROM "AcabamentoAluminio" WHERE nome LIKE '${PREFIXO}%')`);
    await c.query(`DELETE FROM "Produto" WHERE codigo LIKE 'INT-MOD-%'`);
    await c.query(`DELETE FROM "AcabamentoAluminio" WHERE nome LIKE '${PREFIXO}%'`);
    await c.query(`DELETE FROM "Fornecedor" WHERE "razaoSocial" LIKE '${PREFIXO}%'`);
  });
}

beforeAll(async () => {
  await limpar();
  fornecedorId = (await prisma.fornecedor.create({ data: { razaoSocial: `${PREFIXO} Fornecedor` } })).id;
  acabamentoId = (await prisma.acabamentoAluminio.create({ data: { nome: `${PREFIXO} Acabamento` } })).id;
  produtoId = (await prisma.produto.create({ data: { codigo: `INT-MOD-${randomUUID().slice(0, 6)}`, descricao: `${PREFIXO} Perfil`, unidade: "BARRA", custoPorKg: true } })).id;
});

afterAll(async () => {
  await limpar();
  await prisma.$disconnect();
});

describe("modelo de estoque e compras: o banco garante as regras", () => {
  it("produto nasce com saldo zero e guarda quantidades com 3 casas sem erro de ponto flutuante", async () => {
    const p = await prisma.produto.findUniqueOrThrow({ where: { id: produtoId } });
    expect(p.saldoCache.toString()).toBe("0");
    expect(p.custoPorKg).toBe(true);
    const m = await prisma.movimentoEstoque.create({ data: { produtoId, tipo: "ENTRADA_COMPRA", quantidade: "1234.567", data: dia("2026-11-12"), custoUnitarioCentavos: null } });
    expect(m.quantidade.toString()).toBe("1234.567");
    expect(m.custoUnitarioCentavos).toBeNull(); // "sem custo" é null, não zero
  });

  it("movimento de estoque nunca tem quantidade zero", async () => {
    await expect(prisma.movimentoEstoque.create({ data: { produtoId, tipo: "AJUSTE", quantidade: 0, data: dia("2026-11-12") } })).rejects.toThrow();
  });

  it("um movimento só pode ser estornado uma vez", async () => {
    const original = await prisma.movimentoEstoque.create({ data: { produtoId, tipo: "SAIDA_OBRA", quantidade: -2, data: dia("2026-11-12") } });
    await prisma.movimentoEstoque.create({ data: { produtoId, tipo: "AJUSTE", quantidade: 2, data: dia("2026-11-12"), estornoDeId: original.id } });
    await expect(prisma.movimentoEstoque.create({ data: { produtoId, tipo: "AJUSTE", quantidade: 2, data: dia("2026-11-12"), estornoDeId: original.id } })).rejects.toThrow();
  });

  it("compra com destino OBRA exige o projeto; para o estoque não", async () => {
    await expect(prisma.compra.create({ data: { numero: proximoNumero(), fornecedorId, destino: "OBRA" } })).rejects.toThrow();
    const ok = await prisma.compra.create({ data: { numero: proximoNumero(), fornecedorId, destino: "ESTOQUE" } });
    expect(ok.status).toBe("RASCUNHO");
  });

  it("o número da compra é único", async () => {
    const n = proximoNumero();
    await prisma.compra.create({ data: { numero: n, fornecedorId } });
    await expect(prisma.compra.create({ data: { numero: n, fornecedorId } })).rejects.toThrow();
  });

  it("item de compra: quantidade positiva e produto OU descrição", async () => {
    const compra = await prisma.compra.create({ data: { numero: proximoNumero(), fornecedorId, tipo: "VIDRO" } });
    await expect(prisma.itemCompra.create({ data: { compraId: compra.id, ordem: 1, produtoId, quantidade: 0 } })).rejects.toThrow();
    await expect(prisma.itemCompra.create({ data: { compraId: compra.id, ordem: 1, quantidade: 1 } })).rejects.toThrow();
    await expect(prisma.itemCompra.create({ data: { compraId: compra.id, ordem: 1, descricao: "   ", quantidade: 1 } })).rejects.toThrow();
    const item = await prisma.itemCompra.create({ data: { compraId: compra.id, ordem: 1, descricao: "Vidro 8 mm incolor", larguraMm: 1180, alturaMm: 980, espessuraMm: 8, quantidade: 2 } });
    expect(item.precoUnitarioCentavos).toBeNull(); // sem preço = "sem custo"
    expect(item.quantidadeRecebida.toString()).toBe("0");
    await expect(prisma.itemCompra.create({ data: { compraId: compra.id, ordem: 1, descricao: "Outro", quantidade: 1 } })).rejects.toThrow(); // ordem repetida
  });

  it("recebimento: as quantidades precisam ser positivas", async () => {
    const compra = await prisma.compra.create({ data: { numero: proximoNumero(), fornecedorId } });
    const item = await prisma.itemCompra.create({ data: { compraId: compra.id, ordem: 1, produtoId, unidadeCompra: "KG", quantidade: 30 } });
    const rec = await prisma.recebimentoCompra.create({ data: { compraId: compra.id, data: dia("2026-11-12") } });
    await expect(prisma.itemRecebimento.create({ data: { recebimentoId: rec.id, itemCompraId: item.id, quantidadeCompra: 0, quantidadeEstoque: 10 } })).rejects.toThrow();
    const ok = await prisma.itemRecebimento.create({ data: { recebimentoId: rec.id, itemCompraId: item.id, quantidadeCompra: 30, quantidadeEstoque: 10, valorCentavos: 150_000, custoUnitarioCentavos: 15_000 } });
    expect(ok.valorCentavos).toBe(150_000);
  });

  it("preço do kg: um por (acabamento, linha) entre os não excluídos; excluído libera a vaga; sem preço é null", async () => {
    const a = await prisma.precoKgAluminio.create({ data: { acabamentoId } });
    expect(a.custoKgCentavos).toBeNull();
    await expect(prisma.precoKgAluminio.create({ data: { acabamentoId, custoKgCentavos: 5000 } })).rejects.toThrow();
    await prisma.precoKgAluminio.update({ where: { id: a.id }, data: { deletadoEm: new Date() } });
    const b = await prisma.precoKgAluminio.create({ data: { acabamentoId, custoKgCentavos: 5000 } });
    expect(b.custoKgCentavos).toBe(5000);
  });

  it("retalho precisa de comprimento positivo e nasce disponível", async () => {
    await expect(prisma.retalho.create({ data: { produtoId, comprimentoMm: 0 } })).rejects.toThrow();
    const r = await prisma.retalho.create({ data: { produtoId, comprimentoMm: 1800, local: "Prateleira 2" } });
    expect(r.status).toBe("DISPONIVEL");
  });
});
