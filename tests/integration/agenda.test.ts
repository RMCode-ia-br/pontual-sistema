import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { criarClientePrisma } from "@/lib/db/criar-cliente";
import { instanteDeDataHoraLocal } from "@/lib/formatadores";
import { gerarToken, hashDoToken } from "@/lib/tokens";
import { GET as feedPublico } from "@/app/api/public/agenda/[token]/route";
import { horariosLivresDoDia, listarEventos, obterExpediente } from "@/modules/agenda/queries";
import { avisosDoEvento } from "@/modules/agenda/servico";

import { comConexao, criarUsuarioDeTeste } from "./banco-teste";

const PREFIXO = "Int Agenda";
const LOGIN = "int-agenda";
const LOGIN_OUTRO = "int-agenda-b";
const prisma = criarClientePrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL);

// 12/03/2030 é terça-feira; 10/03/2030, domingo. Longe de qualquer feriado semeado.
const TERCA = "2030-03-12";
const DOMINGO = "2030-03-10";
const FERIADO = "2030-03-13";
const FERIAS_INICIO = "2030-03-20";
const FERIAS_FIM = "2030-03-22";

const em = (dia: string, hora: string) => instanteDeDataHoraLocal(dia, hora)!;

async function limpar() {
  await comConexao(async (c) => {
    await c.query(`DELETE FROM "EventoAgenda" WHERE titulo LIKE $1`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "FeedAgenda" WHERE "usuarioId" IN (SELECT id FROM "Usuario" WHERE login = ANY($1))`, [[LOGIN, LOGIN_OUTRO]]);
    await c.query(`DELETE FROM "Feriado" WHERE nome LIKE $1`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Usuario" WHERE login = ANY($1)`, [[LOGIN, LOGIN_OUTRO]]);
  });
}

let u1: string;
let u2: string;

async function evento(titulo: string, inicio: Date, minutos: number, extra: Record<string, unknown> = {}) {
  return prisma.eventoAgenda.create({
    data: { tipo: "REUNIAO", titulo: `${PREFIXO} ${titulo}`, inicio, fim: new Date(inicio.getTime() + minutos * 60_000), responsavelId: u1, ...extra },
  });
}

beforeAll(async () => {
  await limpar();
  await criarUsuarioDeTeste(LOGIN, "senha-de-teste-123");
  await criarUsuarioDeTeste(LOGIN_OUTRO, "senha-de-teste-123");
  u1 = (await prisma.usuario.findUniqueOrThrow({ where: { login: LOGIN }, select: { id: true } })).id;
  u2 = (await prisma.usuario.findUniqueOrThrow({ where: { login: LOGIN_OUTRO }, select: { id: true } })).id;
  await prisma.feriado.create({ data: { data: new Date(`${FERIADO}T00:00:00Z`), nome: `${PREFIXO} Feriado`, tipo: "FERIADO" } });
  await prisma.feriado.create({
    data: { data: new Date(`${FERIAS_INICIO}T00:00:00Z`), dataFim: new Date(`${FERIAS_FIM}T00:00:00Z`), nome: `${PREFIXO} Férias`, tipo: "FERIAS_COLETIVA_FORNECEDORES" },
  });
  await evento("Manhã", em(TERCA, "09:00"), 60);
});

afterAll(async () => {
  await limpar();
  await prisma.$disconnect();
});

