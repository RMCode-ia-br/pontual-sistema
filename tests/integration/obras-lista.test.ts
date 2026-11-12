import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { criarClientePrisma } from "@/lib/db/criar-cliente";
import { gerarEtapasDaObra } from "@/modules/obras/servico";
import { editarEtapa, mudarStatusDaEtapa } from "@/modules/obras/servico-execucao";
import { lerFiltrosDeObras, listarEtapasSemAgendamento, listarObras, type FiltrosDeObras } from "@/modules/obras/queries-lista";

import { comConexao, criarUsuarioDeTeste } from "./banco-teste";

/** Lista de obras, concluídas com pontualidade e instalações sem agendamento. Cada teste isola as suas obras pelo prefixo na busca. */
const PREFIXO = "Int Lis";
const LOGIN = "int-lista";
const prisma = criarClientePrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL);
const AGORA = new Date("2026-06-20T15:00:00Z"); // sábado; "hoje" em São Paulo

let usuario: { id: string; nome: string };
let clienteId: string;

async function limpar() {
  await comConexao(async (c) => {
    const projetos = `SELECT id FROM "Projeto" WHERE titulo LIKE $1`;
    const p = [`${PREFIXO}%`];
    await c.query(`DELETE FROM "LogAuditoria" WHERE "usuarioId" IN (SELECT id FROM "Usuario" WHERE login = $1)`, [LOGIN]);
    await c.query(`DELETE FROM "LogAuditoria" WHERE "entidade" IN ('Projeto','ContaReceber','EtapaProjeto','PausaProjeto') AND "entidadeId" IN (SELECT id FROM "EtapaProjeto" WHERE "projetoId" IN (${projetos}) UNION ${projetos})`, p);
    await c.query(`DELETE FROM "Tarefa" WHERE "projetoId" IN (${projetos})`, p);
    await c.query(`DELETE FROM "Interacao" WHERE "projetoId" IN (${projetos})`, p);
    await c.query(`DELETE FROM "ContaReceber" WHERE "projetoId" IN (${projetos})`, p);
    await c.query(`DELETE FROM "EventoAgenda" WHERE "projetoId" IN (${projetos})`, p);
    await c.query(`DELETE FROM "EtapaProjeto" WHERE "projetoId" IN (${projetos})`, p);
    await c.query(`DELETE FROM "PausaProjeto" WHERE "projetoId" IN (${projetos})`, p);
    await c.query(`DELETE FROM "HistoricoFaseProjeto" WHERE "projetoId" IN (${projetos})`, p);
    await c.query(`DELETE FROM "Projeto" WHERE titulo LIKE $1`, p);
    await c.query(`DELETE FROM "Cliente" WHERE nome LIKE $1`, p);
    await c.query(`DELETE FROM "Equipe" WHERE nome LIKE $1`, p);
    await c.query(`DELETE FROM "Usuario" WHERE login = $1`, [LOGIN]);
  });
}

beforeAll(async () => {
  await limpar();
  await criarUsuarioDeTeste(LOGIN, "senha-de-teste-123");
  usuario = await prisma.usuario.findUniqueOrThrow({ where: { login: LOGIN }, select: { id: true, nome: true } });
  clienteId = (await prisma.cliente.create({ data: { nome: `${PREFIXO} Cliente`, tipoPessoa: "PF" } })).id;
});

afterAll(async () => {
  await limpar();
  await prisma.$disconnect();
});

/**
 * Obra aprovada com as etapas do modelo padrão (prazo 4 + 3 + 5 dias úteis, ou sem prazo). `aceitaEm` é a base das
 * datas provisórias das etapas: antiga = etapas já vencidas; futura = nada vencido.
 */
async function criarObra(nome: string, o: { semPrazo?: boolean; responsavel?: boolean; aceitaEm?: string } = {}) {
  const projeto = await prisma.projeto.create({
    data: { codigo: `P-0000-${randomUUID().slice(0, 8)}`, titulo: `${PREFIXO} ${nome}`, clienteId, status: "APROVADO", responsavelId: o.responsavel ? usuario.id : null },
  });
  await prisma.$transaction((tx) =>
    gerarEtapasDaObra(tx, {
      projetoId: projeto.id,
      propostaId: "inexistente",
      opcaoId: "inexistente",
      usuario,
      aceitaEm: o.aceitaEm ?? "2026-05-04",
      prazo: o.semPrazo ? { modo: "NENHUM", tipoDias: "UTEIS" } : { modo: "POR_ETAPA", materialDias: 4, execucaoDias: 3, vidrosDias: 5, tipoDias: "UTEIS" },
    }),
  );
  return projeto.id;
}

