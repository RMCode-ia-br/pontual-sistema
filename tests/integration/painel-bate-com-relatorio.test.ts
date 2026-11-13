import { randomUUID } from "node:crypto";

import type { QueryResultRow } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Prisma } from "@/generated/prisma/client";
import { criarClientePrisma } from "@/lib/db/criar-cliente";
import { dataLocalDoInstante } from "@/lib/formatadores";
import { chaveDoMes, lerPeriodo, limitesEmInstantes, primeiroDiaDoMes, somarDias, somarMeses, type Periodo } from "@/lib/periodo";
import { janelaDeFechamento, fechamentoNaJanela, listarDecisoes, tempoVisitaAteProposta } from "@/modules/indicadores/fechamento";
import { ocupacaoAtualDaFabrica } from "@/modules/indicadores/fabrica";
import { faturamentoMensal } from "@/modules/indicadores/faturamento-mensal";
import { listarRecebimentos, recebimentosParaCsv } from "@/modules/indicadores/lista-de-recebimentos";
import { faturamentoComNota, recebidoNoPeriodo } from "@/modules/indicadores/recebimentos";
import { listarVendas, vendidoNoPeriodo } from "@/modules/indicadores/vendas";
import { listarObras } from "@/modules/obras/queries-lista";
import { resumoDeObras } from "@/modules/obras/resumo";

import { comConexao } from "./banco-teste";

/**
 * Critério de aceite da Fase 7: "cada número do painel leva à lista filtrada e bate com o relatório correspondente".
 * Para cada indicador a igualdade é provada em três pontos: (a) a função que o painel usa, (b) o loader do relatório/lista
 * de destino e (c) uma soma SQL INDEPENDENTE escrita aqui (sem usar nenhuma função do sistema), mais o valor calculado à mão.
 *
 * Dados: tudo com prefixo "Int Pnl", em janeiro de 2020 (sem dado real) e, para o que depende de "hoje" (fábrica, faturamento
 * com nota dos últimos 12 meses, faturamento mensal), comparação por DIFERENÇA antes × depois. Só apaga o que tem o prefixo;
 * nunca limpa nem reseta o banco. O limite de Configurações é trocado e SEMPRE restaurado. Não usa contadores.
 */
const PREFIXO = "Int Pnl";
const prisma = criarClientePrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL);
const AGORA = new Date();
const HOJE = dataLocalDoInstante(AGORA);
const JAN: Periodo = { de: "2020-01-01", ate: "2020-01-31" };
const MAR: Periodo = { de: "2020-03-01", ate: "2020-03-31" };

let clienteId: string;
let contaFinanceiraId: string;
let categoriaReceitaId: string;
let categoriaDespesaId: string;
let contaReceberId: string;
let limiteOriginal: number | null = null;
let limiteLido = false;
let seq = 0;

const q = async <T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> => comConexao(async (c) => (await c.query<T>(sql, params)).rows);
const n = (v: unknown) => Number(v ?? 0);
const dia = (texto: string) => new Date(`${texto}T00:00:00.000Z`);
const instante = (texto: string) => new Date(texto);

async function limpar() {
  await comConexao(async (c) => {
    const projetos = `SELECT id FROM "Projeto" WHERE titulo LIKE '${PREFIXO}%'`;
    await c.query(`DELETE FROM "Lancamento" WHERE "contaFinanceiraId" IN (SELECT id FROM "ContaFinanceira" WHERE nome LIKE '${PREFIXO}%')`);
    await c.query(`DELETE FROM "ContaReceber" WHERE "projetoId" IN (${projetos})`);
    await c.query(`DELETE FROM "EventoAgenda" WHERE "projetoId" IN (${projetos})`);
    await c.query(`DELETE FROM "EtapaProjeto" WHERE "projetoId" IN (${projetos})`);
    await c.query(`DELETE FROM "OpcaoProposta" WHERE "propostaId" IN (SELECT id FROM "Proposta" WHERE "projetoId" IN (${projetos}))`);
    await c.query(`DELETE FROM "Proposta" WHERE "projetoId" IN (${projetos})`);
    await c.query(`DELETE FROM "Projeto" WHERE titulo LIKE '${PREFIXO}%'`);
    await c.query(`DELETE FROM "Cliente" WHERE nome LIKE '${PREFIXO}%'`);
    await c.query(`DELETE FROM "ContaFinanceira" WHERE nome LIKE '${PREFIXO}%'`);
    await c.query(`DELETE FROM "CategoriaFinanceira" WHERE nome LIKE '${PREFIXO}%'`);
  });
}

// ---------------------------------------------------------------------------------------------------------
// Criadores (Prisma, com os NOT NULL e enums do schema)
// ---------------------------------------------------------------------------------------------------------

const projeto = (titulo: string, extra: Partial<Prisma.ProjetoUncheckedCreateInput> = {}) =>
  prisma.projeto.create({ data: { codigo: `INT-PNL-P-${++seq}-${randomUUID().slice(0, 6)}`, titulo: `${PREFIXO} ${titulo}`, clienteId, status: "APROVADO", ...extra } });

type OpcoesDeProposta = {
  status?: "APROVADA" | "ENVIADA" | "RECUSADA" | "RASCUNHO";
  aceitaEm?: string | null;
  valor?: number | null;
  comNota?: boolean;
  acrescimo?: number;
  areaM2?: number;
  enviadaEm?: string | null;
  deletada?: boolean;
};

async function proposta(projetoId: string, o: OpcoesDeProposta = {}): Promise<{ id: string; numero: string }> {
  const numero = `INT-PNL-${String(++seq).padStart(4, "0")}`;
  const status = o.status ?? "APROVADA";
  const opcaoId = `int-pnl-opcao-${seq}`;
  const aprovada = status === "APROVADA";
  const criada = await prisma.proposta.create({
    data: {
      projetoId,
      numero,
      numeroSequencial: 7_100_000 + seq,
      ano: 2020,
      data: dia("2020-01-02"),
      clienteNome: `${PREFIXO} Cliente`,
      status,
      comNotaFiscal: o.comNota ?? false,
      aceitaEm: o.aceitaEm ? instante(o.aceitaEm) : null,
      enviadaEm: o.enviadaEm ? instante(o.enviadaEm) : null,
      valorAprovadoCentavos: aprovada ? (o.valor ?? 0) : null,
      opcaoAprovadaId: aprovada ? opcaoId : null,
      snapshot: aprovada ? { opcoes: [{ id: opcaoId, nome: "Opção 1", totais: { itensCentavos: (o.valor ?? 0) - (o.acrescimo ?? 0), descontoCentavos: 0, acrescimoNotaCentavos: o.acrescimo ?? 0, totalCentavos: o.valor ?? 0, areaM2: o.areaM2 ?? 0 } }] } : undefined,
      deletadoEm: o.deletada ? AGORA : null,
    },
  });
  return { id: criada.id, numero };
}

