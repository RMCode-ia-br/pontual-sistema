import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { criarClientePrisma } from "@/lib/db/criar-cliente";
import type { Periodo } from "@/lib/periodo";
import { avaliacoesDoGoogle, obrasEmAndamento, producaoPorMes } from "@/modules/indicadores/operacional";
import { carregarRelatorioDeEstoque } from "@/modules/relatorios/estoque";
import { curvaAbcDeSaidas, variacaoDeCustoDosInsumos } from "@/modules/relatorios/estoque-analises";

import { comConexao } from "./banco-teste";

/**
 * Relatórios operacionais e de estoque da Fase 7B (Bloco 7). Dados com prefixo "Int Rop", em abril de 2018 (sem dado real),
 * com registros às 23h59 do último dia e à 00h01 do primeiro (horário de São Paulo, UTC−3 nessas datas). Nada lê o relógio.
 */
const PREFIXO = "Int Rop";
const prisma = criarClientePrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL);
const ABR: Periodo = { de: "2018-04-01", ate: "2018-04-30" };
const PERIODO_ESTOQUE = { de: "2018-04-01", ate: "2018-04-30" };
let seq = 0;

async function limpar() {
  await comConexao(async (c) => {
    const projetos = `SELECT id FROM "Projeto" WHERE titulo LIKE '${PREFIXO}%'`;
    const produtos = `SELECT id FROM "Produto" WHERE codigo LIKE 'INT-ROP-%'`;
    await c.query(`DELETE FROM "Tarefa" WHERE titulo LIKE '${PREFIXO}%'`);
    await c.query(`DELETE FROM "EtapaProjeto" WHERE "projetoId" IN (${projetos})`);
    await c.query(`DELETE FROM "MotivoBloqueio" WHERE nome LIKE '${PREFIXO}%'`);
    await c.query(`DELETE FROM "Proposta" WHERE "projetoId" IN (${projetos})`);
    await c.query(`DELETE FROM "HistoricoFaseProjeto" WHERE "projetoId" IN (${projetos})`);
    await c.query(`DELETE FROM "Projeto" WHERE titulo LIKE '${PREFIXO}%'`);
    await c.query(`DELETE FROM "Cliente" WHERE nome LIKE '${PREFIXO}%'`);
    await c.query(`DELETE FROM "MovimentoEstoque" WHERE "produtoId" IN (${produtos})`);
    await c.query(`DELETE FROM "HistoricoPreco" WHERE "produtoId" IN (${produtos})`);
    await c.query(`DELETE FROM "Produto" WHERE codigo LIKE 'INT-ROP-%'`);
  });
}

const produto = (codigo: string, extra: Record<string, unknown> = {}) => prisma.produto.create({ data: { codigo: `INT-ROP-${codigo}`, descricao: `${PREFIXO} ${codigo}`, unidade: "UN", ...extra } });
const mov = (produtoId: string, tipo: "SAIDA_OBRA" | "DEVOLUCAO", quantidade: number, custo: number | null, data: string) =>
  prisma.movimentoEstoque.create({ data: { produtoId, tipo, quantidade, custoUnitarioCentavos: custo, data: new Date(`${data}T00:00:00Z`) } });

let cliente = "";
const obra = (titulo: string, status: "APROVADO" | "EM_EXECUCAO" | "CONCLUIDO" = "EM_EXECUCAO") => prisma.projeto.create({ data: { codigo: `INT-ROP-${++seq}-${randomUUID().slice(0, 6)}`, titulo: `${PREFIXO} ${titulo}`, clienteId: cliente, status } });
const etapa = (projetoId: string, tipo: "FABRICACAO" | "ENTREGA" | "MEDICAO_EXATA" | "ACABAMENTO", status: "PENDENTE" | "EM_ANDAMENTO" | "CONCLUIDA" | "BLOQUEADA" | "DISPENSADA", ordem: number, extra: Record<string, unknown> = {}) =>
  prisma.etapaProjeto.create({ data: { projetoId, tipo, nome: `${PREFIXO} ${tipo}`, ordem, status, ...extra } });