const etapaDe = (projetoId: string, tipo: string) => prisma.etapaProjeto.findFirstOrThrow({ where: { projetoId, tipo: tipo as never, deletadoEm: null } });
const mudar = (etapaId: string, para: "EM_ANDAMENTO" | "CONCLUIDA" | "DISPENSADA", data?: string) =>
  prisma.$transaction((tx) => mudarStatusDaEtapa(tx, { etapaId, para, usuario, data, agora: AGORA }), { timeout: 30_000 });

const filtros = (parte: Partial<FiltrosDeObras> = {}): FiltrosDeObras => ({ situacao: "andamento", busca: PREFIXO, ...parte });

describe("lista de obras em andamento", () => {
  let atrasada: string;
  let noPrazo: string;

  beforeAll(async () => {
    atrasada = await criarObra("Atrasada", { responsavel: true });
    noPrazo = await criarObra("No prazo", { aceitaEm: "2026-06-24" }); // etapas provisórias todas no futuro
    await criarObra("Sem prazo", { semPrazo: true, aceitaEm: "2026-06-24" }); // a medição prevista ainda não venceu
    // O relógio da primeira começou há mais de um mês (prazo de 12 dias úteis já estourou); o da segunda, há poucos dias.
    await mudar((await etapaDe(atrasada, "MEDICAO_EXATA")).id, "CONCLUIDA", "2026-05-04");
    await mudar((await etapaDe(noPrazo, "MEDICAO_EXATA")).id, "CONCLUIDA", "2026-06-15");
    // A equipe de uma etapa aberta da segunda obra (para o filtro de equipe).
    const equipe = await prisma.equipe.create({ data: { nome: `${PREFIXO} Equipe` } });
    const fabricacao = await etapaDe(noPrazo, "FABRICACAO");
    await prisma.$transaction((tx) => editarEtapa(tx, { etapaId: fabricacao.id, usuario, equipeId: equipe.id }));
  });

  it("traz as obras com prazo e semáforo calculados na hora, o mais urgente primeiro", async () => {
    const { linhas, resumo, truncado } = await listarObras(filtros(), AGORA);
    expect(linhas.map((l) => l.titulo)).toEqual([`${PREFIXO} Atrasada`, `${PREFIXO} No prazo`, `${PREFIXO} Sem prazo`]);
    expect(truncado).toBe(false);
    expect(resumo).toEqual({ total: 3, vermelhas: 1, amarelas: 0, semPrazo: 1 });

    const [a, n, s] = linhas;
    expect(a.semaforo).toBe("VERMELHO");
    expect(a.prazo.diasRestantes!).toBeLessThan(0);
    expect(n.semaforo).toBe("VERDE");
    expect(n.prazo.diasRestantes!).toBeGreaterThan(0);
    // Sem prazo em dias, só a medição exata tem data (futura): o semáforo olha só ela, e o prazo segue "não definido".
    expect(s.semaforo).toBe("VERDE");
    expect(s.prazo.definido).toBe(false);
    expect(s.prazo.comPausas).toBeNull();
    expect(a.responsavelNome).toBe(usuario.nome);
  });

  it("etapa atual, andamento das etapas e marcas de atenção", async () => {
    const { linhas } = await listarObras(filtros(), AGORA);
    const [a, , s] = linhas;
    expect(a.etapaAtual).toMatchObject({ tipo: "PEDIDO_MATERIAL", status: "PENDENTE" }); // a medição já foi concluída
    expect([a.etapasConcluidas, a.etapasTotal]).toEqual([1, 9]);
    expect(s.etapaAtual?.tipo).toBe("MEDICAO_EXATA");
    expect(a.emPausa).toBe(false);
    expect(a.bloqueada).toBe(false);
    // Passou da data prevista do que está aberto → etapas atrasadas.
    expect(a.atrasadas).toBeGreaterThan(0);
  });

  it("filtra por semáforo, etapa atual, responsável e equipe (e combina os filtros)", async () => {
    const titulos = async (f: Partial<FiltrosDeObras>) => (await listarObras(filtros(f), AGORA)).linhas.map((l) => l.titulo.replace(`${PREFIXO} `, ""));
    expect(await titulos({ semaforo: "VERMELHO" })).toEqual(["Atrasada"]);
    expect(await titulos({ semaforo: "VERDE" })).toEqual(["No prazo", "Sem prazo"]);
    expect(await titulos({ etapa: "MEDICAO_EXATA" })).toEqual(["Sem prazo"]);
    expect(await titulos({ etapa: "PEDIDO_MATERIAL" })).toEqual(["Atrasada", "No prazo"]);
    expect(await titulos({ responsavelId: usuario.id })).toEqual(["Atrasada"]);
    expect(await titulos({ etapa: "PEDIDO_MATERIAL", semaforo: "VERDE" })).toEqual(["No prazo"]);
    expect(await titulos({ busca: `${PREFIXO} No` })).toEqual(["No prazo"]);
    expect(await titulos({ busca: "nada-disso-existe" })).toEqual([]);
  });

  it("filtro de equipe considera as etapas abertas da obra", async () => {
    const equipe = await prisma.equipe.findFirstOrThrow({ where: { nome: `${PREFIXO} Equipe` } });
    const { linhas } = await listarObras(filtros({ equipeId: equipe.id }), AGORA);
    expect(linhas.map((l) => l.titulo)).toEqual([`${PREFIXO} No prazo`]);
    expect(linhas[0].equipes).toEqual([`${PREFIXO} Equipe`]);
  });

  it("não mistura obras concluídas na lista em andamento", async () => {
    const { linhas } = await listarObras(filtros({ situacao: "concluidas" }), AGORA);
    expect(linhas).toEqual([]);
  });
});

