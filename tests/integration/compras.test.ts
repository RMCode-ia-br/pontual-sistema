import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Prisma } from "@/generated/prisma/client";
import type { UsuarioSessao } from "@/lib/auth/sessao";
import { criarClientePrisma } from "@/lib/db/criar-cliente";
import { atualizarCompra, cancelarCompra, criarCompra, estornarRecebimento, fazerPedido, receberCompra, type EntradaDeCompra, type EntradaDeRecebimento, type ItemDeCompraEntrada } from "@/modules/compras/servico";
import { definirPrecosKgDoAcabamento } from "@/modules/produtos/servico-preco-kg";

import { comConexao, criarUsuarioDeTeste } from "./banco-teste";

/** Compras e recebimento (Fase 6, Bloco 5). Só toca registros "Int Cmp"/"INT-CMP-"; o contador C-0001 volta ao que era. */
const PREFIXO = "Int Cmp";
const LOGIN = "int-compras";
const prisma = criarClientePrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL);
const AGORA = new Date("2026-11-20T15:00:00Z");

let usuario: UsuarioSessao;
let fornecedorId: string;
let obraId: string;
let leadId: string;
let acabamentoId: string;
let categoriaId: string;
let contadorAntes: number | null = null;

const tx = <T>(fn: (t: Prisma.TransactionClient) => Promise<T>) => prisma.$transaction(fn, { timeout: 30_000 });
const ctx = () => ({ usuario, ip: null, agora: AGORA });
const dia = "2026-11-19";

async function produto(nome: string, extra: Partial<Prisma.ProdutoUncheckedCreateInput> = {}) {
  return prisma.produto.create({ data: { codigo: `INT-CMP-${randomUUID().slice(0, 8)}`, descricao: `${PREFIXO} ${nome}`, unidade: "UN", ...extra } });
}
const perfilKg = (nome: string) => produto(nome, { unidade: "BARRA", custoPorKg: true, acabamentoId, pesoKgPorMetro: "0.5", comprimentoBarraMm: 6000 });
const item = (p: Partial<ItemDeCompraEntrada> & Pick<ItemDeCompraEntrada, "quantidadeMilesimos">): ItemDeCompraEntrada => ({ produtoId: null, descricao: `${PREFIXO} item`, unidadeCompra: "UN", precoUnitarioCentavos: null, ...p });
const cabecalho = (itens: ItemDeCompraEntrada[], extra: Partial<EntradaDeCompra> = {}): EntradaDeCompra => ({ fornecedorId, tipo: "MATERIAL", destino: "ESTOQUE", projetoId: null, previsaoEntrega: null, condicoes: null, observacao: null, itens, ...extra });
const criar = (itens: ItemDeCompraEntrada[], extra: Partial<EntradaDeCompra> & { fazerPedido?: boolean } = {}) => tx((t) => criarCompra(t, { ...cabecalho(itens, extra), fazerPedido: extra.fazerPedido ?? true }, ctx()));
const receber = (compraId: string, itens: EntradaDeRecebimento["itens"], extra: Partial<EntradaDeRecebimento> = {}) => tx((t) => receberCompra(t, { compraId, data: dia, itens, ...extra }, ctx()));
const compraDe = (id: string) => prisma.compra.findUniqueOrThrow({ where: { id }, include: { itens: { where: { deletadoEm: null }, orderBy: { ordem: "asc" } } } });
const produtoDe = (id: string) => prisma.produto.findUniqueOrThrow({ where: { id } });
const saldo = async (id: string) => Number((await produtoDe(id)).saldoCache.toString());