type OpcoesDeLancamento = { data: string; valor: number; nota: boolean; descricao: string; tipo?: "ENTRADA" | "SAIDA"; comConta?: boolean; estornado?: boolean };
const lancamento = (o: OpcoesDeLancamento) => {
  const tipo = o.tipo ?? "ENTRADA";
  return prisma.lancamento.create({
    data: {
      data: dia(o.data),
      tipo,
      valorCentavos: o.valor,
      contaFinanceiraId,
      categoriaId: tipo === "ENTRADA" ? categoriaReceitaId : categoriaDespesaId,
      descricao: `${PREFIXO} ${o.descricao}`,
      comNotaFiscal: o.nota,
      contaReceberId: o.comConta ? contaReceberId : null,
      clienteId,
      estornadoEm: o.estornado ? AGORA : null,
      motivoEstorno: o.estornado ? "Estorno de teste" : null,
    },
  });
};

// ---------------------------------------------------------------------------------------------------------
// Somas SQL independentes (nenhuma função do sistema). Datas de São Paulo: o banco guarda UTC em timestamp(3) SEM fuso,
// então primeiro diz-se que é UTC e depois converte-se para São Paulo.
// ---------------------------------------------------------------------------------------------------------

const EM_SP = (coluna: string) => `((${coluna} AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')::date`;

async function vendasSql(de: string, ate: string) {
  const [r] = await q<{ com: string; sem: string; repasse: string; propostas: number; projetos: number }>(
    `SELECT COALESCE(sum(pr."valorAprovadoCentavos") FILTER (WHERE pr."comNotaFiscal"), 0)::text AS com,
            COALESCE(sum(pr."valorAprovadoCentavos") FILTER (WHERE NOT pr."comNotaFiscal"), 0)::text AS sem,
            COALESCE(sum((SELECT (o->'totais'->>'acrescimoNotaCentavos')::bigint FROM jsonb_array_elements(pr.snapshot->'opcoes') o WHERE o->>'id' = pr."opcaoAprovadaId")) FILTER (WHERE pr."comNotaFiscal"), 0)::text AS repasse,
            count(*)::int AS propostas, count(DISTINCT pr."projetoId")::int AS projetos
       FROM "Proposta" pr JOIN "Projeto" j ON j.id = pr."projetoId"
      WHERE pr.status = 'APROVADA' AND pr."deletadoEm" IS NULL AND j."deletadoEm" IS NULL
        AND ${EM_SP(`pr."aceitaEm"`)} BETWEEN $1::date AND $2::date`,
    [de, ate],
  );
  return { com: n(r.com), sem: n(r.sem), repasse: n(r.repasse), propostas: r.propostas, projetos: r.projetos };
}

async function recebidoSql(de: string, ate: string) {
  const [r] = await q<{ com: string; sem: string; qtd: number }>(
    `SELECT COALESCE(sum("valorCentavos") FILTER (WHERE "comNotaFiscal"), 0)::text AS com,
            COALESCE(sum("valorCentavos") FILTER (WHERE NOT "comNotaFiscal"), 0)::text AS sem, count(*)::int AS qtd
       FROM "Lancamento"
      WHERE tipo = 'ENTRADA' AND "contaReceberId" IS NOT NULL AND "estornadoEm" IS NULL AND "deletadoEm" IS NULL AND data BETWEEN $1::date AND $2::date`,
    [de, ate],
  );
  return { com: n(r.com), sem: n(r.sem), qtd: r.qtd };
}

async function limiteEhNulavel(): Promise<boolean> {
  const [r] = await q<{ is_nullable: string }>(`SELECT is_nullable FROM information_schema.columns WHERE table_name = 'ConfiguracaoEmpresa' AND column_name = 'limiteSimplesCentavos'`);
  return r?.is_nullable === "YES";
}

const definirLimite = (valor: number | null) => q(`UPDATE "ConfiguracaoEmpresa" SET "limiteSimplesCentavos" = $1 WHERE id = 'singleton'`, [valor]);

// ---------------------------------------------------------------------------------------------------------
// Dados fixos de janeiro de 2020
// ---------------------------------------------------------------------------------------------------------

/** Vendas esperadas (as que ENTRAM em janeiro/2020, em horário de São Paulo). */
const vendasEsperadas: { numero: string; valor: number; nota: boolean }[] = [];
const recebimentosEsperados: { descricao: string; valor: number; nota: boolean }[] = [];
let projetoVP1Id = "";

