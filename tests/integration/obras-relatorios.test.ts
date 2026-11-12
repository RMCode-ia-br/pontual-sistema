import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { criarClientePrisma } from "@/lib/db/criar-cliente";
import { TIPOS_DE_ETAPA } from "@/lib/dominio/etapas";
import { gerarEtapasDaObra } from "@/modules/obras/servico";
import { abrirChamado, mudarStatusDoChamado } from "@/modules/obras/servico-chamados";
import { mudarStatusDaEtapa } from "@/modules/obras/servico-execucao";
import { resumoDeObras, type ResumoDeObras } from "@/modules/obras/resumo";
import { carregarRelatorioDeObras, lerPeriodoDoRelatorioDeObras, type RelatorioDeObras } from "@/modules/relatorios/obras";

import { comConexao, criarUsuarioDeTeste } from "./banco-teste";

/**
 * Painel e relatório de obras. O banco de desenvolvimento tem dados de verdade: os números do painel são conferidos
 * por DIFERENÇA (antes e depois de criar as obras de teste) e o relatório usa um período no passado (junho de 2026),
 * onde só existem os dados deste teste.
 */
const PREFIXO = "Int Rel";
const LOGIN = "int-relatorios";
const prisma = criarClientePrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL);
const AGORA = new Date("2026-06-20T15:00:00Z"); // sábado; "hoje" em São Paulo
const PERIODO = { de: "2026-06-01", ate: "2026-06-20" };
const MOTIVO = `${PREFIXO} Motivo`;

let usuario: { id: string; nome: string };
let clienteId: string;
let antes: ResumoDeObras;
let relatorio: RelatorioDeObras;
let obraAtrasadaAberta: string;

async function limpar() {
  await comConexao(async (c) => {
    const projetos = `SELECT id FROM "Projeto" WHERE titulo LIKE $1`;
    const clientes = `SELECT id FROM "Cliente" WHERE nome LIKE $1`;
    const p = [`${PREFIXO}%`];
    await c.query(`DELETE FROM "LogAuditoria" WHERE "usuarioId" IN (SELECT id FROM "Usuario" WHERE login = $1)`, [LOGIN]);
    await c.query(`DELETE FROM "Chamado" WHERE "clienteId" IN (${clientes})`, p);
    await c.query(`DELETE FROM "Tarefa" WHERE "projetoId" IN (${projetos})`, p);
    await c.query(`DELETE FROM "Interacao" WHERE "projetoId" IN (${projetos}) OR "clienteId" IN (${clientes})`, p);
    await c.query(`DELETE FROM "ContaReceber" WHERE "projetoId" IN (${projetos})`, p);
    await c.query(`DELETE FROM "EventoAgenda" WHERE "projetoId" IN (${projetos})`, p);
    await c.query(`DELETE FROM "EtapaProjeto" WHERE "projetoId" IN (${projetos})`, p);
    await c.query(`DELETE FROM "PausaProjeto" WHERE "projetoId" IN (${projetos})`, p);
    await c.query(`DELETE FROM "HistoricoFaseProjeto" WHERE "projetoId" IN (${projetos})`, p);
    await c.query(`DELETE FROM "Projeto" WHERE titulo LIKE $1`, p);
    await c.query(`DELETE FROM "Cliente" WHERE nome LIKE $1`, p);
    await c.query(`DELETE FROM "MotivoBloqueio" WHERE nome LIKE $1`, p);
    await c.query(`DELETE FROM "Usuario" WHERE login = $1`, [LOGIN]);
    // Os chamados de teste consomem números da fila: o contador volta ao maior que sobrou.
    await c.query(`UPDATE "ContadorSequencia" SET "valor" = coalesce((SELECT max("numero") FROM "Chamado"), 0) WHERE "chave" = 'chamado'`);
  });
}

async function criarObra(nome: string, aceitaEm: string) {
  const projeto = await prisma.projeto.create({ data: { codigo: `P-0000-${randomUUID().slice(0, 8)}`, titulo: `${PREFIXO} ${nome}`, clienteId, status: "APROVADO" } });
  await prisma.$transaction((tx) =>
    gerarEtapasDaObra(tx, {
      projetoId: projeto.id,
      propostaId: "inexistente",
      opcaoId: "inexistente",
      usuario,
      aceitaEm,
      prazo: { modo: "POR_ETAPA", materialDias: 4, execucaoDias: 3, vidrosDias: 5, tipoDias: "UTEIS" },
    }),
  );
  return projeto.id;
}

