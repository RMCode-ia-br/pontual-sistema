import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Prisma } from "@/generated/prisma/client";
import type { UsuarioSessao } from "@/lib/auth/sessao";
import { criarClientePrisma } from "@/lib/db/criar-cliente";
import { estornarMovimentoDeEstoque, registrarMovimentoDeEstoque } from "@/modules/estoque/servico";
import { ajustarSucata, baixarPerfilParaObra, descartarRetalho, saldoDaSucata, usarRetalhoEmObra, venderSucata, type EntradaDeBaixaDePerfil } from "@/modules/estoque/servico-retalhos";

import { comConexao, criarUsuarioDeTeste } from "./banco-teste";

/**
 * Retalhos e sucata (R14). O retalho mínimo de Configurações é trocado durante o teste e restaurado no fim; a sucata é um saldo
 * global, então os testes comparam por DIFERENÇA e só criam registros ligados a produtos/obras "Int Ret".
 */
const PREFIXO = "Int Ret";
const LOGIN = "int-retalhos";
const prisma = criarClientePrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL);
const AGORA = new Date("2026-11-20T15:00:00Z");

let usuario: UsuarioSessao;
let obraId: string;
let obra2Id: string;
let leadId: string;
let contaId: string;
/** Categoria de receita do próprio teste (o dono pode renomear ou excluir a "Venda de sucata" semeada). */
let categoriaReceitaId: string;
let minimoOriginal: number | null;
/** Sucata que já existia antes dos testes (dado real): os testes que venderiam "tudo" só rodam quando isto é zero. */
let sucataReal = 0;

const tx = <T>(fn: (t: Prisma.TransactionClient) => Promise<T>) => prisma.$transaction(fn, { timeout: 30_000 });
const ctx = () => ({ usuario, ip: null, agora: AGORA });
const definirMinimo = (mm: number | null) => comConexao((c) => c.query(`UPDATE "ConfiguracaoEmpresa" SET "retalhoMinimoMm" = $1 WHERE id = 'singleton'`, [mm]));
const kgDaSucata = async () => (await saldoDaSucata(prisma)).pesoMilesimosKg;
const semPesoDaSucata = async () => (await saldoDaSucata(prisma)).comprimentoSemPesoMm;
const saldoDe = async (id: string) => Number((await prisma.produto.findUniqueOrThrow({ where: { id } })).saldoCache.toString());

async function perfil(nome: string, extra: Partial<Prisma.ProdutoUncheckedCreateInput> = {}) {
  const p = await prisma.produto.create({
    data: { codigo: `INT-RET-${randomUUID().slice(0, 8)}`, descricao: `${PREFIXO} ${nome}`, unidade: "BARRA", comprimentoBarraMm: 6000, pesoKgPorMetro: "0.5", custoUnitarioCentavos: 15_000, ...extra },
  });
  await tx((t) => registrarMovimentoDeEstoque(t, { produtoId: p.id, tipo: "ENTRADA_COMPRA", quantidadeMilesimos: 20_000, data: "2026-11-01" }, ctx()));
  return p;
}

const baixar = (e: Partial<EntradaDeBaixaDePerfil> & Pick<EntradaDeBaixaDePerfil, "produtoId" | "modo">) => tx((t) => baixarPerfilParaObra(t, { projetoId: obraId, data: "2026-11-19", ...e }, ctx()));

async function limpar() {
  await comConexao(async (c) => {
    const produtos = `SELECT id FROM "Produto" WHERE codigo LIKE 'INT-RET-%'`;
    const projetos = `SELECT id FROM "Projeto" WHERE titulo LIKE '${PREFIXO}%'`;
    await c.query(`DELETE FROM "LogAuditoria" WHERE "usuarioId" IN (SELECT id FROM "Usuario" WHERE login = $1)`, [LOGIN]);
    await c.query(`DELETE FROM "MovimentoSucata" WHERE "produtoId" IN (${produtos}) OR "projetoId" IN (${projetos}) OR observacao LIKE '${PREFIXO}%'`);
    await c.query(`DELETE FROM "Lancamento" WHERE "contaFinanceiraId" IN (SELECT id FROM "ContaFinanceira" WHERE nome LIKE '${PREFIXO}%')`);
    await c.query(`DELETE FROM "Retalho" WHERE "produtoId" IN (${produtos})`);
    await c.query(`UPDATE "MovimentoEstoque" SET "estornoDeId" = NULL WHERE "produtoId" IN (${produtos})`);
    await c.query(`DELETE FROM "MovimentoEstoque" WHERE "produtoId" IN (${produtos})`);
    await c.query(`DELETE FROM "HistoricoPreco" WHERE "produtoId" IN (${produtos})`);
    await c.query(`DELETE FROM "Produto" WHERE codigo LIKE 'INT-RET-%'`);
    await c.query(`DELETE FROM "ContaFinanceira" WHERE nome LIKE '${PREFIXO}%'`);
    await c.query(`DELETE FROM "CategoriaFinanceira" WHERE nome LIKE '${PREFIXO}%'`);
    await c.query(`DELETE FROM "Projeto" WHERE titulo LIKE '${PREFIXO}%'`);
    await c.query(`DELETE FROM "Cliente" WHERE nome LIKE '${PREFIXO}%'`);
    await c.query(`DELETE FROM "Usuario" WHERE login = $1`, [LOGIN]);
  });
}

