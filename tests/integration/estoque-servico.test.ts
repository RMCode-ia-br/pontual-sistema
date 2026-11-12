import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Prisma } from "@/generated/prisma/client";
import type { UsuarioSessao } from "@/lib/auth/sessao";
import { criarClientePrisma } from "@/lib/db/criar-cliente";
import { contarEstoqueInicial, estornarMovimentoDeEstoque, registrarMovimentoDeEstoque, type EntradaDeMovimento } from "@/modules/estoque/servico";
import { estoqueDoProduto, listarMovimentos, lerListaMovimentos, produtosSemMovimento } from "@/modules/estoque/queries";

import { comConexao, criarUsuarioDeTeste } from "./banco-teste";

const PREFIXO = "Int Est";
const LOGIN = "int-estoque";
const prisma = criarClientePrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL);
const AGORA = new Date("2026-11-20T15:00:00Z");

let usuario: UsuarioSessao;
let obraId: string;
let obraNaoAprovadaId: string;

const tx = <T>(fn: (t: Prisma.TransactionClient) => Promise<T>) => prisma.$transaction(fn, { timeout: 30_000 });
const ctx = () => ({ usuario, ip: null, agora: AGORA });
const mover = (e: Partial<EntradaDeMovimento> & Pick<EntradaDeMovimento, "produtoId" | "tipo" | "quantidadeMilesimos">) => tx((t) => registrarMovimentoDeEstoque(t, { data: "2026-11-19", ...e }, ctx()));
const produtoDe = (id: string) => prisma.produto.findUniqueOrThrow({ where: { id } });
const saldo = async (id: string) => Number((await produtoDe(id)).saldoCache.toString());
const somaDosMovimentos = async (id: string) => {
  const m = await prisma.movimentoEstoque.findMany({ where: { produtoId: id } });
  return m.reduce((s, x) => s + Number(x.quantidade.toString()), 0);
};

async function novoProduto(nome: string, custo: number | null = 1000) {
  return prisma.produto.create({ data: { codigo: `INT-EST-${randomUUID().slice(0, 8)}`, descricao: `${PREFIXO} ${nome}`, unidade: "UN", custoUnitarioCentavos: custo } });
}