async function limpar() {
  await comConexao(async (c) => {
    const compras = `SELECT id FROM "Compra" WHERE "fornecedorId" IN (SELECT id FROM "Fornecedor" WHERE "razaoSocial" LIKE '${PREFIXO}%')`;
    const produtos = `SELECT id FROM "Produto" WHERE codigo LIKE 'INT-CMP-%'`;
    await c.query(`DELETE FROM "LogAuditoria" WHERE "usuarioId" IN (SELECT id FROM "Usuario" WHERE login = $1)`, [LOGIN]);
    await c.query(`DELETE FROM "ContaPagar" WHERE "compraId" IN (${compras})`);
    await c.query(`DELETE FROM "HistoricoPrecoKg" WHERE "compraId" IN (${compras}) OR "precoKgId" IN (SELECT id FROM "PrecoKgAluminio" WHERE "acabamentoId" IN (SELECT id FROM "AcabamentoAluminio" WHERE nome LIKE '${PREFIXO}%'))`);
    await c.query(`DELETE FROM "HistoricoPreco" WHERE "compraId" IN (${compras}) OR "produtoId" IN (${produtos})`);
    await c.query(`UPDATE "MovimentoEstoque" SET "estornoDeId" = NULL WHERE "produtoId" IN (${produtos})`);
    await c.query(`DELETE FROM "MovimentoEstoque" WHERE "produtoId" IN (${produtos})`);
    await c.query(`DELETE FROM "ItemRecebimento" WHERE "itemCompraId" IN (SELECT id FROM "ItemCompra" WHERE "compraId" IN (${compras}))`);
    await c.query(`DELETE FROM "RecebimentoCompra" WHERE "compraId" IN (${compras})`);
    await c.query(`DELETE FROM "ItemCompra" WHERE "compraId" IN (${compras})`);
    await c.query(`DELETE FROM "Compra" WHERE id IN (${compras})`);
    await c.query(`DELETE FROM "PrecoKgAluminio" WHERE "acabamentoId" IN (SELECT id FROM "AcabamentoAluminio" WHERE nome LIKE '${PREFIXO}%')`);
    await c.query(`DELETE FROM "Produto" WHERE codigo LIKE 'INT-CMP-%'`);
    await c.query(`DELETE FROM "AcabamentoAluminio" WHERE nome LIKE '${PREFIXO}%'`);
    await c.query(`DELETE FROM "CategoriaFinanceira" WHERE nome LIKE '${PREFIXO}%'`);
    await c.query(`DELETE FROM "Fornecedor" WHERE "razaoSocial" LIKE '${PREFIXO}%'`);
    await c.query(`DELETE FROM "Projeto" WHERE titulo LIKE '${PREFIXO}%'`);
    await c.query(`DELETE FROM "Cliente" WHERE nome LIKE '${PREFIXO}%'`);
    await c.query(`DELETE FROM "Usuario" WHERE login = $1`, [LOGIN]);
  });
}

beforeAll(async () => {
  await limpar();
  contadorAntes = await comConexao(async (c) => (await c.query(`SELECT valor FROM "ContadorSequencia" WHERE chave = 'compra'`)).rows[0]?.valor ?? null);
  await criarUsuarioDeTeste(LOGIN, "senha-de-teste-123");
  const u = await prisma.usuario.findUniqueOrThrow({ where: { login: LOGIN } });
  usuario = { id: u.id, nome: u.nome, login: u.login, email: u.email, papel: "ADMIN", precisaTrocarSenha: false };
  fornecedorId = (await prisma.fornecedor.create({ data: { razaoSocial: `${PREFIXO} Fornecedor` } })).id;
  acabamentoId = (await prisma.acabamentoAluminio.create({ data: { nome: `${PREFIXO} Acabamento` } })).id;
  categoriaId = (await prisma.categoriaFinanceira.create({ data: { nome: `${PREFIXO} Despesa`, tipo: "DESPESA", grupo: "CUSTOS_DIRETOS", grupoDre: "Custos diretos" } })).id;
  const clienteId = (await prisma.cliente.create({ data: { nome: `${PREFIXO} Cliente`, tipoPessoa: "PF" } })).id;
  const projeto = (titulo: string, status: "APROVADO" | "NOVO_LEAD") => prisma.projeto.create({ data: { codigo: `P-0000-${randomUUID().slice(0, 8)}`, titulo: `${PREFIXO} ${titulo}`, clienteId, status, responsavelId: usuario.id } });
  obraId = (await projeto("Obra", "APROVADO")).id;
  leadId = (await projeto("Lead", "NOVO_LEAD")).id;
});