beforeAll(async () => {
  await limpar();
  const [r] = await q<{ limite: number | null }>(`SELECT "limiteSimplesCentavos" AS limite FROM "ConfiguracaoEmpresa" WHERE id = 'singleton'`);
  if (!r) throw new Error("ConfiguracaoEmpresa 'singleton' não existe.");
  limiteOriginal = r.limite;
  limiteLido = true;

  clienteId = (await prisma.cliente.create({ data: { nome: `${PREFIXO} Cliente`, tipoPessoa: "PF" } })).id;
  contaFinanceiraId = (await prisma.contaFinanceira.create({ data: { nome: `${PREFIXO} Banco`, saldoInicialInformado: true, saldoInicialCentavos: 0, dataSaldoInicial: dia("2019-01-01") } })).id;
  categoriaReceitaId = (await prisma.categoriaFinanceira.create({ data: { nome: `${PREFIXO} Receita`, tipo: "RECEITA", grupo: "RECEITAS_OPERACIONAIS", grupoDre: "Receitas operacionais" } })).id;
  categoriaDespesaId = (await prisma.categoriaFinanceira.create({ data: { nome: `${PREFIXO} Despesa`, tipo: "DESPESA", grupo: "CUSTOS_DIRETOS", grupoDre: "Custos diretos" } })).id;

  // ----- Vendido -----
  const p1 = await projeto("Venda P1");
  const p2 = await projeto("Venda P2");
  const p3 = await projeto("Venda P3");
  const excluido = await projeto("Venda excluido", { deletadoEm: AGORA });
  projetoVP1Id = p1.id;
  const venda = async (projetoId: string, o: OpcoesDeProposta, entra: boolean) => {
    const p = await proposta(projetoId, o);
    if (entra) vendasEsperadas.push({ numero: p.numero, valor: o.valor ?? 0, nota: o.comNota ?? false });
  };
  await venda(p1.id, { aceitaEm: "2020-01-10T15:00:00Z", valor: 1_000_000 }, true); // sem nota R$ 10.000,00
  await venda(p2.id, { aceitaEm: "2020-02-01T01:00:00Z", valor: 400_000 }, true); // sem nota R$ 4.000,00, 31/01 às 22h em SP
  await venda(p3.id, { aceitaEm: "2020-01-15T12:00:00Z", valor: 1_050_000, comNota: true, acrescimo: 50_000 }, true); // com nota R$ 10.500,00 (500,00 de repasse)
  await venda(p1.id, { aceitaEm: "2020-01-20T12:00:00Z", valor: 210_000, comNota: true, acrescimo: 10_000 }, true); // 2ª aprovada do P1: com nota R$ 2.100,00 (100,00 de repasse)
  await venda(p1.id, { aceitaEm: "2020-02-01T03:30:00Z", valor: 777_700 }, false); // 01/02 às 00:30 em SP: fora
  await venda(p2.id, { aceitaEm: "2020-01-01T02:59:00Z", valor: 333_300 }, false); // 31/12/2019 às 23:59 em SP: fora
  await venda(p1.id, { aceitaEm: "2020-01-12T12:00:00Z", valor: 888_800, deletada: true }, false); // proposta excluída
  await venda(excluido.id, { aceitaEm: "2020-01-12T12:00:00Z", valor: 999_900 }, false); // projeto excluído
  await venda(p2.id, { status: "RECUSADA", aceitaEm: "2020-01-14T12:00:00Z", valor: 555_500 }, false); // recusada

  // ----- Recebido -----
  const cr = await prisma.contaReceber.create({ data: { projetoId: p1.id, clienteId, ordem: 1, descricao: `${PREFIXO} Parcela`, valorCentavos: 100_000_000, vencimento: dia("2020-01-05"), status: "ABERTA" } });
  contaReceberId = cr.id;
  const rec = async (o: OpcoesDeLancamento, entra: boolean) => {
    await lancamento(o);
    if (entra) recebimentosEsperados.push({ descricao: `${PREFIXO} ${o.descricao}`, valor: o.valor, nota: o.nota });
  };
  await rec({ data: "2020-01-05", valor: 500_000, nota: false, comConta: true, descricao: "Rec sem 1" }, true);
  await rec({ data: "2020-01-31", valor: 250_000, nota: false, comConta: true, descricao: "Rec sem 2" }, true);
  await rec({ data: "2020-01-15", valor: 300_000, nota: true, comConta: true, descricao: "Rec com 1" }, true);
  await rec({ data: "2020-01-01", valor: 100_000, nota: true, comConta: true, descricao: "Rec com 2" }, true);
  await rec({ data: "2020-01-10", valor: 123_000, nota: false, comConta: true, estornado: true, descricao: "Rec estornado" }, false);
  await rec({ data: "2020-01-10", valor: 77_000, nota: false, tipo: "SAIDA", descricao: "Saida" }, false);
  await rec({ data: "2020-01-12", valor: 55_000, nota: true, descricao: "Entrada avulsa com nota" }, false);
  await rec({ data: "2020-02-01", valor: 44_000, nota: false, comConta: true, descricao: "Rec fora (fevereiro)" }, false);
  await rec({ data: "2019-12-31", valor: 33_000, nota: true, comConta: true, descricao: "Rec fora (dezembro)" }, false);

  // ----- Fechamento (janela de 90 dias que termina em 31/01/2020: 03/11/2019 a 31/01/2020) -----
  const aprovado = (titulo: string, status: "APROVADO" | "EM_EXECUCAO" | "CONCLUIDO" | "CANCELADO", fechamento: string) => projeto(titulo, { status, dataFechamento: instante(fechamento), valorFechadoCentavos: 100_000 });
  await aprovado("Fech aprovado 1", "APROVADO", "2019-12-05T12:00:00Z");
  await aprovado("Fech aprovado 2", "EM_EXECUCAO", "2019-12-20T12:00:00Z");
  await aprovado("Fech aprovado 3", "CONCLUIDO", "2020-01-15T12:00:00Z");
  await aprovado("Fech cancelado depois", "CANCELADO", "2020-01-10T12:00:00Z"); // não conta como ganho
  await aprovado("Fech aprovado fora (antes)", "APROVADO", "2019-11-03T02:59:00Z"); // 02/11 às 23:59 em SP: fora
  const perdido = async (titulo: string, perdidoEm: string, comProposta: boolean) => {
    const p = await projeto(titulo, { status: "PERDIDO", perdidoEm: instante(perdidoEm) });
    await proposta(p.id, comProposta ? { status: "RECUSADA", enviadaEm: "2019-12-12T12:00:00Z" } : { status: "RASCUNHO" });
  };
  await perdido("Fech perdido 1", "2019-11-20T12:00:00Z", true);
  await perdido("Fech perdido 2", "2020-01-31T23:00:00Z", true);
  await perdido("Fech perdido sem proposta enviada", "2020-01-05T12:00:00Z", false); // não conta
  await perdido("Fech perdido fora (depois)", "2020-02-01T03:00:00Z", true); // 01/02 às 00:00 em SP: fora

  // ----- Visita → proposta (janeiro/2020) -----
  const visita = (projetoId: string, realizadoEm: string | null) =>
    prisma.eventoAgenda.create({ data: { tipo: "VISITA_TECNICA", inicio: instante(realizadoEm ?? "2020-01-03T13:00:00Z"), fim: new Date(instante(realizadoEm ?? "2020-01-03T13:00:00Z").getTime() + 3_600_000), projetoId, clienteId, status: realizadoEm ? "REALIZADO" : "AGENDADO", realizadoEm: realizadoEm ? instante(realizadoEm) : null } });
  const vp = async (titulo: string) => projeto(titulo, { status: "PROPOSTA_ENVIADA" });
  const vp1 = await vp("Vis VP1"); // visita 06/01 10h SP, proposta 08/01: 2 dias (e uma 2ª proposta depois, que não conta)
  await visita(vp1.id, "2020-01-06T13:00:00Z");
  await proposta(vp1.id, { status: "ENVIADA", enviadaEm: "2020-01-08T16:00:00Z" });
  await proposta(vp1.id, { status: "ENVIADA", enviadaEm: "2020-01-25T16:00:00Z" });
  const vp2 = await vp("Vis VP2"); // visita 09/01 22h SP (= 10/01 01h UTC), proposta 13/01: 4 dias em SP (3 se errasse o fuso)
  await visita(vp2.id, "2020-01-10T01:00:00Z");
  await proposta(vp2.id, { status: "ENVIADA", enviadaEm: "2020-01-13T15:00:00Z" });
  const vp3 = await vp("Vis VP3"); // proposta enviada ANTES da visita registrada: conta 0
  await visita(vp3.id, "2020-01-22T15:00:00Z");
  await proposta(vp3.id, { status: "ENVIADA", enviadaEm: "2020-01-20T15:00:00Z" });
  const vp4 = await vp("Vis VP4"); // visita não realizada: fora
  await visita(vp4.id, null);
  await proposta(vp4.id, { status: "ENVIADA", enviadaEm: "2020-01-18T15:00:00Z" });
  const vp5 = await vp("Vis VP5"); // 1ª proposta em dezembro (a de janeiro é a 2ª): fora do período
  await visita(vp5.id, "2019-12-01T15:00:00Z");
  await proposta(vp5.id, { status: "ENVIADA", enviadaEm: "2019-12-10T15:00:00Z" });
  await proposta(vp5.id, { status: "ENVIADA", enviadaEm: "2020-01-12T15:00:00Z" });
  await projeto("Vis VP6 sem visita", { status: "PROPOSTA_ENVIADA" }).then((p) => proposta(p.id, { status: "ENVIADA", enviadaEm: "2020-01-09T15:00:00Z" })); // sem visita: fora

  // ----- Pontualidade (obras concluídas em janeiro/2020; prazo em dias corridos a partir de 10/12/2019 + 30 = 09/01/2020) -----
  const concluida = (titulo: string, conclusao: string, comPrazo: boolean) =>
    projeto(titulo, {
      status: "CONCLUIDO",
      dataConclusao: dia(conclusao),
      ...(comPrazo ? { prazoModo: "TOTAL", prazoDias: 30, tipoDiasPrazo: "CORRIDOS", dataInicioPrazo: dia("2019-12-10"), prazoFinalPrometido: dia("2020-01-09") } : {}),
    });
  await concluida("Pont no prazo", "2020-01-08", true);
  await concluida("Pont atrasada", "2020-01-14", true);
  await concluida("Pont sem prazo", "2020-01-20", false);
  await concluida("Pont fora (fevereiro)", "2020-02-05", true);
}, 180_000);

