import { randomUUID } from "node:crypto";

import type { QueryResultRow } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Prisma } from "@/generated/prisma/client";
import { criarClientePrisma } from "@/lib/db/criar-cliente";
import type { Periodo } from "@/lib/periodo";
import { desempenhoPorParceiro, sazonalidade, ticketPorPorte, ticketPorTipoDeServico, vendasPorOrigem } from "@/modules/indicadores/vendas-por-dimensao";
import { vendidoNoPeriodo } from "@/modules/indicadores/vendas";
import { ganhasEPerdidasPorFaixa, temposDeDecisao } from "@/modules/indicadores/tempos-e-faixas";
import { calcularFunil } from "@/lib/dominio/relatorio-funil";
import { carregarRelatorioDoFunil } from "@/modules/relatorios/funil";

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

type OpcoesDeProposta = { status?: "APROVADA" | "ENVIADA" | "RECUSADA"; aceitaEm?: string | null; valor?: number; enviadaEm?: string | null; deletada?: boolean; /** Totais das opções do conteúdo congelado (snapshot). */ snapshotTotais?: number[] };
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
      snapshot: o.snapshotTotais ? { opcoes: o.snapshotTotais.map((total, i) => ({ id: `op${i}`, nome: `Opção ${i + 1}`, totais: { itensCentavos: total, descontoCentavos: 0, acrescimoNotaCentavos: 0, totalCentavos: total, areaM2: 0 } })) } : undefined,
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
  await proposta(p4.id, { aceitaEm: "2020-01-01T03:01:00Z", valor: 111_100, enviadaEm: "2020-01-03T15:00:00Z" }); // 01/01 às 00h01 em SP: DENTRO (aceite ANTES do envio registrado: fica fora da média dos tempos)
  await proposta(p4.id, { aceitaEm: "2020-01-01T02:59:00Z", valor: 333_300 }); // 31/12 às 23h59 em SP: fora (dezembro)
  await proposta(p4.id, { aceitaEm: "2020-02-01T03:30:00Z", valor: 777_700 }); // 01/02 às 00h30 em SP: fora
  await proposta(p3.id, { status: "RECUSADA", aceitaEm: "2020-01-14T15:00:00Z", valor: 555_500 }); // recusada: não é venda
  await proposta(p1.id, { aceitaEm: "2020-01-12T15:00:00Z", valor: 888_800, deletada: true }); // proposta excluída
  await proposta(excluido.id, { aceitaEm: "2020-01-12T15:00:00Z", valor: 999_900 }); // projeto excluído
  await proposta(p3.id, { aceitaEm: "2019-01-10T15:00:00Z", valor: 50_000 }); // um ano antes (janeiro/2019)

  // ----- Funil (coorte = projetos CRIADOS em janeiro/2020; origem INSTAGRAM para não mexer nas contas de origem acima) -----
  const fase = (projetoId: string, para: Prisma.HistoricoFaseProjetoUncheckedCreateInput["para"], de: Prisma.HistoricoFaseProjetoUncheckedCreateInput["de"] = null) =>
    prisma.historicoFaseProjeto.create({ data: { projetoId, de, para, criadoEm: instante("2020-01-10T15:00:00Z") } });
  const funil = (titulo: string, status: Prisma.ProjetoUncheckedCreateInput["status"], extra: Partial<Prisma.ProjetoUncheckedCreateInput> = {}) =>
    projeto(titulo, c1.id, { status, origem: "INSTAGRAM", criadoEm: instante("2020-01-07T15:00:00Z"), ...extra });
  await funil("F1 novo", "NOVO_LEAD");
  const f2 = await funil("F2 visita", "VISITA_AGENDADA");
  await fase(f2.id, "NOVO_LEAD");
  await fase(f2.id, "VISITA_AGENDADA", "NOVO_LEAD");
  const f3 = await funil("F3 proposta", "PROPOSTA_ENVIADA");
  for (const p of ["VISITA_AGENDADA", "ELABORANDO_PROPOSTA", "PROPOSTA_ENVIADA"] as const) await fase(f3.id, p);
  const f4 = await funil("F4 perdido com proposta", "PERDIDO", { perdidoEm: instante("2020-01-12T15:00:00Z") });
  for (const p of ["PROPOSTA_ENVIADA", "PERDIDO"] as const) await fase(f4.id, p);
  await proposta(f4.id, { status: "RECUSADA", enviadaEm: "2020-01-02T15:00:00Z", snapshotTotais: [1_200_000] });
  const f5 = await funil("F5 em execucao", "EM_EXECUCAO", { valorEstimadoCentavos: 100_000 });
  for (const p of ["PROPOSTA_ENVIADA", "APROVADO", "EM_EXECUCAO"] as const) await fase(f5.id, p);
  const f6 = await funil("F6 perdido sem proposta", "PERDIDO", { perdidoEm: instante("2020-01-13T15:00:00Z") });
  await fase(f6.id, "PERDIDO");
  // Borda da coorte, em horário de São Paulo: 31/01 23h59 e 01/01 00h01 DENTRO; 01/02 00h01 e 31/12 23h59 fora.
  await funil("F borda 23h59 do dia 31", "NOVO_LEAD", { criadoEm: instante("2020-02-01T02:59:00Z") });
  await funil("F borda 00h01 do dia 1", "NOVO_LEAD", { criadoEm: instante("2020-01-01T03:01:00Z") });
  await funil("F borda 00h01 de fevereiro", "NOVO_LEAD", { criadoEm: instante("2020-02-01T03:01:00Z") });
  await funil("F borda 23h59 de dezembro", "NOVO_LEAD", { criadoEm: instante("2020-01-01T02:59:00Z") });

  // ----- Ganhas × perdidas por faixa (janela de 12 meses até 31/01/2020) e tempos de decisão -----
  const perdida = async (titulo: string, perdidoEm: string, propostas: { enviadaEm: string; totais?: number[] }[]) => {
    const p = await projeto(titulo, c2.id, { status: "PERDIDO", perdidoEm: instante(perdidoEm), origem: "INSTAGRAM" });
    for (const x of propostas) await proposta(p.id, { status: "RECUSADA", enviadaEm: x.enviadaEm, snapshotTotais: x.totais });
    return p;
  };
  await perdida("PF borda 00h01 de 01/02/2019", "2019-02-01T02:01:00Z", [{ enviadaEm: "2019-01-20T15:00:00Z", totais: [100_000] }]); // DENTRO da janela (em fev/2019 São Paulo estava no horário de verão, UTC−2: a meia-noite local é 02h00Z)
  await perdida("PF fora 23h59 de 31/01/2019", "2019-02-01T01:59:00Z", [{ enviadaEm: "2019-01-20T15:00:00Z", totais: [4_000_000] }]); // fora
  await perdida("PF duas propostas", "2019-07-15T15:00:00Z", [{ enviadaEm: "2019-06-01T15:00:00Z", totais: [9_000_000] }, { enviadaEm: "2019-07-01T15:00:00Z", totais: [150_000] }]); // vale a ÚLTIMA: 150.000
  await perdida("PF 250", "2019-08-15T15:00:00Z", [{ enviadaEm: "2019-08-01T15:00:00Z", totais: [250_000] }]);
  await perdida("PF 350", "2019-09-15T15:00:00Z", [{ enviadaEm: "2019-09-01T15:00:00Z", totais: [350_000] }]);
  await perdida("PF 500", "2019-10-15T15:00:00Z", [{ enviadaEm: "2019-10-01T15:00:00Z", totais: [500_000] }]);
  await perdida("PF duas opcoes", "2019-11-15T15:00:00Z", [{ enviadaEm: "2019-11-01T15:00:00Z", totais: [500_000, 700_000] }]); // vale a MAIOR opção: 700.000
  await perdida("PF borda 23h59 de 31/01/2020", "2020-02-01T02:59:00Z", [{ enviadaEm: "2020-01-01T15:00:00Z", totais: [900_000] }]); // DENTRO da janela e de janeiro
  await perdida("PF fora 00h01 de 01/02/2020", "2020-02-01T03:01:00Z", [{ enviadaEm: "2020-01-20T15:00:00Z", totais: [5_000_000] }]); // fora
  await perdida("TP1 sem valor", "2020-01-20T15:00:00Z", [{ enviadaEm: "2020-01-05T15:00:00Z" }]); // enviada, mas o conteúdo congelado não tem valor
  await perdida("TP2 400", "2020-01-28T15:00:00Z", [{ enviadaEm: "2020-01-27T15:00:00Z", totais: [400_000] }]);
  // Duas propostas ENVIADAS (em aberto agora).
  const aberta = await projeto("TA aberta", c2.id, { status: "PROPOSTA_ENVIADA", origem: "INSTAGRAM" });
  await proposta(aberta.id, { status: "ENVIADA", enviadaEm: "2020-01-15T15:00:00Z", snapshotTotais: [10_000] });
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
    expect(por.GOOGLE).toEqual({ origem: "GOOGLE", leads: 1, comProposta: 2, fechados: 2, vendidoCentavos: 1_111_100 }); // P1 e P4 tiveram proposta enviada em janeiro
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
    // Propostas enviadas em janeiro: P1 (1), P2 (2), P4 (1) e as do funil/faixas (F4 e as de 2020-01 das perdidas); novos contatos: P1, P2, P3 e os projetos do funil (P4 nasceu em dezembro, o excluído não conta).
    expect(jan.atual.propostasEnviadas).toBe(10); // P1, P2 (2), P4, F4, a perdida de 31/01 23h59, a de 01/02 (enviada em janeiro), TP1, TP2 e a aberta
    expect(jan.atual.novosContatos).toBe(3 + 8);
    expect(dez.atual.novosContatos).toBe(2); // P4 (20/12) e o do funil criado em 31/12 às 23h59
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

