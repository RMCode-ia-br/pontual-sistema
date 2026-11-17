import { randomUUID } from "node:crypto";

import type { QueryResultRow } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Prisma } from "@/generated/prisma/client";
import { criarClientePrisma } from "@/lib/db/criar-cliente";
import type { Periodo } from "@/lib/periodo";
import { desempenhoPorParceiro, sazonalidade, ticketPorPorte, ticketPorTipoDeServico, vendasPorOrigem } from "@/modules/indicadores/vendas-por-dimensao";
import { vendidoNoPeriodo } from "@/modules/indicadores/vendas";

import { comConexao } from "./banco-teste";

/**
 * Relatórios comerciais da Fase 7B (Bloco 6): cada visão é conferida contra o valor calculado à mão e contra uma consulta SQL
 * INDEPENDENTE (escrita aqui, sem usar função do sistema). Dados com prefixo "Int Rcom", em janeiro de 2020 (sem dado real),
 * com registros às 22h e 23h59 do último dia do mês e à 00h01 do primeiro (horário de São Paulo, UTC−3). Janelas relativas
 * recebem a data de referência como parâmetro, então nada aqui depende do dia em que o teste roda.
 */
const PREFIXO = "Int Rcom";
const prisma = criarClientePrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL);
const JAN: Periodo = { de: "2020-01-01", ate: "2020-01-31" };
const MAR: Periodo = { de: "2020-03-01", ate: "2020-03-31" };
const instante = (t: string) => new Date(t);
const q = async <T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> => comConexao(async (c) => (await c.query<T>(sql, params)).rows);
const EM_SP = (coluna: string) => `((${coluna} AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')::date`;
let seq = 0;

async function limpar() {
  await comConexao(async (c) => {
    const projetos = `SELECT id FROM "Projeto" WHERE titulo LIKE '${PREFIXO}%'`;
    const propostas = `SELECT id FROM "Proposta" WHERE "projetoId" IN (${projetos})`;
    await c.query(`DELETE FROM "ItemPropostaMedida" WHERE "itemId" IN (SELECT id FROM "ItemProposta" WHERE "propostaId" IN (${propostas}))`);
    await c.query(`DELETE FROM "ItemProposta" WHERE "propostaId" IN (${propostas})`);
    await c.query(`DELETE FROM "OpcaoProposta" WHERE "propostaId" IN (${propostas})`);
    await c.query(`DELETE FROM "Proposta" WHERE "projetoId" IN (${projetos})`);
    await c.query(`DELETE FROM "HistoricoFaseProjeto" WHERE "projetoId" IN (${projetos})`);
    await c.query(`DELETE FROM "Projeto" WHERE titulo LIKE '${PREFIXO}%'`);
    await c.query(`DELETE FROM "EnderecoCliente" WHERE "clienteId" IN (SELECT id FROM "Cliente" WHERE nome LIKE '${PREFIXO}%')`);
    await c.query(`DELETE FROM "Cliente" WHERE nome LIKE '${PREFIXO}%'`);
  });
}

type Cliente = { id: string };
const cliente = (nome: string, extra: Partial<Prisma.ClienteUncheckedCreateInput> = {}): Promise<Cliente> => prisma.cliente.create({ data: { nome: `${PREFIXO} ${nome}`, tipoPessoa: "PF", ...extra } });
const projeto = (titulo: string, clienteId: string, extra: Partial<Prisma.ProjetoUncheckedCreateInput> = {}) =>
  prisma.projeto.create({ data: { codigo: `INT-RCOM-${++seq}-${randomUUID().slice(0, 6)}`, titulo: `${PREFIXO} ${titulo}`, clienteId, status: "APROVADO", ...extra } });

type OpcoesDeProposta = { status?: "APROVADA" | "ENVIADA" | "RECUSADA"; aceitaEm?: string | null; valor?: number; enviadaEm?: string | null; deletada?: boolean };
async function proposta(projetoId: string, o: OpcoesDeProposta = {}) {
  const status = o.status ?? "APROVADA";
  const aprovada = status === "APROVADA";
  const numero = `INT-RCOM-${String(++seq).padStart(4, "0")}`;
  return prisma.proposta.create({
    data: {
      projetoId,
      numero,
      numeroSequencial: 7_300_000 + seq,
      ano: 2020,
      data: new Date("2020-01-02T00:00:00Z"),
      clienteNome: `${PREFIXO} Cliente`,
      status,
      aceitaEm: o.aceitaEm ? instante(o.aceitaEm) : null,
      enviadaEm: o.enviadaEm ? instante(o.enviadaEm) : null,
      valorAprovadoCentavos: aprovada ? (o.valor ?? 0) : null,
      deletadoEm: o.deletada ? new Date() : null,
    },
  });
}