const etapaDe = (projetoId: string, tipo: string) => prisma.etapaProjeto.findFirstOrThrow({ where: { projetoId, tipo: tipo as never, deletadoEm: null } });
const mudar = (etapaId: string, para: "CONCLUIDA", data: string) => prisma.$transaction((tx) => mudarStatusDaEtapa(tx, { etapaId, para, usuario, data, agora: AGORA }), { timeout: 30_000 });

/** Conclui a obra (medição, etapas do meio e entrega) com as datas dadas. */
async function concluirObra(id: string, medicao: string, entrega: string) {
  await mudar((await etapaDe(id, "MEDICAO_EXATA")).id, "CONCLUIDA", medicao);
  await prisma.etapaProjeto.updateMany({ where: { projetoId: id, ordem: { gt: 1, lt: 9 }, status: "PENDENTE" }, data: { status: "CONCLUIDA", inicioReal: new Date("2026-06-10T00:00:00Z"), fimReal: new Date("2026-06-10T00:00:00Z") } });
  await mudar((await etapaDe(id, "ENTREGA")).id, "CONCLUIDA", entrega);
}

beforeAll(async () => {
  await limpar();
  await criarUsuarioDeTeste(LOGIN, "senha-de-teste-123");
  usuario = await prisma.usuario.findUniqueOrThrow({ where: { login: LOGIN }, select: { id: true, nome: true } });
  clienteId = (await prisma.cliente.create({ data: { nome: `${PREFIXO} Cliente`, tipoPessoa: "PF" } })).id;
  antes = await resumoDeObras(AGORA);

  // Duas concluídas: uma no prazo (prazo de 12 dias úteis vai a 17/06; entrega em 12/06) e uma atrasada (prazo ~20/05; entrega 18/06).
  const pontual = await criarObra("Concluída pontual", "2026-05-04");
  const atrasada = await criarObra("Concluída atrasada", "2026-05-04");
  await concluirObra(pontual, "2026-06-01", "2026-06-12");
  await concluirObra(atrasada, "2026-05-04", "2026-06-18");
  // A fabricação da pontual terminou no dia previsto; a da atrasada, 5 dias depois do previsto.
  const fabricacao = async (id: string, previsto: string, real: string) => {
    const e = await etapaDe(id, "FABRICACAO");
    await prisma.etapaProjeto.update({ where: { id: e.id }, data: { fimPrevisto: new Date(`${previsto}T00:00:00Z`), fimReal: new Date(`${real}T00:00:00Z`) } });
  };
  await fabricacao(pontual, "2026-06-10", "2026-06-10");
  await fabricacao(atrasada, "2026-06-05", "2026-06-10");

  // Uma pausa justificada de 3 dias (02 a 04/06) na obra atrasada.
  const motivo = await prisma.motivoBloqueio.create({ data: { nome: MOTIVO, justificado: true } });
  await prisma.pausaProjeto.create({ data: { projetoId: atrasada, inicio: new Date("2026-06-02T00:00:00Z"), fim: new Date("2026-06-04T00:00:00Z"), motivoBloqueioId: motivo.id, justificada: true } });

  // Em andamento: uma atrasada e uma no prazo com a fabricação bloqueada.
  obraAtrasadaAberta = await criarObra("Atrasada aberta", "2026-05-04");
  await mudar((await etapaDe(obraAtrasadaAberta, "MEDICAO_EXATA")).id, "CONCLUIDA", "2026-05-04");
  const noPrazo = await criarObra("No prazo bloqueada", "2026-06-24");
  await prisma.etapaProjeto.update({ where: { id: (await etapaDe(noPrazo, "FABRICACAO")).id }, data: { status: "BLOQUEADA", motivoBloqueioId: motivo.id } });
  // Uma instalação agendada (a próxima).
  await prisma.eventoAgenda.create({
    data: { tipo: "INSTALACAO", inicio: new Date("2026-06-22T11:00:00Z"), fim: new Date("2026-06-22T20:00:00Z"), projetoId: noPrazo, clienteId, status: "AGENDADO" },
  });

  // Dois chamados em junho: um resolvido em 4 dias e outro ainda aberto.
  const aberto = (tipoProblema: "REGULAGEM" | "VIDRO", dia: string) =>
    prisma.$transaction((tx) => abrirChamado(tx, { clienteId, projetoId: pontual, tipoProblema, descricao: "Chamado de teste do relatório", usuario, agora: new Date(`${dia}T15:00:00Z`) }), { timeout: 30_000 });
  const primeiro = await aberto("REGULAGEM", "2026-06-10");
  await aberto("VIDRO", "2026-06-15");
  await prisma.$transaction((tx) => mudarStatusDoChamado(tx, { id: primeiro.id, para: "RESOLVIDO", solucao: "Ajustado no local", usuario, agora: new Date("2026-06-14T15:00:00Z") }));

  relatorio = await carregarRelatorioDeObras(PERIODO, AGORA);
});

