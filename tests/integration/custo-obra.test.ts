import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Prisma } from "@/generated/prisma/client";
import type { UsuarioSessao } from "@/lib/auth/sessao";
import { criarClientePrisma } from "@/lib/db/criar-cliente";
import { criarCompra, receberCompra } from "@/modules/compras/servico";
import { registrarMovimentoDeEstoque } from "@/modules/estoque/servico";
import { estornarLancamento, registrarLancamento } from "@/modules/financeiro/servico-lancamentos";
import { criarContasAPagar, registrarPagamento } from "@/modules/financeiro/servico-pagar";
import { carregarCustoDaObra } from "@/modules/obras/queries-custo";

import { comConexao, criarUsuarioDeTeste } from "./banco-teste";

/**
 * Custo real e margem por obra (R15) — critério de aceite da Fase 6: NENHUM custo contado duas vezes e a margem mostra a origem
 * de cada custo. O resultado é conferido contra uma soma SQL independente. O custo de mão de obra por m² de Configurações é
 * trocado e restaurado; o contador de compras volta ao que era.
 */
const PREFIXO = "Int Cus";
const LOGIN = "int-custo-obra";
const prisma = criarClientePrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL);
const AGORA = new Date("2026-11-20T15:00:00Z");
const DIA = "2026-11-19";

let usuario: UsuarioSessao;
let obraId: string;
let outraObraId: string;
let fornecedorId: string;
let contaFinanceiraId: string;
let categoriaDespesaId: string;
let maoDeObraOriginal: number | null;
let contadorAntes: number | null = null;

const tx = <T>(fn: (t: Prisma.TransactionClient) => Promise<T>) => prisma.$transaction(fn, { timeout: 30_000 });
const ctx = () => ({ usuario, ip: null, agora: AGORA });
const definirMaoDeObra = (c: number | null) => comConexao((q) => q.query(`UPDATE "ConfiguracaoEmpresa" SET "custoMaoDeObraPorM2Centavos" = $1 WHERE id = 'singleton'`, [c]));
const prod = (nome: string, custo: number | null) => prisma.produto.create({ data: { codigo: `INT-CUS-${randomUUID().slice(0, 8)}`, descricao: `${PREFIXO} ${nome}`, unidade: "UN", custoUnitarioCentavos: custo } });
const mover = (e: Parameters<typeof registrarMovimentoDeEstoque>[1]) => tx((t) => registrarMovimentoDeEstoque(t, e, ctx()));