afterAll(async () => {
  await limpar();
  // Devolve o contador de compras ao maior número que sobrou (as compras de teste foram apagadas).
  await comConexao(async (c) => {
    const max = (await c.query(`SELECT coalesce(max(numero), 0)::int AS m FROM "Compra"`)).rows[0].m as number;
    if (contadorAntes === null && max === 0) await c.query(`DELETE FROM "ContadorSequencia" WHERE chave = 'compra'`);
    else await c.query(`UPDATE "ContadorSequencia" SET valor = $1 WHERE chave = 'compra'`, [Math.max(max, contadorAntes ?? 0)]);
  });
  await prisma.$disconnect();
});

describe("criar, pedir e validar a compra", () => {
  it("nasce em rascunho (ou já pedida) com número sequencial; fazer o pedido só vale uma vez", async () => {
    const p = await produto("Roldana", { custoUnitarioCentavos: 1000 });
    const a = await criar([item({ produtoId: p.id, descricao: null, quantidadeMilesimos: 10_000, precoUnitarioCentavos: 1200 })], { fazerPedido: false });
    const b = await criar([item({ quantidadeMilesimos: 1_000 })], { fazerPedido: false });
    expect(a.status).toBe("RASCUNHO");
    expect(b.numero).toBe(a.numero + 1);
    await tx((t) => fazerPedido(t, a.id, ctx()));
    const depois = await compraDe(a.id);
    expect(depois.status).toBe("PEDIDO");
    expect(depois.dataPedido?.toISOString().slice(0, 10)).toBe("2026-11-20");
    await expect(tx((t) => fazerPedido(t, a.id, ctx()))).rejects.toThrow(/rascunho/);
    expect(await prisma.logAuditoria.count({ where: { entidade: "Compra", entidadeId: a.id } })).toBe(2);
  });

  it("recusa destino obra sem obra ou com obra não aprovada, estoque com obra, fornecedor inexistente e compra sem item", async () => {
    await expect(criar([item({ quantidadeMilesimos: 1_000 })], { destino: "OBRA" })).rejects.toThrow(/Escolha a obra/);
    await expect(criar([item({ quantidadeMilesimos: 1_000 })], { destino: "OBRA", projetoId: leadId })).rejects.toThrow(/aprovadas/);
    await expect(criar([item({ quantidadeMilesimos: 1_000 })], { destino: "ESTOQUE", projetoId: obraId })).rejects.toThrow(/Tire a obra|não tem obra/);
    await expect(criar([item({ quantidadeMilesimos: 1_000 })], { fornecedorId: "nao-existe" })).rejects.toThrow(/Fornecedor não encontrado/);
    await expect(criar([])).rejects.toThrow(/ao menos um item/);
  });

  it("recusa item sem produto nem descrição, quantidade ou preço inválidos e unidade incoerente com o produto", async () => {
    const un = await produto("Parafuso");
    await expect(criar([item({ descricao: null, quantidadeMilesimos: 1_000 })])).rejects.toThrow(/escolha um produto ou descreva/);
    await expect(criar([item({ quantidadeMilesimos: 0 })])).rejects.toThrow(/quantidade/);
    await expect(criar([item({ quantidadeMilesimos: 1_000, precoUnitarioCentavos: 0 })])).rejects.toThrow(/preço/);
    await expect(criar([item({ produtoId: un.id, descricao: null, quantidadeMilesimos: 1_000, unidadeCompra: "KG" })])).rejects.toThrow(/é comprado em un/);
    await expect(criar([item({ produtoId: "nao-existe", descricao: null, quantidadeMilesimos: 1_000 })])).rejects.toThrow(/produto não encontrado/);
  });
});