/** Referência fixa dos testes de janela relativa: fim de janeiro de 2020 (nenhum teste lê o relógio). */
const REFERENCIA = "2020-01-31";

let arq1: Cliente;

beforeAll(async () => {
  await limpar();
  const [c1, c2, c3, c4] = await Promise.all([cliente("Cliente 1"), cliente("Cliente 2"), cliente("Cliente 3"), cliente("Cliente 4")]);
  arq1 = await cliente("Arquiteta 1", { arquiteto: true });
  const cons1 = await cliente("Construtora 1");

  // ----- Vendas por dimensão (janeiro/2020) -----
  const p1 = await projeto("P1", c1.id, { origem: "GOOGLE", porte: "PEQUENO", tiposServico: ["JANELA"], arquitetoId: arq1.id, criadoEm: instante("2020-01-03T15:00:00Z") });
  const p2 = await projeto("P2", c2.id, { origem: "INDICACAO_CLIENTE", porte: "GRANDE", tiposServico: ["JANELA", "PORTA"], arquitetoId: arq1.id, construtoraId: cons1.id, criadoEm: instante("2020-01-04T15:00:00Z") });
  const p3 = await projeto("P3", c3.id, { origem: null, porte: null, tiposServico: [], criadoEm: instante("2020-01-05T15:00:00Z") });
  const p4 = await projeto("P4", c4.id, { origem: "GOOGLE", porte: null, tiposServico: [], criadoEm: instante("2019-12-20T15:00:00Z") });
  const excluido = await projeto("P5 excluido", c1.id, { origem: "GOOGLE", deletadoEm: new Date(), criadoEm: instante("2020-01-06T15:00:00Z") });

  await proposta(p1.id, { aceitaEm: "2020-01-10T15:00:00Z", valor: 1_000_000, enviadaEm: "2020-01-08T15:00:00Z" });
  await proposta(p2.id, { aceitaEm: "2020-02-01T01:00:00Z", valor: 400_000, enviadaEm: "2020-01-09T15:00:00Z" }); // 31/01 às 22h em SP: DENTRO
  await proposta(p2.id, { aceitaEm: "2020-01-20T15:00:00Z", valor: 200_000, enviadaEm: "2020-01-18T15:00:00Z" }); // 2ª parte aprovada do mesmo projeto
  await proposta(p3.id, { aceitaEm: "2020-01-15T15:00:00Z", valor: 300_000 }); // nunca enviada: só aprovada
  await proposta(p4.id, { aceitaEm: "2020-01-01T03:01:00Z", valor: 111_100 }); // 01/01 às 00h01 em SP: DENTRO
  await proposta(p4.id, { aceitaEm: "2020-01-01T02:59:00Z", valor: 333_300 }); // 31/12 às 23h59 em SP: fora (dezembro)
  await proposta(p4.id, { aceitaEm: "2020-02-01T03:30:00Z", valor: 777_700 }); // 01/02 às 00h30 em SP: fora
  await proposta(p3.id, { status: "RECUSADA", aceitaEm: "2020-01-14T15:00:00Z", valor: 555_500 }); // recusada: não é venda
  await proposta(p1.id, { aceitaEm: "2020-01-12T15:00:00Z", valor: 888_800, deletada: true }); // proposta excluída
  await proposta(excluido.id, { aceitaEm: "2020-01-12T15:00:00Z", valor: 999_900 }); // projeto excluído
  await proposta(p3.id, { aceitaEm: "2019-01-10T15:00:00Z", valor: 50_000 }); // um ano antes (janeiro/2019)
});

afterAll(async () => {
  await limpar();
  await prisma.$disconnect();
});