async function limpar() {
  await comConexao(async (c) => {
    const projetos = `SELECT id FROM "Projeto" WHERE titulo LIKE '${PREFIXO}%'`;
    const compras = `SELECT id FROM "Compra" WHERE "fornecedorId" IN (SELECT id FROM "Fornecedor" WHERE "razaoSocial" LIKE '${PREFIXO}%')`;
    const produtos = `SELECT id FROM "Produto" WHERE codigo LIKE 'INT-CUS-%'`;
    await c.query(`DELETE FROM "LogAuditoria" WHERE "usuarioId" IN (SELECT id FROM "Usuario" WHERE login = $1)`, [LOGIN]);
    await c.query(`DELETE FROM "Lancamento" WHERE "contaFinanceiraId" IN (SELECT id FROM "ContaFinanceira" WHERE nome LIKE '${PREFIXO}%')`);
    await c.query(`DELETE FROM "ContaPagar" WHERE "projetoId" IN (${projetos}) OR "compraId" IN (${compras})`);
    await c.query(`DELETE FROM "Retalho" WHERE "produtoId" IN (${produtos})`);
    await c.query(`UPDATE "MovimentoEstoque" SET "estornoDeId" = NULL WHERE "produtoId" IN (${produtos})`);
    await c.query(`DELETE FROM "MovimentoEstoque" WHERE "produtoId" IN (${produtos})`);
    await c.query(`DELETE FROM "HistoricoPreco" WHERE "compraId" IN (${compras}) OR "produtoId" IN (${produtos})`);
    await c.query(`DELETE FROM "ItemRecebimento" WHERE "itemCompraId" IN (SELECT id FROM "ItemCompra" WHERE "compraId" IN (${compras}))`);
    await c.query(`DELETE FROM "RecebimentoCompra" WHERE "compraId" IN (${compras})`);
    await c.query(`DELETE FROM "ItemCompra" WHERE "compraId" IN (${compras})`);
    await c.query(`DELETE FROM "Compra" WHERE id IN (${compras})`);
    await c.query(`DELETE FROM "Produto" WHERE codigo LIKE 'INT-CUS-%'`);
    // O pagamento e a cobrança deixam linha do tempo e tarefa no projeto e no cliente.
    await c.query(`DELETE FROM "Interacao" WHERE "projetoId" IN (${projetos}) OR "clienteId" IN (SELECT id FROM "Cliente" WHERE nome LIKE '${PREFIXO}%')`);
    await c.query(`DELETE FROM "Tarefa" WHERE "projetoId" IN (${projetos}) OR "clienteId" IN (SELECT id FROM "Cliente" WHERE nome LIKE '${PREFIXO}%')`);
    await c.query(`DELETE FROM "OpcaoProposta" WHERE "propostaId" IN (SELECT id FROM "Proposta" WHERE "projetoId" IN (${projetos}))`);
    await c.query(`DELETE FROM "Proposta" WHERE "projetoId" IN (${projetos})`);
    await c.query(`DELETE FROM "ContaFinanceira" WHERE nome LIKE '${PREFIXO}%'`);
    await c.query(`DELETE FROM "CategoriaFinanceira" WHERE nome LIKE '${PREFIXO}%'`);
    await c.query(`DELETE FROM "Fornecedor" WHERE "razaoSocial" LIKE '${PREFIXO}%'`);
    await c.query(`DELETE FROM "Projeto" WHERE titulo LIKE '${PREFIXO}%'`);
    await c.query(`DELETE FROM "Cliente" WHERE nome LIKE '${PREFIXO}%'`);
    await c.query(`DELETE FROM "Usuario" WHERE login = $1`, [LOGIN]);
  });
}

/** Soma INDEPENDENTE do custo da obra (SQL cru), sem usar nenhuma função do sistema. */
async function somaIndependente(projetoId: string) {
  return comConexao(async (c) => {
    const n = async (sql: string) => Number((await c.query(sql, [projetoId])).rows[0].v);
    const compras = await n(`SELECT COALESCE(SUM(ir."valorCentavos"),0)::bigint AS v FROM "ItemRecebimento" ir JOIN "ItemCompra" ic ON ic.id = ir."itemCompraId" JOIN "Compra" co ON co.id = ic."compraId" WHERE co."projetoId" = $1 AND co.destino = 'OBRA' AND co.status <> 'CANCELADO' AND co."deletadoEm" IS NULL AND ir."deletadoEm" IS NULL`);
    const estoque = await n(`SELECT COALESCE(ROUND(SUM(-m.quantidade * m."custoUnitarioCentavos")),0)::bigint AS v FROM "MovimentoEstoque" m WHERE m."projetoId" = $1 AND m.tipo NOT IN ('INVENTARIO_INICIAL','ENTRADA_COMPRA') AND m."deletadoEm" IS NULL`);
    const contas = await n(`SELECT COALESCE(SUM("valorCentavos"),0)::bigint AS v FROM "ContaPagar" WHERE "projetoId" = $1 AND "compraId" IS NULL AND status <> 'CANCELADA' AND "deletadoEm" IS NULL`);
    const avulsos = await n(`SELECT COALESCE(SUM("valorCentavos"),0)::bigint AS v FROM "Lancamento" WHERE "projetoId" = $1 AND tipo = 'SAIDA' AND "contaPagarId" IS NULL AND "contaReceberId" IS NULL AND "transferenciaId" IS NULL AND "estornadoEm" IS NULL AND "deletadoEm" IS NULL`);
    return { compras, estoque, contas, avulsos };
  });
}