afterAll(async () => {
  try {
    if (limiteLido) await definirLimite(limiteOriginal);
  } finally {
    await limpar();
    await prisma.$disconnect();
  }
}, 180_000);

describe("preparo: janeiro e março de 2020 não têm dado real", () => {
  it("nenhum registro fora do prefixo cai nas janelas usadas em valores absolutos (senão os números à mão não valem)", async () => {
    const [r] = await q<{ total: number }>(
      `SELECT (
         (SELECT count(*) FROM "Proposta" pr JOIN "Projeto" j ON j.id = pr."projetoId" WHERE j.titulo NOT LIKE '${PREFIXO}%' AND (pr."aceitaEm" BETWEEN '2019-10-01' AND '2020-04-30' OR pr."enviadaEm" BETWEEN '2019-10-01' AND '2020-04-30'))
       + (SELECT count(*) FROM "Lancamento" WHERE "contaFinanceiraId" NOT IN (SELECT id FROM "ContaFinanceira" WHERE nome LIKE '${PREFIXO}%') AND data BETWEEN '2019-10-01' AND '2020-04-30')
       + (SELECT count(*) FROM "Projeto" WHERE titulo NOT LIKE '${PREFIXO}%' AND ("dataFechamento" BETWEEN '2019-10-01' AND '2020-04-30' OR "perdidoEm" BETWEEN '2019-10-01' AND '2020-04-30' OR "dataConclusao" BETWEEN '2019-10-01' AND '2020-04-30'))
       + (SELECT count(*) FROM "EventoAgenda" e WHERE (e."projetoId" IS NULL OR e."projetoId" NOT IN (SELECT id FROM "Projeto" WHERE titulo LIKE '${PREFIXO}%')) AND e.tipo = 'VISITA_TECNICA' AND e."realizadoEm" BETWEEN '2019-10-01' AND '2020-04-30')
       )::int AS total`,
    );
    expect(r.total).toBe(0);
  });

  it("o período lido da URL é o mesmo dos testes e os limites em instantes são os de São Paulo (UTC−3 em 2020)", () => {
    expect(lerPeriodo({ de: "2020-01-01", ate: "2020-01-31" }, HOJE).periodo).toEqual(JAN);
    expect(lerPeriodo({ mes: "2020-01" }, HOJE).periodo).toEqual(JAN);
    const { inicio, fimExclusivo } = limitesEmInstantes(JAN);
    expect(inicio.toISOString()).toBe("2020-01-01T03:00:00.000Z");
    expect(fimExclusivo.toISOString()).toBe("2020-02-01T03:00:00.000Z");
  });
});

describe("Vendido: painel × relatório de vendas × SQL independente", () => {
  it("com nota R$ 12.600,00, sem nota R$ 14.000,00, total R$ 26.600,00, repasse R$ 600,00, 4 propostas em 3 projetos, ticket R$ 8.866,67", async () => {
    const painel = await vendidoNoPeriodo(JAN);
    const sql = await vendasSql(JAN.de, JAN.ate);

    // À mão: sem nota 1.000.000 + 400.000; com nota 1.050.000 + 210.000; repasse 50.000 + 10.000.
    expect(painel.semNotaCentavos).toBe(1_400_000);
    expect(painel.comNotaCentavos).toBe(1_260_000);
    expect(painel.totalCentavos).toBe(2_660_000);
    expect(painel.repasseDeImpostoCentavos).toBe(60_000);
    expect(painel.propostas).toBe(4);
    expect(painel.projetos).toBe(3); // a 2ª aprovação do mesmo projeto não conta de novo
    expect(painel.ticketMedioCentavos).toBe(886_667); // 2.660.000 ÷ 3 = 886.666,67

    expect(sql).toEqual({ com: 1_260_000, sem: 1_400_000, repasse: 60_000, propostas: 4, projetos: 3 });
    expect({ com: painel.comNotaCentavos, sem: painel.semNotaCentavos, repasse: painel.repasseDeImpostoCentavos, propostas: painel.propostas, projetos: painel.projetos }).toEqual(sql);
  });

  it("a lista de destino (listarVendas) tem exatamente as mesmas propostas e a mesma soma", async () => {
    const painel = await vendidoNoPeriodo(JAN);
    const lista = await listarVendas(JAN);
    expect(lista.truncado).toBe(false);
    expect(lista.linhas).toHaveLength(painel.propostas);
    expect(lista.linhas.reduce((s, l) => s + l.valorCentavos, 0)).toBe(painel.totalCentavos);
    expect(lista.linhas.filter((l) => l.comNotaFiscal).reduce((s, l) => s + l.valorCentavos, 0)).toBe(painel.comNotaCentavos);
    expect(lista.linhas.filter((l) => !l.comNotaFiscal).reduce((s, l) => s + l.valorCentavos, 0)).toBe(painel.semNotaCentavos);
    expect(new Set(lista.linhas.map((l) => l.projetoId)).size).toBe(painel.projetos);

    const porNumero = new Map(lista.linhas.map((l) => [l.numero, l]));
    expect([...porNumero.keys()].sort()).toEqual(vendasEsperadas.map((v) => v.numero).sort());
    for (const v of vendasEsperadas) expect(porNumero.get(v.numero)).toMatchObject({ valorCentavos: v.valor, comNotaFiscal: v.nota });
    expect(lista.linhas.some((l) => l.projetoId === projetoVP1Id)).toBe(true);
  });

  it("um período sem vendas dá zero e ticket null (sem base), na lista e no painel", async () => {
    const painel = await vendidoNoPeriodo(MAR);
    expect(painel).toMatchObject({ totalCentavos: 0, propostas: 0, projetos: 0, ticketMedioCentavos: null });
    expect((await listarVendas(MAR)).linhas).toHaveLength(0);
  });
});