describe("receber: estoque, custo congelado e último custo", () => {
  it("destino ESTOQUE: entrada com o custo da entrega, produto passa ao último custo (histórico COMPRA), status recebida", async () => {
    const p = await produto("Ferragem", { custoUnitarioCentavos: 1000 });
    const c = await criar([item({ produtoId: p.id, descricao: null, quantidadeMilesimos: 10_000, precoUnitarioCentavos: 1200 })]);
    const r = await receber(c.id, [{ itemCompraId: (await compraDe(c.id)).itens[0].id, quantidadeCompraMilesimos: 10_000 }]);
    expect(r).toMatchObject({ status: "RECEBIDO", valorCentavos: 12_000 });

    expect(await saldo(p.id)).toBe(10);
    const mov = await prisma.movimentoEstoque.findFirstOrThrow({ where: { produtoId: p.id } });
    expect(mov).toMatchObject({ tipo: "ENTRADA_COMPRA", custoUnitarioCentavos: 1200 });
    expect(mov.itemRecebimentoId).not.toBeNull();
    expect((await produtoDe(p.id)).custoUnitarioCentavos).toBe(1200);
    const hist = await prisma.historicoPreco.findFirstOrThrow({ where: { produtoId: p.id } });
    expect(hist).toMatchObject({ origem: "COMPRA", compraId: c.id, custoAnteriorCentavos: 1000, custoNovoCentavos: 1200, fornecedorId });
    const ir = await prisma.itemRecebimento.findFirstOrThrow({ where: { itemCompra: { compraId: c.id } } });
    expect(ir).toMatchObject({ valorCentavos: 12_000, custoUnitarioCentavos: 1200 });
    expect((await compraDe(c.id)).itens[0].quantidadeRecebida.toString()).toBe("10");
  });

  it("recebimento parcial → recebida em parte; depois o resto → recebida; nunca passa do pedido", async () => {
    const p = await produto("Parcial");
    const c = await criar([item({ produtoId: p.id, descricao: null, quantidadeMilesimos: 10_000, precoUnitarioCentavos: 500 })]);
    const itemId = (await compraDe(c.id)).itens[0].id;
    expect((await receber(c.id, [{ itemCompraId: itemId, quantidadeCompraMilesimos: 4_000 }])).status).toBe("RECEBIDO_PARCIAL");
    await expect(receber(c.id, [{ itemCompraId: itemId, quantidadeCompraMilesimos: 6_001 }])).rejects.toThrow(/Passa do pedido: faltam receber 6/);
    expect((await receber(c.id, [{ itemCompraId: itemId, quantidadeCompraMilesimos: 6_000 }])).status).toBe("RECEBIDO");
    expect(await saldo(p.id)).toBe(10);
    await expect(receber(c.id, [{ itemCompraId: itemId, quantidadeCompraMilesimos: 1_000 }])).rejects.toThrow(/já foi recebida/);
  });

  it("dois recebimentos simultâneos do mesmo item nunca passam do pedido (a compra é travada)", async () => {
    const p = await produto("Concorrente");
    const c = await criar([item({ produtoId: p.id, descricao: null, quantidadeMilesimos: 5_000, precoUnitarioCentavos: 100 })]);
    const itemId = (await compraDe(c.id)).itens[0].id;
    const r = await Promise.allSettled([receber(c.id, [{ itemCompraId: itemId, quantidadeCompraMilesimos: 4_000 }]), receber(c.id, [{ itemCompraId: itemId, quantidadeCompraMilesimos: 4_000 }])]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await saldo(p.id)).toBe(4);
  });

  it("destino OBRA não passa pelo estoque: sem movimento, mas o valor fica congelado para o custo da obra", async () => {
    const p = await produto("Direto na obra", { custoUnitarioCentavos: 700 });
    const c = await criar([item({ produtoId: p.id, descricao: null, quantidadeMilesimos: 3_000, precoUnitarioCentavos: 900 })], { destino: "OBRA", projetoId: obraId });
    await receber(c.id, [{ itemCompraId: (await compraDe(c.id)).itens[0].id, quantidadeCompraMilesimos: 3_000 }]);
    expect(await prisma.movimentoEstoque.count({ where: { produtoId: p.id } })).toBe(0);
    expect(await saldo(p.id)).toBe(0);
    const ir = await prisma.itemRecebimento.findFirstOrThrow({ where: { itemCompra: { compraId: c.id } } });
    expect(ir.valorCentavos).toBe(2_700);
  });

  it("item sem preço entra 'sem custo' (null, nunca o custo antigo nem zero) e não mexe no custo do produto", async () => {
    const p = await produto("Sem preço", { custoUnitarioCentavos: 800 });
    const c = await criar([item({ produtoId: p.id, descricao: null, quantidadeMilesimos: 2_000, precoUnitarioCentavos: null })]);
    const r = await receber(c.id, [{ itemCompraId: (await compraDe(c.id)).itens[0].id, quantidadeCompraMilesimos: 2_000 }]);
    expect(r.valorCentavos).toBe(0);
    const mov = await prisma.movimentoEstoque.findFirstOrThrow({ where: { produtoId: p.id } });
    expect(mov.custoUnitarioCentavos).toBeNull();
    expect((await produtoDe(p.id)).custoUnitarioCentavos).toBe(800);
    const ir = await prisma.itemRecebimento.findFirstOrThrow({ where: { itemCompra: { compraId: c.id } } });
    expect(ir).toMatchObject({ valorCentavos: null, custoUnitarioCentavos: null });
  });

  it("o valor digitado vale no lugar de quantidade × preço (pesou diferente); item de vidro sem produto não vai ao estoque", async () => {
    const c = await criar([item({ descricao: `${PREFIXO} Vidro 8 mm`, quantidadeMilesimos: 2_000, precoUnitarioCentavos: 10_000, larguraMm: 1180, alturaMm: 980, espessuraMm: 8 })], { tipo: "VIDRO", destino: "OBRA", projetoId: obraId });
    await receber(c.id, [{ itemCompraId: (await compraDe(c.id)).itens[0].id, quantidadeCompraMilesimos: 2_000, valorTotalCentavos: 19_500 }]);
    const ir = await prisma.itemRecebimento.findFirstOrThrow({ where: { itemCompra: { compraId: c.id } } });
    expect(ir.valorCentavos).toBe(19_500);
  });
});