beforeAll(async () => {
  await limpar();
  maoDeObraOriginal = (await prisma.configuracaoEmpresa.findUniqueOrThrow({ where: { id: "singleton" }, select: { custoMaoDeObraPorM2Centavos: true } })).custoMaoDeObraPorM2Centavos;
  await definirMaoDeObra(16_000);
  contadorAntes = await comConexao(async (c) => (await c.query(`SELECT valor FROM "ContadorSequencia" WHERE chave = 'compra'`)).rows[0]?.valor ?? null);
  await criarUsuarioDeTeste(LOGIN, "senha-de-teste-123");
  const u = await prisma.usuario.findUniqueOrThrow({ where: { login: LOGIN } });
  usuario = { id: u.id, nome: u.nome, login: u.login, email: u.email, papel: "ADMIN", precisaTrocarSenha: false };
  fornecedorId = (await prisma.fornecedor.create({ data: { razaoSocial: `${PREFIXO} Fornecedor` } })).id;
  contaFinanceiraId = (await prisma.contaFinanceira.create({ data: { nome: `${PREFIXO} Banco`, saldoInicialInformado: true, saldoInicialCentavos: 0, dataSaldoInicial: new Date("2026-11-01T00:00:00Z") } })).id;
  categoriaDespesaId = (await prisma.categoriaFinanceira.create({ data: { nome: `${PREFIXO} Despesa`, tipo: "DESPESA", grupo: "CUSTOS_DIRETOS", grupoDre: "Custos diretos" } })).id;
  const clienteId = (await prisma.cliente.create({ data: { nome: `${PREFIXO} Cliente`, tipoPessoa: "PF" } })).id;
  const projeto = (titulo: string, extra: Record<string, unknown> = {}) => prisma.projeto.create({ data: { codigo: `P-0000-${randomUUID().slice(0, 8)}`, titulo: `${PREFIXO} ${titulo}`, clienteId, status: "APROVADO", responsavelId: usuario.id, ...extra } });
  // Obra com valor fechado de R$ 10.500,00, dos quais R$ 500,00 são acréscimo de nota (repasse de imposto), 10 m².
  obraId = (await projeto("Obra", { valorFechadoCentavos: 1_050_000 })).id;
  outraObraId = (await projeto("Outra obra")).id;
  const proposta = await prisma.proposta.create({
    data: { projetoId: obraId, numero: `INT-CUS-${randomUUID().slice(0, 5)}`, numeroSequencial: 7_000_000 + Math.floor(Math.random() * 900_000), ano: 2026, data: new Date("2026-11-10T00:00:00Z"), clienteNome: `${PREFIXO} Cliente`, status: "APROVADA", aceitaEm: new Date("2026-11-12T00:00:00Z"), valorAprovadoCentavos: 1_050_000, comNotaFiscal: true, opcoes: { create: [{ nome: "Opção 1" }] } },
    include: { opcoes: true },
  });
  const opcaoId = proposta.opcoes[0].id;
  await prisma.proposta.update({
    where: { id: proposta.id },
    data: { opcaoAprovadaId: opcaoId, snapshot: { opcoes: [{ id: opcaoId, nome: "Opção 1", totais: { itensCentavos: 1_000_000, descontoCentavos: 0, acrescimoNotaCentavos: 50_000, totalCentavos: 1_050_000, areaM2: 10 } }] } },
  });
});

afterAll(async () => {
  await limpar();
  await definirMaoDeObra(maoDeObraOriginal);
  await comConexao(async (c) => {
    const max = (await c.query(`SELECT coalesce(max(numero), 0)::int AS m FROM "Compra"`)).rows[0].m as number;
    if (contadorAntes === null && max === 0) await c.query(`DELETE FROM "ContadorSequencia" WHERE chave = 'compra'`);
    else await c.query(`UPDATE "ContadorSequencia" SET valor = $1 WHERE chave = 'compra'`, [Math.max(max, contadorAntes ?? 0)]);
  });
  await prisma.$disconnect();
});

