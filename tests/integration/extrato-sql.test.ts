import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { montarExtrato, type LancamentoParaSaldo } from "@/lib/dominio/saldo";
import { criarClientePrisma } from "@/lib/db/criar-cliente";
import { extratoDaConta, obterContaFinanceira } from "@/modules/financeiro/queries";

import { comConexao } from "./banco-teste";

/**
 * O extrato em SQL (agregados + soma acumulada, paginado) dá o MESMO resultado da função pura `montarExtrato` (Fase 7B, Bloco 8).
 * Contas e lançamentos criados aqui ("Int Extrato"), em maio de 2018; nada lê dado real.
 */
const PREFIXO = "Int Extrato";
const prisma = criarClientePrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL);
const HOJE = "2018-06-01";
let informada = "";
let semSaldo = "";

async function limpar() {
  await comConexao(async (c) => {
    await c.query(`DELETE FROM "Lancamento" WHERE "contaFinanceiraId" IN (SELECT id FROM "ContaFinanceira" WHERE nome LIKE '${PREFIXO}%')`);
    await c.query(`DELETE FROM "ContaFinanceira" WHERE nome LIKE '${PREFIXO}%'`);
  });
}

type Fixa = { dia: string; tipo: "ENTRADA" | "SAIDA"; valor: number; estornado?: boolean };
const FIXAS: Fixa[] = [
  { dia: "2018-05-02", tipo: "ENTRADA", valor: 5_000 }, // anterior ao saldo inicial: "já incluído"
  { dia: "2018-05-05", tipo: "SAIDA", valor: 1_200 }, // idem
  { dia: "2018-05-10", tipo: "ENTRADA", valor: 10_000 }, // no dia do saldo inicial: conta
  { dia: "2018-05-10", tipo: "SAIDA", valor: 2_500 }, // mesmo dia, criado depois
  { dia: "2018-05-12", tipo: "SAIDA", valor: 700, estornado: true }, // estornado: não mexe no saldo
  { dia: "2018-05-15", tipo: "ENTRADA", valor: 3_333 },
  { dia: "2018-05-15", tipo: "ENTRADA", valor: 1_111 },
  { dia: "2018-05-20", tipo: "SAIDA", valor: 4_000 },
  { dia: "2018-05-31", tipo: "ENTRADA", valor: 900 }, // último dia do mês
];

async function criar(contaId: string) {
  let i = 0;
  for (const f of FIXAS) {
    await prisma.lancamento.create({
      data: {
        contaFinanceiraId: contaId,
        data: new Date(`${f.dia}T00:00:00Z`),
        tipo: f.tipo,
        valorCentavos: f.valor,
        descricao: `${PREFIXO} ${i}`,
        estornadoEm: f.estornado ? new Date("2018-05-13T12:00:00Z") : null,
        motivoEstorno: f.estornado ? "Teste" : null,
        criadoEm: new Date(Date.UTC(2018, 4, 1, 12, 0, i++)), // ordem de criação conhecida
      },
    });
  }
}

beforeAll(async () => {
  await limpar();
  const a = await prisma.contaFinanceira.create({ data: { nome: `${PREFIXO} informada`, saldoInicialInformado: true, saldoInicialCentavos: 100_000, dataSaldoInicial: new Date("2018-05-10T00:00:00Z") } });
  const b = await prisma.contaFinanceira.create({ data: { nome: `${PREFIXO} sem saldo` } });
  informada = a.id;
  semSaldo = b.id;
  await criar(a.id);
  await criar(b.id);
});

afterAll(async () => {
  await limpar();
  await prisma.$disconnect();
});

async function referencia(contaId: string, de: string, ate: string) {
  const conta = (await obterContaFinanceira(contaId, HOJE))!;
  const lancs: (LancamentoParaSaldo & { descricao: string })[] = (
    await prisma.lancamento.findMany({ where: { contaFinanceiraId: contaId, deletadoEm: null }, orderBy: [{ data: "asc" }, { criadoEm: "asc" }, { id: "asc" }] })
  ).map((l) => ({ id: l.id, data: l.data.toISOString().slice(0, 10), tipo: l.tipo, valorCentavos: l.valorCentavos, estornado: l.estornadoEm !== null, descricao: l.descricao }));
  return { conta, pura: montarExtrato(conta, lancs, de, ate) };
}