const aprovada = async (projetoId: string, areaM2: number) => {
  const p = await prisma.proposta.create({
    data: { projetoId, numero: `INT-ROP-${String(++seq).padStart(4, "0")}`, numeroSequencial: 7_500_000 + seq, ano: 2018, data: new Date("2018-03-02T00:00:00Z"), clienteNome: `${PREFIXO} C`, status: "APROVADA", aceitaEm: new Date("2018-03-10T15:00:00Z"), valorAprovadoCentavos: 100_000, snapshot: { opcoes: [{ id: "opx", nome: "Op", totais: { areaM2 } }] } },
  });
  return prisma.proposta.update({ where: { id: p.id }, data: { opcaoAprovadaId: "opx" } });
};
const tarefa = (projetoId: string, status: "ABERTA" | "CONCLUIDA" | "CANCELADA", extra: Record<string, unknown> = {}) =>
  prisma.tarefa.create({ data: { titulo: `${PREFIXO} avaliação ${++seq}`, tipo: "PEDIR_AVALIACAO", projetoId, status, ...extra } });

let ids: Record<string, string> = {};

beforeAll(async () => {
  await limpar();
  cliente = (await prisma.cliente.create({ data: { nome: `${PREFIXO} Cliente`, tipoPessoa: "PF" } })).id;

  // ----- Estoque: curva ABC (saída = quantidade negativa; devolução = positiva) -----
  const [a, b, c, semCusto, inativo] = await Promise.all([produto("A"), produto("B"), produto("C"), produto("SC"), produto("INATIVO", { ativo: false, saldoCache: 3, custoUnitarioCentavos: 1_000, estoqueMinimo: 10 })]);
  ids = { a: a.id, b: b.id, c: c.id, sc: semCusto.id, inativo: inativo.id };
  await mov(a.id, "SAIDA_OBRA", -10, 1_000, "2018-04-10"); // 10.000
  await mov(a.id, "DEVOLUCAO", 2, 1_000, "2018-04-20"); // volta 2.000 → líquido 8.000
  await mov(b.id, "SAIDA_OBRA", -1, 1_000, "2018-04-30"); // dia 30: dentro → 1.000
  await mov(b.id, "SAIDA_OBRA", -5, 1_000, "2018-05-01"); // dia 1º do mês seguinte: fora
  await mov(b.id, "SAIDA_OBRA", -5, 1_000, "2018-03-31"); // dia anterior: fora
  await mov(c.id, "SAIDA_OBRA", -1, 1_000, "2018-04-15"); // 1.000
  await mov(semCusto.id, "SAIDA_OBRA", -4, null, "2018-04-12"); // sem custo: fora do valor, contada à parte

  // ----- Variação de custo (instantes; 23h59 do dia 30 e 00h01 do dia 1º em São Paulo) -----
  const h = (produtoId: string, antes: number | null, depois: number, criadoEm: string) =>
    prisma.historicoPreco.create({ data: { produtoId, custoAnteriorCentavos: antes, custoNovoCentavos: depois, origem: "MANUAL", criadoEm: new Date(criadoEm) } });
  await h(a.id, 1_000, 1_100, "2018-04-05T15:00:00Z");
  await h(a.id, 1_100, 1_200, "2018-04-25T15:00:00Z"); // custo no fim 1.200
  await h(b.id, null, 500, "2018-05-01T02:59:00Z"); // 30/04 às 23h59 em SP: dentro; sem custo anterior → "sem base"
  await h(c.id, 100, 900, "2018-05-01T03:01:00Z"); // 01/05 às 00h01 em SP: fora
  await h(semCusto.id, 800, 700, "2018-04-01T03:01:00Z"); // 01/04 às 00h01 em SP: dentro (queda)
  await h(inativo.id, 100, 200, "2018-03-31T02:59:00Z"); // 30/03 às 23h59 em SP: fora

  // ----- Produção: fabricação concluída por mês -----
  const p1 = await obra("Prod 1", "CONCLUIDO");
  await aprovada(p1.id, 10);
  await etapa(p1.id, "FABRICACAO", "CONCLUIDA", 1, { fimReal: new Date("2018-04-30T00:00:00Z") }); // último dia: dentro
  const p2 = await obra("Prod 2", "CONCLUIDO");
  await aprovada(p2.id, 5.5);
  await etapa(p2.id, "FABRICACAO", "CONCLUIDA", 1, { fimReal: new Date("2018-05-01T00:00:00Z") }); // dia 1º seguinte: fora de abril
  const p3 = await obra("Prod 3 sem area", "CONCLUIDO");
  await etapa(p3.id, "FABRICACAO", "CONCLUIDA", 1, { fimReal: new Date("2018-04-02T00:00:00Z") });

  // ----- Avaliações no Google -----
  const e1 = await obra("Aval 1 feita", "CONCLUIDO");
  await etapa(e1.id, "ENTREGA", "CONCLUIDA", 1, { fimReal: new Date("2018-04-30T00:00:00Z") });
  await tarefa(e1.id, "CONCLUIDA", { concluidaEm: new Date("2018-05-01T02:59:00Z") }); // 30/04 às 23h59 em SP: dentro
  const e2 = await obra("Aval 2 aberta", "CONCLUIDO");
  await etapa(e2.id, "ENTREGA", "CONCLUIDA", 1, { fimReal: new Date("2018-04-10T00:00:00Z") });
  await tarefa(e2.id, "ABERTA", { vencimento: new Date("2018-04-12T00:00:00Z") });
  const e3 = await obra("Aval 3 sem tarefa", "CONCLUIDO");
  await etapa(e3.id, "ENTREGA", "CONCLUIDA", 1, { fimReal: new Date("2018-04-15T00:00:00Z") });
  const e4 = await obra("Aval 4 fora", "CONCLUIDO");
  await etapa(e4.id, "ENTREGA", "CONCLUIDA", 1, { fimReal: new Date("2018-05-01T00:00:00Z") });
  await tarefa(e4.id, "CONCLUIDA", { concluidaEm: new Date("2018-05-01T03:01:00Z") }); // 01/05 às 00h01: fora de abril

  // ----- Obras em andamento -----
  const o1 = await obra("And 1", "EM_EXECUCAO");
  await etapa(o1.id, "MEDICAO_EXATA", "CONCLUIDA", 1);
  const motivo = await prisma.motivoBloqueio.create({ data: { nome: `${PREFIXO} motivo` } });
  await etapa(o1.id, "FABRICACAO", "BLOQUEADA", 2, { motivoBloqueioId: motivo.id });
  await etapa(o1.id, "ENTREGA", "PENDENTE", 3);
  await etapa(o1.id, "ACABAMENTO", "DISPENSADA", 4);
});