async function limpar() {
  await comConexao(async (c) => {
    const produtos = `SELECT id FROM "Produto" WHERE codigo LIKE 'INT-EST-%'`;
    await c.query(`DELETE FROM "LogAuditoria" WHERE "usuarioId" IN (SELECT id FROM "Usuario" WHERE login = $1)`, [LOGIN]);
    await c.query(`UPDATE "MovimentoEstoque" SET "estornoDeId" = NULL WHERE "produtoId" IN (${produtos})`);
    await c.query(`DELETE FROM "MovimentoEstoque" WHERE "produtoId" IN (${produtos})`);
    await c.query(`DELETE FROM "HistoricoPreco" WHERE "produtoId" IN (${produtos})`);
    await c.query(`DELETE FROM "Produto" WHERE codigo LIKE 'INT-EST-%'`);
    await c.query(`DELETE FROM "Projeto" WHERE titulo LIKE $1`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Cliente" WHERE nome LIKE $1`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Usuario" WHERE login = $1`, [LOGIN]);
  });
}

beforeAll(async () => {
  await limpar();
  await criarUsuarioDeTeste(LOGIN, "senha-de-teste-123");
  const u = await prisma.usuario.findUniqueOrThrow({ where: { login: LOGIN } });
  usuario = { id: u.id, nome: u.nome, login: u.login, email: u.email, papel: "ADMIN", precisaTrocarSenha: false };
  const clienteId = (await prisma.cliente.create({ data: { nome: `${PREFIXO} Cliente`, tipoPessoa: "PF" } })).id;
  obraId = (await prisma.projeto.create({ data: { codigo: `P-0000-${randomUUID().slice(0, 8)}`, titulo: `${PREFIXO} Obra`, clienteId, status: "APROVADO", responsavelId: usuario.id } })).id;
  obraNaoAprovadaId = (await prisma.projeto.create({ data: { codigo: `P-0000-${randomUUID().slice(0, 8)}`, titulo: `${PREFIXO} Lead`, clienteId, status: "NOVO_LEAD", responsavelId: usuario.id } })).id;
});

afterAll(async () => {
  await limpar();
  await prisma.$disconnect();
});

describe("movimentos de estoque", () => {
  it("entrada soma, saída com saldo subtrai; o saldo em cache é sempre a soma dos movimentos; tudo auditado", async () => {
    const p = await novoProduto("Saldo");
    await mover({ produtoId: p.id, tipo: "ENTRADA_COMPRA", quantidadeMilesimos: 10_000, custoUnitarioCentavos: 1200 });
    const saida = await mover({ produtoId: p.id, tipo: "SAIDA_OBRA", quantidadeMilesimos: 2_500, projetoId: obraId });
    expect(saida.saldoDepoisMilesimos).toBe(7_500);
    expect(await saldo(p.id)).toBe(7.5);
    expect(await somaDosMovimentos(p.id)).toBe(7.5);

    const m = await prisma.movimentoEstoque.findUniqueOrThrow({ where: { id: saida.id } });
    expect(m.quantidade.toString()).toBe("-2.5");
    expect(m.custoUnitarioCentavos).toBe(1000); // custo atual do produto, congelado na hora
    expect(m.projetoId).toBe(obraId);
    expect(await prisma.logAuditoria.count({ where: { entidade: "MovimentoEstoque", entidadeId: saida.id } })).toBe(1);
  });

  it("o custo é congelado na hora: mudar o custo do produto depois não muda a saída antiga", async () => {
    const p = await novoProduto("Congelado", 1000);
    await mover({ produtoId: p.id, tipo: "ENTRADA_COMPRA", quantidadeMilesimos: 5_000 });
    const s = await mover({ produtoId: p.id, tipo: "SAIDA_OBRA", quantidadeMilesimos: 1_000, projetoId: obraId });
    await prisma.produto.update({ where: { id: p.id }, data: { custoUnitarioCentavos: 9999 } });
    expect((await prisma.movimentoEstoque.findUniqueOrThrow({ where: { id: s.id } })).custoUnitarioCentavos).toBe(1000);
  });

  it("produto sem custo gera movimento 'sem custo' (null), nunca zero", async () => {
    const p = await novoProduto("Sem custo", null);
    await mover({ produtoId: p.id, tipo: "ENTRADA_COMPRA", quantidadeMilesimos: 3_000 });
    const s = await mover({ produtoId: p.id, tipo: "SAIDA_OBRA", quantidadeMilesimos: 1_000, projetoId: obraId });
    expect((await prisma.movimentoEstoque.findUniqueOrThrow({ where: { id: s.id } })).custoUnitarioCentavos).toBeNull();
  });

  it("saída maior que o saldo exige confirmação E justificativa; sem elas nada é gravado", async () => {
    const p = await novoProduto("Sem saldo");
    await mover({ produtoId: p.id, tipo: "ENTRADA_COMPRA", quantidadeMilesimos: 2_000 });
    await expect(mover({ produtoId: p.id, tipo: "SAIDA_OBRA", quantidadeMilesimos: 3_000, projetoId: obraId })).rejects.toThrow(/maior que o saldo/);
    await expect(mover({ produtoId: p.id, tipo: "SAIDA_OBRA", quantidadeMilesimos: 3_000, projetoId: obraId, confirmarSemSaldo: true, justificativa: " " })).rejects.toThrow(/justificativa/);
    expect(await saldo(p.id)).toBe(2);
    expect(await prisma.movimentoEstoque.count({ where: { produtoId: p.id } })).toBe(1);

    const ok = await mover({ produtoId: p.id, tipo: "SAIDA_OBRA", quantidadeMilesimos: 3_000, projetoId: obraId, confirmarSemSaldo: true, justificativa: "Material chega amanhã" });
    expect(ok.saldoDepoisMilesimos).toBe(-1_000);
    expect(await saldo(p.id)).toBe(-1);
    const m = await prisma.movimentoEstoque.findUniqueOrThrow({ where: { id: ok.id } });
    expect(m).toMatchObject({ semSaldoConfirmado: true, justificativa: "Material chega amanhã" });
  });

  it("duas saídas simultâneas nunca passam do saldo: a linha do produto é travada", async () => {
    const p = await novoProduto("Concorrente");
    await mover({ produtoId: p.id, tipo: "ENTRADA_COMPRA", quantidadeMilesimos: 5_000 });
    const r = await Promise.allSettled([mover({ produtoId: p.id, tipo: "SAIDA_OBRA", quantidadeMilesimos: 4_000, projetoId: obraId }), mover({ produtoId: p.id, tipo: "SAIDA_OBRA", quantidadeMilesimos: 4_000, projetoId: obraId })]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(r.filter((x) => x.status === "rejected")).toHaveLength(1);
    expect(await saldo(p.id)).toBe(1);
    expect(await somaDosMovimentos(p.id)).toBe(1);
  });

  it("obra obrigatória na saída e na devolução; só obra aprovada, em execução ou concluída; quantidade positiva", async () => {
    const p = await novoProduto("Obra");
    await mover({ produtoId: p.id, tipo: "ENTRADA_COMPRA", quantidadeMilesimos: 5_000 });
    await expect(mover({ produtoId: p.id, tipo: "SAIDA_OBRA", quantidadeMilesimos: 1_000 })).rejects.toThrow(/Escolha a obra/);
    await expect(mover({ produtoId: p.id, tipo: "DEVOLUCAO", quantidadeMilesimos: 1_000 })).rejects.toThrow(/Escolha a obra/);
    await expect(mover({ produtoId: p.id, tipo: "SAIDA_OBRA", quantidadeMilesimos: 1_000, projetoId: obraNaoAprovadaId })).rejects.toThrow(/aprovadas/);
    await expect(mover({ produtoId: p.id, tipo: "SAIDA_OBRA", quantidadeMilesimos: 0, projetoId: obraId })).rejects.toThrow(/maior que zero/);
    await expect(mover({ produtoId: p.id, tipo: "SAIDA_OBRA", quantidadeMilesimos: 1_000, projetoId: "nao-existe" })).rejects.toThrow(/Obra não encontrada/);
    expect(await saldo(p.id)).toBe(5);
  });

  it("devolução da obra devolve ao saldo; ajuste precisa do sentido; perda subtrai", async () => {
    const p = await novoProduto("Tipos");
    await mover({ produtoId: p.id, tipo: "ENTRADA_COMPRA", quantidadeMilesimos: 10_000 });
    await mover({ produtoId: p.id, tipo: "SAIDA_OBRA", quantidadeMilesimos: 4_000, projetoId: obraId });
    await mover({ produtoId: p.id, tipo: "DEVOLUCAO", quantidadeMilesimos: 1_000, projetoId: obraId });
    await mover({ produtoId: p.id, tipo: "PERDA", quantidadeMilesimos: 500 });
    await expect(mover({ produtoId: p.id, tipo: "AJUSTE", quantidadeMilesimos: 100 })).rejects.toThrow(/acrescenta ou retira/);
    await mover({ produtoId: p.id, tipo: "AJUSTE", sentido: -1, quantidadeMilesimos: 500 });
    await mover({ produtoId: p.id, tipo: "AJUSTE", sentido: 1, quantidadeMilesimos: 2_000 });
    expect(await saldo(p.id)).toBe(10 - 4 + 1 - 0.5 - 0.5 + 2);
    expect(await somaDosMovimentos(p.id)).toBe(8);
  });
});

describe("estorno de movimento", () => {
  it("cria o movimento inverso (não apaga), devolve o saldo e liga um ao outro; só estorna uma vez", async () => {
    const p = await novoProduto("Estorno");
    await mover({ produtoId: p.id, tipo: "ENTRADA_COMPRA", quantidadeMilesimos: 10_000 });
    const s = await mover({ produtoId: p.id, tipo: "SAIDA_OBRA", quantidadeMilesimos: 3_000, projetoId: obraId });
    expect(await saldo(p.id)).toBe(7);

    const e = await tx((t) => estornarMovimentoDeEstoque(t, s.id, "Lançado na obra errada", ctx()));
    expect(await saldo(p.id)).toBe(10);
    const estorno = await prisma.movimentoEstoque.findUniqueOrThrow({ where: { id: e.id } });
    expect(estorno).toMatchObject({ estornoDeId: s.id, projetoId: obraId, custoUnitarioCentavos: 1000 });
    expect(estorno.quantidade.toString()).toBe("3");
    expect(await prisma.movimentoEstoque.count({ where: { produtoId: p.id } })).toBe(3); // nada foi apagado
    expect(await prisma.logAuditoria.count({ where: { entidade: "MovimentoEstoque", entidadeId: e.id, acao: "ESTORNAR" } })).toBe(1);

    await expect(tx((t) => estornarMovimentoDeEstoque(t, s.id, "de novo", ctx()))).rejects.toThrow(/já foi estornado/);
    await expect(tx((t) => estornarMovimentoDeEstoque(t, e.id, "desfazer o estorno", ctx()))).rejects.toThrow(/já é um estorno/);
    await expect(tx((t) => estornarMovimentoDeEstoque(t, s.id, "  ", ctx()))).rejects.toThrow();
    expect(await saldo(p.id)).toBe(10);
  });

  it("o estorno funciona mesmo se a obra foi cancelada depois da saída (o material não fica preso na obra)", async () => {
    const p = await novoProduto("Estorno obra cancelada");
    await mover({ produtoId: p.id, tipo: "ENTRADA_COMPRA", quantidadeMilesimos: 10_000 });
    const clienteId = (await prisma.cliente.findFirstOrThrow({ where: { nome: `${PREFIXO} Cliente` } })).id;
    const obra = await prisma.projeto.create({ data: { codigo: `P-0000-${randomUUID().slice(0, 8)}`, titulo: `${PREFIXO} Obra cancelada`, clienteId, status: "APROVADO", responsavelId: usuario.id } });
    const s = await mover({ produtoId: p.id, tipo: "SAIDA_OBRA", quantidadeMilesimos: 4_000, projetoId: obra.id });
    await prisma.projeto.update({ where: { id: obra.id }, data: { status: "CANCELADO" } });
    // Nova saída para a obra cancelada continua recusada; o estorno da que já existia é permitido.
    await expect(mover({ produtoId: p.id, tipo: "SAIDA_OBRA", quantidadeMilesimos: 1_000, projetoId: obra.id })).rejects.toThrow();
    const e = await tx((t) => estornarMovimentoDeEstoque(t, s.id, "Obra cancelada", ctx()));
    expect(await saldo(p.id)).toBe(10);
    expect((await prisma.movimentoEstoque.findUniqueOrThrow({ where: { id: e.id } })).projetoId).toBe(obra.id);
  });

  it("estornar uma entrada retira do saldo e não trava mesmo se já foi usada (o estorno é intencional e justificado)", async () => {
    const p = await novoProduto("Estorno entrada");
    const entrada = await mover({ produtoId: p.id, tipo: "ENTRADA_COMPRA", quantidadeMilesimos: 4_000 });
    await mover({ produtoId: p.id, tipo: "SAIDA_OBRA", quantidadeMilesimos: 3_000, projetoId: obraId });
    await tx((t) => estornarMovimentoDeEstoque(t, entrada.id, "Entrada lançada duas vezes", ctx()));
    expect(await saldo(p.id)).toBe(-3);
    expect((await prisma.movimentoEstoque.findFirstOrThrow({ where: { produtoId: p.id, estornoDeId: entrada.id } })).semSaldoConfirmado).toBe(true);
  });

  it("dois estornos simultâneos do mesmo movimento: só um vale", async () => {
    const p = await novoProduto("Estorno concorrente");
    await mover({ produtoId: p.id, tipo: "ENTRADA_COMPRA", quantidadeMilesimos: 10_000 });
    const s = await mover({ produtoId: p.id, tipo: "SAIDA_OBRA", quantidadeMilesimos: 2_000, projetoId: obraId });
    const r = await Promise.allSettled([tx((t) => estornarMovimentoDeEstoque(t, s.id, "a", ctx())), tx((t) => estornarMovimentoDeEstoque(t, s.id, "b b b", ctx()))]);
    expect(r.filter((x) => x.status === "fulfilled").length).toBeLessThanOrEqual(1);
    expect(await saldo(p.id)).toBe(await somaDosMovimentos(p.id));
    expect(await saldo(p.id)).toBe(10); // 10 − 2 + 2
  });
});

describe("contagem inicial", () => {
  it("registra por produto SEM movimentos, com custo opcional; custo digitado vira o custo do produto, com histórico", async () => {
    const semCusto = await novoProduto("Contagem sem custo", null);
    const comCusto = await novoProduto("Contagem com custo", null);
    const r = await tx((t) =>
      contarEstoqueInicial(
        t,
        [
          { produtoId: semCusto.id, quantidadeMilesimos: 12_000, custoUnitarioCentavos: null },
          { produtoId: comCusto.id, quantidadeMilesimos: 7_500, custoUnitarioCentavos: 2_500 },
        ],
        "2026-11-20",
        ctx(),
      ),
    );
    expect(r.contados).toBe(2);
    expect(await saldo(semCusto.id)).toBe(12);
    expect((await produtoDe(semCusto.id)).custoUnitarioCentavos).toBeNull(); // nada inventado
    const mov = await prisma.movimentoEstoque.findFirstOrThrow({ where: { produtoId: semCusto.id } });
    expect(mov).toMatchObject({ tipo: "INVENTARIO_INICIAL", custoUnitarioCentavos: null });

    expect((await produtoDe(comCusto.id)).custoUnitarioCentavos).toBe(2_500);
    const hist = await prisma.historicoPreco.findMany({ where: { produtoId: comCusto.id } });
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({ origem: "MANUAL", custoAnteriorCentavos: null, custoNovoCentavos: 2_500, observacao: "Contagem inicial" });
  });

  it("recusa produto que já tem movimentos, produto repetido e contagem vazia; nada é gravado (transação inteira)", async () => {
    const novo = await novoProduto("Contagem novo");
    const usado = await novoProduto("Contagem usado");
    await mover({ produtoId: usado.id, tipo: "ENTRADA_COMPRA", quantidadeMilesimos: 1_000 });
    await expect(tx((t) => contarEstoqueInicial(t, [{ produtoId: novo.id, quantidadeMilesimos: 5_000, custoUnitarioCentavos: null }, { produtoId: usado.id, quantidadeMilesimos: 5_000, custoUnitarioCentavos: null }], "2026-11-20", ctx()))).rejects.toThrow(/já tem movimentos/);
    expect(await prisma.movimentoEstoque.count({ where: { produtoId: novo.id } })).toBe(0); // o primeiro também foi desfeito
    await expect(tx((t) => contarEstoqueInicial(t, [{ produtoId: novo.id, quantidadeMilesimos: 1, custoUnitarioCentavos: null }, { produtoId: novo.id, quantidadeMilesimos: 1, custoUnitarioCentavos: null }], "2026-11-20", ctx()))).rejects.toThrow(/repetido/);
    await expect(tx((t) => contarEstoqueInicial(t, [], "2026-11-20", ctx()))).rejects.toThrow();
  });

  it("depois da contagem o produto sai da lista de 'sem movimento'", async () => {
    const p = await novoProduto("Contagem lista");
    const antes = await produtosSemMovimento(`${PREFIXO} Contagem lista`);
    expect(antes.produtos.map((x) => x.id)).toContain(p.id);
    await tx((t) => contarEstoqueInicial(t, [{ produtoId: p.id, quantidadeMilesimos: 1_000, custoUnitarioCentavos: null }], "2026-11-20", ctx()));
    const depois = await produtosSemMovimento(`${PREFIXO} Contagem lista`);
    expect(depois.produtos.map((x) => x.id)).not.toContain(p.id);
  });
});

describe("consultas", () => {
  it("a ficha do produto e a lista de movimentações trazem o saldo, os movimentos e os filtros", async () => {
    const p = await novoProduto("Consulta");
    await mover({ produtoId: p.id, tipo: "ENTRADA_COMPRA", quantidadeMilesimos: 6_000 });
    await mover({ produtoId: p.id, tipo: "SAIDA_OBRA", quantidadeMilesimos: 1_500, projetoId: obraId });
    const e = await estoqueDoProduto(p.id);
    expect(e).toMatchObject({ saldoMilesimos: 4_500, totalDeMovimentos: 2, retalhosDisponiveis: 0, minimoMilesimos: null });
    expect(e?.movimentos.map((m) => m.quantidadeMilesimos).sort((a, b) => a - b)).toEqual([-1_500, 6_000]);

    const { parametros, filtros } = lerListaMovimentos({ busca: `${PREFIXO} Consulta`, tipo: "SAIDA_OBRA" });
    const lista = await listarMovimentos(parametros, filtros);
    expect(lista.linhas).toHaveLength(1);
    expect(lista.linhas[0]).toMatchObject({ tipo: "SAIDA_OBRA", quantidadeMilesimos: -1_500, estornado: false, ehEstorno: false });
    expect(lista.linhas[0].obra).toContain(`${PREFIXO} Obra`);

    const nada = lerListaMovimentos({ busca: "xyz-nao-existe-123" });
    expect((await listarMovimentos(nada.parametros, nada.filtros)).linhas).toHaveLength(0);
  });
});