describe("avisos de agendamento (alerta, nunca bloqueio)", () => {
  it("avisa conflito com o mesmo responsável e nomeia o compromisso", async () => {
    const avisos = await avisosDoEvento({ inicio: em(TERCA, "09:30"), fim: em(TERCA, "10:30"), responsavelId: u1 });
    expect(avisos.some((a) => a.startsWith("Conflito de horário") && a.includes(`${PREFIXO} Manhã`))).toBe(true);
  });

  it("não avisa quando o responsável é outro, o horário só encosta ou o próprio compromisso é remarcado", async () => {
    expect(await avisosDoEvento({ inicio: em(TERCA, "09:30"), fim: em(TERCA, "10:30"), responsavelId: u2 })).toEqual([]);
    expect(await avisosDoEvento({ inicio: em(TERCA, "10:00"), fim: em(TERCA, "11:00"), responsavelId: u1 })).toEqual([]);
    const existente = await prisma.eventoAgenda.findFirstOrThrow({ where: { titulo: `${PREFIXO} Manhã` } });
    expect(await avisosDoEvento({ inicio: em(TERCA, "09:00"), fim: em(TERCA, "10:00"), responsavelId: u1, id: existente.id })).toEqual([]);
  });

  it("compromisso cancelado libera o horário", async () => {
    const cancelado = await evento("Cancelado", em(TERCA, "14:00"), 60, { status: "CANCELADO" });
    expect(cancelado.id).toBeTruthy();
    expect(await avisosDoEvento({ inicio: em(TERCA, "14:00"), fim: em(TERCA, "15:00"), responsavelId: u1 })).toEqual([]);
  });

  it("avisa fora do expediente, domingo, feriado e férias coletivas", async () => {
    const exp = await obterExpediente();
    expect(exp.horarioSemanaInicio, "o teste supõe o expediente padrão da configuração").toBeTruthy();

    expect((await avisosDoEvento({ inicio: em(TERCA, "06:00"), fim: em(TERCA, "07:00"), responsavelId: u2 })).join(" ")).toMatch(/fora do expediente/i);
    expect((await avisosDoEvento({ inicio: em(DOMINGO, "10:00"), fim: em(DOMINGO, "11:00"), responsavelId: u2 })).join(" ")).toMatch(/fora do expediente/i);
    expect((await avisosDoEvento({ inicio: em(FERIADO, "10:00"), fim: em(FERIADO, "11:00"), responsavelId: u2 })).join(" ")).toContain(`Feriado: ${PREFIXO} Feriado`);
    for (const dia of [FERIAS_INICIO, "2030-03-21", FERIAS_FIM]) {
      expect((await avisosDoEvento({ inicio: em(dia, "10:00"), fim: em(dia, "11:00"), responsavelId: u2 })).join(" "), dia).toContain(`Férias coletivas: ${PREFIXO} Férias`);
    }
    expect(await avisosDoEvento({ inicio: em("2030-03-23", "10:00"), fim: em("2030-03-23", "11:00"), responsavelId: u2 }).then((a) => a.join(" "))).not.toMatch(/Férias/);
  });
});

describe("horários livres e consulta por período", () => {
  it("sugere horários dentro do expediente e pula o que está ocupado", async () => {
    const livres = await horariosLivresDoDia({ data: TERCA, duracaoMin: 60, responsavelId: u1 });
    const inicios = livres.map((d) => d.getTime());
    expect(livres.length).toBeGreaterThan(0);
    expect(inicios).not.toContain(em(TERCA, "09:00").getTime());
    expect(inicios).not.toContain(em(TERCA, "09:30").getTime());
    expect(inicios).toContain(em(TERCA, "10:00").getTime()); // encosta no fim do compromisso das 9h
    // Para outro responsável as 9h estão livres.
    const doOutro = await horariosLivresDoDia({ data: TERCA, duracaoMin: 60, responsavelId: u2 });
    expect(doOutro.map((d) => d.getTime())).toContain(em(TERCA, "09:00").getTime());
  });

  it("não sugere nada em domingo nem em feriado", async () => {
    expect(await horariosLivresDoDia({ data: DOMINGO, duracaoMin: 60, responsavelId: u2 })).toEqual([]);
    expect(await horariosLivresDoDia({ data: FERIADO, duracaoMin: 60, responsavelId: u2 })).toEqual([]);
  });

  it("lista os compromissos do período, filtrados por responsável, e ignora os excluídos", async () => {
    await evento("Excluído", em(TERCA, "16:00"), 60, { deletadoEm: new Date() });
    await evento("Do outro", em(TERCA, "11:00"), 60, { responsavelId: u2 });
    const periodo = { inicio: em(TERCA, "00:00"), fim: em("2030-03-13", "00:00") };

    const todos = (await listarEventos(periodo)).map((e) => e.titulo);
    expect(todos).toContain(`${PREFIXO} Manhã`);
    expect(todos).toContain(`${PREFIXO} Do outro`);
    expect(todos).not.toContain(`${PREFIXO} Excluído`);

    const doU2 = (await listarEventos(periodo, { responsavelId: u2 })).map((e) => e.titulo);
    expect(doU2).toContain(`${PREFIXO} Do outro`);
    expect(doU2).not.toContain(`${PREFIXO} Manhã`);
  });

  it("o banco recusa compromisso que termina antes de começar", async () => {
    await expect(prisma.eventoAgenda.create({ data: { tipo: "REUNIAO", titulo: `${PREFIXO} Inválido`, inicio: em(TERCA, "10:00"), fim: em(TERCA, "09:00") } })).rejects.toThrow();
  });
});