beforeAll(async () => {
  await limpar();
  minimoOriginal = (await prisma.configuracaoEmpresa.findUniqueOrThrow({ where: { id: "singleton" }, select: { retalhoMinimoMm: true } })).retalhoMinimoMm;
  sucataReal = (await saldoDaSucata(prisma)).pesoMilesimosKg;
  await definirMinimo(1000);
  await criarUsuarioDeTeste(LOGIN, "senha-de-teste-123");
  const u = await prisma.usuario.findUniqueOrThrow({ where: { login: LOGIN } });
  usuario = { id: u.id, nome: u.nome, login: u.login, email: u.email, papel: "ADMIN", precisaTrocarSenha: false };
  const clienteId = (await prisma.cliente.create({ data: { nome: `${PREFIXO} Cliente`, tipoPessoa: "PF" } })).id;
  const projeto = (titulo: string, status: "APROVADO" | "NOVO_LEAD") => prisma.projeto.create({ data: { codigo: `P-0000-${randomUUID().slice(0, 8)}`, titulo: `${PREFIXO} ${titulo}`, clienteId, status, responsavelId: usuario.id } });
  obraId = (await projeto("Obra A", "APROVADO")).id;
  obra2Id = (await projeto("Obra B", "APROVADO")).id;
  leadId = (await projeto("Lead", "NOVO_LEAD")).id;
  contaId = (await prisma.contaFinanceira.create({ data: { nome: `${PREFIXO} Banco`, saldoInicialInformado: true, saldoInicialCentavos: 0, dataSaldoInicial: new Date("2026-11-01T00:00:00Z") } })).id;
  categoriaReceitaId = (await prisma.categoriaFinanceira.create({ data: { nome: `${PREFIXO} Receita`, tipo: "RECEITA", grupo: "OUTRAS_RECEITAS", grupoDre: "Outras receitas" } })).id;
});

afterAll(async () => {
  await limpar();
  await definirMinimo(minimoOriginal);
  await prisma.$disconnect();
});