describe("Recebido: painel × lista de recebimentos × CSV × SQL independente", () => {
  it("sem nota R$ 7.500,00, com nota R$ 4.000,00, total R$ 11.500,00 em 4 pagamentos (estornado, saída, avulsa e fora do mês ficam de fora)", async () => {
    const painel = await recebidoNoPeriodo(JAN);
    const sql = await recebidoSql(JAN.de, JAN.ate);
    expect(painel).toEqual({ semNotaCentavos: 750_000, comNotaCentavos: 400_000, totalCentavos: 1_150_000, quantidade: 4 });
    expect(sql).toEqual({ sem: 750_000, com: 400_000, qtd: 4 });
  });

  it("a lista (todas, com nota, sem nota) tem o mesmo total, a mesma soma e as mesmas linhas do painel", async () => {
    const painel = await recebidoNoPeriodo(JAN);
    const todas = await listarRecebimentos(JAN, undefined, 1);
    const com = await listarRecebimentos(JAN, "com", 1);
    const sem = await listarRecebimentos(JAN, "sem", 1);

    expect({ total: todas.total, soma: todas.somaCentavos }).toEqual({ total: painel.quantidade, soma: painel.totalCentavos });
    expect({ total: com.total, soma: com.somaCentavos }).toEqual({ total: 2, soma: painel.comNotaCentavos });
    expect({ total: sem.total, soma: sem.somaCentavos }).toEqual({ total: 2, soma: painel.semNotaCentavos });
    expect(todas.linhas.reduce((s, l) => s + l.valorCentavos, 0)).toBe(painel.totalCentavos); // cabe numa página (4 linhas)
    expect(com.linhas.every((l) => l.comNotaFiscal)).toBe(true);
    expect(sem.linhas.every((l) => !l.comNotaFiscal)).toBe(true);

    const descricoes = todas.linhas.map((l) => l.descricao).sort();
    expect(descricoes).toEqual(recebimentosEsperados.map((r) => r.descricao).sort());
    for (const r of recebimentosEsperados) expect(todas.linhas.find((l) => l.descricao === r.descricao)).toMatchObject({ valorCentavos: r.valor, comNotaFiscal: r.nota, contaReceberId });
  });

  it("o CSV tem as mesmas linhas e a mesma soma da lista, também filtrado por nota", async () => {
    const painel = await recebidoNoPeriodo(JAN);
    const csv = await recebimentosParaCsv(JAN, undefined);
    expect(csv.truncado).toBe(false);
    expect(csv.linhas).toHaveLength(painel.quantidade);
    expect(csv.linhas.reduce((s, l) => s + l.valorCentavos, 0)).toBe(painel.totalCentavos);
    const csvCom = await recebimentosParaCsv(JAN, "com");
    expect(csvCom.linhas.reduce((s, l) => s + l.valorCentavos, 0)).toBe(painel.comNotaCentavos);
    const csvSem = await recebimentosParaCsv(JAN, "sem");
    expect(csvSem.linhas.reduce((s, l) => s + l.valorCentavos, 0)).toBe(painel.semNotaCentavos);
  });
});

describe("Taxa de fechamento: painel × lista de decisões × SQL independente", () => {
  const JANELA: Periodo = { de: "2019-11-03", ate: "2020-01-31" };

  it("a janela de 90 dias termina no fim do período, sem passar de hoje", () => {
    expect(janelaDeFechamento(JAN, "2026-11-12")).toEqual(JANELA);
    expect(janelaDeFechamento({ de: "2026-11-01", ate: "2026-11-30" }, "2026-11-12")).toEqual({ de: "2026-08-15", ate: "2026-11-12" });
  });

  it("3 aprovados (o cancelado depois não conta) e 2 perdidos com proposta enviada (o sem proposta não conta) = 60,0%", async () => {
    const janela = janelaDeFechamento(JAN, "2026-11-12");
    const painel = await fechamentoNaJanela(janela);
    expect(painel).toMatchObject({ aprovados: 3, perdidos: 2, taxaPercentual: 60 });

    const [sql] = await q<{ aprovados: number; perdidos: number }>(
      `SELECT (SELECT count(*) FROM "Projeto" j WHERE j."deletadoEm" IS NULL AND j.status IN ('APROVADO','EM_EXECUCAO','CONCLUIDO') AND ${EM_SP(`j."dataFechamento"`)} BETWEEN $1::date AND $2::date)::int AS aprovados,
              (SELECT count(*) FROM "Projeto" j WHERE j."deletadoEm" IS NULL AND j.status = 'PERDIDO' AND ${EM_SP(`j."perdidoEm"`)} BETWEEN $1::date AND $2::date
                  AND EXISTS (SELECT 1 FROM "Proposta" pr WHERE pr."projetoId" = j.id AND pr."enviadaEm" IS NOT NULL AND pr."deletadoEm" IS NULL))::int AS perdidos`,
      [janela.de, janela.ate],
    );
    expect(sql).toEqual({ aprovados: 3, perdidos: 2 });
    expect({ aprovados: painel.aprovados, perdidos: painel.perdidos }).toEqual(sql);
    expect(Math.round((sql.aprovados * 1000) / (sql.aprovados + sql.perdidos)) / 10).toBe(painel.taxaPercentual);
  });

  it("a lista de decisões tem uma linha por projeto contado na taxa (5), com o resultado certo", async () => {
    const painel = await fechamentoNaJanela(janelaDeFechamento(JAN, "2026-11-12"));
    const lista = await listarDecisoes(janelaDeFechamento(JAN, "2026-11-12"));
    expect(lista.truncado).toBe(false);
    expect(lista.linhas).toHaveLength(painel.aprovados + painel.perdidos);
    expect(lista.linhas.filter((l) => l.resultado === "APROVADO")).toHaveLength(painel.aprovados);
    expect(lista.linhas.filter((l) => l.resultado === "PERDIDO")).toHaveLength(painel.perdidos);
    const titulos = lista.linhas.map((l) => l.titulo).sort();
    expect(titulos).toEqual([`${PREFIXO} Fech aprovado 1`, `${PREFIXO} Fech aprovado 2`, `${PREFIXO} Fech aprovado 3`, `${PREFIXO} Fech perdido 1`, `${PREFIXO} Fech perdido 2`].sort());
  });

  it("sem nenhuma decisão na janela não há taxa (null, não 0%)", async () => {
    expect(await fechamentoNaJanela({ de: "2019-01-01", ate: "2019-03-31" })).toMatchObject({ aprovados: 0, perdidos: 0, taxaPercentual: null });
  });
});