describe("feed .ics público (token)", () => {
  const chamar = (token: string) => feedPublico(new NextRequest(`http://localhost/api/public/agenda/${token}`), { params: Promise.resolve({ token }) });

  it("com token válido devolve o calendário, sem valores, e anota o acesso", async () => {
    const amanha = new Date(Date.now() + 24 * 3_600_000);
    amanha.setUTCHours(15, 0, 0, 0);
    await evento("No feed", amanha, 60, { local: "Rua do Teste, 1", observacoes: "Levar a trena" });

    const token = gerarToken();
    const feed = await prisma.feedAgenda.create({ data: { usuarioId: u1, nome: "Teste", tokenHash: hashDoToken(token) } });

    const r = await chamar(token);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("text/calendar");
    expect(r.headers.get("cache-control")).toContain("private");
    const corpo = await r.text();
    expect(corpo.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(corpo).toContain(`SUMMARY:${PREFIXO} No feed`);
    expect(corpo).toContain("LOCATION:Rua do Teste\\, 1");
    expect(corpo).not.toMatch(/R\$|senha|hash/i);

    const depois = await prisma.feedAgenda.findUniqueOrThrow({ where: { id: feed.id } });
    expect(depois.ultimoAcessoEm).not.toBeNull();
    // O token em claro nunca é gravado.
    expect(JSON.stringify(depois)).not.toContain(token);
  });

  it("token inexistente, malformado, revogado ou de usuário inativo respondem o MESMO 404", async () => {
    const revogado = gerarToken();
    await prisma.feedAgenda.create({ data: { usuarioId: u1, tokenHash: hashDoToken(revogado), revogadoEm: new Date() } });
    const deInativo = gerarToken();
    await prisma.feedAgenda.create({ data: { usuarioId: u2, tokenHash: hashDoToken(deInativo) } });
    await prisma.usuario.update({ where: { id: u2 }, data: { ativo: false } });

    const respostas = await Promise.all([gerarToken(), "curto", "../../etc/passwd", revogado, deInativo].map(chamar));
    for (const r of respostas) {
      expect(r.status).toBe(404);
      expect(await r.text()).toBe("Não encontrado.");
    }
    await prisma.usuario.update({ where: { id: u2 }, data: { ativo: true } });
  });

  it("revogar corta o acesso na hora", async () => {
    const token = gerarToken();
    const feed = await prisma.feedAgenda.create({ data: { usuarioId: u1, tokenHash: hashDoToken(token) } });
    expect((await chamar(token)).status).toBe(200);
    await prisma.feedAgenda.update({ where: { id: feed.id }, data: { revogadoEm: new Date() } });
    expect((await chamar(token)).status).toBe(404);
  });
});
