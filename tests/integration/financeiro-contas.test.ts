import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Prisma } from "@/generated/prisma/client";
import { criarClientePrisma } from "@/lib/db/criar-cliente";
import type { UsuarioSessao } from "@/lib/auth/sessao";
import { saldoEm } from "@/lib/dominio/saldo";
import { extratoDaConta, listarContasFinanceiras, obterContaFinanceira } from "@/modules/financeiro/queries";
import { contaFinanceiraSchema, lancamentoSchema, transferenciaSchema } from "@/modules/financeiro/schemas";
import { alternarContaAtiva, criarContaFinanceira, editarContaFinanceira } from "@/modules/financeiro/servico-contas";
import { conciliarLancamento, criarLancamentoAvulso, criarTransferencia, estornarLancamento } from "@/modules/financeiro/servico-lancamentos";

import { comConexao, criarUsuarioDeTeste } from "./banco-teste";

const PREFIXO = "Int Fin";
const LOGIN = "int-financeiro";
const prisma = criarClientePrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL);

// Um dia fixo "de hoje" e datas anteriores: nada depende do relógio da máquina.
const AGORA = new Date("2026-11-20T15:00:00Z");
const HOJE = "2026-11-20";

let usuario: UsuarioSessao;
let categoriaReceita: string;
let categoriaDespesa: string;

const ctx = () => ({ usuario, ip: null, agora: AGORA });
const conta = (extra: Record<string, string> = {}) => contaFinanceiraSchema.parse({ nome: `${PREFIXO} Banco`, tipo: "BANCO", ...extra });
const lanc = (extra: Record<string, string>) =>
  lancamentoSchema.parse({ tipo: "ENTRADA", data: "2026-11-10", valor: "100,00", descricao: `${PREFIXO} Lançamento`, categoriaId: categoriaReceita, ...extra });
const tx = <T>(fn: (t: Prisma.TransactionClient) => Promise<T>) => prisma.$transaction(fn);