describe("obras concluídas e pontualidade", () => {
  it("lista as concluídas no período com o veredito de pontualidade, com e sem pausas", async () => {
    const pontual = await criarObra("Concluída pontual");
    const atrasada = await criarObra("Concluída atrasada");
    for (const [id, medicao, entrega] of [
      [pontual, "2026-06-01", "2026-06-12"], // prazo de 12 dias úteis vai a 17/06: entrega antes
      [atrasada, "2026-05-04", "2026-06-18"], // prazo vai a ~20/05: entrega muito depois
    ] as const) {
      await mudar((await etapaDe(id, "MEDICAO_EXATA")).id, "CONCLUIDA", medicao);
      await prisma.etapaProjeto.updateMany({ where: { projetoId: id, ordem: { gt: 1, lt: 9 }, status: "PENDENTE" }, data: { status: "CONCLUIDA", inicioReal: new Date("2026-06-10T00:00:00Z"), fimReal: new Date("2026-06-10T00:00:00Z") } });
      await mudar((await etapaDe(id, "ENTREGA")).id, "CONCLUIDA", entrega);
    }

    const r = await listarObras(filtros({ situacao: "concluidas" }), AGORA);
    expect(r.linhas.map((l) => l.titulo)).toEqual([`${PREFIXO} Concluída atrasada`, `${PREFIXO} Concluída pontual`]); // a mais recente primeiro
    expect(r.linhas.every((l) => l.status === "CONCLUIDO" && l.semaforo === null)).toBe(true);
    expect(r.linhas[1].prazo.pontualidade).toMatchObject({ avaliavel: true, pontual: true });
    expect(r.linhas[0].prazo.pontualidade).toMatchObject({ avaliavel: true, pontual: false });
    expect(r.pontualidade).toMatchObject({ concluidas: 2, pontuais: 1, pontualidadePct: 50, semPrazo: 0 });
    expect(r.pontualidade!.desvioMedioDias).not.toBeNull();

    // Período: só a primeira concluída (12/06).
    const soJunho12 = await listarObras(filtros({ situacao: "concluidas", de: "2026-06-12", ate: "2026-06-12" }), AGORA);
    expect(soJunho12.linhas.map((l) => l.titulo)).toEqual([`${PREFIXO} Concluída pontual`]);
    expect(soJunho12.pontualidade).toMatchObject({ concluidas: 1, pontualidadePct: 100 });
  });
});

