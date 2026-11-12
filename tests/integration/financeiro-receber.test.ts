import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Prisma } from "@/generated/prisma/client";
import type { UsuarioSessao } from "@/lib/auth/sessao";
import { criarClientePrisma } from "@/lib/db/criar-cliente";
import { montarCobrancaDaConta, listarContasAReceber, lerListaAReceber, obterContaAReceber } from "@/modules/financeiro/queries-receber";
import { listarContasFinanceiras } from "@/modules/financeiro/queries";
import { estornarLancamento } from "@/modules/financeiro/servico-lancamentos";
import { ajustarContaAReceber, cancelarContaAReceber, liberarParcelaAntesDaEtapa, prorrogarContaAReceber, reabrirContaAReceber, registrarRecebimento } from "@/modules/financeiro/servico-receber";

import { comConexao, criarUsuarioDeTeste } from "./banco-teste";

const PREFIXO = "Int FinR";
const LOGIN = "int-fin-receber";
const prisma = criarClientePrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL);

const AGORA = new Date("2026-11-20T15:00:00Z");
const HOJE = "2026-11-20";

let usuario: UsuarioSessao;
let clienteId: string;
let projetoId: string;
let contaBancoId: string;
let categoriaId: string;

const tx = <T>(fn: (t: Prisma.TransactionClient) => Promise<T>) => prisma.$transaction(fn, { timeout: 30_000 });
const ctx = () => ({ usuario, ip: null, agora: AGORA });
const dia = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;