describe("baixa de perfil para a obra", () => {
  it("barras inteiras: baixa do saldo ao custo da época, sem retalho nem sucata", async () => {
    const p = await perfil("Inteiras");
    const antes = await kgDaSucata();
    const r = await baixar({ produtoId: p.id, modo: "BARRAS_INTEIRAS", barras: 3 });
    expect(r.sobra).toBeNull();
    expect(await saldoDe(p.id)).toBe(17);
    const m = await prisma.movimentoEstoque.findUniqueOrThrow({ where: { id: r.movimentoId } });
    expect(m).toMatchObject({ tipo: "SAIDA_OBRA", projetoId: obraId, custoUnitarioCentavos: 15_000 });
    expect(m.quantidade.toString()).toBe("-3");
    expect(await prisma.retalho.count({ where: { produtoId: p.id } })).toBe(0);
    expect(await kgDaSucata()).toBe(antes);
  });

  it("barra cortada com sobra ≥ mínimo: baixa UMA barra inteira e a sobra vira retalho DISPONIVEL (6.000 − 4.200 = 1.800)", async () => {
    const p = await perfil("Retalho");
    const r = await baixar({ produtoId: p.id, modo: "BARRA_CORTADA", usadoMm: 4200, local: "Prateleira 2" });
    expect(r.sobra).toMatchObject({ destino: "RETALHO", comprimentoMm: 1800 });
    expect(await saldoDe(p.id)).toBe(19); // uma barra inteira saiu do estoque
    const retalho = await prisma.retalho.findFirstOrThrow({ where: { produtoId: p.id } });
    expect(retalho).toMatchObject({ comprimentoMm: 1800, status: "DISPONIVEL", local: "Prateleira 2", origemProjetoId: obraId, origemMovimentoId: r.movimentoId });
    expect(await prisma.logAuditoria.count({ where: { entidade: "Retalho", entidadeId: retalho.id, acao: "CRIAR" } })).toBe(1);
  });

  it("sobra menor que o mínimo vira sucata em kg: 600 mm × 0,5 kg/m = 0,300 kg", async () => {
    const p = await perfil("Sucata");
    const antes = await kgDaSucata();
    const r = await baixar({ produtoId: p.id, modo: "BARRA_CORTADA", usadoMm: 5400 });
    expect(r.sobra).toMatchObject({ destino: "SUCATA", comprimentoMm: 600, pesoMilesimosKg: 300 });
    expect(await kgDaSucata()).toBe(antes + 300);
    expect(await prisma.retalho.count({ where: { produtoId: p.id } })).toBe(0);
    const s = await prisma.movimentoSucata.findFirstOrThrow({ where: { produtoId: p.id } });
    expect(s).toMatchObject({ tipo: "GERACAO", comprimentoMm: 600, projetoId: obraId });
    expect(s.pesoKg?.toString()).toBe("0.3");
  });

  it("sem peso por metro, a sucata guarda só o comprimento (peso null), fora do saldo em kg", async () => {
    const p = await perfil("Sem peso", { pesoKgPorMetro: null });
    const kg = await kgDaSucata();
    const mm = await semPesoDaSucata();
    const r = await baixar({ produtoId: p.id, modo: "BARRA_CORTADA", usadoMm: 5500 });
    expect(r.sobra).toMatchObject({ destino: "SUCATA", comprimentoMm: 500, pesoMilesimosKg: null });
    expect(await kgDaSucata()).toBe(kg);
    expect(await semPesoDaSucata()).toBe(mm + 500);
  });

  it("sem retalho mínimo definido, NÃO decide sozinho: exige a escolha e não grava nada sem ela", async () => {
    await definirMinimo(null);
    try {
      const p = await perfil("Decidir");
      await expect(baixar({ produtoId: p.id, modo: "BARRA_CORTADA", usadoMm: 4000 })).rejects.toThrow(/retalho mínimo/);
      expect(await saldoDe(p.id)).toBe(20); // a baixa inteira foi desfeita (mesma transação)
      expect(await prisma.retalho.count({ where: { produtoId: p.id } })).toBe(0);

      const r = await baixar({ produtoId: p.id, modo: "BARRA_CORTADA", usadoMm: 4000, destinoDaSobra: "RETALHO" });
      expect(r.sobra).toMatchObject({ destino: "RETALHO", comprimentoMm: 2000 });
      const kg = await kgDaSucata();
      const s = await baixar({ produtoId: p.id, modo: "BARRA_CORTADA", usadoMm: 4000, destinoDaSobra: "SUCATA" });
      expect(s.sobra).toMatchObject({ destino: "SUCATA", pesoMilesimosKg: 1000 });
      expect(await kgDaSucata()).toBe(kg + 1000);
    } finally {
      await definirMinimo(1000);
    }
  });

  it("usar a barra toda não deixa sobra; recusa uso maior que a barra, produto sem comprimento, produto que não é barra e obra não aprovada", async () => {
    const p = await perfil("Bordas");
    expect((await baixar({ produtoId: p.id, modo: "BARRA_CORTADA", usadoMm: 6000 })).sobra).toMatchObject({ destino: "NENHUMA" });
    await expect(baixar({ produtoId: p.id, modo: "BARRA_CORTADA", usadoMm: 6001 })).rejects.toThrow(/passa do tamanho da barra/);
    await expect(baixar({ produtoId: p.id, modo: "BARRA_CORTADA", usadoMm: 0 })).rejects.toThrow(/comprimento usado/);
    await expect(baixar({ produtoId: p.id, modo: "BARRAS_INTEIRAS", barras: 0 })).rejects.toThrow(/barras inteiras/);
    await expect(baixar({ produtoId: p.id, modo: "BARRA_CORTADA", usadoMm: 1000, projetoId: leadId })).rejects.toThrow(/aprovadas/);

    const semComprimento = await perfil("Sem comprimento", { comprimentoBarraMm: null });
    await expect(baixar({ produtoId: semComprimento.id, modo: "BARRA_CORTADA", usadoMm: 1000 })).rejects.toThrow(/comprimento da barra/);
    const naoBarra = await perfil("Em metros", { unidade: "M" });
    await expect(baixar({ produtoId: naoBarra.id, modo: "BARRAS_INTEIRAS", barras: 1 })).rejects.toThrow(/unidade é “Barra”/);
  });

  it("sem saldo de barras, exige confirmação e justificativa como qualquer saída", async () => {
    const p = await perfil("Sem saldo");
    await expect(baixar({ produtoId: p.id, modo: "BARRAS_INTEIRAS", barras: 25 })).rejects.toThrow(/maior que o saldo/);
    await baixar({ produtoId: p.id, modo: "BARRAS_INTEIRAS", barras: 25, confirmarSemSaldo: true, justificativa: "Chega amanhã" });
    expect(await saldoDe(p.id)).toBe(-5);
  });
});