describe("instalações previstas sem agendamento", () => {
  it("lista só etapas de instalação, medição dos vidros e entrega, abertas, de obras em andamento e sem compromisso vivo", async () => {
    const obra = await criarObra("Agenda");
    const todas = (await listarEtapasSemAgendamento(AGORA)).filter((e) => e.projetoTitulo === `${PREFIXO} Agenda`);
    expect(todas.map((e) => e.etapaTipo).sort()).toEqual(["ENTREGA", "INSTALACAO_ESQUADRIAS", "INSTALACAO_VIDROS", "MEDICAO_VIDROS"].sort());
    expect(todas.find((e) => e.etapaTipo === "INSTALACAO_VIDROS")?.eventoTipo).toBe("INSTALACAO");
    expect(todas.find((e) => e.etapaTipo === "ENTREGA")?.eventoTipo).toBe("ENTREGA");

    // Compromisso vivo (agendado) liga à etapa e a tira da lista; cancelar a devolve.
    const instalacao = await etapaDe(obra, "INSTALACAO_ESQUADRIAS");
    const evento = await prisma.eventoAgenda.create({
      data: { tipo: "INSTALACAO", inicio: new Date("2026-07-01T11:00:00Z"), fim: new Date("2026-07-01T20:00:00Z"), projetoId: obra, clienteId, etapaProjetoId: instalacao.id, status: "AGENDADO" },
    });
    const depois = (await listarEtapasSemAgendamento(AGORA)).filter((e) => e.projetoTitulo === `${PREFIXO} Agenda`).map((e) => e.etapaTipo);
    expect(depois).not.toContain("INSTALACAO_ESQUADRIAS");

    // Remarcar muda o horário da mesma linha e a deixa REMARCADO: o compromisso continua vivo.
    await prisma.eventoAgenda.update({ where: { id: evento.id }, data: { status: "REMARCADO", inicio: new Date("2026-07-03T11:00:00Z"), fim: new Date("2026-07-03T20:00:00Z") } });
    expect((await listarEtapasSemAgendamento(AGORA)).some((e) => e.etapaId === instalacao.id)).toBe(false);

    await prisma.eventoAgenda.update({ where: { id: evento.id }, data: { status: "CANCELADO" } });
    expect((await listarEtapasSemAgendamento(AGORA)).some((e) => e.etapaId === instalacao.id)).toBe(true);

    // Etapa concluída ou dispensada não precisa de agendamento.
    await mudar(instalacao.id, "DISPENSADA");
    expect((await listarEtapasSemAgendamento(AGORA)).some((e) => e.etapaId === instalacao.id)).toBe(false);
  });

  it("obra concluída ou ainda não aprovada não aparece", async () => {
    const obra = await criarObra("Agenda concluída");
    await prisma.projeto.update({ where: { id: obra }, data: { status: "CONCLUIDO" } });
    expect((await listarEtapasSemAgendamento(AGORA)).some((e) => e.projetoTitulo === `${PREFIXO} Agenda concluída`)).toBe(false);
    await prisma.projeto.update({ where: { id: obra }, data: { status: "NOVO_LEAD" } });
    expect((await listarEtapasSemAgendamento(AGORA)).some((e) => e.projetoTitulo === `${PREFIXO} Agenda concluída`)).toBe(false);
  });

  it("a equipe da etapa e as datas previstas vêm junto, para o 'Agendar'", async () => {
    const obra = await criarObra("Agenda equipe");
    const equipe = await prisma.equipe.create({ data: { nome: `${PREFIXO} Equipe agenda` } });
    const etapa = await etapaDe(obra, "INSTALACAO_VIDROS");
    await prisma.$transaction((tx) => editarEtapa(tx, { etapaId: etapa.id, usuario, equipeId: equipe.id, inicioPrevisto: "2026-07-06", fimPrevisto: "2026-07-07" }));
    const e = (await listarEtapasSemAgendamento(AGORA)).find((x) => x.etapaId === etapa.id)!;
    expect(e).toMatchObject({ equipeId: equipe.id, equipeNome: `${PREFIXO} Equipe agenda`, inicioPrevisto: "2026-07-06", fimPrevisto: "2026-07-07", clienteNome: `${PREFIXO} Cliente` });
  });
});

describe("leitura dos filtros da URL", () => {
  it("valores inválidos são ignorados (a URL é dado não confiável)", () => {
    expect(lerFiltrosDeObras({ situacao: "qualquer", etapa: "INVENTADA", semaforo: "ROXO", responsavel: "a b; drop", equipe: "x".repeat(100), de: "2026-13-45", ate: "ontem", busca: "  oi  " })).toEqual({
      situacao: "andamento",
      busca: "oi",
      etapa: undefined,
      semaforo: undefined,
      responsavelId: undefined,
      equipeId: undefined,
      de: undefined,
      ate: undefined,
    });
  });

  it("valores válidos passam", () => {
    expect(lerFiltrosDeObras({ situacao: "concluidas", etapa: "FABRICACAO", semaforo: "AMARELO", responsavel: "abc123", equipe: "eq-9", de: "2026-06-01", ate: "2026-06-30" })).toEqual({
      situacao: "concluidas",
      busca: "",
      etapa: "FABRICACAO",
      semaforo: "AMARELO",
      responsavelId: "abc123",
      equipeId: "eq-9",
      de: "2026-06-01",
      ate: "2026-06-30",
    });
  });
});