describe("alumínio por kg: conversão para barras e preço do kg", () => {
  it("compra em kg exige informar as barras que entraram; 30 kg a R$ 52,00 viram 10 barras de R$ 156,00; marcado, atualiza o preço do kg (COMPRA)", async () => {
    const p = await perfilKg("Perfil A");
    const c = await criar([item({ produtoId: p.id, descricao: null, unidadeCompra: "KG", quantidadeMilesimos: 30_000, precoUnitarioCentavos: 5_200 })]);
    const itemId = (await compraDe(c.id)).itens[0].id;
    await expect(receber(c.id, [{ itemCompraId: itemId, quantidadeCompraMilesimos: 30_000 }])).rejects.toThrow(/informe quantas barras entraram/);
    expect(await saldo(p.id)).toBe(0);

    await receber(c.id, [{ itemCompraId: itemId, quantidadeCompraMilesimos: 30_000, quantidadeEstoqueMilesimos: 10_000, atualizarPrecoKg: true }]);
    expect(await saldo(p.id)).toBe(10);
    const ir = await prisma.itemRecebimento.findFirstOrThrow({ where: { itemCompra: { compraId: c.id } } });
    expect(ir).toMatchObject({ valorCentavos: 156_000, custoUnitarioCentavos: 15_600 });
    expect(ir.quantidadeCompra.toString()).toBe("30");
    expect(ir.quantidadeEstoque.toString()).toBe("10");
    // O preço do kg do acabamento passou a ser o da compra (histórico COMPRA) e o perfil acompanha: 5200 × 0,5 × 6 = 15.600.
    const preco = await prisma.precoKgAluminio.findFirstOrThrow({ where: { acabamentoId, linhaId: null } });
    expect(preco.custoKgCentavos).toBe(5_200);
    const h = await prisma.historicoPrecoKg.findFirstOrThrow({ where: { precoKgId: preco.id, origem: "COMPRA" } });
    expect(h.compraId).toBe(c.id);
    expect((await produtoDe(p.id)).custoUnitarioCentavos).toBe(15_600);
  });

  it("sem marcar o preço do kg, o último custo do perfil vira o custo por barra da entrega", async () => {
    const p = await perfilKg("Perfil B");
    const c = await criar([item({ produtoId: p.id, descricao: null, unidadeCompra: "KG", quantidadeMilesimos: 6_000, precoUnitarioCentavos: 4_800 })]);
    await receber(c.id, [{ itemCompraId: (await compraDe(c.id)).itens[0].id, quantidadeCompraMilesimos: 6_000, quantidadeEstoqueMilesimos: 2_000 }]);
    expect((await produtoDe(p.id)).custoUnitarioCentavos).toBe(14_400); // 28.800 ÷ 2 barras
    expect(await saldo(p.id)).toBe(2);
  });
});