describe("usar e descartar retalho", () => {
  it("usar em obra: vira CONSUMIDO com a obra; só uma vez; só em obra aprovada", async () => {
    const p = await perfil("Usar");
    const r = await baixar({ produtoId: p.id, modo: "BARRA_CORTADA", usadoMm: 4200 });
    const retalhoId = r.sobra!.retalhoId!;
    await expect(tx((t) => usarRetalhoEmObra(t, { retalhoId, projetoId: leadId }, ctx()))).rejects.toThrow(/aprovadas/);
    await tx((t) => usarRetalhoEmObra(t, { retalhoId, projetoId: obra2Id }, ctx()));
    const retalho = await prisma.retalho.findUniqueOrThrow({ where: { id: retalhoId } });
    expect(retalho).toMatchObject({ status: "CONSUMIDO", consumidoProjetoId: obra2Id });
    expect(retalho.consumidoEm).not.toBeNull();
    await expect(tx((t) => usarRetalhoEmObra(t, { retalhoId, projetoId: obra2Id }, ctx()))).rejects.toThrow(/já foi usado ou descartado/);
    expect(await saldoDe(p.id)).toBe(19); // usar retalho não mexe no saldo de barras
  });

  it("dois usos simultâneos do mesmo retalho: só um vale", async () => {
    const p = await perfil("Usar concorrente");
    const retalhoId = (await baixar({ produtoId: p.id, modo: "BARRA_CORTADA", usadoMm: 4200 })).sobra!.retalhoId!;
    const r = await Promise.allSettled([tx((t) => usarRetalhoEmObra(t, { retalhoId, projetoId: obraId }, ctx())), tx((t) => usarRetalhoEmObra(t, { retalhoId, projetoId: obra2Id }, ctx()))]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect((await prisma.retalho.findUniqueOrThrow({ where: { id: retalhoId } })).status).toBe("CONSUMIDO");
  });

  it("descartar exige motivo; pode mandar o pedaço para a sucata (peso pelo peso por metro); não descarta duas vezes", async () => {
    const p = await perfil("Descartar");
    const retalhoId = (await baixar({ produtoId: p.id, modo: "BARRA_CORTADA", usadoMm: 4200 })).sobra!.retalhoId!; // 1.800 mm
    await expect(tx((t) => descartarRetalho(t, { retalhoId, motivo: " ", virarSucata: true }, ctx()))).rejects.toThrow(/motivo/);
    const antes = await kgDaSucata();
    await tx((t) => descartarRetalho(t, { retalhoId, motivo: "Torto", virarSucata: true }, ctx()));
    expect(await kgDaSucata()).toBe(antes + 900); // 1,8 m × 0,5 kg/m
    expect(await prisma.retalho.findUniqueOrThrow({ where: { id: retalhoId } })).toMatchObject({ status: "DESCARTADO", observacao: "Torto" });
    await expect(tx((t) => descartarRetalho(t, { retalhoId, motivo: "de novo", virarSucata: false }, ctx()))).rejects.toThrow(/já foi usado ou descartado/);

    const outro = (await baixar({ produtoId: p.id, modo: "BARRA_CORTADA", usadoMm: 4200 })).sobra!.retalhoId!;
    const kg = await kgDaSucata();
    await tx((t) => descartarRetalho(t, { retalhoId: outro, motivo: "Jogado fora", virarSucata: false }, ctx()));
    expect(await kgDaSucata()).toBe(kg);
  });
});

describe("sucata: venda e ajuste", () => {
  async function gerar(kgEsperado = 300) {
    const p = await perfil("Gera sucata");
    const r = await baixar({ produtoId: p.id, modo: "BARRA_CORTADA", usadoMm: 5400 });
    expect(r.sobra).toMatchObject({ pesoMilesimosKg: kgEsperado });
    return p;
  }
  const vender = (e: Partial<Parameters<typeof venderSucata>[1]> & { pesoMilesimosKg: number }) =>
    tx((t) => venderSucata(t, { data: "2026-11-19", valorCentavos: 8_000, contaFinanceiraId: null, categoriaId: null, observacao: `${PREFIXO} venda`, ...e }, ctx()));

  it("vende o peso digitado pelo valor digitado: baixa o saldo e (com a conta) lança a entrada no financeiro", async () => {
    await gerar();
    const antes = await kgDaSucata();
    const r = await vender({ pesoMilesimosKg: 300, valorCentavos: 12_345, contaFinanceiraId: contaId, categoriaId: categoriaReceitaId });
    expect(await kgDaSucata()).toBe(antes - 300);
    expect(r.lancamentoId).not.toBeNull();
    const l = await prisma.lancamento.findUniqueOrThrow({ where: { id: r.lancamentoId! }, include: { categoria: true } });
    expect(l).toMatchObject({ tipo: "ENTRADA", valorCentavos: 12_345, contaFinanceiraId: contaId, estornadoEm: null });
    expect(l.categoriaId).toBe(categoriaReceitaId);
    const m = await prisma.movimentoSucata.findUniqueOrThrow({ where: { id: r.id } });
    expect(m).toMatchObject({ tipo: "VENDA", valorCentavos: 12_345, lancamentoId: r.lancamentoId });
    expect(await prisma.logAuditoria.count({ where: { entidade: "MovimentoSucata", entidadeId: r.id, acao: "VENDER" } })).toBe(1);
  });

  it("com a conta e sem categoria, usa a \"Venda de sucata\" do catálogo; se o dono a renomeou ou desativou, pede a categoria e nada é gravado", async () => {
    // O código procura a categoria padrão pelo NOME; este teste confere o comportamento nos dois cenários possíveis do banco.
    const padrao = await prisma.categoriaFinanceira.findFirst({ where: { tipo: "RECEITA", nome: { equals: "Venda de sucata", mode: "insensitive" }, ativo: true, deletadoEm: null }, select: { id: true } });
    await gerar();
    const saldo = await kgDaSucata();
    if (padrao) {
      const r = await vender({ pesoMilesimosKg: 100, valorCentavos: 4_000, contaFinanceiraId: contaId });
      expect((await prisma.lancamento.findUniqueOrThrow({ where: { id: r.lancamentoId! } })).categoriaId).toBe(padrao.id);
      expect(await kgDaSucata()).toBe(saldo - 100);
    } else {
      await expect(vender({ pesoMilesimosKg: 100, valorCentavos: 4_000, contaFinanceiraId: contaId })).rejects.toThrow(/Escolha a categoria/);
      expect(await kgDaSucata()).toBe(saldo);
    }
  });

  it("sem escolher a conta, só registra a venda (nenhum lançamento)", async () => {
    await gerar();
    const lancamentos = await prisma.lancamento.count();
    const r = await vender({ pesoMilesimosKg: 100, valorCentavos: 4_000 });
    expect(r.lancamentoId).toBeNull();
    expect(await prisma.lancamento.count()).toBe(lancamentos);
  });

  it("recusa peso maior que o saldo, peso/valor zero e data futura com lançamento; nada é gravado", async () => {
    await gerar();
    const saldo = await kgDaSucata();
    await expect(vender({ pesoMilesimosKg: saldo + 1 })).rejects.toThrow(/Só há/);
    await expect(vender({ pesoMilesimosKg: 0 })).rejects.toThrow(/peso vendido/);
    await expect(vender({ pesoMilesimosKg: 100, valorCentavos: 0 })).rejects.toThrow(/valor da venda/);
    await expect(vender({ pesoMilesimosKg: 100, contaFinanceiraId: contaId, data: "2026-12-31" })).rejects.toThrow(/futuro/);
    expect(await kgDaSucata()).toBe(saldo);
  });

  it("duas vendas simultâneas nunca passam do saldo (só roda se não há sucata real: venderia o saldo todo)", async () => {
    if (sucataReal > 0) return;
    await gerar();
    const saldo = await kgDaSucata();
    const r = await Promise.allSettled([vender({ pesoMilesimosKg: saldo }), vender({ pesoMilesimosKg: saldo })]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await kgDaSucata()).toBe(0);
  });

  it("ajuste acrescenta ou retira kg com observação; não deixa o saldo negativo", async () => {
    const antes = await kgDaSucata();
    await tx((t) => ajustarSucata(t, { data: "2026-11-19", pesoMilesimosKg: 2_500, observacao: `${PREFIXO} pesei de novo` }, ctx()));
    expect(await kgDaSucata()).toBe(antes + 2_500);
    await tx((t) => ajustarSucata(t, { data: "2026-11-19", pesoMilesimosKg: -1_000, observacao: `${PREFIXO} sobrou menos` }, ctx()));
    expect(await kgDaSucata()).toBe(antes + 1_500);
    await expect(tx((t) => ajustarSucata(t, { data: "2026-11-19", pesoMilesimosKg: -(antes + 1_500) - 1, observacao: `${PREFIXO} demais` }, ctx()))).rejects.toThrow(/negativa/);
    await expect(tx((t) => ajustarSucata(t, { data: "2026-11-19", pesoMilesimosKg: 0, observacao: `${PREFIXO} zero` }, ctx()))).rejects.toThrow(/diferente de zero/);
    await expect(tx((t) => ajustarSucata(t, { data: "2026-11-19", pesoMilesimosKg: 100, observacao: "  " }, ctx()))).rejects.toThrow(/Explique/);
  });
});

describe("estorno de uma saída por corte", () => {
  it("retalho ainda disponível: o estorno devolve a barra, descarta o retalho gerado e retira a sucata gerada", async () => {
    const p = await perfil("Estorno retalho");
    const r = await baixar({ produtoId: p.id, modo: "BARRA_CORTADA", usadoMm: 4200 });
    expect(await saldoDe(p.id)).toBe(19);
    await tx((t) => estornarMovimentoDeEstoque(t, r.movimentoId, "Cortei na obra errada", ctx()));
    expect(await saldoDe(p.id)).toBe(20);
    expect((await prisma.retalho.findFirstOrThrow({ where: { produtoId: p.id } })).status).toBe("DESCARTADO");

    const q = await perfil("Estorno sucata");
    const antes = await kgDaSucata();
    const s = await baixar({ produtoId: q.id, modo: "BARRA_CORTADA", usadoMm: 5400 });
    expect(await kgDaSucata()).toBe(antes + 300);
    await tx((t) => estornarMovimentoDeEstoque(t, s.movimentoId, "Erro de lançamento", ctx()));
    expect(await kgDaSucata()).toBe(antes);
    expect(await saldoDe(q.id)).toBe(20);
  });

  it("recusa estornar se o retalho já foi usado ou se a sucata já foi vendida", async () => {
    const p = await perfil("Estorno recusado");
    const r = await baixar({ produtoId: p.id, modo: "BARRA_CORTADA", usadoMm: 4200 });
    await tx((t) => usarRetalhoEmObra(t, { retalhoId: r.sobra!.retalhoId!, projetoId: obra2Id }, ctx()));
    await expect(tx((t) => estornarMovimentoDeEstoque(t, r.movimentoId, "tarde demais", ctx()))).rejects.toThrow(/já foi usado ou descartado/);

    // Tudo numa transação que SEMPRE desfaz (o erro do estorno a aborta): vende-se o saldo todo sem gravar nada de verdade.
    const q = await perfil("Estorno sucata vendida");
    await expect(
      tx(async (t) => {
        const s = await baixarPerfilParaObra(t, { produtoId: q.id, projetoId: obraId, data: "2026-11-19", modo: "BARRA_CORTADA", usadoMm: 5400 }, ctx());
        await venderSucata(t, { data: "2026-11-19", pesoMilesimosKg: await kgNaTx(t), valorCentavos: 5_000, contaFinanceiraId: null, categoriaId: null, observacao: `${PREFIXO} vendi tudo` }, ctx());
        await estornarMovimentoDeEstoque(t, s.movimentoId, "tarde demais", ctx());
      }),
    ).rejects.toThrow(/já foi vendida/);
    expect(await saldoDe(q.id)).toBe(20); // nada ficou gravado
  });
});

async function kgNaTx(t: Prisma.TransactionClient): Promise<number> {
  return (await saldoDaSucata(t)).pesoMilesimosKg;
}