describe("custo real da obra: nenhum custo contado duas vezes", () => {
  it("compra para a obra + conta a pagar da compra, compra para estoque + saída, despesas e mão de obra: cada custo entra UMA vez, com a origem", async () => {
    // 1) Compra de vidro direto para a obra: 2 × R$ 1.500,00 = R$ 3.000,00, com a conta a pagar (3 parcelas) ligada à compra.
    const vidro = await tx((t) =>
      criarCompra(t, { fornecedorId, tipo: "VIDRO", destino: "OBRA", projetoId: obraId, previsaoEntrega: null, condicoes: null, observacao: null, fazerPedido: true, itens: [{ produtoId: null, descricao: `${PREFIXO} Vidro`, unidadeCompra: "UN", quantidadeMilesimos: 2_000, precoUnitarioCentavos: 150_000 }] }, ctx()),
    );
    const itemVidro = (await prisma.itemCompra.findFirstOrThrow({ where: { compraId: vidro.id } })).id;
    await tx((t) => receberCompra(t, { compraId: vidro.id, data: DIA, itens: [{ itemCompraId: itemVidro, quantidadeCompraMilesimos: 2_000 }], contaPagar: { categoriaId: categoriaDespesaId, vencimento: "2026-12-10", parcelas: 3, forma: "BOLETO" } }, ctx()));

    // 2) Compra de 10 un a R$ 50,00 PARA O ESTOQUE (500,00) e saída de 10 un para a obra, com devolução de 2 un.
    const perfil = await prod("Perfil", null);
    const paraEstoque = await tx((t) =>
      criarCompra(t, { fornecedorId, tipo: "MATERIAL", destino: "ESTOQUE", projetoId: null, previsaoEntrega: null, condicoes: null, observacao: null, fazerPedido: true, itens: [{ produtoId: perfil.id, descricao: null, unidadeCompra: "UN", quantidadeMilesimos: 10_000, precoUnitarioCentavos: 5_000 }] }, ctx()),
    );
    const itemEstoque = (await prisma.itemCompra.findFirstOrThrow({ where: { compraId: paraEstoque.id } })).id;
    await tx((t) => receberCompra(t, { compraId: paraEstoque.id, data: DIA, itens: [{ itemCompraId: itemEstoque, quantidadeCompraMilesimos: 10_000 }], contaPagar: { categoriaId: categoriaDespesaId, vencimento: "2026-12-10", parcelas: 1, forma: null } }, ctx()));
    await mover({ produtoId: perfil.id, tipo: "SAIDA_OBRA", quantidadeMilesimos: 10_000, data: DIA, projetoId: obraId });
    await mover({ produtoId: perfil.id, tipo: "DEVOLUCAO", quantidadeMilesimos: 2_000, data: DIA, projetoId: obraId });

    // 3) Conta a pagar da obra (frete, R$ 1.000,00) JÁ PAGA (o pagamento é um lançamento com a conta: não conta de novo) e um lançamento avulso de R$ 200,00; um avulso estornado não conta.
    const frete = await tx((t) => criarContasAPagar(t, { descricao: `${PREFIXO} Frete`, modo: "UNICA", fornecedorId, funcionarioId: null, favorecido: null, categoriaId: categoriaDespesaId, projetoId: obraId, valor: 100_000, vencimento: "2026-11-25", parcelas: 2, periodicidade: "MENSAL", fimRecorrencia: null, forma: null, observacao: null }, ctx()));
    await tx((t) => registrarPagamento(t, { contaPagarId: frete.primeiraId, data: DIA, valor: 100_000, contaFinanceiraId, forma: null, comNotaFiscal: false, observacao: null }, ctx()));
    await tx((t) => registrarLancamento(t, { data: DIA, tipo: "SAIDA", valorCentavos: 20_000, contaFinanceiraId, categoriaId: categoriaDespesaId, descricao: `${PREFIXO} Parafusos no balcão`, forma: null, comNotaFiscal: false, projetoId: obraId }, ctx()));
    const estornado = await tx((t) => registrarLancamento(t, { data: DIA, tipo: "SAIDA", valorCentavos: 99_999, contaFinanceiraId, categoriaId: categoriaDespesaId, descricao: `${PREFIXO} Lançado errado`, forma: null, comNotaFiscal: false, projetoId: obraId }, ctx()));
    await tx((t) => estornarLancamento(t, estornado.id, "Lançado errado", ctx()));

    // 4) Retalho que veio de outra obra e foi usado nesta: entra a R$ 0 (informativo).
    await prisma.retalho.create({ data: { produtoId: perfil.id, comprimentoMm: 1800, status: "CONSUMIDO", origemProjetoId: outraObraId, consumidoProjetoId: obraId, consumidoEm: AGORA } });

    const c = await carregarCustoDaObra(obraId);
    const r = c.resultado;

    // Cada grupo uma vez só: vidro R$ 3.000 (recebimento) + estoque 10×50 − 2×50 = R$ 400 + frete R$ 1.000 + avulso R$ 200 + mão de obra 10 m² × R$ 160 = R$ 1.600.
    const porGrupo = (g: string) => c.linhas.filter((l) => l.grupo === g && !l.informativo).reduce((s, l) => s + (l.valorCentavos ?? 0), 0);
    expect(porGrupo("COMPRAS_DA_OBRA")).toBe(300_000);
    expect(porGrupo("ESTOQUE")).toBe(40_000);
    expect(porGrupo("OUTRAS_DESPESAS")).toBe(120_000);
    expect(porGrupo("MAO_DE_OBRA")).toBe(160_000);
    expect(r.custoConhecidoCentavos).toBe(620_000);

    // Conferência contra a soma SQL independente (+ mão de obra): os mesmos R$ 6.200,00.
    const sql = await somaIndependente(obraId);
    expect(sql).toEqual({ compras: 300_000, estoque: 40_000, contas: 100_000, avulsos: 20_000 });
    expect(sql.compras + sql.estoque + sql.contas + sql.avulsos + 160_000).toBe(r.custoConhecidoCentavos);

    // O que NÃO entrou: as contas a pagar da compra do vidro (3 parcelas = R$ 3.000), a compra para o estoque e o lançamento estornado.
    expect(c.contasDeComprasIgnoradas.valorCentavos).toBe(300_000 /* só a do vidro: a do estoque não tem obra */);
    expect(c.contasDeComprasIgnoradas.quantidade).toBe(3);
    expect(c.linhas.some((l) => l.descricao.includes("Lançado errado"))).toBe(false);
    expect(c.linhas.some((l) => l.origem.includes("Conta a pagar") && l.descricao.includes("Vidro"))).toBe(false);
    // O frete pago aparece UMA vez (como conta), não também como o lançamento do pagamento.
    expect(c.linhas.filter((l) => l.descricao.includes("Frete"))).toHaveLength(1);

    // Receita (opção B): fechado R$ 10.500 − acréscimo de nota R$ 500 = R$ 10.000; margem R$ 10.000 − R$ 6.200 = R$ 3.800 (38%).
    expect(r.receitaDaMargemCentavos).toBe(1_000_000);
    expect(r.repasseDeImpostoCentavos).toBe(50_000);
    expect(r).toMatchObject({ incompleto: false, margemCentavos: 380_000, margemPb: 3800, faltando: [] });

    // Cada linha mostra a origem, e o retalho usado é só informativo.
    expect(c.linhas.every((l) => l.origem.length > 0)).toBe(true);
    const retalho = c.linhas.find((l) => l.grupo === "RETALHOS")!;
    expect(retalho).toMatchObject({ valorCentavos: 0, informativo: true });
    expect(retalho.origem).toContain("custo já contado na obra de origem");
    expect(c.linhas.find((l) => l.grupo === "COMPRAS_DA_OBRA")?.href).toMatch(/^\/compras\//);
  });

  it("estornar a devolução (ou a saída) acompanha o custo: nada fica contado a mais", async () => {
    const antes = (await carregarCustoDaObra(obraId)).resultado.custoConhecidoCentavos;
    const mov = await prisma.movimentoEstoque.findFirstOrThrow({ where: { projetoId: obraId, tipo: "DEVOLUCAO" } });
    // Estorno da devolução = saída de volta de 2 un (R$ 100,00 a mais de custo).
    await tx(async (t) => {
      const { estornarMovimentoDeEstoque } = await import("@/modules/estoque/servico");
      await estornarMovimentoDeEstoque(t, mov.id, "Devolução lançada por engano", ctx());
    });
    const depois = (await carregarCustoDaObra(obraId)).resultado.custoConhecidoCentavos;
    expect(depois - antes).toBe(10_000);
    const sql = await somaIndependente(obraId);
    expect(sql.compras + sql.estoque + sql.contas + sql.avulsos + 160_000).toBe(depois);
  });
});

describe("margem incompleta: nunca zero", () => {
  it("compra recebida sem preço deixa a margem incompleta e diz o que falta", async () => {
    const c = await tx((t) =>
      criarCompra(t, { fornecedorId, tipo: "MATERIAL", destino: "OBRA", projetoId: obraId, previsaoEntrega: null, condicoes: null, observacao: null, fazerPedido: true, itens: [{ produtoId: null, descricao: `${PREFIXO} Ferragem sem preço`, unidadeCompra: "UN", quantidadeMilesimos: 1_000, precoUnitarioCentavos: null }] }, ctx()),
    );
    const itemSemPreco = (await prisma.itemCompra.findFirstOrThrow({ where: { compraId: c.id } })).id;
    await tx((t) => receberCompra(t, { compraId: c.id, data: DIA, itens: [{ itemCompraId: itemSemPreco, quantidadeCompraMilesimos: 1_000 }] }, ctx()));
    const r = (await carregarCustoDaObra(obraId)).resultado;
    expect(r.incompleto).toBe(true);
    expect(r.margemCentavos).toBeNull();
    expect(r.margemPb).toBeNull();
    expect(r.faltando.join(" ")).toMatch(/Ferragem sem preço/);
    expect(r.margemComOQueSeSabeCentavos).not.toBeNull();
  });

  it("saída de produto sem custo e mão de obra por m² vazia também deixam incompleta", async () => {
    const semCusto = await prod("Roldana sem custo", null);
    await mover({ produtoId: semCusto.id, tipo: "ENTRADA_COMPRA", quantidadeMilesimos: 4_000, data: DIA });
    await mover({ produtoId: semCusto.id, tipo: "SAIDA_OBRA", quantidadeMilesimos: 2_000, data: DIA, projetoId: obraId });
    await definirMaoDeObra(null);
    try {
      const c = await carregarCustoDaObra(obraId);
      expect(c.resultado.incompleto).toBe(true);
      expect(c.resultado.faltando.some((f) => f.includes("Roldana sem custo"))).toBe(true);
      expect(c.resultado.faltando.some((f) => f.includes("mão de obra por m²"))).toBe(true);
      expect(c.linhas.find((l) => l.grupo === "MAO_DE_OBRA")).toMatchObject({ valorCentavos: null, href: "/configuracoes/empresa" });
    } finally {
      await definirMaoDeObra(16_000);
    }
  });

  it("obra sem proposta aprovada não tem receita nem margem (incompleta)", async () => {
    const c = await carregarCustoDaObra(outraObraId);
    expect(c.propostas).toEqual([]);
    expect(c.resultado).toMatchObject({ incompleto: true, margemCentavos: null, receitaDaMargemCentavos: null });
  });
});