describe("conta a pagar nascida da compra (e o custo da obra lendo só a compra)", () => {
  it("gera a conta com o valor do que foi recebido, ligada à compra e à obra; parcelada vira várias, todas com o compraId", async () => {
    const p = await produto("Com conta");
    const c = await criar([item({ produtoId: p.id, descricao: null, quantidadeMilesimos: 10_000, precoUnitarioCentavos: 1_000 }), item({ quantidadeMilesimos: 1_000, precoUnitarioCentavos: null })], { destino: "OBRA", projetoId: obraId });
    const itens = (await compraDe(c.id)).itens;
    const r = await receber(c.id, itens.map((i) => ({ itemCompraId: i.id, quantidadeCompraMilesimos: Number(i.quantidade) * 1000 })), { contaPagar: { categoriaId, vencimento: "2026-12-10", parcelas: 3, forma: "BOLETO" } });
    expect(r.valorCentavos).toBe(10_000);
    const contas = await prisma.contaPagar.findMany({ where: { compraId: c.id }, orderBy: { vencimento: "asc" } });
    expect(contas).toHaveLength(3);
    expect(contas.reduce((s, x) => s + x.valorCentavos, 0)).toBe(10_000); // a última parcela absorve a diferença
    expect(contas.every((x) => x.projetoId === obraId && x.fornecedorId === fornecedorId && x.categoriaId === categoriaId)).toBe(true);
    expect(contas[0].descricao).toContain("C-");
  });

  it("sem nenhum item com preço não há o que lançar: recusa e desfaz o recebimento inteiro", async () => {
    const p = await produto("Sem valor");
    const c = await criar([item({ produtoId: p.id, descricao: null, quantidadeMilesimos: 1_000, precoUnitarioCentavos: null })]);
    const itemId = (await compraDe(c.id)).itens[0].id;
    await expect(receber(c.id, [{ itemCompraId: itemId, quantidadeCompraMilesimos: 1_000 }], { contaPagar: { categoriaId, vencimento: "2026-12-10", parcelas: 1, forma: null } })).rejects.toThrow(/Nenhum item recebido tem preço/);
    expect(await saldo(p.id)).toBe(0);
    expect((await compraDe(c.id)).status).toBe("PEDIDO");
    expect(await prisma.recebimentoCompra.count({ where: { compraId: c.id } })).toBe(0);
  });
});