afterAll(async () => {
  await limpar();
  await prisma.$disconnect();
});

describe("relatório de obras", () => {
  it("pontualidade do período, com e sem pausas, e as obras concluídas com o desvio", () => {
    expect(relatorio.pontualidade).toMatchObject({ concluidas: 2, pontuais: 1, pontualidadePct: 50, semPrazo: 0 });
    const titulos = relatorio.obrasConcluidas.map((o) => o.titulo).sort();
    expect(titulos).toEqual([`${PREFIXO} Concluída atrasada`, `${PREFIXO} Concluída pontual`]);
    const pontual = relatorio.obrasConcluidas.find((o) => o.titulo.endsWith("pontual"))!;
    const atrasada = relatorio.obrasConcluidas.find((o) => o.titulo.endsWith("atrasada"))!;
    expect(pontual).toMatchObject({ concluidaEm: "2026-06-12", pontual: true });
    expect(pontual.desvioDias!).toBeLessThanOrEqual(0);
    expect(atrasada).toMatchObject({ concluidaEm: "2026-06-18", pontual: false });
    expect(atrasada.desvioDias!).toBeGreaterThan(0);
  });

  it("atrasos por etapa: a fabricação concluída no dia previsto e a que atrasou 5 dias", () => {
    const fabricacao = relatorio.atrasosPorEtapa.find((l) => l.tipo === "FABRICACAO")!;
    expect(fabricacao).toMatchObject({ concluidasNoPeriodo: 2, comPrazo: 2, comAtraso: 1, atrasoMedioDias: 5 });
    // A obra "Atrasada aberta" tem o pedido do material já vencido: aparece como atrasada hoje.
    expect(relatorio.atrasosPorEtapa.find((l) => l.tipo === "PEDIDO_MATERIAL")!.abertasAtrasadas).toBeGreaterThanOrEqual(1);
  });

  it("pausas do período e etapas bloqueadas agora, por motivo", () => {
    expect(relatorio.pausasPorMotivo).toEqual([{ motivo: MOTIVO, quantidade: 1, justificadas: 1, dias: 3 }]);
    expect(relatorio.bloqueadasAgora).toEqual(expect.arrayContaining([{ motivo: MOTIVO, quantidade: 1 }]));
  });

  it("assistências abertas no período: garantia, resolução e cobrança", () => {
    const a = relatorio.assistencias;
    expect(a.total).toBe(2);
    expect(a.resolvidos).toBe(1);
    expect(a.diasMedioParaResolver).toBe(4);
    expect(a.porTipo).toEqual(expect.arrayContaining([{ tipo: "REGULAGEM", quantidade: 1 }, { tipo: "VIDRO", quantidade: 1 }]));
    // A instalação dos vidros (marco da garantia) foi concluída em 10/06: a regulagem aberta nesse dia está em garantia;
    // o vidro de 15/06 veio depois da instalação e fica fora, com a visita a cobrar.
    expect(a.emGarantia).toBe(1);
    expect(a.foraDaGarantia).toBe(1);
    expect(a.visitasCobradas).toBe(1);
    expect(relatorio.chamadosEmAbertoHoje).toBeGreaterThanOrEqual(1);
  });

  it("período vazio: tudo zerado e sem erro", async () => {
    const r = await carregarRelatorioDeObras({ de: "2020-01-01", ate: "2020-01-31" }, AGORA);
    expect(r.pontualidade).toMatchObject({ concluidas: 0, pontualidadePct: null });
    expect(r.obrasConcluidas).toEqual([]);
    expect(r.pausasPorMotivo).toEqual([]);
    expect(r.assistencias).toMatchObject({ total: 0, diasMedioParaResolver: null });
  });
});