// ---------------------------------------------------------------------------------------------------------------------
// Funil em SQL agregado (coorte = projetos criados no período)
// ---------------------------------------------------------------------------------------------------------------------

describe("Funil em SQL: o mesmo resultado do cálculo em memória, sem limite de projetos", () => {
  it("contagens à mão: 11 projetos criados em janeiro (com as bordas 23h59 e 00h01 em São Paulo), chegaram [11, 7, 6, 6, 4, 4], taxa 80%", async () => {
    const r = await carregarRelatorioDoFunil({ de: JAN.de, ate: JAN.ate });
    expect(r.total).toBe(11); // p1, p2, p3, F1..F6 e as duas bordas de dentro
    expect(r.conversao.map((c) => c.chegaram)).toEqual([11, 7, 6, 6, 4, 4]);
    expect(r.conversao[1]).toMatchObject({ percentualDoTotal: 63.6, percentualDaAnterior: 63.6 });
    // Aprovados que chegaram: p1, p2, p3 e F5 (em execução). Perdidos que chegaram a ter proposta enviada: só F4 (F6 não). 4 ÷ (4 + 1).
    expect(r.taxaDeFechamento).toBe(80);
    expect(r.ticketMedioCentavos).toBe(100_000); // só F5 tem valor estimado
    const por = Object.fromEntries(r.porOrigem.map((o) => [o.origem ?? "NULO", o]));
    expect(por.INSTAGRAM).toEqual({ origem: "INSTAGRAM", leads: 8, comVisita: 4, comPropostaEnviada: 3, aprovados: 1, perdidos: 2 });
    expect(por.GOOGLE).toMatchObject({ leads: 1, comVisita: 1, aprovados: 1 });
    expect(r.porFase.find((f) => f.status === "PERDIDO")?.quantidade).toBe(2);
  });

  it("é IDÊNTICO ao cálculo em memória (calcularFunil) sobre as mesmas linhas da coorte", async () => {
    const linhas = await prisma.projeto.findMany({
      where: { deletadoEm: null, criadoEm: { gte: instante("2020-01-01T03:00:00Z"), lt: instante("2020-02-01T03:00:00Z") } },
      select: { origem: true, status: true, valorEstimadoCentavos: true, historicoFases: { select: { para: true, criadoEm: true } } },
    });
    const oraculo = calcularFunil(linhas.map((p) => ({ origem: p.origem, status: p.status, valorEstimadoCentavos: p.valorEstimadoCentavos, fases: p.historicoFases.map((h) => ({ para: h.para, em: h.criadoEm })) })));
    const r = await carregarRelatorioDoFunil({ de: JAN.de, ate: JAN.ate });
    const ordem = <T extends { origem: string | null }>(l: T[]) => [...l].sort((a, b) => String(a.origem).localeCompare(String(b.origem)));
    expect(r.total).toBe(oraculo.total);
    expect(r.porFase).toEqual(oraculo.porFase);
    expect(r.conversao).toEqual(oraculo.conversao);
    expect(ordem(r.porOrigem)).toEqual(ordem(oraculo.porOrigem));
    expect(r.taxaDeFechamento).toBe(oraculo.taxaDeFechamento);
    expect(r.ticketMedioCentavos).toBe(oraculo.ticketMedioCentavos);
  });

  it("o filtro de origem vale para tudo (só INSTAGRAM) e período sem projetos dá total 0 e conversão em branco", async () => {
    const r = await carregarRelatorioDoFunil({ de: JAN.de, ate: JAN.ate, origem: "INSTAGRAM" });
    expect(r.total).toBe(8);
    expect(r.porOrigem.map((o) => o.origem)).toEqual(["INSTAGRAM"]);
    const vazio = await carregarRelatorioDoFunil({ de: MAR.de, ate: MAR.ate });
    expect(vazio.total).toBe(0);
    expect(vazio.conversao.every((c) => c.percentualDoTotal === null)).toBe(true);
    expect(vazio.taxaDeFechamento).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Tempos de resposta (proposta → decisão)
// ---------------------------------------------------------------------------------------------------------------------

describe("Tempos de resposta: proposta enviada → decisão", () => {
  it("aprovadas: dias entre o envio e o aceite; aceite ANTES do envio fica fora da média e é contado", async () => {
    const d = await temposDeDecisao(JAN);
    const minhas = d.aprovadas.linhas.filter((l) => l.titulo.startsWith(PREFIXO));
    // P1: 08→10/01 = 2; P2: 09/01→31/01 (22h em SP) = 22; P2 (2ª): 18→20/01 = 2; P4: aceite em 01/01 e envio em 03/01 = −2 (fora).
    expect(minhas.map((l) => [l.titulo, l.dias, l.naMedia]).sort()).toEqual(
      [
        [`${PREFIXO} P1`, 2, true],
        [`${PREFIXO} P2`, 22, true],
        [`${PREFIXO} P2`, 2, true],
        [`${PREFIXO} P4`, -2, false],
      ].sort(),
    );
    expect(d.aprovadas.amostra).toBe(3);
    expect(d.aprovadas.foraDaMedia).toBe(1);
    expect(d.aprovadas.mediaDias).toBe(8.7); // (2 + 22 + 2) ÷ 3
  });

  it("perdidas: dias entre o PRIMEIRO envio e a perda; sem proposta enviada fica de fora e é contada; 31/01 23h59 entra e 01/02 00h01 não", async () => {
    const d = await temposDeDecisao(JAN);
    // F4: 02→12/01 = 10; TP1: 05→20/01 = 15; TP2: 27→28/01 = 1; a perdida de 31/01 23h59 (enviada em 01/01) = 30. A de 01/02 00h01 está fora do período.
    expect(d.perdidas.linhas.map((l) => l.dias).sort((a, b) => a - b)).toEqual([1, 10, 15, 30]);
    expect(d.perdidas.mediaDias).toBe(14);
    expect(d.perdidas.semPropostaEnviada).toBe(1); // F6
    expect(d.emAbertoAgora).toBeGreaterThanOrEqual(1); // a proposta ENVIADA do teste (e as reais, se houver)
  });

  it("período sem decisões: sem média (null), nunca zero", async () => {
    const d = await temposDeDecisao(MAR);
    expect(d.aprovadas).toMatchObject({ mediaDias: null, amostra: 0, foraDaMedia: 0 });
    expect(d.perdidas).toMatchObject({ mediaDias: null, amostra: 0 });
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Ganhas × perdidas por faixa de preço (janela de 12 meses a partir da data de referência)
// ---------------------------------------------------------------------------------------------------------------------

describe("Ganhas × perdidas por faixa de preço", () => {
  it("quartis dos 15 casos (6 ganhas e 9 perdidas): cortes 200.000, 350.000 e 700.000; cada caso numa só faixa", async () => {
    const f = await ganhasEPerdidasPorFaixa(REFERENCIA, null);
    expect(f.janela).toEqual({ de: "2019-02-01", ate: "2020-01-31" });
    expect(f.casos).toHaveLength(15);
    expect(f.casos.filter((c) => c.ganha)).toHaveLength(6);
    if (f.resultado.tipo !== "faixas") throw new Error("devia dividir em faixas");
    expect(f.resultado.origemDosCortes).toBe("quartis");
    expect(f.resultado.cortes).toEqual([200_000, 350_000, 700_000]);
    expect(f.resultado.linhas.map((l) => [l.ganhas, l.perdidas])).toEqual([[2, 2], [2, 2], [1, 3], [1, 2]]);
    expect(f.resultado.linhas.reduce((s, l) => s + l.ganhas + l.perdidas, 0)).toBe(15);
  });

  it("a perdida vale pela ÚLTIMA proposta enviada (150.000, não 9.000.000) e pela MAIOR opção (700.000, não 500.000)", async () => {
    const f = await ganhasEPerdidasPorFaixa(REFERENCIA, null);
    const perdidas = f.casos.filter((c) => !c.ganha).map((c) => c.valorCentavos).sort((a, b) => a - b);
    expect(perdidas).toEqual([100_000, 150_000, 250_000, 350_000, 400_000, 500_000, 700_000, 900_000, 1_200_000]);
  });

  it("bordas da janela em São Paulo: 01/02/2019 00h01 e 31/01/2020 23h59 entram; 31/01/2019 23h59 e 01/02/2020 00h01 ficam fora", async () => {
    const f = await ganhasEPerdidasPorFaixa(REFERENCIA, null);
    const valores = f.casos.map((c) => c.valorCentavos);
    expect(valores).toContain(100_000);
    expect(valores).toContain(900_000);
    expect(valores).not.toContain(4_000_000);
    expect(valores).not.toContain(5_000_000);
  });

  it("fora do mundo dos casos: a perdida sem proposta e a sem valor são contadas à parte, não somem em silêncio", async () => {
    const f = await ganhasEPerdidasPorFaixa(REFERENCIA, null);
    expect(f.perdidasSemProposta).toBe(1); // F6
    expect(f.perdidasSemValor).toBe(1); // TP1
  });

  it("cortes digitados mandam (mesmo sem os quartis): 300.000 e 800.000 dão 3 faixas que fecham os 15 casos", async () => {
    const f = await ganhasEPerdidasPorFaixa(REFERENCIA, [300_000, 800_000]);
    if (f.resultado.tipo !== "faixas") throw new Error("devia dividir em faixas");
    expect(f.resultado.origemDosCortes).toBe("digitados");
    expect(f.resultado.linhas).toHaveLength(3);
    expect(f.resultado.linhas.reduce((s, l) => s + l.ganhas + l.perdidas, 0)).toBe(15);
  });

  it("com a referência em outra data a janela anda (mesmos dados, outro recorte): sem a janela de 2020 há poucos casos e a tabela é única", async () => {
    const f = await ganhasEPerdidasPorFaixa("2019-12-31", null);
    expect(f.janela).toEqual({ de: "2019-01-01", ate: "2019-12-31" });
    expect(f.resultado.tipo === "unica" || f.resultado.casos >= 12).toBe(true);
  });
});