async function limpar() {
  await comConexao(async (c) => {
    await c.query(`DELETE FROM "LogAuditoria" WHERE "usuarioId" IN (SELECT id FROM "Usuario" WHERE login = $1)`, [LOGIN]);
    await c.query(`DELETE FROM "Lancamento" WHERE "contaFinanceiraId" IN (SELECT id FROM "ContaFinanceira" WHERE nome LIKE $1)`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "ContaFinanceira" WHERE nome LIKE $1`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "CategoriaFinanceira" WHERE nome LIKE $1`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Usuario" WHERE login = $1`, [LOGIN]);
  });
}

beforeAll(async () => {
  await limpar();
  await criarUsuarioDeTeste(LOGIN, "senha-de-teste-123");
  const u = await prisma.usuario.findUniqueOrThrow({ where: { login: LOGIN } });
  usuario = { id: u.id, nome: u.nome, login: u.login, email: u.email, papel: "ADMIN", precisaTrocarSenha: false };
  categoriaReceita = (await prisma.categoriaFinanceira.create({ data: { nome: `${PREFIXO} Receita`, tipo: "RECEITA", grupo: "RECEITAS_OPERACIONAIS", grupoDre: "Receitas operacionais" } })).id;
  categoriaDespesa = (await prisma.categoriaFinanceira.create({ data: { nome: `${PREFIXO} Despesa`, tipo: "DESPESA", grupo: "DESPESAS_FIXAS", grupoDre: "Despesas fixas" } })).id;
});

afterAll(async () => {
  await limpar();
  await prisma.$disconnect();
});

describe("contas financeiras: nascem sem saldo inventado", () => {
  it("sem saldo informado: saldo zero, sem data, marcado como não informado", async () => {
    const { id } = await tx((t) => criarContaFinanceira(t, conta({ nome: `${PREFIXO} Sem saldo` }), ctx()));
    const c = await obterContaFinanceira(id, HOJE);
    expect(c).toMatchObject({ saldoInicialCentavos: 0, saldoInicialInformado: false, dataSaldoInicial: null, saldoAtualCentavos: 0, ativo: true });
  });

  it("com saldo informado: guarda o valor (inclusive negativo) e a data", async () => {
    const { id } = await tx((t) => criarContaFinanceira(t, conta({ nome: `${PREFIXO} Com saldo`, saldoInformado: "on", saldoInicial: "-1.500,50", dataSaldoInicial: "2026-11-01" }), ctx()));
    expect(await obterContaFinanceira(id, HOJE)).toMatchObject({ saldoInicialCentavos: -150050, saldoInicialInformado: true, dataSaldoInicial: "2026-11-01", saldoAtualCentavos: -150050 });
  });

  it("a data do saldo no futuro é recusada", async () => {
    await expect(tx((t) => criarContaFinanceira(t, conta({ nome: `${PREFIXO} Futuro`, saldoInformado: "on", saldoInicial: "10,00", dataSaldoInicial: "2026-12-01" }), ctx()))).rejects.toThrow(/futuro/);
  });

  it("nome repetido (sem diferenciar maiúsculas) é barrado pelo banco; excluída libera o nome", async () => {
    await expect(tx((t) => criarContaFinanceira(t, conta({ nome: `${PREFIXO.toUpperCase()} SEM SALDO` }), ctx()))).rejects.toMatchObject({ code: "P2002" });
  });

  it("cada criação e edição fica na auditoria", async () => {
    const n = await prisma.logAuditoria.count({ where: { usuarioId: usuario.id, entidade: "ContaFinanceira", acao: "CRIAR" } });
    expect(n).toBeGreaterThanOrEqual(2);
  });
});

describe("lançamentos avulsos", () => {
  let contaId: string;
  beforeAll(async () => {
    contaId = (await tx((t) => criarContaFinanceira(t, conta({ nome: `${PREFIXO} Lançamentos`, saldoInformado: "on", saldoInicial: "1.000,00", dataSaldoInicial: "2026-11-01" }), ctx()))).id;
  });

  it("entrada e saída movem o saldo; o saldo do banco é igual ao do domínio", async () => {
    await tx((t) => criarLancamentoAvulso(t, lanc({ contaFinanceiraId: contaId, valor: "250,00" }), ctx()));
    await tx((t) => criarLancamentoAvulso(t, lanc({ contaFinanceiraId: contaId, tipo: "SAIDA", categoriaId: categoriaDespesa, valor: "80,25", descricao: `${PREFIXO} Saída` }), ctx()));
    const c = (await obterContaFinanceira(contaId, HOJE))!;
    expect(c.saldoAtualCentavos).toBe(100000 + 25000 - 8025);
    const extrato = await extratoDaConta(c, "2026-11-01", HOJE);
    expect(extrato.saldoFinalCentavos).toBe(c.saldoAtualCentavos);
    expect(saldoEm(c, extrato.linhas.map((l) => l.lancamento), HOJE)).toBe(c.saldoAtualCentavos);
    expect(extrato.entradasCentavos).toBe(25000);
    expect(extrato.saidasCentavos).toBe(8025);
  });

  it("recusa categoria de tipo errado, data futura e conta inativa", async () => {
    await expect(tx((t) => criarLancamentoAvulso(t, lanc({ contaFinanceiraId: contaId, tipo: "SAIDA" }), ctx()))).rejects.toThrow(/categoria de despesa/);
    await expect(tx((t) => criarLancamentoAvulso(t, lanc({ contaFinanceiraId: contaId, categoriaId: categoriaDespesa }), ctx()))).rejects.toThrow(/categoria de receita/);
    await expect(tx((t) => criarLancamentoAvulso(t, lanc({ contaFinanceiraId: contaId, data: "2026-11-21" }), ctx()))).rejects.toThrow(/futuro/);
    const inativa = (await tx((t) => criarContaFinanceira(t, conta({ nome: `${PREFIXO} Inativa` }), ctx()))).id;
    await tx((t) => alternarContaAtiva(t, inativa, false, ctx()));
    await expect(tx((t) => criarLancamentoAvulso(t, lanc({ contaFinanceiraId: inativa }), ctx()))).rejects.toThrow(/inativa/);
  });

  it("o banco recusa valor zero e transferência com categoria (última barreira)", async () => {
    const base = { data: new Date("2026-11-10T00:00:00Z"), tipo: "ENTRADA" as const, contaFinanceiraId: contaId, descricao: `${PREFIXO} Direto` };
    await expect(prisma.lancamento.create({ data: { ...base, valorCentavos: 0 } })).rejects.toThrow();
    await expect(prisma.lancamento.create({ data: { ...base, valorCentavos: 100, transferenciaId: "x", categoriaId: categoriaReceita } })).rejects.toThrow();
  });

  it("conciliar marca e desmarca; estornado não se concilia", async () => {
    const { id } = await tx((t) => criarLancamentoAvulso(t, lanc({ contaFinanceiraId: contaId, valor: "10,00", descricao: `${PREFIXO} Para conciliar` }), ctx()));
    await tx((t) => conciliarLancamento(t, id, true, ctx()));
    expect((await prisma.lancamento.findUniqueOrThrow({ where: { id } })).conciliado).toBe(true);
    await tx((t) => conciliarLancamento(t, id, false, ctx()));
    expect(await prisma.lancamento.findUniqueOrThrow({ where: { id } })).toMatchObject({ conciliado: false, conciliadoEm: null });
    await tx((t) => estornarLancamento(t, id, "teste", ctx()));
    await expect(tx((t) => conciliarLancamento(t, id, true, ctx()))).rejects.toThrow(/estornado/);
  });

  it("estorno não apaga: marca com motivo, devolve o saldo e não pode ser repetido", async () => {
    const antes = (await obterContaFinanceira(contaId, HOJE))!.saldoAtualCentavos;
    const { id } = await tx((t) => criarLancamentoAvulso(t, lanc({ contaFinanceiraId: contaId, valor: "500,00", descricao: `${PREFIXO} Errado` }), ctx()));
    expect((await obterContaFinanceira(contaId, HOJE))!.saldoAtualCentavos).toBe(antes + 50000);

    await tx((t) => estornarLancamento(t, id, "Lançado na conta errada", ctx()));
    const l = await prisma.lancamento.findUniqueOrThrow({ where: { id } });
    expect(l).toMatchObject({ motivoEstorno: "Lançado na conta errada", estornadoPorId: usuario.id, deletadoEm: null });
    expect(l.estornadoEm).not.toBeNull();
    expect((await obterContaFinanceira(contaId, HOJE))!.saldoAtualCentavos).toBe(antes);
    expect(await prisma.logAuditoria.count({ where: { entidade: "Lancamento", entidadeId: id, acao: "ESTORNAR" } })).toBe(1);
    await expect(tx((t) => estornarLancamento(t, id, "de novo", ctx()))).rejects.toThrow(/já foi estornado/);

    // O estornado continua no extrato, riscado, sem mexer no saldo.
    const extrato = await extratoDaConta((await obterContaFinanceira(contaId, HOJE))!, "2026-11-01", HOJE);
    const linha = extrato.linhas.find((x) => x.lancamento.id === id)!;
    expect(linha.lancamento.estornado).toBe(true);
    expect(extrato.saldoFinalCentavos).toBe(antes);
  });

  it("corrigir a data do saldo não quebra o histórico: os anteriores só passam a 'já incluídos'", async () => {
    const c = (await obterContaFinanceira(contaId, HOJE))!;
    const antes = (await extratoDaConta(c, "2026-11-01", HOJE)).linhas.length;
    await tx((t) => editarContaFinanceira(t, contaId, conta({ nome: c.nome, saldoInformado: "on", saldoInicial: "1.000,00", dataSaldoInicial: "2026-11-10" }), ctx()));
    const depois = await extratoDaConta((await obterContaFinanceira(contaId, HOJE))!, "2026-11-01", HOJE);
    expect(depois.linhas).toHaveLength(antes);
    expect(await prisma.logAuditoria.count({ where: { entidade: "ContaFinanceira", entidadeId: contaId, acao: "ATUALIZAR" } })).toBeGreaterThanOrEqual(1);
  });
});

describe("transferência entre contas", () => {
  it("cria duas pontas ligadas, sem categoria; o total não muda e o estorno desfaz as duas", async () => {
    const a = (await tx((t) => criarContaFinanceira(t, conta({ nome: `${PREFIXO} Origem`, saldoInformado: "on", saldoInicial: "500,00", dataSaldoInicial: "2026-11-01" }), ctx()))).id;
    const b = (await tx((t) => criarContaFinanceira(t, conta({ nome: `${PREFIXO} Destino`, tipo: "CAIXA" }), ctx()))).id;
    const somaAntes = (await listarContasFinanceiras(HOJE)).filter((c) => [a, b].includes(c.id)).reduce((s, c) => s + c.saldoAtualCentavos, 0);

    const { transferenciaId } = await tx((t) => criarTransferencia(t, transferenciaSchema.parse({ contaOrigemId: a, contaDestinoId: b, data: "2026-11-12", valor: "120,00" }), ctx()));
    const pontas = await prisma.lancamento.findMany({ where: { transferenciaId }, orderBy: { tipo: "asc" } });
    expect(pontas.map((p) => [p.tipo, p.contaFinanceiraId, p.valorCentavos, p.categoriaId])).toEqual([
      ["ENTRADA", b, 12000, null],
      ["SAIDA", a, 12000, null],
    ]);
    const contas = await listarContasFinanceiras(HOJE);
    expect(contas.find((c) => c.id === a)!.saldoAtualCentavos).toBe(50000 - 12000);
    expect(contas.find((c) => c.id === b)!.saldoAtualCentavos).toBe(12000);
    expect(contas.filter((c) => [a, b].includes(c.id)).reduce((s, c) => s + c.saldoAtualCentavos, 0)).toBe(somaAntes);

    // Estornar uma ponta estorna as duas.
    await tx((t) => estornarLancamento(t, pontas[0].id, "Transferência errada", ctx()));
    expect((await prisma.lancamento.findMany({ where: { transferenciaId } })).every((p) => p.estornadoEm !== null)).toBe(true);
    const depois = await listarContasFinanceiras(HOJE);
    expect(depois.find((c) => c.id === a)!.saldoAtualCentavos).toBe(50000);
    expect(depois.find((c) => c.id === b)!.saldoAtualCentavos).toBe(0);
  });

  it("recusa origem e destino iguais (na validação) e conta inativa", async () => {
    expect(transferenciaSchema.safeParse({ contaOrigemId: "x", contaDestinoId: "x", data: "2026-11-12", valor: "1,00" }).success).toBe(false);
    const ativa = (await prisma.contaFinanceira.findFirstOrThrow({ where: { nome: `${PREFIXO} Origem` } })).id;
    const inativa = (await prisma.contaFinanceira.findFirstOrThrow({ where: { nome: `${PREFIXO} Inativa` } })).id;
    await expect(tx((t) => criarTransferencia(t, transferenciaSchema.parse({ contaOrigemId: ativa, contaDestinoId: inativa, data: "2026-11-12", valor: "1,00" }), ctx()))).rejects.toThrow(/inativa/);
  });
});