afterAll(async () => {
  await limpar();
  await prisma.$disconnect();
});

describe("Curva ABC das saídas de estoque", () => {
  it("valor líquido por produto (saída − devolução), com as bordas do período e o sem custo à parte", async () => {
    const c = await curvaAbcDeSaidas(PERIODO_ESTOQUE, { a: 80, b: 15 });
    const minhas = c.linhas.filter((l) => l.codigo.startsWith("INT-ROP-"));
    // Líquido: A = 8.000, B = 1.000 (só a de 30/04), C = 1.000. Sem custo fica fora do valor.
    expect(Object.fromEntries(minhas.map((l) => [l.codigo, l.valorCentavos]))).toEqual({ "INT-ROP-A": 8_000, "INT-ROP-B": 1_000, "INT-ROP-C": 1_000 });
    expect(minhas.find((l) => l.codigo === "INT-ROP-A")?.quantidadeMilesimos).toBe(8_000);
    expect(minhas.some((l) => l.codigo === "INT-ROP-SC")).toBe(false);
    expect(c.semCusto).toBeGreaterThanOrEqual(1);
    // O primeiro da curva (o maior) é sempre A e as classes seguem a ordem decrescente de valor.
    const ordem = c.linhas.map((l) => l.valorCentavos);
    expect(ordem).toEqual([...ordem].sort((x, y) => y - x));
    expect(c.linhas[0]?.classe).toBe("A");
    expect(c.totalCentavos).toBe(c.linhas.reduce((s, l) => s + l.valorCentavos, 0));
  });

  it("período sem saída: curva vazia", async () => {
    const c = await curvaAbcDeSaidas({ de: "2018-06-01", ate: "2018-06-30" }, { a: 80, b: 15 });
    expect(c.linhas.filter((l) => l.codigo.startsWith("INT-ROP-"))).toEqual([]);
  });
});

describe("Variação de custo dos insumos", () => {
  it("custo no começo = anterior da 1ª mudança; no fim = novo da última; 'sem base' quando não havia custo; bordas em São Paulo", async () => {
    const r = await variacaoDeCustoDosInsumos(PERIODO_ESTOQUE);
    const por = Object.fromEntries(r.linhas.filter((l) => l.codigo.startsWith("INT-ROP-")).map((l) => [l.codigo, l]));
    expect(por["INT-ROP-A"]).toMatchObject({ custoInicialCentavos: 1_000, custoFinalCentavos: 1_200, variacaoPercentual: 20, mudancas: 2 });
    expect(por["INT-ROP-B"]).toMatchObject({ custoInicialCentavos: null, custoFinalCentavos: 500, variacaoPercentual: null, mudancas: 1 }); // 30/04 às 23h59: dentro
    expect(por["INT-ROP-SC"]).toMatchObject({ custoInicialCentavos: 800, custoFinalCentavos: 700, variacaoPercentual: -12.5 }); // 01/04 às 00h01: dentro
    expect(por["INT-ROP-C"]).toBeUndefined(); // 01/05 às 00h01: fora
    expect(por["INT-ROP-INATIVO"]).toBeUndefined(); // 30/03 às 23h59: fora
  });
});