describe("Vendas por origem: tela × SQL independente × valor à mão", () => {
  it("leads, propostas enviadas, fechados e R$ por origem (com borda do mês em horário de São Paulo)", async () => {
    const r = await vendasPorOrigem(JAN);
    const por = Object.fromEntries(r.map((l) => [l.origem ?? "NULO", l]));
    // À mão: GOOGLE = P1 (1.000.000) + P4 (111.100); INDICAÇÃO = P2 (400.000 + 200.000); sem origem = P3 (300.000).
    expect(por.GOOGLE).toEqual({ origem: "GOOGLE", leads: 1, comProposta: 1, fechados: 2, vendidoCentavos: 1_111_100 });
    expect(por.INDICACAO_CLIENTE).toEqual({ origem: "INDICACAO_CLIENTE", leads: 1, comProposta: 1, fechados: 1, vendidoCentavos: 600_000 });
    expect(por.NULO).toEqual({ origem: null, leads: 1, comProposta: 0, fechados: 1, vendidoCentavos: 300_000 });
    expect(r.filter((l) => l.origem === null || l.origem === "GOOGLE" || l.origem === "INDICACAO_CLIENTE")).toHaveLength(3);

    // SQL independente por origem.
    const sql = await q<{ origem: string | null; total: string; fechados: number }>(
      `SELECT j.origem::text AS origem, COALESCE(sum(pr."valorAprovadoCentavos"), 0)::text AS total, count(DISTINCT pr."projetoId")::int AS fechados
         FROM "Proposta" pr JOIN "Projeto" j ON j.id = pr."projetoId"
        WHERE pr.status = 'APROVADA' AND pr."deletadoEm" IS NULL AND j."deletadoEm" IS NULL AND ${EM_SP('pr."aceitaEm"')} BETWEEN $1::date AND $2::date
          AND j.titulo LIKE '${PREFIXO}%'
        GROUP BY j.origem`,
      [JAN.de, JAN.ate],
    );
    for (const l of sql) expect(por[l.origem ?? "NULO"].vendidoCentavos).toBe(Number(l.total));
    expect(sql.reduce((s, l) => s + Number(l.total), 0)).toBe(2_011_100);
  });

  it("a soma por origem fecha com o 'Vendido' do painel (a mesma definição de venda)", async () => {
    const meu = (await vendasPorOrigem(JAN)).filter((l) => ["GOOGLE", "INDICACAO_CLIENTE", null].includes(l.origem));
    const totalDasOrigens = meu.reduce((s, l) => s + l.vendidoCentavos, 0);
    expect(totalDasOrigens).toBe(2_011_100);
    // O painel soma o banco todo: o que é nosso é uma parte dele (por diferença, sem depender de dado real).
    expect((await vendidoNoPeriodo(JAN)).totalCentavos).toBeGreaterThanOrEqual(totalDasOrigens);
  });

  it("período sem nada: sem linhas nossas", async () => {
    expect((await vendasPorOrigem(MAR)).filter((l) => l.vendidoCentavos > 0 || l.leads > 0)).toEqual([]);
  });
});

describe("Desempenho por parceiro (arquiteto e construtora)", () => {
  it("indicados, com proposta, fechados e R$ do arquiteto e da construtora", async () => {
    const arq = (await desempenhoPorParceiro(JAN, "arquiteto")).find((l) => l.parceiroId === arq1.id);
    expect(arq).toMatchObject({ nome: `${PREFIXO} Arquiteta 1`, indicados: 2, comProposta: 2, fechados: 2, vendidoCentavos: 1_600_000 });
    const cons = (await desempenhoPorParceiro(JAN, "construtora")).find((l) => l.nome === `${PREFIXO} Construtora 1`);
    expect(cons).toMatchObject({ indicados: 1, comProposta: 1, fechados: 1, vendidoCentavos: 600_000 });
  });

  it("projeto sem parceiro não entra em nenhuma linha de parceiro", async () => {
    const todas = [...(await desempenhoPorParceiro(JAN, "arquiteto")), ...(await desempenhoPorParceiro(JAN, "construtora"))].filter((l) => l.nome.startsWith(PREFIXO));
    expect(todas.reduce((s, l) => s + l.vendidoCentavos, 0)).toBe(1_600_000 + 600_000); // P3 e P4 (sem parceiro) ficam de fora
  });
});