describe("período do relatório", () => {
  it("sem período, os últimos 90 dias; datas inválidas e invertidas são corrigidas", () => {
    expect(lerPeriodoDoRelatorioDeObras({}, AGORA)).toEqual({ de: "2026-03-23", ate: "2026-06-20" });
    expect(lerPeriodoDoRelatorioDeObras({ de: "2026-13-45", ate: "ontem" }, AGORA)).toEqual({ de: "2026-03-23", ate: "2026-06-20" });
    expect(lerPeriodoDoRelatorioDeObras({ de: "2026-06-30", ate: "2026-06-10" }, AGORA)).toEqual({ de: "2026-06-10", ate: "2026-06-10" });
    expect(lerPeriodoDoRelatorioDeObras({ de: "2026-06-01", ate: "2026-06-15" }, AGORA)).toEqual({ de: "2026-06-01", ate: "2026-06-15" });
  });
});

describe("resumo de obras do painel", () => {
  let depois: ResumoDeObras;
  beforeAll(async () => {
    depois = await resumoDeObras(AGORA);
  });

  it("conta as obras em andamento por semáforo (diferença para antes dos dados de teste)", () => {
    expect(depois.emAndamento - antes.emAndamento).toBe(2);
    expect(depois.vermelhas - antes.vermelhas).toBe(1); // a atrasada aberta
    expect(depois.verdes - antes.verdes).toBe(1); // a de prazo futuro
  });

  it("obras por etapa atual, na ordem do fluxo", () => {
    const dif = (tipo: string) => (depois.porEtapa.find((e) => e.tipo === tipo)?.quantidade ?? 0) - (antes.porEtapa.find((e) => e.tipo === tipo)?.quantidade ?? 0);
    expect(dif("MEDICAO_EXATA")).toBe(1); // a de prazo futuro ainda não mediu
    expect(dif("PEDIDO_MATERIAL")).toBe(1); // a atrasada já mediu
    const ordem = depois.porEtapa.map((e) => e.tipo);
    expect(ordem).toEqual([...ordem].sort((a, b) => TIPOS_DE_ETAPA.indexOf(a) - TIPOS_DE_ETAPA.indexOf(b)));
  });

  it("pontualidade dos últimos 90 dias e obras com etapa atrasada", () => {
    expect(depois.periodoDaPontualidade).toEqual({ de: "2026-03-23", ate: "2026-06-20" });
    expect(depois.pontualidade.concluidas - antes.pontualidade.concluidas).toBe(2);
    expect(depois.pontualidade.pontuais - antes.pontualidade.pontuais).toBe(1);
    const atrasada = depois.atrasadas.find((o) => o.id === obraAtrasadaAberta);
    expect(atrasada).toMatchObject({ titulo: `${PREFIXO} Atrasada aberta`, clienteNome: `${PREFIXO} Cliente`, etapaAtual: "Pedido de material" });
    expect(atrasada!.etapasAtrasadas).toBeGreaterThan(0);
    expect(depois.atrasadas.length).toBeLessThanOrEqual(5);
  });

  it("próximas instalações e chamados em aberto", () => {
    expect(depois.proximasInstalacoes[0]).toMatchObject({ tipo: "INSTALACAO", clienteNome: `${PREFIXO} Cliente`, projetoTitulo: `${PREFIXO} No prazo bloqueada` });
    expect(depois.chamadosEmAberto - antes.chamadosEmAberto).toBe(1); // o resolvido não conta
  });
});