const PERIODOS: [string, string][] = [
  ["2018-05-01", "2018-05-31"], // tudo
  ["2018-05-10", "2018-05-31"], // começa no dia do saldo inicial
  ["2018-05-11", "2018-05-20"], // miolo, com saldo anterior vindo de dias antes
  ["2018-05-01", "2018-05-09"], // só lançamentos anteriores ao saldo inicial
  ["2018-05-15", "2018-05-15"], // um dia, dois lançamentos
  ["2018-04-01", "2018-04-30"], // período vazio
];

describe("extrato em SQL × função pura montarExtrato", () => {
  it.each(["informada", "semSaldo"] as const)("conta %s: saldo anterior, saldo final, linhas e saldo corrido iguais em todos os períodos", async (qual) => {
    const contaId = qual === "informada" ? informada : semSaldo;
    for (const [de, ate] of PERIODOS) {
      const { conta, pura } = await referencia(contaId, de, ate);
      const sql = await extratoDaConta(conta, de, ate);
      const rotulo = `${qual} ${de}..${ate}`;
      expect(sql.saldoAnteriorCentavos, rotulo).toBe(pura.saldoAnteriorCentavos);
      expect(sql.saldoFinalCentavos, rotulo).toBe(pura.saldoFinalCentavos);
      expect(sql.linhas.map((l) => [l.lancamento.descricao, l.saldoAposCentavos, l.incluidoNoSaldoInicial]), rotulo).toEqual(pura.linhas.map((l) => [(l.lancamento as { descricao: string }).descricao, l.saldoAposCentavos, l.incluidoNoSaldoInicial]));
      // Totais: entradas e saídas não estornadas do período.
      const naoEstornadas = pura.linhas.filter((l) => !l.lancamento.estornado);
      expect(sql.entradasCentavos, rotulo).toBe(naoEstornadas.filter((l) => l.lancamento.tipo === "ENTRADA").reduce((s, l) => s + l.lancamento.valorCentavos, 0));
      expect(sql.saidasCentavos, rotulo).toBe(naoEstornadas.filter((l) => l.lancamento.tipo === "SAIDA").reduce((s, l) => s + l.lancamento.valorCentavos, 0));
    }
  });

  it("as páginas, juntas, dão as mesmas linhas e o mesmo saldo corrido do extrato inteiro", async () => {
    const { conta } = await referencia(informada, "2018-05-01", "2018-05-31");
    const inteiro = await extratoDaConta(conta, "2018-05-01", "2018-05-31");
    const p1 = await extratoDaConta(conta, "2018-05-01", "2018-05-31", { pagina: 1, tamanho: 4 });
    const p2 = await extratoDaConta(conta, "2018-05-01", "2018-05-31", { pagina: 2, tamanho: 4 });
    const p3 = await extratoDaConta(conta, "2018-05-01", "2018-05-31", { pagina: 3, tamanho: 4 });
    expect(p1.paginacao).toMatchObject({ total: 9, paginas: 3, pagina: 1 });
    const juntas = [...p1.linhas, ...p2.linhas, ...p3.linhas];
    expect(juntas.map((l) => [l.lancamento.id, l.saldoAposCentavos])).toEqual(inteiro.linhas.map((l) => [l.lancamento.id, l.saldoAposCentavos]));
    // Os saldos anterior e final e os totais valem para o período inteiro em qualquer página.
    for (const p of [p1, p2, p3]) expect([p.saldoAnteriorCentavos, p.saldoFinalCentavos, p.entradasCentavos, p.saidasCentavos]).toEqual([inteiro.saldoAnteriorCentavos, inteiro.saldoFinalCentavos, inteiro.entradasCentavos, inteiro.saidasCentavos]);
  });

  it("à mão: saldo inicial 1.000,00 em 10/05; o que veio antes não conta; o estornado não mexe", async () => {
    const { conta } = await referencia(informada, "2018-05-01", "2018-05-31");
    const e = await extratoDaConta(conta, "2018-05-01", "2018-05-31");
    // 100.000 + 10.000 − 2.500 (+ estornado 0) + 3.333 + 1.111 − 4.000 + 900 = 108.844
    expect(e.saldoFinalCentavos).toBe(108_844);
    expect(e.saldoAnteriorCentavos).toBe(100_000);
    expect(e.linhas.filter((l) => l.incluidoNoSaldoInicial)).toHaveLength(2);
  });
});