describe("Tempo da visita até a proposta: painel × SQL independente", () => {
  it("média 2,0 dia em 3 projetos (2, 4 e 0): usa a 1ª proposta, datas de São Paulo, nunca negativo; sem visita realizada fica fora", async () => {
    const r = await tempoVisitaAteProposta(JAN);
    const minhas = r.linhas.filter((l) => l.titulo.startsWith(PREFIXO));
    expect(r.amostra).toBe(3);
    expect(minhas).toHaveLength(3);
    expect(minhas.map((l) => [l.titulo, l.dias]).sort()).toEqual([
      [`${PREFIXO} Vis VP1`, 2],
      [`${PREFIXO} Vis VP2`, 4],
      [`${PREFIXO} Vis VP3`, 0],
    ]);
    expect(r.mediaDeDias).toBe(2);

    const sql = await q<{ dias: number }>(
      `WITH env AS (SELECT pr."projetoId", min(pr."enviadaEm") AS enviada FROM "Proposta" pr WHERE pr."deletadoEm" IS NULL AND pr."enviadaEm" IS NOT NULL GROUP BY 1),
            vis AS (SELECT e."projetoId", min(e."realizadoEm") AS realizada FROM "EventoAgenda" e WHERE e.tipo = 'VISITA_TECNICA' AND e."realizadoEm" IS NOT NULL AND e."deletadoEm" IS NULL AND e."projetoId" IS NOT NULL GROUP BY 1)
       SELECT GREATEST(0, ${EM_SP("env.enviada")} - ${EM_SP("vis.realizada")})::int AS dias
         FROM env JOIN vis USING ("projetoId") JOIN "Projeto" j ON j.id = env."projetoId" AND j."deletadoEm" IS NULL
        WHERE ${EM_SP("env.enviada")} BETWEEN $1::date AND $2::date`,
      [JAN.de, JAN.ate],
    );
    expect(sql.map((l) => l.dias).sort()).toEqual([0, 2, 4]);
    expect(sql.map((l) => l.dias).sort()).toEqual(r.linhas.map((l) => l.dias).sort());
    expect(Math.round((sql.reduce((s, l) => s + l.dias, 0) * 10) / sql.length) / 10).toBe(r.mediaDeDias);
  });

  it("período sem propostas enviadas: sem dados (null) e amostra 0", async () => {
    expect(await tempoVisitaAteProposta(MAR)).toMatchObject({ mediaDeDias: null, amostra: 0, linhas: [] });
  });
});

describe("Pontualidade: painel (resumoDeObras) × lista de obras concluídas × SQL independente", () => {
  it("2 obras avaliadas (1 no prazo, 1 atrasada 5 dias) e 1 sem prazo: 50,0% e desvio médio de 2,0 dias, igual na lista", async () => {
    const painel = (await resumoDeObras(AGORA, JAN)).pontualidade;
    const lista = (await listarObras({ situacao: "concluidas", busca: "", de: JAN.de, ate: JAN.ate }, AGORA)).pontualidade;

    expect(painel).toMatchObject({ concluidas: 2, semPrazo: 1, pontuais: 1, pontualidadePct: 50, desvioMedioDias: 2, pontuaisSemPausas: 1, pontualidadeSemPausasPct: 50, desvioMedioSemPausasDias: 2 });
    expect(lista).toEqual(painel);

    // SQL independente: prazo = início do relógio + dias corridos (sem pausas nesta massa).
    const [sql] = await q<{ avaliaveis: number; pontuais: number; sem_prazo: number }>(
      `SELECT count(*) FILTER (WHERE "prazoModo" <> 'NENHUM' AND "dataInicioPrazo" IS NOT NULL AND "prazoDias" IS NOT NULL)::int AS avaliaveis,
              count(*) FILTER (WHERE "prazoModo" <> 'NENHUM' AND "dataInicioPrazo" IS NOT NULL AND "prazoDias" IS NOT NULL AND "dataConclusao" <= "dataInicioPrazo" + "prazoDias")::int AS pontuais,
              count(*) FILTER (WHERE NOT ("prazoModo" <> 'NENHUM' AND "dataInicioPrazo" IS NOT NULL AND "prazoDias" IS NOT NULL))::int AS sem_prazo
         FROM "Projeto" WHERE "deletadoEm" IS NULL AND status = 'CONCLUIDO' AND "dataConclusao" BETWEEN $1::date AND $2::date`,
      [JAN.de, JAN.ate],
    );
    expect(sql).toEqual({ avaliaveis: 2, pontuais: 1, sem_prazo: 1 });
    expect({ avaliaveis: painel.concluidas, pontuais: painel.pontuais, sem_prazo: painel.semPrazo }).toEqual(sql);
  });

  it("o painel devolve o período usado e mudar o período muda o resultado (março: nenhuma concluída, sem percentual)", async () => {
    const jan = await resumoDeObras(AGORA, JAN);
    expect(jan.periodoDaPontualidade).toEqual(JAN);
    const mar = await resumoDeObras(AGORA, MAR);
    const listaMar = (await listarObras({ situacao: "concluidas", busca: "", de: MAR.de, ate: MAR.ate }, AGORA)).pontualidade;
    expect(mar.periodoDaPontualidade).toEqual(MAR);
    expect(mar.pontualidade).toMatchObject({ concluidas: 0, semPrazo: 0, pontuais: 0, pontualidadePct: null, desvioMedioDias: null });
    expect(listaMar).toEqual(mar.pontualidade);
    expect(mar.pontualidade).not.toEqual(jan.pontualidade);
  });
});