describe("Ticket médio por tipo de serviço e por porte", () => {
  it("obra com vários tipos entra em cada um; sem tipo ou porte vai para 'Não informado'; ticket = vendido ÷ obras", async () => {
    const tipos = Object.fromEntries((await ticketPorTipoDeServico(JAN)).map((l) => [l.chave ?? "NULO", l]));
    expect(tipos.JANELA).toMatchObject({ projetos: expect.any(Number) });
    // Só as nossas obras estão em janeiro de 2020; se houver dado real, a conferência é por diferença (nunca menos que o nosso).
    expect(tipos.JANELA.vendidoCentavos).toBeGreaterThanOrEqual(1_600_000);
    const porte = Object.fromEntries((await ticketPorPorte(JAN)).map((l) => [l.chave ?? "NULO", l]));
    expect(porte.PEQUENO).toMatchObject({ projetos: 1, vendidoCentavos: 1_000_000, ticketCentavos: 1_000_000 });
    expect(porte.GRANDE).toMatchObject({ projetos: 1, vendidoCentavos: 600_000, ticketCentavos: 600_000 });
    expect(porte.NULO).toMatchObject({ projetos: 2, vendidoCentavos: 411_100, ticketCentavos: 205_550 }); // P3 + P4
  });

  it("tipo: JANELA (P1, P2) 1.600.000 ÷ 2; PORTA (P2) 600.000; sem tipo (P3, P4) 411.100 ÷ 2", async () => {
    const tipos = Object.fromEntries((await ticketPorTipoDeServico(JAN)).map((l) => [l.chave ?? "NULO", l]));
    expect(tipos.JANELA).toMatchObject({ projetos: 2, vendidoCentavos: 1_600_000, ticketCentavos: 800_000 });
    expect(tipos.PORTA).toMatchObject({ projetos: 1, vendidoCentavos: 600_000, ticketCentavos: 600_000 });
    expect(tipos.NULO).toMatchObject({ projetos: 2, vendidoCentavos: 411_100, ticketCentavos: 205_550 });
    // A soma por tipo passa do total (P2 está em JANELA e em PORTA): é o que a tela avisa.
    expect(Object.values(tipos).reduce((s, l) => s + l.vendidoCentavos, 0)).toBe(1_600_000 + 600_000 + 411_100);
  });
});

describe("Ano contra ano (sazonalidade) com data de referência", () => {
  it("12 meses até a referência contra os 12 de um ano antes; borda do mês em São Paulo; sem ler o relógio", async () => {
    const r = await sazonalidade(REFERENCIA);
    expect(r.periodoAtual).toEqual({ de: "2019-02-01", ate: "2020-01-31" });
    expect(r.periodoAnterior).toEqual({ de: "2018-02-01", ate: "2019-01-31" });
    expect(r.meses).toHaveLength(12);
    const jan = r.meses.find((m) => m.mes === "2020-01")!;
    const dez = r.meses.find((m) => m.mes === "2019-12")!;
    // Janeiro/2020: 1.000.000 + 400.000 (31/01 22h) + 200.000 + 300.000 + 111.100 (01/01 00h01) = 2.011.100; a de 31/12 23h59 vai para dezembro.
    expect(jan.atual.vendidoCentavos).toBe(2_011_100);
    expect(dez.atual.vendidoCentavos).toBe(333_300);
    // Um ano antes (janeiro/2019): a venda de 50.000 do P3.
    expect(jan.anoAnterior.vendidoCentavos).toBe(50_000);
    // Propostas enviadas em janeiro: P1 (1) e P2 (2); novos contatos: P1, P2 e P3 (P4 nasceu em dezembro, o excluído não conta).
    expect(jan.atual.propostasEnviadas).toBe(3);
    expect(jan.atual.novosContatos).toBe(3);
    expect(dez.atual.novosContatos).toBe(1);
    // Fevereiro/2020 está FORA da janela de 12 meses (a venda de 777.700 não aparece).
    expect(r.meses.reduce((s, m) => s + m.atual.vendidoCentavos, 0)).toBe(2_011_100 + 333_300);

    // SQL independente do vendido mensal.
    const sql = await q<{ mes: string; total: string }>(
      `SELECT to_char(${EM_SP('pr."aceitaEm"')}, 'YYYY-MM') AS mes, sum(pr."valorAprovadoCentavos")::text AS total
         FROM "Proposta" pr JOIN "Projeto" j ON j.id = pr."projetoId"
        WHERE pr.status = 'APROVADA' AND pr."deletadoEm" IS NULL AND j."deletadoEm" IS NULL AND j.titulo LIKE '${PREFIXO}%'
          AND ${EM_SP('pr."aceitaEm"')} BETWEEN '2018-02-01'::date AND '2020-01-31'::date GROUP BY 1`,
    );
    const porMes = Object.fromEntries(sql.map((l) => [l.mes, Number(l.total)]));
    expect(porMes["2020-01"]).toBe(jan.atual.vendidoCentavos);
    expect(porMes["2019-12"]).toBe(dez.atual.vendidoCentavos);
    expect(porMes["2019-01"]).toBe(jan.anoAnterior.vendidoCentavos);
  });

  it("a referência manda: com outra data, a janela muda (mesmos dados, outro recorte)", async () => {
    const r = await sazonalidade("2020-02-29");
    expect(r.periodoAtual).toEqual({ de: "2019-03-01", ate: "2020-02-29" });
    expect(r.meses.find((m) => m.mes === "2020-02")!.atual.vendidoCentavos).toBe(777_700); // a de 01/02 às 00h30
  });
});
