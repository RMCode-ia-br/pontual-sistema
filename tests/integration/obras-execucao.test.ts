import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { criarClientePrisma } from "@/lib/db/criar-cliente";
import { datasDeFeriado, somarDiasDoTipo, type TipoDiasDoPrazo } from "@/lib/dominio/dias-uteis";
import { vencimentoAvisoFimGarantia, vencimentoPedidoAvaliacao } from "@/lib/dominio/followup";
import { carregarPeriodosDeFeriado, gerarEtapasDaObra } from "@/modules/obras/servico";
import {
  abrirPausa,
  aplicarDatasSugeridas,
  definirPrazoDaObra,
  editarEtapa,
  encerrarPausa,
  excluirPausa,
  gerarEtapasDeProjetoAprovado,
  marcarFachadaAprovada,
  mudarStatusDaEtapa,
  sugerirDatasDaObra,
  ajustarPausa,
} from "@/modules/obras/servico-execucao";

import { comConexao, criarUsuarioDeTeste } from "./banco-teste";

/**
 * Execução da obra (R7/R8): estados das etapas, relógio do prazo, gatilhos de pagamento, pausas e follow-ups.
 * Usa o modelo de etapas padrão do banco (criado pela seed) e um "agora" fixo para as datas serem repetíveis.
 */
const PREFIXO = "Int Exe";
const LOGIN = "int-execucao";
const prisma = criarClientePrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL);

/** 2026-06-20 é sábado; "hoje" em São Paulo é esse dia. */
const AGORA = new Date("2026-06-20T15:00:00Z");

let usuario: { id: string; nome: string };
let clienteId: string;