describe("Estoque: produto inativo com saldo", () => {
  it("entra no valor, aparece marcado como inativo e não gera alerta de mínimo", async () => {
    const r = await carregarRelatorioDeEstoque(PERIODO_ESTOQUE);
    const linha = r.linhas.find((l) => l.id === ids.inativo);
    expect(linha).toMatchObject({ ativo: false, saldoMilesimos: 3_000, valorCentavos: 3_000, abaixoDoMinimo: false });
    expect(r.inativosComSaldo).toBeGreaterThanOrEqual(1);
  });
});

describe("Produção por mês", () => {
  it("soma os m² da opção aprovada no mês da fabricação concluída; o último dia entra e o dia 1º seguinte não", async () => {
    const r = await producaoPorMes(ABR);
    expect(r.meses.map((m) => m.mes)).toEqual(["2018-04"]);
    // Prod 1 (10 m²) e Prod 3 (sem área na proposta) em abril; Prod 2 (5,5 m²) é de maio.
    expect(r.meses[0]).toMatchObject({ m2: 10, obras: 2 });
    expect(r.obrasSemArea).toBe(1);
  });

  it("lista todos os meses do período, com 0 m² nos meses sem obra concluída", async () => {
    const r = await producaoPorMes({ de: "2018-03-01", ate: "2018-05-31" });
    expect(r.meses.map((m) => [m.mes, m.m2])).toEqual([["2018-03", 0], ["2018-04", 10], ["2018-05", 5.5]]);
  });
});

describe("Avaliações no Google × obras entregues", () => {
  it("entregues no período, situação de cada pedido e contagens; bordas pela data de São Paulo", async () => {
    const a = await avaliacoesDoGoogle(ABR, "2018-04-30");
    const minhas = a.linhas.filter((l) => l.titulo.startsWith(PREFIXO));
    const por = Object.fromEntries(minhas.map((l) => [l.titulo.replace(`${PREFIXO} `, ""), l.situacao]));
    expect(por).toEqual({ "Aval 1 feita": "FEITO", "Aval 2 aberta": "ABERTO", "Aval 3 sem tarefa": "SEM_TAREFA" }); // "Aval 4" foi entregue em maio
    expect(a.obrasEntregues).toBeGreaterThanOrEqual(3);
    expect(a.pedidosFeitos).toBeGreaterThanOrEqual(1);
  });

  it("o pedido feito às 23h59 do dia 30 conta em abril; o de 00h01 do dia 1º conta em maio", async () => {
    const abril = await avaliacoesDoGoogle(ABR, "2018-04-30");
    const maio = await avaliacoesDoGoogle({ de: "2018-05-01", ate: "2018-05-31" }, "2018-05-31");
    const f = (a: typeof abril, nome: string) => a.linhas.some((l) => l.titulo === `${PREFIXO} ${nome}`);
    expect(f(maio, "Aval 4 fora")).toBe(true);
    expect(f(abril, "Aval 4 fora")).toBe(false);
    // 1 pedido (Aval 1) em abril; 1 (Aval 4) em maio: comparação por diferença entre períodos vazios de dados reais.
    expect(abril.pedidosFeitos - (await avaliacoesDoGoogle({ de: "2018-04-01", ate: "2018-04-29" }, "2018-04-29")).pedidosFeitos).toBe(1);
  });

  it("pedido atrasado é contado pela data de referência recebida", async () => {
    const antes = await avaliacoesDoGoogle(ABR, "2018-04-11"); // vencimento 12/04 ainda não passou
    const depois = await avaliacoesDoGoogle(ABR, "2018-04-13");
    expect(depois.pedidosVencidos - antes.pedidosVencidos).toBe(1);
  });
});

describe("Obras em andamento", () => {
  it("traz a etapa atual (bloqueada antes da pendente), as etapas prontas e ignora as dispensadas", async () => {
    const r = await obrasEmAndamento();
    const o = r.linhas.find((l) => l.titulo === `${PREFIXO} And 1`);
    expect(o).toMatchObject({ status: "EM_EXECUCAO", etapaBloqueada: true, etapasConcluidas: 1, etapasTotal: 3 });
    expect(o?.etapaAtual).toContain("FABRICACAO");
    // Obra concluída (as de produção e avaliação) não é "em andamento".
    expect(r.linhas.some((l) => l.titulo === `${PREFIXO} Prod 1`)).toBe(false);
  });
});