describe("Fábrica: ocupação atual (diferença antes × depois) × SQL independente", () => {
  it("entram a fabricação em andamento e a que começa em até 30 dias; ficam de fora a de +60 dias, a concluída e a de obra concluída", async () => {
    const antes = await ocupacaoAtualDaFabrica(HOJE);
    const [capacidade] = await q<{ cap: number }>(`SELECT "capacidadeProducaoM2Mes" AS cap FROM "ConfiguracaoEmpresa" WHERE id = 'singleton'`);

    const obra = async (titulo: string, status: "APROVADO" | "EM_EXECUCAO" | "CONCLUIDO", area: number, etapa: { status: "EM_ANDAMENTO" | "PENDENTE" | "CONCLUIDA"; inicio: string | null }) => {
      const p = await projeto(titulo, { status });
      await proposta(p.id, { aceitaEm: "2020-03-10T15:00:00Z", valor: 1_000_000, areaM2: area });
      await prisma.etapaProjeto.create({ data: { projetoId: p.id, tipo: "FABRICACAO", nome: "Fabricação", ordem: 1, status: etapa.status, inicioPrevisto: etapa.inicio ? dia(etapa.inicio) : null } });
      return p.id;
    };
    const f1 = await obra("Fab em andamento", "APROVADO", 12.5, { status: "EM_ANDAMENTO", inicio: null });
    const f2 = await obra("Fab em 10 dias", "EM_EXECUCAO", 8, { status: "PENDENTE", inicio: somarDias(HOJE, 10) });
    await obra("Fab em 60 dias", "APROVADO", 100, { status: "PENDENTE", inicio: somarDias(HOJE, 60) });
    await obra("Fab concluida", "APROVADO", 40, { status: "CONCLUIDA", inicio: somarDias(HOJE, -20) });
    await obra("Fab obra concluida", "CONCLUIDO", 50, { status: "EM_ANDAMENTO", inicio: null });

    const depois = await ocupacaoAtualDaFabrica(HOJE);
    expect(depois.obras.length - antes.obras.length).toBe(2);
    expect(depois.m2EmProducao - antes.m2EmProducao).toBeCloseTo(20.5, 2);
    expect(depois.obras.find((o) => o.projetoId === f1)).toMatchObject({ m2: 12.5, situacao: "EM_ANDAMENTO", inicioPrevisto: null });
    expect(depois.obras.find((o) => o.projetoId === f2)).toMatchObject({ m2: 8, situacao: "A_COMECAR", inicioPrevisto: somarDias(HOJE, 10) });
    expect(depois.obras.some((o) => o.titulo.includes("Fab em 60 dias") || o.titulo.includes("Fab concluida") || o.titulo.includes("Fab obra concluida"))).toBe(false);

    // Ocupação = m² ÷ capacidade (uma casa), e a capacidade é a de Configurações.
    expect(depois.capacidadeM2).toBe(capacidade.cap);
    expect(depois.ocupacaoPercentual).toBe(Math.round((depois.m2EmProducao * 1000) / capacidade.cap) / 10);
    expect(depois.ocupacaoPercentual! - (antes.ocupacaoPercentual ?? 0)).toBeCloseTo((20.5 * 100) / capacidade.cap, 0);

    // SQL independente do retrato de hoje (todas as obras, as reais e as do teste).
    const [sql] = await q<{ m2: string; obras: number }>(
      `SELECT COALESCE(sum(m2), 0)::text AS m2, count(*)::int AS obras FROM (
         SELECT j.id, (SELECT COALESCE(sum((o->'totais'->>'areaM2')::numeric), 0) FROM "Proposta" pr, jsonb_array_elements(pr.snapshot->'opcoes') o
                        WHERE pr."projetoId" = j.id AND pr.status = 'APROVADA' AND pr."deletadoEm" IS NULL AND o->>'id' = pr."opcaoAprovadaId") AS m2
           FROM "Projeto" j
          WHERE j."deletadoEm" IS NULL AND j.status IN ('APROVADO', 'EM_EXECUCAO')
            AND EXISTS (SELECT 1 FROM "EtapaProjeto" e WHERE e."projetoId" = j.id AND e.tipo = 'FABRICACAO' AND e."deletadoEm" IS NULL
                          AND (e.status = 'EM_ANDAMENTO' OR (e.status = 'PENDENTE' AND e."inicioPrevisto" <= ($1::date + 30))))
       ) x`,
      [HOJE],
    );
    expect(depois.obras.length).toBe(sql.obras);
    expect(depois.m2EmProducao).toBeCloseTo(n(sql.m2), 2);
  });
});