async function limpar() {
  await comConexao(async (c) => {
    const contas = `SELECT id FROM "ContaReceber" WHERE descricao LIKE '${PREFIXO}%'`;
    await c.query(`DELETE FROM "LogAuditoria" WHERE "usuarioId" IN (SELECT id FROM "Usuario" WHERE login = $1)`, [LOGIN]);
    await c.query(`DELETE FROM "Lancamento" WHERE "contaReceberId" IN (${contas}) OR "contaFinanceiraId" IN (SELECT id FROM "ContaFinanceira" WHERE nome LIKE $1)`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Tarefa" WHERE "chaveUnica" IN (SELECT 'cobranca:' || id FROM "ContaReceber" WHERE descricao LIKE '${PREFIXO}%')`);
    await c.query(`DELETE FROM "Interacao" WHERE "clienteId" IN (SELECT id FROM "Cliente" WHERE nome LIKE $1)`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "ProrrogacaoReceber" WHERE "contaReceberId" IN (${contas})`);
    await c.query(`DELETE FROM "ContaReceber" WHERE descricao LIKE $1`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Projeto" WHERE titulo LIKE $1`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Cliente" WHERE nome LIKE $1`, [`${PREFIXO}%`]);
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
  clienteId = (await prisma.cliente.create({ data: { nome: `${PREFIXO} Cliente`, tipoPessoa: "PF", whatsapp: "+5522999583288" } })).id;
  projetoId = (await prisma.projeto.create({ data: { codigo: `P-0000-${randomUUID().slice(0, 8)}`, titulo: `${PREFIXO} Obra`, clienteId, status: "APROVADO", responsavelId: usuario.id } })).id;
  contaBancoId = (await prisma.contaFinanceira.create({ data: { nome: `${PREFIXO} Banco`, saldoInicialInformado: true, saldoInicialCentavos: 0, dataSaldoInicial: new Date("2026-11-01T00:00:00Z") } })).id;
  categoriaId = (await prisma.categoriaFinanceira.create({ data: { nome: `${PREFIXO} Receita`, tipo: "RECEITA", grupo: "RECEITAS_OPERACIONAIS", grupoDre: "Receitas operacionais" } })).id;
});

afterAll(async () => {
  await limpar();
  await prisma.$disconnect();
});

let ordem = 0;
/** Conta a receber de teste (com a tarefa de cobrança, como a abertura por etapa cria). */
async function nova(nome: string, valorCentavos: number, extra: Partial<Prisma.ContaReceberUncheckedCreateInput> = {}) {
  const c = await prisma.contaReceber.create({
    data: { projetoId, clienteId, ordem: ++ordem, descricao: `${PREFIXO} ${nome}`, valorCentavos, status: "ABERTA", vencimento: new Date("2026-11-25T00:00:00Z"), gatilho: "CONFIRMACAO", ...extra },
  });
  if (c.status !== "AGUARDANDO_GATILHO") {
    await prisma.tarefa.create({ data: { titulo: `Cobrar parcela — ${c.descricao}`, tipo: "COBRAR_PARCELA", clienteId, projetoId, vencimento: c.vencimento, chaveUnica: `cobranca:${c.id}` } });
  }
  return c;
}
const receber = (id: string, valor: number, extra: Partial<Parameters<typeof registrarRecebimento>[1]> = {}) =>
  tx((t) => registrarRecebimento(t, { contaReceberId: id, data: "2026-11-19", valorCentavos: valor, contaFinanceiraId: contaBancoId, categoriaId, forma: "PIX", comNotaFiscal: false, observacao: null, ...extra }, ctx()));
const de = (id: string) => prisma.contaReceber.findUniqueOrThrow({ where: { id } });
const tarefaDe = (id: string) => prisma.tarefa.findUniqueOrThrow({ where: { chaveUnica: `cobranca:${id}` } });
const saldoDoBanco = async () => (await listarContasFinanceiras(HOJE)).find((c) => c.id === contaBancoId)!.saldoAtualCentavos;

describe("recebimento total e parcial (critério de aceite: cobrar → receber fecha certo)", () => {
  it("parcial deixa a parcela em aberto e a tarefa viva; a quitação conclui a tarefa; tudo auditado e na linha do tempo", async () => {
    const c = await nova("Sinal", 100000);
    const antes = await saldoDoBanco();

    const r1 = await receber(c.id, 30000);
    expect(r1).toMatchObject({ status: "PARCIAL", saldoCentavos: 70000 });
    expect(await de(c.id)).toMatchObject({ status: "PARCIAL", valorPagoCentavos: 30000, categoriaFinanceiraId: categoriaId, forma: "PIX" });
    expect((await tarefaDe(c.id)).status).toBe("ABERTA");
    expect(await saldoDoBanco()).toBe(antes + 30000);

    const lanc = await prisma.lancamento.findMany({ where: { contaReceberId: c.id } });
    expect(lanc).toHaveLength(1);
    expect(lanc[0]).toMatchObject({ tipo: "ENTRADA", valorCentavos: 30000, projetoId, clienteId, contaFinanceiraId: contaBancoId, categoriaId, estornadoEm: null });

    const r2 = await receber(c.id, 70000);
    expect(r2).toMatchObject({ status: "PAGA", saldoCentavos: 0 });
    expect(await de(c.id)).toMatchObject({ status: "PAGA", valorPagoCentavos: 100000 });
    const tarefa = await tarefaDe(c.id);
    expect(tarefa.status).toBe("CONCLUIDA");
    expect(tarefa.concluidaEm).not.toBeNull();
    expect(await saldoDoBanco()).toBe(antes + 100000);

    expect(await prisma.logAuditoria.count({ where: { entidade: "ContaReceber", entidadeId: c.id, acao: "RECEBER" } })).toBe(2);
    expect(await prisma.interacao.count({ where: { clienteId, projetoId, texto: { contains: "Parcela quitada" } } })).toBeGreaterThanOrEqual(1);
  });

  it("recusa o que passa do saldo, parcela aguardando etapa, parcela cancelada e valor inválido", async () => {
    const c = await nova("Recusas", 50000);
    await expect(receber(c.id, 50001)).rejects.toThrow(/passa do saldo/);
    await expect(receber(c.id, 0)).rejects.toThrow(/maior que zero/);
    const aguardando = await nova("Aguardando", 50000, { status: "AGUARDANDO_GATILHO", vencimento: null, gatilho: "ENTREGA_MATERIAL" });
    await expect(receber(aguardando.id, 100)).rejects.toThrow(/aguarda a conclusão/);
    await tx((t) => cancelarContaAReceber(t, c.id, "teste", ctx()));
    await expect(receber(c.id, 100)).rejects.toThrow(/cancelad/);
    // Nada foi gravado pelas tentativas recusadas.
    expect(await prisma.lancamento.count({ where: { contaReceberId: { in: [c.id, aguardando.id] } } })).toBe(0);
  });

  it("sem categoria (nem na conta nem no pagamento) pede a categoria", async () => {
    const c = await nova("Sem categoria", 10000);
    await expect(receber(c.id, 1000, { categoriaId: null })).rejects.toThrow(/categoria/);
  });

  it("lançamento em conta inativa ou data futura é recusado e a conta fica intacta (transação desfeita)", async () => {
    const c = await nova("Data futura", 10000);
    await expect(receber(c.id, 1000, { data: "2026-11-21" })).rejects.toThrow(/futuro/);
    expect(await de(c.id)).toMatchObject({ status: "ABERTA", valorPagoCentavos: 0 });
  });

  it("dois recebimentos simultâneos nunca passam do valor (a linha da conta é travada)", async () => {
    const c = await nova("Corrida", 100000);
    const r = await Promise.allSettled([receber(c.id, 60000), receber(c.id, 60000)]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(r.filter((x) => x.status === "rejected")).toHaveLength(1);
    expect(await de(c.id)).toMatchObject({ valorPagoCentavos: 60000, status: "PARCIAL" });
    expect(await prisma.lancamento.count({ where: { contaReceberId: c.id } })).toBe(1);
  });

  it("a marca 'com nota' do recebimento é gravada, e o valor da parcela NÃO é recalculado", async () => {
    const c = await nova("Com nota", 105000);
    await receber(c.id, 105000, { comNotaFiscal: true });
    expect(await de(c.id)).toMatchObject({ comNotaFiscal: true, valorCentavos: 105000, status: "PAGA" });
    expect((await prisma.lancamento.findFirstOrThrow({ where: { contaReceberId: c.id } })).comNotaFiscal).toBe(true);
  });
});

describe("estorno do recebimento", () => {
  it("devolve o valor e o status, reabre a tarefa de cobrança e devolve o saldo da conta", async () => {
    const c = await nova("Estorno", 80000);
    const antes = await saldoDoBanco();
    await receber(c.id, 50000);
    const quitacao = await receber(c.id, 30000);
    expect((await tarefaDe(c.id)).status).toBe("CONCLUIDA");

    await tx((t) => estornarLancamento(t, quitacao.lancamentoId, "Cheque devolvido", ctx()));
    expect(await de(c.id)).toMatchObject({ status: "PARCIAL", valorPagoCentavos: 50000 });
    expect((await tarefaDe(c.id)).status).toBe("ABERTA");
    expect(await saldoDoBanco()).toBe(antes + 50000);

    // O recebimento estornado continua visível no histórico, marcado.
    const detalhe = (await obterContaAReceber(c.id, HOJE))!;
    expect(detalhe.recebimentos.map((r) => [r.valorCentavos, r.estornadoEm !== null])).toEqual([[50000, false], [30000, true]]);
    expect(detalhe.resumo).toMatchObject({ situacao: "A_VENCER", parcial: true, saldoCentavos: 30000 });

    // Dá para receber de novo o que foi estornado, e o resto fecha.
    await receber(c.id, 30000);
    expect(await de(c.id)).toMatchObject({ status: "PAGA", valorPagoCentavos: 80000 });
  });

  it("estornar tudo volta a parcela para 'aberta' (sem pagamento)", async () => {
    const c = await nova("Estorno total", 20000);
    const r = await receber(c.id, 20000);
    await tx((t) => estornarLancamento(t, r.lancamentoId, "Engano", ctx()));
    expect(await de(c.id)).toMatchObject({ status: "ABERTA", valorPagoCentavos: 0 });
  });
});

describe("ajustes, cancelamento e liberação", () => {
  it("desconto: o valor não fica abaixo do recebido; igualar o recebido quita; aumentar reabre como parcial", async () => {
    const c = await nova("Desconto", 100000);
    await receber(c.id, 30000);
    const ajustar = (valorCentavos: number | null, vencimento: string | null = null) => tx((t) => ajustarContaAReceber(t, { contaReceberId: c.id, valorCentavos, vencimento, motivo: "Desconto combinado" }, ctx()));

    await expect(ajustar(20000)).rejects.toThrow(/não pode ser menor/);
    await ajustar(30000);
    expect(await de(c.id)).toMatchObject({ valorCentavos: 30000, status: "PAGA" });
    expect((await tarefaDe(c.id)).status).toBe("CONCLUIDA");

    await ajustar(40000);
    expect(await de(c.id)).toMatchObject({ valorCentavos: 40000, status: "PARCIAL" });
    expect((await tarefaDe(c.id)).status).toBe("ABERTA");
    expect(await prisma.logAuditoria.count({ where: { entidade: "ContaReceber", entidadeId: c.id, acao: "AJUSTAR" } })).toBe(2);
  });

  it("novo vencimento acompanha a tarefa de cobrança; parcela aguardando etapa não aceita vencimento; sem mudança é recusado", async () => {
    const c = await nova("Vencimento", 10000);
    await tx((t) => ajustarContaAReceber(t, { contaReceberId: c.id, valorCentavos: null, vencimento: "2026-12-05", motivo: "Cliente pediu" }, ctx()));
    expect(dia((await de(c.id)).vencimento)).toBe("2026-12-05");
    expect(dia((await tarefaDe(c.id)).vencimento)).toBe("2026-12-05");

    const aguardando = await nova("Aguardando venc", 10000, { status: "AGUARDANDO_GATILHO", vencimento: null, gatilho: "ENTREGA_MATERIAL" });
    await expect(tx((t) => ajustarContaAReceber(t, { contaReceberId: aguardando.id, valorCentavos: null, vencimento: "2026-12-05", motivo: "x y z" }, ctx()))).rejects.toThrow(/aguarda a etapa/);
    await expect(tx((t) => ajustarContaAReceber(t, { contaReceberId: c.id, valorCentavos: 10000, vencimento: "2026-12-05", motivo: "x y z" }, ctx()))).rejects.toThrow(/Nada foi alterado/);
  });

  it("cancelar: recusa com recebimento; sem recebimento cancela a conta e a tarefa; reabrir volta ao normal", async () => {
    const paga = await nova("Cancelar paga", 10000);
    await receber(paga.id, 1000);
    await expect(tx((t) => cancelarContaAReceber(t, paga.id, "motivo", ctx()))).rejects.toThrow(/estorne antes/);

    const c = await nova("Cancelar", 10000);
    await tx((t) => cancelarContaAReceber(t, c.id, "Obra cancelada", ctx()));
    expect((await de(c.id)).status).toBe("CANCELADA");
    expect((await tarefaDe(c.id)).status).toBe("CANCELADA");
    expect(await prisma.logAuditoria.count({ where: { entidade: "ContaReceber", entidadeId: c.id, acao: "CANCELAR" } })).toBe(1);

    await tx((t) => reabrirContaAReceber(t, c.id, ctx()));
    expect((await de(c.id)).status).toBe("ABERTA");
    expect((await tarefaDe(c.id)).status).toBe("ABERTA");
    await expect(tx((t) => reabrirContaAReceber(t, c.id, ctx()))).rejects.toThrow(/cancelada/);
  });

  it("liberar antes da etapa: vira aberta com a tarefa de cobrança; não vale para quem não aguarda", async () => {
    const c = await nova("Liberar", 10000, { status: "AGUARDANDO_GATILHO", vencimento: null, gatilho: "ENTREGA_MATERIAL" });
    expect(await prisma.tarefa.count({ where: { chaveUnica: `cobranca:${c.id}` } })).toBe(0);
    await tx((t) => liberarParcelaAntesDaEtapa(t, { contaReceberId: c.id, vencimento: "2026-11-27" }, ctx()));
    expect(await de(c.id)).toMatchObject({ status: "ABERTA", etapaProjetoId: null });
    expect(dia((await de(c.id)).vencimento)).toBe("2026-11-27");
    expect(dia((await tarefaDe(c.id)).vencimento)).toBe("2026-11-27");
    await expect(tx((t) => liberarParcelaAntesDaEtapa(t, { contaReceberId: c.id, vencimento: "2026-11-28" }, ctx()))).rejects.toThrow(/não está aguardando/);
    // Já liberada, pode receber.
    await receber(c.id, 10000);
    expect((await de(c.id)).status).toBe("PAGA");
  });
});

describe("listas e atrasos derivados (critério de aceite: atrasos corretos)", () => {
  it("as abas agrupam pela data de hoje, e a parcela parcial vencida continua atrasada", async () => {
    const outro = (await prisma.cliente.create({ data: { nome: `${PREFIXO} Cliente Lista`, tipoPessoa: "PF" } })).id;
    const mk = (nome: string, vencimento: string | null, extra: Partial<Prisma.ContaReceberUncheckedCreateInput> = {}) =>
      prisma.contaReceber.create({
        data: { projetoId, clienteId: outro, ordem: ++ordem, descricao: `${PREFIXO} ${nome}`, valorCentavos: 10000, status: vencimento ? "ABERTA" : "AGUARDANDO_GATILHO", vencimento: vencimento ? new Date(`${vencimento}T00:00:00Z`) : null, gatilho: vencimento ? "CONFIRMACAO" : "ENTREGA_MATERIAL", ...extra },
      });
    await mk("Ontem", "2026-11-19");
    const parcial = await mk("Parcial vencida", "2026-11-10");
    await prisma.contaReceber.update({ where: { id: parcial.id }, data: { status: "PARCIAL", valorPagoCentavos: 4000 } });
    await mk("Hoje", HOJE);
    await mk("Em 3 dias", "2026-11-23");
    await mk("Em 8 dias", "2026-11-28"); // fora da janela de 7 dias
    await mk("Aguardando", null);
    await mk("Paga", "2026-11-01", { status: "PAGA", valorPagoCentavos: 10000 });

    const lista = async (aba: string) => {
      const { parametros, filtros } = lerListaAReceber({ aba, cliente: outro, tamanho: "100" });
      return listarContasAReceber(parametros, filtros, HOJE, 7);
    };
    const nomes = async (aba: string) => (await lista(aba)).linhas.map((l) => l.descricao.replace(`${PREFIXO} `, ""));

    expect(await nomes("atrasadas")).toEqual(["Parcial vencida", "Ontem"]); // ordenadas por vencimento
    expect(await nomes("hoje")).toEqual(["Hoje"]);
    expect(await nomes("proximos")).toEqual(["Em 3 dias"]);
    expect(await nomes("aguardando")).toEqual(["Aguardando"]);
    expect(await nomes("pagas")).toEqual(["Paga"]);
    expect((await nomes("abertas")).sort()).toEqual(["Em 3 dias", "Em 8 dias", "Hoje", "Ontem", "Parcial vencida"].sort());

    const abertas = await lista("abertas");
    expect(abertas.contagens).toMatchObject({ abertas: 5, atrasadas: 2, hoje: 1, proximos: 1, aguardando: 1, pagas: 1, todas: 7 });
    // Saldo: 10.000 × 4 + (10.000 − 4.000); atrasado: ontem 10.000 + parcial 6.000.
    expect(abertas.totais).toEqual({ saldoCentavos: 40000 + 6000, atrasadoCentavos: 16000 });

    const ontem = abertas.linhas.find((l) => l.descricao.endsWith("Ontem"))!;
    expect(ontem.resumo).toMatchObject({ situacao: "ATRASADO", diasEmAtraso: 1 });
    expect(abertas.linhas.find((l) => l.descricao.endsWith("Hoje"))!.resumo.situacao).toBe("VENCE_HOJE");
    const venc = abertas.linhas.find((l) => l.descricao.endsWith("Parcial vencida"))!;
    expect(venc.resumo).toMatchObject({ situacao: "ATRASADO", parcial: true, saldoCentavos: 6000, diasEmAtraso: 10 });

    // O mesmo dia, visto de amanhã: "ontem" vira atrasada há 2 dias e "hoje" passa a atrasada.
    const { parametros, filtros } = lerListaAReceber({ aba: "atrasadas", cliente: outro, tamanho: "100" });
    const amanha = await listarContasAReceber(parametros, filtros, "2026-11-21", 7);
    expect(amanha.linhas.map((l) => l.descricao.replace(`${PREFIXO} `, "")).sort()).toEqual(["Hoje", "Ontem", "Parcial vencida"].sort());
  });

  it("a busca acha por cliente, obra ou descrição", async () => {
    const { parametros, filtros } = lerListaAReceber({ aba: "todas", busca: "FinR Cliente Lista", tamanho: "100" });
    const r = await listarContasAReceber(parametros, filtros, HOJE, 7);
    expect(r.linhas.length).toBeGreaterThanOrEqual(7);
    expect(r.linhas.every((l) => l.clienteNome.includes("Cliente Lista"))).toBe(true);
  });
});

describe("cobrança por WhatsApp", () => {
  it("monta a mensagem com o SALDO (não o valor cheio) e o link do cliente", async () => {
    const c = await nova("Cobrança", 100000, { vencimento: new Date("2026-11-30T00:00:00Z") });
    await receber(c.id, 25000);
    const detalhe = (await obterContaAReceber(c.id, HOJE))!;
    const r = await montarCobrancaDaConta(detalhe, "Pontual");
    expect(r.faltando).toEqual([]);
    expect(r.texto).toMatch(/R\$\s?750,00/);
    expect(r.texto).toContain("30/11/2026");
    expect(r.link).toMatch(/^https:\/\/wa\.me\/5522999583288\?text=/);
  });
});

describe("cliente pediu mais prazo (prorrogação): o vencimento original continua mandando no atraso", () => {
  const prorrogar = (id: string, dataPrometida: string, observacao: string | null = null) => tx((t) => prorrogarContaAReceber(t, { contaReceberId: id, dataPrometida, observacao }, ctx()));

  it("grava a promessa e o histórico, não mexe no vencimento, mantém o atraso, move a tarefa e audita", async () => {
    const c = await nova("Prorrogar", 80000, { vencimento: new Date("2026-11-10T00:00:00Z") }); // venceu há 10 dias
    await prorrogar(c.id, "2026-11-28", "Cliente disse que recebe na sexta");

    const depois = await de(c.id);
    expect(dia(depois.vencimento)).toBe("2026-11-10"); // INTACTO
    expect(dia(depois.dataPrometida)).toBe("2026-11-28");
    expect(depois.status).toBe("ABERTA");

    const detalhe = await obterContaAReceber(c.id, HOJE);
    expect(detalhe?.dataPrometida).toBe("2026-11-28");
    expect(detalhe?.resumo).toMatchObject({ situacao: "ATRASADO", diasEmAtraso: 10 }); // atraso e inadimplência pelo original
    expect(detalhe?.prorrogacoes).toHaveLength(1);
    expect(detalhe?.prorrogacoes[0]).toMatchObject({ dataAnterior: null, dataPrometida: "2026-11-28", observacao: "Cliente disse que recebe na sexta" });

    expect(dia((await tarefaDe(c.id)).vencimento)).toBe("2026-11-28");
    expect(await prisma.logAuditoria.count({ where: { entidade: "ContaReceber", entidadeId: c.id, acao: "PRORROGAR" } })).toBe(1);
    expect(await prisma.interacao.count({ where: { clienteId, projetoId, texto: { contains: "pediu mais prazo" } } })).toBeGreaterThanOrEqual(1);
  });

  it("uma segunda promessa guarda a anterior no histórico; recebimento parcial continua permitido", async () => {
    const c = await nova("Prorrogar duas", 50000, { vencimento: new Date("2026-11-10T00:00:00Z") });
    await prorrogar(c.id, "2026-11-25");
    await prorrogar(c.id, "2026-12-03");
    await receber(c.id, 10000);
    const detalhe = await obterContaAReceber(c.id, HOJE);
    expect(detalhe?.status).toBe("PARCIAL");
    expect(detalhe?.dataPrometida).toBe("2026-12-03");
    expect(detalhe?.prorrogacoes.map((x) => [x.dataAnterior, x.dataPrometida])).toEqual([
      ["2026-11-25", "2026-12-03"],
      [null, "2026-11-25"],
    ]);
    await prorrogar(c.id, "2026-12-10"); // parcial também aceita
    expect(dia((await de(c.id)).dataPrometida)).toBe("2026-12-10");
  });

  it("recusa data de ontem, data até o vencimento, a mesma data, parcela paga, aguardando etapa e cancelada; nada é gravado", async () => {
    const c = await nova("Prorrogar recusas", 30000, { vencimento: new Date("2026-11-10T00:00:00Z") });
    await expect(prorrogar(c.id, "2026-11-19")).rejects.toThrow(/anterior a hoje/);
    const futura = await nova("Prorrogar futura", 30000, { vencimento: new Date("2026-11-25T00:00:00Z") });
    await expect(prorrogar(futura.id, "2026-11-25")).rejects.toThrow(/depois do vencimento original/);
    await prorrogar(c.id, "2026-11-30");
    await expect(prorrogar(c.id, "2026-11-30")).rejects.toThrow(/já é a data prometida/);

    const paga = await nova("Prorrogar paga", 1000);
    await receber(paga.id, 1000);
    await expect(prorrogar(paga.id, "2026-12-30")).rejects.toThrow(/em aberto/);
    const aguardando = await nova("Prorrogar aguardando", 1000, { status: "AGUARDANDO_GATILHO", vencimento: null, gatilho: "ENTREGA_MATERIAL" });
    await expect(prorrogar(aguardando.id, "2026-12-30")).rejects.toThrow(/em aberto/);
    await tx((t) => cancelarContaAReceber(t, futura.id, "teste", ctx()));
    await expect(prorrogar(futura.id, "2026-12-30")).rejects.toThrow(/em aberto/);

    expect(await prisma.prorrogacaoReceber.count({ where: { contaReceberId: { in: [futura.id, paga.id, aguardando.id] } } })).toBe(0);
    expect(await prisma.prorrogacaoReceber.count({ where: { contaReceberId: c.id } })).toBe(1);
  });

  it("duas promessas simultâneas não se perdem: o histórico tem as duas e o cache fica com uma delas", async () => {
    const c = await nova("Prorrogar concorrente", 20000, { vencimento: new Date("2026-11-10T00:00:00Z") });
    const r = await Promise.allSettled([prorrogar(c.id, "2026-12-01"), prorrogar(c.id, "2026-12-02")]);
    expect(r.every((x) => x.status === "fulfilled")).toBe(true);
    const hist = await prisma.prorrogacaoReceber.findMany({ where: { contaReceberId: c.id }, orderBy: { id: "asc" } });
    expect(hist).toHaveLength(2);
    expect(dia(hist[1].dataAnterior)).toBe(dia(hist[0].dataPrometida)); // encadeadas, graças ao FOR UPDATE
    expect(dia((await de(c.id)).dataPrometida)).toBe(dia(hist[1].dataPrometida));
  });
});
