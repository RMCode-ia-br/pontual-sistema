import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { criarClientePrisma } from "@/lib/db/criar-cliente";
import { calcularPrecoDoItem, reservarNumeroDeProposta } from "@/modules/propostas/servico";

import { comConexao } from "./banco-teste";

const PREFIXO = "Int Prop";
const prisma = criarClientePrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL);

let contadorOriginal: { proximo: number | null; ano: number | null };
let tipologiaId: string;
let produtoId: string;

async function limpar() {
  await comConexao(async (c) => {
    await c.query(`DELETE FROM "TabelaPreco" WHERE "tipologiaId" IN (SELECT id FROM "Tipologia" WHERE nome LIKE $1)`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "ComposicaoInsumo" WHERE "tipologiaId" IN (SELECT id FROM "Tipologia" WHERE nome LIKE $1)`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "ComposicaoMaoDeObra" WHERE "tipologiaId" IN (SELECT id FROM "Tipologia" WHERE nome LIKE $1)`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Tipologia" WHERE nome LIKE $1`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Produto" WHERE codigo LIKE 'INT-PROP-%'`);
  });
}

beforeAll(async () => {
  await limpar();
  const cfg = await prisma.configuracaoEmpresa.findUniqueOrThrow({ where: { id: "singleton" }, select: { proximoNumeroProposta: true, anoNumeracaoProposta: true } });
  contadorOriginal = { proximo: cfg.proximoNumeroProposta, ano: cfg.anoNumeracaoProposta };

  produtoId = (await prisma.produto.create({ data: { codigo: "INT-PROP-1", descricao: `${PREFIXO} Perfil`, unidade: "M", custoUnitarioCentavos: 5000 } })).id;
  const t = await prisma.tipologia.create({
    data: {
      nome: `${PREFIXO} Tipologia`,
      categoria: "JANELA",
      tipoDesenho: "JANELA_CORRER",
      templateDescricao: "JANELA {MEDIDAS}",
      categoriaMarkup: "PADRAO",
      insumos: { create: [{ produtoId, unidade: "M", formulaQuantidade: "(L/1000)*2 + (A/1000)*2", perdaPb: 0, ordem: 0 }] },
    },
  });
  tipologiaId = t.id;
});

afterAll(async () => {
  await comConexao((c) => c.query(`UPDATE "ConfiguracaoEmpresa" SET "proximoNumeroProposta" = $1, "anoNumeracaoProposta" = $2 WHERE id = 'singleton'`, [contadorOriginal.proximo, contadorOriginal.ano]));
  await limpar();
  await prisma.$disconnect();
});

const base = { tipologiaId: null, linhaId: null, acabamentoId: null, tipoVidroId: null, espessuraVidroMm: null, folhas: 2, valorManualCentavos: null, markupItemPb: null, markupPropostaPb: null };
const um = [{ larguraMm: 1000, alturaMm: 1000, quantidade: 1 }];

describe("numeração das propostas (banco real)", () => {
  it("reservas simultâneas nunca repetem o número e saem consecutivas", async () => {
    const inicio = (await prisma.configuracaoEmpresa.findUniqueOrThrow({ where: { id: "singleton" }, select: { proximoNumeroProposta: true } })).proximoNumeroProposta ?? 2000;
    const numeros = await Promise.all(Array.from({ length: 8 }, () => prisma.$transaction((tx) => reservarNumeroDeProposta(tx))));
    const sequenciais = numeros.map((n) => n.sequencial).sort((a, b) => a - b);
    expect(new Set(sequenciais).size).toBe(8);
    expect(sequenciais).toEqual(Array.from({ length: 8 }, (_, i) => inicio + i));
    expect(numeros[0].numero).toMatch(/^\d{4}-\d{2}$/);
  }, 60_000);

  it("transação desfeita devolve o número (não deixa buraco)", async () => {
    const antes = (await prisma.configuracaoEmpresa.findUniqueOrThrow({ where: { id: "singleton" }, select: { proximoNumeroProposta: true } })).proximoNumeroProposta;
    await expect(
      prisma.$transaction(async (tx) => {
        await reservarNumeroDeProposta(tx);
        throw new Error("falha proposital");
      }),
    ).rejects.toThrow("falha proposital");
    const depois = (await prisma.configuracaoEmpresa.findUniqueOrThrow({ where: { id: "singleton" }, select: { proximoNumeroProposta: true } })).proximoNumeroProposta;
    expect(depois).toBe(antes);
  });
});

describe("cálculo do preço do item (banco real)", () => {
  it("MANUAL: usa o valor digitado, sem markup", async () => {
    const r = await calcularPrecoDoItem(prisma, { ...base, modoPreco: "MANUAL", medidas: um, valorManualCentavos: 123456 });
    expect(r).toMatchObject({ ok: true, modoPreco: "MANUAL", precoTotalCentavos: 123456, markupPb: null });
  });

  it("MANUAL sem valor é recusado; sem medida também", async () => {
    expect((await calcularPrecoDoItem(prisma, { ...base, modoPreco: "MANUAL", medidas: um })).ok).toBe(false);
    expect((await calcularPrecoDoItem(prisma, { ...base, modoPreco: "MANUAL", medidas: [], valorManualCentavos: 1 })).ok).toBe(false);
  });

  it("COMPOSICAO: custo × (1 + markup padrão 80%)", async () => {
    // 1 m × 1 m: perfil 4 m × R$ 50 = R$ 200,00 de custo
    const r = await calcularPrecoDoItem(prisma, { ...base, modoPreco: "COMPOSICAO", tipologiaId, medidas: um });
    const cfg = await prisma.configuracaoEmpresa.findUniqueOrThrow({ where: { id: "singleton" }, select: { markupPadraoPb: true } });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.custoEstimadoCentavos).toBe(20000);
      expect(r.markupPb).toBe(cfg.markupPadraoPb);
      expect(r.precoTotalCentavos).toBe(Math.round((20000 * (10000 + cfg.markupPadraoPb)) / 10000));
    }
  });

  it("COMPOSICAO: markup do item vence o da proposta e o padrão", async () => {
    const r = await calcularPrecoDoItem(prisma, { ...base, modoPreco: "COMPOSICAO", tipologiaId, medidas: um, markupItemPb: 10000, markupPropostaPb: 5000 });
    expect(r).toMatchObject({ ok: true, markupPb: 10000, precoTotalCentavos: 40000 });
    const p = await calcularPrecoDoItem(prisma, { ...base, modoPreco: "COMPOSICAO", tipologiaId, medidas: um, markupPropostaPb: 5000 });
    expect(p).toMatchObject({ ok: true, markupPb: 5000, precoTotalCentavos: 30000 });
  });

  it("COMPOSICAO: custo incompleto (produto sem custo) nunca vira zero", async () => {
    await prisma.produto.update({ where: { id: produtoId }, data: { custoUnitarioCentavos: null } });
    const r = await calcularPrecoDoItem(prisma, { ...base, modoPreco: "COMPOSICAO", tipologiaId, medidas: um });
    await prisma.produto.update({ where: { id: produtoId }, data: { custoUnitarioCentavos: 5000 } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toMatch(/Falta informar/);
  });

  it("TABELA: sem linha cai em manual com aviso (R1); com linha, usa o preço da tabela", async () => {
    const sem = await calcularPrecoDoItem(prisma, { ...base, modoPreco: "TABELA", tipologiaId, medidas: um });
    expect(sem).toMatchObject({ ok: false, semTabela: true });

    const comManual = await calcularPrecoDoItem(prisma, { ...base, modoPreco: "TABELA", tipologiaId, medidas: um, valorManualCentavos: 70000 });
    expect(comManual).toMatchObject({ ok: true, modoPreco: "MANUAL", precoTotalCentavos: 70000 });
    if (comManual.ok) expect(comManual.aviso).toMatch(/Sem preço na tabela/);

    await prisma.tabelaPreco.create({ data: { tipologiaId, cobranca: "POR_M2", valorCentavos: 85000 } });
    const com = await calcularPrecoDoItem(prisma, { ...base, modoPreco: "TABELA", tipologiaId, medidas: [{ larguraMm: 2000, alturaMm: 1500, quantidade: 2 }] });
    // 6 m² × R$ 850,00
    expect(com).toMatchObject({ ok: true, modoPreco: "TABELA", cobranca: "POR_M2", precoTotalCentavos: 510000 });
  });
});