describe("Faturamento mensal e faturamento com nota dos últimos 12 meses (diferença antes × depois)", () => {
  const mesAnterior = somarMeses(primeiroDiaDoMes(HOJE), -1);
  const mesCorrente = primeiroDiaDoMes(HOJE);
  const d30 = somarDias(HOJE, -30);

  it("os recebimentos novos entram no faturamento com nota, na lista de destino e no mês certo; sem nota, estornado e avulso não entram na soma", async () => {
    const antes = await faturamentoComNota(HOJE);
    const mensalAntes = await faturamentoMensal(HOJE, 12);
    const listaAntes = await listarRecebimentos(antes.periodo, "com", 1);

    const p = await projeto("Fat recente", { status: "APROVADO" });
    const cr = await prisma.contaReceber.create({ data: { projetoId: p.id, clienteId, ordem: 1, descricao: `${PREFIXO} Parcela recente`, valorCentavos: 100_000_000, vencimento: dia(d30), status: "ABERTA" } });
    contaReceberId = cr.id;
    await lancamento({ data: d30, valor: 200_000, nota: true, comConta: true, descricao: "Fat com nota" }); // conta
    await lancamento({ data: d30, valor: 50_000, nota: false, comConta: true, descricao: "Fat sem nota" }); // não conta no "com nota"
    await lancamento({ data: d30, valor: 70_000, nota: true, descricao: "Fat avulso com nota" }); // sem conta a receber: fora, contado em avulsas
    await lancamento({ data: d30, valor: 9_000, nota: true, comConta: true, estornado: true, descricao: "Fat estornado" }); // estornado: fora

    // Vendas do mês anterior e do corrente, inclusive nas bordas do fuso (22h do último dia = 01h UTC do dia 1º).
    await proposta(p.id, { aceitaEm: `${mesAnterior.slice(0, 8)}15T15:00:00Z`, valor: 525_000, comNota: true, acrescimo: 25_000 });
    await proposta(p.id, { aceitaEm: `${mesAnterior.slice(0, 8)}16T15:00:00Z`, valor: 300_000 });
    await proposta(p.id, { aceitaEm: `${mesCorrente}T01:00:00Z`, valor: 123_400 }); // 22h do último dia do mês anterior em SP: mês ANTERIOR
    await proposta(p.id, { aceitaEm: `${mesCorrente}T03:30:00Z`, valor: 11_100 }); // 00h30 do dia 1º em SP: mês corrente

    const depois = await faturamentoComNota(HOJE);
    const mensalDepois = await faturamentoMensal(HOJE, 12);

    // ----- faturamento com nota (12 meses) -----
    expect(depois.recebidoCentavos - antes.recebidoCentavos).toBe(200_000);
    expect(depois.pagamentos - antes.pagamentos).toBe(1);
    expect(depois.avulsasComNotaForaDaSoma - antes.avulsasComNotaForaDaSoma).toBe(1);
    // A lista para a qual o painel aponta (12 meses, com nota) tem o mesmo total e a mesma soma.
    const lista = await listarRecebimentos(depois.periodo, "com", 1);
    expect({ total: lista.total, soma: lista.somaCentavos }).toEqual({ total: depois.pagamentos, soma: depois.recebidoCentavos });
    expect(lista.total - listaAntes.total).toBe(1);
    expect(lista.somaCentavos - listaAntes.somaCentavos).toBe(200_000);
    // SQL independente.
    const [sql] = await q<{ soma: string; qtd: number; avulsas: number }>(
      `SELECT COALESCE(sum("valorCentavos") FILTER (WHERE "contaReceberId" IS NOT NULL), 0)::text AS soma,
              (count(*) FILTER (WHERE "contaReceberId" IS NOT NULL))::int AS qtd,
              (count(*) FILTER (WHERE "contaReceberId" IS NULL AND "transferenciaId" IS NULL))::int AS avulsas
         FROM "Lancamento"
        WHERE tipo = 'ENTRADA' AND "comNotaFiscal" AND "estornadoEm" IS NULL AND "deletadoEm" IS NULL AND data BETWEEN $1::date AND $2::date`,
      [depois.periodo.de, depois.periodo.ate],
    );
    expect(n(sql.soma)).toBe(depois.recebidoCentavos);
    expect(sql.qtd).toBe(depois.pagamentos);
    expect(sql.avulsas).toBe(depois.avulsasComNotaForaDaSoma);

    // ----- faturamento mensal: diferença por mês -----
    const diff = (mes: string, campo: "vendidoComNotaCentavos" | "vendidoSemNotaCentavos" | "repasseDeImpostoCentavos" | "recebidoComNotaCentavos" | "recebidoSemNotaCentavos") =>
      mensalDepois.meses.find((m) => m.mes === mes)![campo] - mensalAntes.meses.find((m) => m.mes === mes)![campo];
    const mAnt = chaveDoMes(mesAnterior);
    const mCor = chaveDoMes(mesCorrente);
    const mD30 = chaveDoMes(d30);
    expect(diff(mAnt, "vendidoComNotaCentavos")).toBe(525_000);
    expect(diff(mAnt, "repasseDeImpostoCentavos")).toBe(25_000);
    expect(diff(mAnt, "vendidoSemNotaCentavos")).toBe(300_000 + 123_400); // inclui o de 22h do último dia (fuso)
    expect(diff(mCor, "vendidoSemNotaCentavos")).toBe(11_100);
    expect(diff(mCor, "vendidoComNotaCentavos")).toBe(0);
    expect(diff(mD30, "recebidoComNotaCentavos")).toBe(200_000);
    expect(diff(mD30, "recebidoSemNotaCentavos")).toBe(50_000);
  });

  it("cada mês do faturamento mensal bate com Vendido e Recebido do mesmo mês (painel) e com a soma SQL independente", async () => {
    const mensal = await faturamentoMensal(HOJE, 12);
    expect(mensal.meses).toHaveLength(12);
    expect(mensal.meses[11].mes).toBe(chaveDoMes(HOJE));
    for (const m of mensal.meses) {
      const periodo = { de: m.de, ate: m.ate };
      const [vendido, recebido, vsql, rsql] = await Promise.all([vendidoNoPeriodo(periodo), recebidoNoPeriodo(periodo), vendasSql(m.de, m.ate), recebidoSql(m.de, m.ate)]);
      const rotulo = `mês ${m.mes}`;
      expect({ rotulo, v: m.vendidoComNotaCentavos }).toEqual({ rotulo, v: vendido.comNotaCentavos });
      expect({ rotulo, v: m.vendidoSemNotaCentavos }).toEqual({ rotulo, v: vendido.semNotaCentavos });
      expect({ rotulo, v: m.repasseDeImpostoCentavos }).toEqual({ rotulo, v: vendido.repasseDeImpostoCentavos });
      expect({ rotulo, v: m.recebidoComNotaCentavos }).toEqual({ rotulo, v: recebido.comNotaCentavos });
      expect({ rotulo, v: m.recebidoSemNotaCentavos }).toEqual({ rotulo, v: recebido.semNotaCentavos });
      expect({ rotulo, com: vsql.com, sem: vsql.sem, repasse: vsql.repasse }).toEqual({ rotulo, com: m.vendidoComNotaCentavos, sem: m.vendidoSemNotaCentavos, repasse: m.repasseDeImpostoCentavos });
      expect({ rotulo, com: rsql.com, sem: rsql.sem }).toEqual({ rotulo, com: m.recebidoComNotaCentavos, sem: m.recebidoSemNotaCentavos });
    }
  });
});

describe("Limite de faturamento com nota (Configurações): vazio, zero e informado", () => {
  it("vazio ou zero = limite não informado (null, sem percentual); informado = o valor e o percentual; SEMPRE restaura o original", async () => {
    const nulavel = await limiteEhNulavel();
    try {
      if (nulavel) {
        await definirLimite(null);
        const vazio = await faturamentoComNota(HOJE);
        expect(vazio.limiteCentavos).toBeNull();
        expect(vazio.percentualDoLimite).toBeNull();
      }
      await definirLimite(0);
      const zero = await faturamentoComNota(HOJE);
      expect(zero.limiteCentavos).toBeNull();
      expect(zero.percentualDoLimite).toBeNull();

      await definirLimite(100_000_000);
      const informado = await faturamentoComNota(HOJE);
      expect(informado.limiteCentavos).toBe(100_000_000);
      expect(informado.percentualDoLimite).toBe(Math.round((informado.recebidoCentavos * 1000) / 100_000_000) / 10);
    } finally {
      await definirLimite(limiteOriginal);
    }
    const [r] = await q<{ limite: number | null }>(`SELECT "limiteSimplesCentavos" AS limite FROM "ConfiguracaoEmpresa" WHERE id = 'singleton'`);
    expect(r.limite).toBe(limiteOriginal);
  });
});