describe("estornar recebimento, cancelar e editar", () => {
  it("estorno devolve o estoque, a quantidade recebida e o status; recusa se há conta a pagar ativa", async () => {
    const p = await produto("Estorno");
    const c = await criar([item({ produtoId: p.id, descricao: null, quantidadeMilesimos: 5_000, precoUnitarioCentavos: 1_000 })]);
    const itemId = (await compraDe(c.id)).itens[0].id;
    const r = await receber(c.id, [{ itemCompraId: itemId, quantidadeCompraMilesimos: 5_000 }], { contaPagar: { categoriaId, vencimento: "2026-12-10", parcelas: 1, forma: null } });
    expect(await saldo(p.id)).toBe(5);
    await expect(tx((t) => estornarRecebimento(t, r.recebimentoId, "Veio errado", ctx()))).rejects.toThrow(/conta a pagar ativa/);

    await prisma.contaPagar.updateMany({ where: { compraId: c.id }, data: { status: "CANCELADA" } });
    await expect(tx((t) => estornarRecebimento(t, r.recebimentoId, " ", ctx()))).rejects.toThrow(/motivo/);
    expect((await tx((t) => estornarRecebimento(t, r.recebimentoId, "Veio errado", ctx()))).status).toBe("PEDIDO");
    expect(await saldo(p.id)).toBe(0);
    expect((await compraDe(c.id)).itens[0].quantidadeRecebida.toString()).toBe("0");
    expect((await prisma.recebimentoCompra.findUniqueOrThrow({ where: { id: r.recebimentoId } })).deletadoEm).not.toBeNull();
    await expect(tx((t) => estornarRecebimento(t, r.recebimentoId, "de novo", ctx()))).rejects.toThrow(/Recebimento não encontrado/);
    // Dá para receber de novo depois do estorno.
    expect((await receber(c.id, [{ itemCompraId: itemId, quantidadeCompraMilesimos: 5_000 }])).status).toBe("RECEBIDO");
  });

  it("cancelar só sem recebimento, com motivo; cancelada não recebe", async () => {
    const p = await produto("Cancelar");
    const a = await criar([item({ produtoId: p.id, descricao: null, quantidadeMilesimos: 1_000 })]);
    await expect(tx((t) => cancelarCompra(t, a.id, " ", ctx()))).rejects.toThrow(/motivo/);
    await tx((t) => cancelarCompra(t, a.id, "Desisti", ctx()));
    expect((await compraDe(a.id)).status).toBe("CANCELADO");
    await expect(receber(a.id, [{ itemCompraId: (await compraDe(a.id)).itens[0].id, quantidadeCompraMilesimos: 1_000 }])).rejects.toThrow(/cancelada/);
    await expect(tx((t) => cancelarCompra(t, a.id, "de novo", ctx()))).rejects.toThrow(/já está cancelada/);

    const b = await criar([item({ produtoId: p.id, descricao: null, quantidadeMilesimos: 2_000 })]);
    await receber(b.id, [{ itemCompraId: (await compraDe(b.id)).itens[0].id, quantidadeCompraMilesimos: 1_000 }]);
    await expect(tx((t) => cancelarCompra(t, b.id, "tarde", ctx()))).rejects.toThrow(/Já houve recebimento/);
  });

  it("editar: sem recebimento tudo muda (itens novos, alterados e removidos); com recebimento trava o que já chegou", async () => {
    const p = await produto("Editar");
    const c = await criar([item({ produtoId: p.id, descricao: null, quantidadeMilesimos: 4_000, precoUnitarioCentavos: 100 }), item({ quantidadeMilesimos: 1_000, descricao: `${PREFIXO} a remover` })], { fazerPedido: false });
    const [i1, i2] = (await compraDe(c.id)).itens;
    await tx((t) => atualizarCompra(t, c.id, cabecalho([{ ...item({ produtoId: p.id, descricao: null, quantidadeMilesimos: 6_000, precoUnitarioCentavos: 150 }), id: i1.id }, item({ quantidadeMilesimos: 2_000, descricao: `${PREFIXO} novo` })], { previsaoEntrega: "2026-12-01", observacao: "Urgente" }), ctx()));
    const editada = await compraDe(c.id);
    expect(editada.itens).toHaveLength(2);
    expect(editada.itens.map((i) => [i.ordem, i.quantidade.toString()])).toEqual([[1, "6"], [2, "2"]]);
    expect(editada.itens[0].id).toBe(i1.id);
    expect(editada.itens.some((i) => i.id === i2.id)).toBe(false); // removido
    expect(editada.previsaoEntrega?.toISOString().slice(0, 10)).toBe("2026-12-01");

    await tx((t) => fazerPedido(t, c.id, ctx()));
    await receber(c.id, [{ itemCompraId: i1.id, quantidadeCompraMilesimos: 3_000 }]);
    const base = (q: number, extra: Partial<EntradaDeCompra> = {}) => cabecalho([{ ...item({ produtoId: p.id, descricao: null, quantidadeMilesimos: q, precoUnitarioCentavos: 150 }), id: i1.id }], extra);
    await expect(tx((t) => atualizarCompra(t, c.id, base(2_000), ctx()))).rejects.toThrow(/abaixo do que já chegou/); // item 1 recebido: 3
    await expect(tx((t) => atualizarCompra(t, c.id, cabecalho([item({ quantidadeMilesimos: 1_000 })]), ctx()))).rejects.toThrow(/já foi recebido e não pode ser removido/);
    await expect(tx((t) => atualizarCompra(t, c.id, base(6_000, { destino: "OBRA", projetoId: obraId }), ctx()))).rejects.toThrow(/Já houve recebimento/);
    // Aumentar o pedido (chegou mais) é permitido e continua parcial.
    await tx((t) => atualizarCompra(t, c.id, base(8_000, { observacao: "Chegou mais" }), ctx()));
    expect((await compraDe(c.id)).status).toBe("RECEBIDO_PARCIAL");
    expect((await compraDe(c.id)).itens[0].quantidade.toString()).toBe("8");
  });
});