async function limpar() {
  await comConexao(async (c) => {
    const projetos = `SELECT id FROM "Projeto" WHERE titulo LIKE $1`;
    const contas = `SELECT id FROM "ContaReceber" WHERE "projetoId" IN (${projetos})`;
    const etapas = `SELECT id FROM "EtapaProjeto" WHERE "projetoId" IN (${projetos})`;
    const pausas = `SELECT id FROM "PausaProjeto" WHERE "projetoId" IN (${projetos})`;
    const p = [`${PREFIXO}%`];
    await c.query(`DELETE FROM "LogAuditoria" WHERE "usuarioId" IN (SELECT id FROM "Usuario" WHERE login = $1)`, [LOGIN]);
    await c.query(`DELETE FROM "LogAuditoria" WHERE "entidade" IN ('Projeto','Proposta') AND "entidadeId" IN (${projetos})`, p);
    await c.query(`DELETE FROM "LogAuditoria" WHERE "entidade" = 'ContaReceber' AND "entidadeId" IN (${contas})`, p);
    await c.query(`DELETE FROM "LogAuditoria" WHERE "entidade" = 'EtapaProjeto' AND "entidadeId" IN (${etapas})`, p);
    await c.query(`DELETE FROM "LogAuditoria" WHERE "entidade" = 'PausaProjeto' AND "entidadeId" IN (${pausas})`, p);
    await c.query(`DELETE FROM "Tarefa" WHERE "projetoId" IN (${projetos})`, p);
    await c.query(`DELETE FROM "Interacao" WHERE "projetoId" IN (${projetos})`, p);
    await c.query(`DELETE FROM "ContaReceber" WHERE "projetoId" IN (${projetos})`, p);
    await c.query(`DELETE FROM "EventoAgenda" WHERE "projetoId" IN (${projetos})`, p);
    await c.query(`DELETE FROM "EtapaProjeto" WHERE "projetoId" IN (${projetos})`, p);
    await c.query(`DELETE FROM "PausaProjeto" WHERE "projetoId" IN (${projetos})`, p);
    await c.query(`DELETE FROM "OpcaoProposta" WHERE "propostaId" IN (SELECT id FROM "Proposta" WHERE "projetoId" IN (${projetos}))`, p);
    await c.query(`DELETE FROM "Proposta" WHERE "projetoId" IN (${projetos})`, p);
    await c.query(`DELETE FROM "HistoricoFaseProjeto" WHERE "projetoId" IN (${projetos})`, p);
    await c.query(`DELETE FROM "Projeto" WHERE titulo LIKE $1`, p);
    await c.query(`DELETE FROM "EnderecoCliente" WHERE "clienteId" IN (SELECT id FROM "Cliente" WHERE nome LIKE $1)`, p);
    await c.query(`DELETE FROM "Cliente" WHERE nome LIKE $1`, p);
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

const dia = (d: Date | null | undefined) => d?.toISOString().slice(0, 10) ?? null;

async function esperado(inicio: string, dias: number, tipo: TipoDiasDoPrazo = "UTEIS") {
  return somarDiasDoTipo(inicio, dias, tipo, datasDeFeriado(await carregarPeriodosDeFeriado(prisma)));
}

type Opcoes = { status?: "APROVADO" | "NOVO_LEAD"; semPrazo?: boolean; tipoDias?: TipoDiasDoPrazo; condominio?: boolean };

/** Obra aprovada, com as parcelas 50/25/25 do caso real e as etapas geradas do modelo padrão (prazo 4 + 3 + 5 dias). */
async function criarObra(nome: string, o: Opcoes = {}) {
  const endereco = o.condominio ? await prisma.enderecoCliente.create({ data: { clienteId, tipo: "OBRA", logradouro: "Rua Teste", condominio: true, condominioNome: "Edifício Teste", exigeAprovacaoFachada: true } }) : null;
  const projeto = await prisma.projeto.create({
    data: { codigo: `P-0000-${randomUUID().slice(0, 8)}`, titulo: `${PREFIXO} ${nome}`, clienteId, enderecoObraId: endereco?.id ?? null, status: o.status ?? "APROVADO", responsavelId: usuario.id },
  });
  await prisma.contaReceber.createMany({
    data: [
      { projetoId: projeto.id, clienteId, ordem: 1, descricao: "Sinal", valorCentavos: 500000, gatilho: "CONFIRMACAO", status: "ABERTA", vencimento: new Date("2026-05-29T00:00:00Z") },
      { projetoId: projeto.id, clienteId, ordem: 2, descricao: "Entrega do material", valorCentavos: 250000, gatilho: "ENTREGA_MATERIAL", status: "AGUARDANDO_GATILHO" },
      { projetoId: projeto.id, clienteId, ordem: 3, descricao: "Vidros e instalação", valorCentavos: 250000, gatilho: "ENTREGA_E_INSTALACAO", status: "AGUARDANDO_GATILHO" },
    ],
  });
  if (o.status !== "NOVO_LEAD") {
    await prisma.$transaction((tx) =>
      gerarEtapasDaObra(tx, {
        projetoId: projeto.id,
        propostaId: "inexistente",
        opcaoId: "inexistente",
        usuario,
        aceitaEm: "2026-05-29",
        prazo: o.semPrazo ? { modo: "NENHUM", tipoDias: o.tipoDias ?? "UTEIS" } : { modo: "POR_ETAPA", materialDias: 4, execucaoDias: 3, vidrosDias: 5, tipoDias: o.tipoDias ?? "UTEIS" },
      }),
    );
  }
  return { projetoId: projeto.id, enderecoId: endereco?.id ?? null };
}
type Obra = Awaited<ReturnType<typeof criarObra>>;

const etapa = (obra: Obra, tipo: string) => prisma.etapaProjeto.findFirstOrThrow({ where: { projetoId: obra.projetoId, tipo: tipo as never, deletadoEm: null } });
const projetoDe = (obra: Obra) => prisma.projeto.findUniqueOrThrow({ where: { id: obra.projetoId } });
const contas = (obra: Obra) => prisma.contaReceber.findMany({ where: { projetoId: obra.projetoId }, orderBy: { ordem: "asc" } });
const mudar = (etapaId: string, para: Parameters<typeof mudarStatusDaEtapa>[1]["para"], extra: Partial<Parameters<typeof mudarStatusDaEtapa>[1]> = {}) =>
  prisma.$transaction((tx) => mudarStatusDaEtapa(tx, { etapaId, para, usuario, agora: AGORA, ...extra }), { timeout: 30_000 });
const motivo = (nome: string) => prisma.motivoBloqueio.findFirstOrThrow({ where: { nome, deletadoEm: null } });

describe("estados da etapa", () => {
  it("iniciar, bloquear com motivo, desbloquear e concluir; o projeto vai a Em execução", async () => {
    const obra = await criarObra("Ciclo da etapa");
    const med = await etapa(obra, "MEDICAO_EXATA");

    const iniciada = await mudar(med.id, "EM_ANDAMENTO", { data: "2026-06-01" });
    expect(iniciada).toMatchObject({ status: "EM_ANDAMENTO", statusDoProjeto: "EM_EXECUCAO" });
    expect(dia((await etapa(obra, "MEDICAO_EXATA")).inicioReal)).toBe("2026-06-01");
    expect((await projetoDe(obra)).status).toBe("EM_EXECUCAO");

    const m = await motivo("Aguardando cliente");
    await mudar(med.id, "BLOQUEADA", { motivoBloqueioId: m.id, detalheBloqueio: "Cliente viajou" });
    expect(await etapa(obra, "MEDICAO_EXATA")).toMatchObject({ status: "BLOQUEADA", motivoBloqueioId: m.id, detalheBloqueio: "Cliente viajou" });

    await mudar(med.id, "EM_ANDAMENTO");
    expect(await etapa(obra, "MEDICAO_EXATA")).toMatchObject({ status: "EM_ANDAMENTO", motivoBloqueioId: null, detalheBloqueio: null });

    await mudar(med.id, "CONCLUIDA", { data: "2026-06-03" });
    const final = await etapa(obra, "MEDICAO_EXATA");
    expect(final.status).toBe("CONCLUIDA");
    expect([dia(final.inicioReal), dia(final.fimReal)]).toEqual(["2026-06-01", "2026-06-03"]);
    expect(await prisma.interacao.count({ where: { projetoId: obra.projetoId, texto: { contains: "Medição exata" } } })).toBeGreaterThanOrEqual(4);
    expect(await prisma.logAuditoria.count({ where: { entidade: "EtapaProjeto", entidadeId: med.id } })).toBe(4);
  });

  it("recusa bloqueio sem motivo, motivo inexistente, transição inválida, data futura e conclusão antes do início", async () => {
    const obra = await criarObra("Regras da etapa");
    const fab = await etapa(obra, "FABRICACAO");

    await expect(mudar(fab.id, "BLOQUEADA")).rejects.toThrow(/motivo do bloqueio/);
    await expect(mudar(fab.id, "BLOQUEADA", { motivoBloqueioId: "nao-existe" })).rejects.toThrow(/não está disponível/);
    await expect(mudar(fab.id, "CONCLUIDA", { data: "2026-06-21" })).rejects.toThrow(/futuro/);
    await expect(mudar(fab.id, "CONCLUIDA", { data: "2026-13-45" })).rejects.toThrow(/data válida/);

    await mudar(fab.id, "EM_ANDAMENTO", { data: "2026-06-10" });
    await expect(mudar(fab.id, "CONCLUIDA", { data: "2026-06-09" })).rejects.toThrow(/anterior ao início/);

    await mudar(fab.id, "BLOQUEADA", { motivoBloqueioId: (await motivo("Clima")).id });
    await expect(mudar(fab.id, "CONCLUIDA", { data: "2026-06-12" })).rejects.toThrow(/Não dá para passar/); // desbloquear antes

    await mudar(fab.id, "EM_ANDAMENTO");
    await mudar(fab.id, "CONCLUIDA", { data: "2026-06-12" });
    await expect(mudar(fab.id, "CONCLUIDA", { data: "2026-06-12" })).rejects.toThrow(/Não dá para passar/);
  });

  it("um projeto que ainda não está em obra não tem etapas para mexer", async () => {
    const obra = await criarObra("Ainda lead", { status: "NOVO_LEAD" });
    const solta = await prisma.etapaProjeto.create({ data: { projetoId: obra.projetoId, tipo: "OUTRA", nome: "Solta", ordem: 1 } });
    await expect(mudar(solta.id, "EM_ANDAMENTO")).rejects.toThrow(/ainda não está em obra/);
  });

  it("duas conclusões simultâneas da mesma etapa: uma vence e a parcela abre uma vez só", async () => {
    const obra = await criarObra("Concorrência da etapa");
    const fab = await etapa(obra, "FABRICACAO");
    const r = await Promise.allSettled([mudar(fab.id, "CONCLUIDA", { data: "2026-06-10" }), mudar(fab.id, "CONCLUIDA", { data: "2026-06-10" }), mudar(fab.id, "CONCLUIDA", { data: "2026-06-10" })]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.tarefa.count({ where: { projetoId: obra.projetoId, tipo: "COBRAR_PARCELA" } })).toBe(1);
  }, 60_000);
});

describe("gatilhos de pagamento (R6) — critério de aceite da Fase 4", () => {
  it("concluir a etapa-gatilho abre a parcela com o vencimento da conclusão e cria a tarefa de cobrança", async () => {
    const obra = await criarObra("Gatilho material");
    const fab = await etapa(obra, "FABRICACAO");
    const r = await mudar(fab.id, "CONCLUIDA", { data: "2026-06-10" });
    expect(r.parcelasLiberadas).toBe(1);

    const [sinal, material, vidros] = await contas(obra);
    expect(sinal.status).toBe("ABERTA");
    expect(material).toMatchObject({ status: "ABERTA", etapaProjetoId: fab.id });
    expect(dia(material.vencimento)).toBe("2026-06-10");
    expect(vidros).toMatchObject({ status: "AGUARDANDO_GATILHO", vencimento: null, etapaProjetoId: null });

    const tarefa = await prisma.tarefa.findFirstOrThrow({ where: { projetoId: obra.projetoId, tipo: "COBRAR_PARCELA" } });
    expect(tarefa).toMatchObject({ status: "ABERTA", responsavelId: usuario.id, chaveUnica: `cobranca:${material.id}` });
    expect(dia(tarefa.vencimento)).toBe("2026-06-10");
    expect(await prisma.logAuditoria.count({ where: { entidade: "ContaReceber", entidadeId: material.id, acao: "LIBERAR_POR_ETAPA" } })).toBe(1);
  });

  it("o vencimento das parcelas pode ser ajustado na hora de concluir", async () => {
    const obra = await criarObra("Gatilho vencimento");
    await mudar((await etapa(obra, "FABRICACAO")).id, "CONCLUIDA", { data: "2026-06-10", vencimentoDasParcelas: "2026-06-25" });
    expect(dia((await contas(obra))[1].vencimento)).toBe("2026-06-25");
  });

  it("a instalação dos vidros libera a parcela final", async () => {
    const obra = await criarObra("Gatilho vidros");
    await mudar((await etapa(obra, "INSTALACAO_VIDROS")).id, "CONCLUIDA", { data: "2026-06-18" });
    const [, material, vidros] = await contas(obra);
    expect(material.status).toBe("AGUARDANDO_GATILHO");
    expect(vidros.status).toBe("ABERTA");
    expect(dia(vidros.vencimento)).toBe("2026-06-18");
  });

  it("reabrir a etapa devolve a parcela ao aguardando e cancela a tarefa de cobrança", async () => {
    const obra = await criarObra("Gatilho reabrir");
    const fab = await etapa(obra, "FABRICACAO");
    await mudar(fab.id, "CONCLUIDA", { data: "2026-06-10" });
    const r = await mudar(fab.id, "EM_ANDAMENTO");
    expect(r.parcelasRevertidas).toBe(1);

    const [, material] = await contas(obra);
    expect(material).toMatchObject({ status: "AGUARDANDO_GATILHO", vencimento: null, etapaProjetoId: null });
    expect((await prisma.tarefa.findFirstOrThrow({ where: { projetoId: obra.projetoId, tipo: "COBRAR_PARCELA" } })).status).toBe("CANCELADA");
    expect((await etapa(obra, "FABRICACAO")).fimReal).toBeNull();

    // E concluir de novo abre outra vez (a tarefa cancelada não impede a cobrança).
    await mudar(fab.id, "CONCLUIDA", { data: "2026-06-11" });
    expect((await contas(obra))[1]).toMatchObject({ status: "ABERTA" });
  });

  it("não reabre a etapa se a parcela que ela liberou já tem pagamento", async () => {
    const obra = await criarObra("Gatilho pago");
    const fab = await etapa(obra, "FABRICACAO");
    await mudar(fab.id, "CONCLUIDA", { data: "2026-06-10" });
    const [, material] = await contas(obra);
    await prisma.contaReceber.update({ where: { id: material.id }, data: { status: "PAGA" } });

    await expect(mudar(fab.id, "EM_ANDAMENTO")).rejects.toThrow(/já tem pagamento/);
    expect((await etapa(obra, "FABRICACAO")).status).toBe("CONCLUIDA"); // nada mudou (transação desfeita)
    expect((await contas(obra))[1].status).toBe("PAGA");
  });

  it("dispensar a etapa-gatilho também abre a parcela, e reativar a devolve", async () => {
    const obra = await criarObra("Gatilho dispensa");
    const fab = await etapa(obra, "FABRICACAO");
    await mudar(fab.id, "DISPENSADA", { data: "2026-06-12" });
    expect((await contas(obra))[1]).toMatchObject({ status: "ABERTA", etapaProjetoId: fab.id });
    expect(dia((await contas(obra))[1].vencimento)).toBe("2026-06-12");

    await mudar(fab.id, "PENDENTE");
    expect((await contas(obra))[1]).toMatchObject({ status: "AGUARDANDO_GATILHO", etapaProjetoId: null });
  });
});

describe("relógio do prazo (R8)", () => {
  it("concluir a medição exata inicia o relógio, grava o prazo prometido e SUGERE as datas definitivas", async () => {
    const obra = await criarObra("Relógio");
    const med = await etapa(obra, "MEDICAO_EXATA");
    const antes = await prisma.etapaProjeto.findMany({ where: { projetoId: obra.projetoId }, orderBy: { ordem: "asc" } });

    const r = await mudar(med.id, "CONCLUIDA", { data: "2026-06-01" });
    const projeto = await projetoDe(obra);
    expect(dia(projeto.dataInicioPrazo)).toBe("2026-06-01");
    expect(dia(projeto.prazoFinalPrometido)).toBe(await esperado("2026-06-01", 12));
    expect(projeto.diasPausaJustificada).toBe(0);
    expect((await etapa(obra, "MEDICAO_EXATA")).provisoria).toBe(false);

    // O sistema não mexeu nas datas: só sugeriu.
    const depois = await prisma.etapaProjeto.findMany({ where: { projetoId: obra.projetoId }, orderBy: { ordem: "asc" } });
    expect(depois.map((e) => [dia(e.inicioPrevisto), dia(e.fimPrevisto)])).toEqual(antes.map((e) => [dia(e.inicioPrevisto), dia(e.fimPrevisto)]));
    expect(r.sugestoes?.tipo).toBe("RELOGIO");
    expect(r.sugestoes!.itens.length).toBeGreaterThan(0);
    const ultima = r.sugestoes!.itens.at(-1)!;
    expect(ultima.novoFim).toBe(await esperado("2026-06-01", 12));
  });

  it("aplicar as datas sugeridas grava e deixa de ser provisório (relógio iniciado)", async () => {
    const obra = await criarObra("Aplicar datas");
    const r = await mudar((await etapa(obra, "MEDICAO_EXATA")).id, "CONCLUIDA", { data: "2026-06-01" });
    const itens = r.sugestoes!.itens.map((s) => ({ etapaId: s.id, inicio: s.novoInicio!, fim: s.novoFim! }));
    expect(await prisma.$transaction((tx) => aplicarDatasSugeridas(tx, { projetoId: obra.projetoId, itens, usuario }))).toBe(itens.length);

    const entrega = await etapa(obra, "ENTREGA");
    expect(dia(entrega.fimPrevisto)).toBe(await esperado("2026-06-01", 12));
    expect(entrega.provisoria).toBe(false);
    // Depois de aplicadas, não há mais nada a sugerir.
    const nova = await sugerirDatasDaObra(prisma, obra.projetoId, "2026-06-20");
    expect(nova).toMatchObject({ base: "2026-06-01", itens: [] });
  });

  it("concluir fora da data prevista sugere deslocar as seguintes pelo desvio (sem aplicar)", async () => {
    const obra = await criarObra("Desvio");
    const pedido = await etapa(obra, "PEDIDO_MATERIAL");
    const previstoFim = dia(pedido.fimPrevisto)!;
    const proxima = await etapa(obra, "FABRICACAO");

    // Concluída em um dia útil depois do previsto (o previsto é provisório, a partir de 29/05).
    const fimReal = await esperado(previstoFim, 2);
    const r = await mudar(pedido.id, "CONCLUIDA", { data: fimReal <= "2026-06-20" ? fimReal : "2026-06-19" });
    expect(r.sugestoes?.tipo).toBe("DESVIO");
    const s = r.sugestoes!.itens.find((x) => x.id === proxima.id)!;
    expect(s.novoInicio! > s.inicioPrevisto!).toBe(true);
    expect(dia((await etapa(obra, "FABRICACAO")).inicioPrevisto)).toBe(s.inicioPrevisto); // nada foi alterado
  });

  it("reabrir a medição exata para o relógio e volta as datas a provisórias", async () => {
    const obra = await criarObra("Reabrir medição");
    const med = await etapa(obra, "MEDICAO_EXATA");
    await mudar(med.id, "CONCLUIDA", { data: "2026-06-01" });
    await prisma.etapaProjeto.updateMany({ where: { projetoId: obra.projetoId }, data: { provisoria: false } });

    await mudar(med.id, "EM_ANDAMENTO");
    const projeto = await projetoDe(obra);
    expect(projeto).toMatchObject({ dataInicioPrazo: null, prazoFinalPrometido: null, diasPausaJustificada: 0 });
    expect((await etapa(obra, "FABRICACAO")).provisoria).toBe(true);
  });

  it("obra sem prazo: o relógio inicia mas não há prazo prometido nem sugestão", async () => {
    const obra = await criarObra("Sem prazo", { semPrazo: true });
    const r = await mudar((await etapa(obra, "MEDICAO_EXATA")).id, "CONCLUIDA", { data: "2026-06-01" });
    expect(r.sugestoes).toBeNull();
    const projeto = await projetoDe(obra);
    expect(dia(projeto.dataInicioPrazo)).toBe("2026-06-01");
    expect(projeto.prazoFinalPrometido).toBeNull();
    expect(await sugerirDatasDaObra(prisma, obra.projetoId, "2026-06-20")).toEqual({ erro: expect.stringContaining("Defina o prazo") });
  });

  it("definir o prazo da obra depois calcula o prazo prometido e aceita dias corridos", async () => {
    const obra = await criarObra("Definir prazo", { semPrazo: true });
    await mudar((await etapa(obra, "MEDICAO_EXATA")).id, "CONCLUIDA", { data: "2026-06-01" });
    await prisma.$transaction((tx) => definirPrazoDaObra(tx, { projetoId: obra.projetoId, modo: "TOTAL", totalDias: 35, tipoDias: "CORRIDOS", usuario }));
    const projeto = await projetoDe(obra);
    expect(projeto).toMatchObject({ prazoModo: "TOTAL", prazoDias: 35, tipoDiasPrazo: "CORRIDOS" });
    expect(dia(projeto.prazoFinalPrometido)).toBe("2026-07-06"); // 1º de junho + 35 dias corridos

    await expect(prisma.$transaction((tx) => definirPrazoDaObra(tx, { projetoId: obra.projetoId, modo: "TOTAL", totalDias: 0, tipoDias: "UTEIS", usuario }))).rejects.toThrow(/ao menos um prazo/);

    await prisma.$transaction((tx) => definirPrazoDaObra(tx, { projetoId: obra.projetoId, modo: "NENHUM", tipoDias: "UTEIS", usuario }));
    expect(await projetoDe(obra)).toMatchObject({ prazoModo: "NENHUM", prazoDias: null, prazoFinalPrometido: null });
  });
});

describe("pausas justificadas (R8)", () => {
  async function obraComRelogio(nome: string) {
    const obra = await criarObra(nome);
    await mudar((await etapa(obra, "MEDICAO_EXATA")).id, "CONCLUIDA", { data: "2026-06-01" });
    return obra;
  }
  const abrir = (obra: Obra, motivoBloqueioId: string, inicio: string) => prisma.$transaction((tx) => abrirPausa(tx, { projetoId: obra.projetoId, inicio, motivoBloqueioId, usuario, agora: AGORA }));

  it("pausa justificada estende o prazo prometido pelos dias úteis cobertos; em curso conta até hoje", async () => {
    const obra = await obraComRelogio("Pausa justificada");
    const sem = await esperado("2026-06-01", 12);
    expect(dia((await projetoDe(obra)).prazoFinalPrometido)).toBe(sem);

    const p = await abrir(obra, (await motivo("Alvenaria não pronta")).id, "2026-06-03");
    expect(p.justificada).toBe(true);
    // Em curso: de 03/06 até hoje (20/06, sábado): quarta 03 a sexta 19 = 13 dias úteis.
    expect(await projetoDe(obra)).toMatchObject({ diasPausaJustificada: 13 });
    expect(dia((await projetoDe(obra)).prazoFinalPrometido)).toBe(await esperado("2026-06-01", 12 + 13));

    // Encerrada em 05/06: só 3 dias úteis (03, 04, 05).
    await prisma.$transaction((tx) => encerrarPausa(tx, { pausaId: p.id, fim: "2026-06-05", usuario, agora: AGORA }));
    expect(await projetoDe(obra)).toMatchObject({ diasPausaJustificada: 3 });
    expect(dia((await projetoDe(obra)).prazoFinalPrometido)).toBe(await esperado("2026-06-01", 12 + 3));
  });

  it("pausa por motivo imputável à Pontual não estende o prazo, mas o gestor pode ajustar", async () => {
    const obra = await obraComRelogio("Pausa não justificada");
    const sem = await esperado("2026-06-01", 12);
    const p = await abrir(obra, (await motivo("Aguardando fornecedor")).id, "2026-06-03");
    expect(p.justificada).toBe(false);
    await prisma.$transaction((tx) => encerrarPausa(tx, { pausaId: p.id, fim: "2026-06-05", usuario, agora: AGORA }));
    expect(dia((await projetoDe(obra)).prazoFinalPrometido)).toBe(sem);

    await prisma.$transaction((tx) => ajustarPausa(tx, { pausaId: p.id, justificada: true, observacao: "Fornecedor confirmou força maior", usuario, agora: AGORA }));
    expect(dia((await projetoDe(obra)).prazoFinalPrometido)).toBe(await esperado("2026-06-01", 12 + 3));
  });

  it("não abre duas pausas ao mesmo tempo; não encerra antes do início nem no futuro; excluir recalcula", async () => {
    const obra = await obraComRelogio("Pausa regras");
    const m = (await motivo("Clima")).id;
    const p = await abrir(obra, m, "2026-06-03");
    await expect(abrir(obra, m, "2026-06-10")).rejects.toThrow(/pausa em curso/);
    await expect(prisma.$transaction((tx) => encerrarPausa(tx, { pausaId: p.id, fim: "2026-06-02", usuario, agora: AGORA }))).rejects.toThrow(/antes do início/);
    await expect(prisma.$transaction((tx) => encerrarPausa(tx, { pausaId: p.id, fim: "2026-06-25", usuario, agora: AGORA }))).rejects.toThrow(/futuro/);

    await prisma.$transaction((tx) => encerrarPausa(tx, { pausaId: p.id, fim: "2026-06-05", usuario, agora: AGORA }));
    await expect(abrir(obra, "nao-existe", "2026-06-10")).rejects.toThrow(/não está disponível/);
    await expect(abrir(obra, m, "2026-06-25")).rejects.toThrow(/futuro/);
    await expect(prisma.$transaction((tx) => encerrarPausa(tx, { pausaId: p.id, fim: "2026-06-05", usuario, agora: AGORA }))).rejects.toThrow(/já foi encerrada/);

    await prisma.$transaction((tx) => excluirPausa(tx, { pausaId: p.id, usuario, agora: AGORA }));
    expect(await projetoDe(obra)).toMatchObject({ diasPausaJustificada: 0 });
    expect(dia((await projetoDe(obra)).prazoFinalPrometido)).toBe(await esperado("2026-06-01", 12));
    // Excluída, deixa de contar como "em curso".
    await expect(abrir(obra, m, "2026-06-10")).resolves.toBeTruthy();
  });

  it("não conclui a entrega com pausa em curso", async () => {
    const obra = await obraComRelogio("Pausa e entrega");
    await abrir(obra, (await motivo("Clima")).id, "2026-06-03");
    await expect(mudar((await etapa(obra, "ENTREGA")).id, "CONCLUIDA", { data: "2026-06-18" })).rejects.toThrow(/Encerre a pausa/);
  });
});

/** Deixa as etapas anteriores à entrega concluídas (atalho para os testes que só querem a entrega). */
const concluirAnterioresDaEntrega = async (obra: Obra) => {
  const entrega = await etapa(obra, "ENTREGA");
  await prisma.etapaProjeto.updateMany({
    where: { projetoId: obra.projetoId, ordem: { lt: entrega.ordem }, status: "PENDENTE" },
    data: { status: "CONCLUIDA", inicioReal: new Date("2026-06-10T00:00:00Z"), fimReal: new Date("2026-06-10T00:00:00Z") },
  });
};

describe("conclusão da obra e follow-ups (R11)", () => {
  it("a entrega exige as etapas anteriores concluídas ou dispensadas (cada uma é decisão do gestor)", async () => {
    const obra = await criarObra("Entrega exige anteriores");
    const entrega = await etapa(obra, "ENTREGA");
    await expect(mudar(entrega.id, "CONCLUIDA", { data: "2026-06-18" })).rejects.toThrow(/Antes de concluir a entrega, conclua ou dispense: Medição exata, Pedido de material/);
    expect((await etapa(obra, "ENTREGA")).status).toBe("PENDENTE");
    expect((await projetoDe(obra)).status).toBe("APROVADO");

    // Concluir uma sim, dispensar outra: as duas resolvem (e as etapas-gatilho liberam as parcelas).
    const anteriores = await prisma.etapaProjeto.findMany({ where: { projetoId: obra.projetoId, ordem: { lt: entrega.ordem } }, orderBy: { ordem: "asc" } });
    for (const [i, e] of anteriores.entries()) await mudar(e.id, i % 2 === 0 ? "CONCLUIDA" : "DISPENSADA", { data: "2026-06-10" });
    const r = await mudar(entrega.id, "CONCLUIDA", { data: "2026-06-18" });
    expect(r.statusDoProjeto).toBe("CONCLUIDO");
    expect((await contas(obra)).map((c) => c.status)).toEqual(["ABERTA", "ABERTA", "ABERTA"]);
  });

  it("concluir a entrega conclui o projeto, grava a data e cria a tarefa de avaliação; reabrir desfaz", async () => {
    const obra = await criarObra("Entrega");
    await concluirAnterioresDaEntrega(obra);
    const entrega = await etapa(obra, "ENTREGA");
    const r = await mudar(entrega.id, "CONCLUIDA", { data: "2026-06-18" });
    expect(r.statusDoProjeto).toBe("CONCLUIDO");

    const projeto = await projetoDe(obra);
    expect(projeto.status).toBe("CONCLUIDO");
    expect(dia(projeto.dataConclusao)).toBe("2026-06-18");

    const cfg = await prisma.configuracaoEmpresa.findUniqueOrThrow({ where: { id: "singleton" }, select: { diasPedidoAvaliacao: true } });
    const tarefa = await prisma.tarefa.findFirstOrThrow({ where: { projetoId: obra.projetoId, tipo: "PEDIR_AVALIACAO" } });
    expect(tarefa.status).toBe("ABERTA");
    expect(dia(tarefa.vencimento)).toBe(dia(vencimentoPedidoAvaliacao(new Date("2026-06-18T12:00:00Z"), cfg.diasPedidoAvaliacao)));

    const reaberta = await mudar(entrega.id, "EM_ANDAMENTO");
    expect(reaberta.statusDoProjeto).toBe("EM_EXECUCAO");
    expect(await projetoDe(obra)).toMatchObject({ status: "EM_EXECUCAO", dataConclusao: null });
    expect((await prisma.tarefa.findFirstOrThrow({ where: { projetoId: obra.projetoId, tipo: "PEDIR_AVALIACAO" } })).status).toBe("CANCELADA");

    // Concluir de novo cria um novo pedido (o anterior ficou cancelado).
    await mudar(entrega.id, "CONCLUIDA", { data: "2026-06-19" });
    expect(await prisma.tarefa.count({ where: { projetoId: obra.projetoId, tipo: "PEDIR_AVALIACAO", status: "ABERTA" } })).toBe(1);
  });

  it("concluir a instalação dos vidros (marco) cria o aviso do fim da garantia", async () => {
    const obra = await criarObra("Garantia");
    await mudar((await etapa(obra, "INSTALACAO_VIDROS")).id, "CONCLUIDA", { data: "2026-06-15" });
    const cfg = await prisma.configuracaoEmpresa.findUniqueOrThrow({ where: { id: "singleton" }, select: { garantiaRegulagemDias: true } });
    const tarefa = await prisma.tarefa.findFirstOrThrow({ where: { projetoId: obra.projetoId, tipo: "FIM_GARANTIA" } });
    expect(dia(tarefa.vencimento)).toBe(dia(vencimentoAvisoFimGarantia(new Date("2026-06-15T12:00:00Z"), cfg.garantiaRegulagemDias)));
    expect(tarefa.descricao).toContain("termina em");
  });

  it("o projeto só vira Concluído pela entrega; etapas anteriores deixam em execução", async () => {
    const obra = await criarObra("Status");
    await mudar((await etapa(obra, "FABRICACAO")).id, "CONCLUIDA", { data: "2026-06-10" });
    expect((await projetoDe(obra)).status).toBe("EM_EXECUCAO");
    expect(await prisma.historicoFaseProjeto.count({ where: { projetoId: obra.projetoId, para: "EM_EXECUCAO" } })).toBe(1);
  });
});

describe("editar etapa, condomínio e obras aprovadas antes da Fase 4", () => {
  it("editar a etapa: responsável, equipe, datas e observação (com validação)", async () => {
    const obra = await criarObra("Editar etapa");
    const fab = await etapa(obra, "FABRICACAO");
    const equipe = await prisma.equipe.create({ data: { nome: `${PREFIXO} Equipe` } });
    try {
      await prisma.$transaction((tx) => editarEtapa(tx, { etapaId: fab.id, usuario, responsavelId: usuario.id, equipeId: equipe.id, inicioPrevisto: "2026-07-01", fimPrevisto: "2026-07-10", observacao: "  Aguardar vidro  " }));
      expect(await etapa(obra, "FABRICACAO")).toMatchObject({ responsavelId: usuario.id, equipeId: equipe.id, observacao: "Aguardar vidro" });
      expect([dia((await etapa(obra, "FABRICACAO")).inicioPrevisto), dia((await etapa(obra, "FABRICACAO")).fimPrevisto)]).toEqual(["2026-07-01", "2026-07-10"]);

      await expect(prisma.$transaction((tx) => editarEtapa(tx, { etapaId: fab.id, usuario, inicioPrevisto: "2026-07-10", fimPrevisto: "2026-07-01" }))).rejects.toThrow(/antes do início/);
      await expect(prisma.$transaction((tx) => editarEtapa(tx, { etapaId: fab.id, usuario, responsavelId: "nao-existe" }))).rejects.toThrow(/responsável/);
      await expect(prisma.$transaction((tx) => editarEtapa(tx, { etapaId: fab.id, usuario, equipeId: "nao-existe" }))).rejects.toThrow(/equipe/);

      // Limpar com null; undefined mantém.
      await prisma.$transaction((tx) => editarEtapa(tx, { etapaId: fab.id, usuario, equipeId: null }));
      expect(await etapa(obra, "FABRICACAO")).toMatchObject({ equipeId: null, responsavelId: usuario.id });
    } finally {
      await prisma.etapaProjeto.updateMany({ where: { equipeId: equipe.id }, data: { equipeId: null } });
      await prisma.equipe.delete({ where: { id: equipe.id } });
    }
  });

  it("marcar a fachada do condomínio como aprovada conclui a tarefa de confirmação", async () => {
    const obra = await criarObra("Condomínio", { condominio: true });
    await prisma.tarefa.create({ data: { titulo: "Confirmar aprovação do condomínio", tipo: "CONFIRMAR_CONDOMINIO", projetoId: obra.projetoId, clienteId, vencimento: new Date("2026-05-29T00:00:00Z") } });
    await prisma.$transaction((tx) => marcarFachadaAprovada(tx, { projetoId: obra.projetoId, usuario, agora: AGORA }));

    expect((await prisma.enderecoCliente.findUniqueOrThrow({ where: { id: obra.enderecoId! } })).fachadaAprovada).toBe(true);
    expect(await prisma.tarefa.findFirstOrThrow({ where: { projetoId: obra.projetoId, tipo: "CONFIRMAR_CONDOMINIO" } })).toMatchObject({ status: "CONCLUIDA" });
    await expect(prisma.$transaction((tx) => marcarFachadaAprovada(tx, { projetoId: obra.projetoId, usuario }))).rejects.toThrow(/já está marcada/);

    const semCondominio = await criarObra("Sem condomínio");
    await expect(prisma.$transaction((tx) => marcarFachadaAprovada(tx, { projetoId: semCondominio.projetoId, usuario }))).rejects.toThrow(/não é de condomínio/);
  });

  it("gera as etapas de uma obra aprovada antes de existir o modelo, com o prazo da proposta aprovada", async () => {
    const projeto = await prisma.projeto.create({ data: { codigo: `P-0000-${randomUUID().slice(0, 8)}`, titulo: `${PREFIXO} Antiga`, clienteId, status: "APROVADO" } });
    const obra: Obra = { projetoId: projeto.id, enderecoId: null };
    await expect(prisma.$transaction((tx) => gerarEtapasDeProjetoAprovado(tx, { projetoId: projeto.id, usuario }))).rejects.toThrow(/Nenhuma proposta aprovada/);

    const proposta = await prisma.proposta.create({
      data: {
        projetoId: projeto.id,
        numero: `INT-${randomUUID().slice(0, 8)}`,
        numeroSequencial: 1,
        ano: 2026,
        data: new Date("2026-05-20T00:00:00Z"),
        clienteNome: `${PREFIXO} Cliente`,
        status: "APROVADA",
        aceitaEm: new Date("2026-05-29T12:00:00Z"),
        opcoes: { create: [{ nome: "Opção 1" }] },
        snapshot: { prazo: { modo: "TOTAL", totalMinDias: 20, totalMaxDias: 35, materialDias: null, execucaoDias: null, vidrosDias: null, tipoDias: "UTEIS" } },
      },
      include: { opcoes: true },
    });
    await prisma.proposta.update({ where: { id: proposta.id }, data: { opcaoAprovadaId: proposta.opcoes[0].id } });

    const n = await prisma.$transaction((tx) => gerarEtapasDeProjetoAprovado(tx, { projetoId: projeto.id, usuario }));
    expect(n).toBeGreaterThan(0);
    expect(await projetoDe(obra)).toMatchObject({ prazoModo: "TOTAL", prazoDias: 35, tipoDiasPrazo: "UTEIS" });
    expect(dia((await etapa(obra, "MEDICAO_EXATA")).fimPrevisto)).toBe("2026-05-29"); // parte do aceite
    await expect(prisma.$transaction((tx) => gerarEtapasDeProjetoAprovado(tx, { projetoId: projeto.id, usuario }))).rejects.toThrow(/já tem etapas/);
  });
});
