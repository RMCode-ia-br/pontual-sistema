import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { UsuarioSessao } from "@/lib/auth/sessao";
import { criarClientePrisma } from "@/lib/db/criar-cliente";
import { ehDeadlock } from "@/lib/db/deadlock";
import { dataLocalDoInstante } from "@/lib/formatadores";
import { estornarLancamento } from "@/modules/financeiro/servico-lancamentos";
import { registrarRecebimento } from "@/modules/financeiro/servico-receber";
import { restaurarDaLixeira } from "@/modules/lixeira/restaurar";
import { proximoCodigoDoProjeto } from "@/modules/projetos/servico";
import { aprovarProposta, copiarProposta, enviarProposta } from "@/modules/propostas/servico-ciclo";
import { listarVendas, vendidoNoPeriodo } from "@/modules/indicadores/vendas";
import type { Periodo } from "@/lib/periodo";
import { previaDaTroca, previaDoDesfazer } from "@/modules/propostas/previa-desfazer";
import { desfazerAprovacao, reabrirRevisao, trocarAprovacao } from "@/modules/propostas/servico-desfazer";
import { reservarNumeroDeProposta } from "@/modules/propostas/servico";

import { comConexao, criarUsuarioDeTeste } from "./banco-teste";

/**
 * Fase 7A.1: desfazer, trocar e reabrir a aprovação de proposta. Só toca registros com o prefixo "Int Desf"
 * (nunca dados reais) e devolve o contador de propostas e de projetos ao que era.
 */
const PREFIXO = "Int Desf";
const LOGIN = "int-desfazer";
const prisma = criarClientePrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL);

let usuario: { id: string; nome: string };
let clienteId: string;
let contador: { proximo: number | null; ano: number | null };
let contaFinanceiraId: string;
let categoriaReceitaId: string;
let fornecedorId: string;
let produtoId: string;
let proximoNumeroDeCompra = 1_500_000_000;

async function limpar() {
  await comConexao(async (c) => {
    const projetos = `SELECT id FROM "Projeto" WHERE titulo LIKE $1`;
    const propostas = `SELECT id FROM "Proposta" WHERE "projetoId" IN (${projetos})`;
    const contas = `SELECT id FROM "ContaReceber" WHERE "projetoId" IN (${projetos})`;
    await c.query(`DELETE FROM "LogAuditoria" WHERE "entidade" IN ('Proposta','Projeto') AND ("entidadeId" IN (${propostas}) OR "entidadeId" IN (${projetos}))`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "LogAuditoria" WHERE "entidade" = 'ContaReceber' AND "entidadeId" IN (${contas})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "LogAuditoria" WHERE "entidade" = 'Lancamento' AND "entidadeId" IN (SELECT id FROM "Lancamento" WHERE "projetoId" IN (${projetos}))`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Lancamento" WHERE "projetoId" IN (${projetos})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "MovimentoEstoque" WHERE "projetoId" IN (${projetos})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "MovimentoSucata" WHERE "projetoId" IN (${projetos})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "PausaProjeto" WHERE "projetoId" IN (${projetos})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Anexo" WHERE "entidadeTipo" = 'Projeto' AND "entidadeId" IN (${projetos})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "MotivoBloqueio" WHERE nome LIKE $1`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Compra" WHERE "projetoId" IN (${projetos})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "ContaReceber" WHERE "projetoId" IN (${projetos})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "EventoAgenda" WHERE "projetoId" IN (${projetos})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "EtapaProjeto" WHERE "projetoId" IN (${projetos})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "ItemPropostaMedida" WHERE "itemId" IN (SELECT id FROM "ItemProposta" WHERE "propostaId" IN (${propostas}))`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "ItemProposta" WHERE "propostaId" IN (${propostas})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "PropostaParcela" WHERE "propostaId" IN (${propostas})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "GrupoProposta" WHERE "propostaId" IN (${propostas})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "OpcaoProposta" WHERE "propostaId" IN (${propostas})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Proposta" WHERE "projetoId" IN (${projetos})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Interacao" WHERE "projetoId" IN (${projetos})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Tarefa" WHERE "projetoId" IN (${projetos})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "HistoricoFaseProjeto" WHERE "projetoId" IN (${projetos})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Projeto" WHERE titulo LIKE $1`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "EnderecoCliente" WHERE "clienteId" IN (SELECT id FROM "Cliente" WHERE nome LIKE $1)`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Cliente" WHERE nome LIKE $1`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Produto" WHERE descricao LIKE $1`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Fornecedor" WHERE "razaoSocial" LIKE $1`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "ContaFinanceira" WHERE nome LIKE $1`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "CategoriaFinanceira" WHERE nome LIKE $1`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Usuario" WHERE login = $1`, [LOGIN]);
    // Devolve o contador de projetos como os outros testes de integração fazem.
    await c.query(`UPDATE "ContadorSequencia" SET "valor" = coalesce((SELECT max(substring("codigo" from 8)::int) FROM "Projeto" WHERE "codigo" LIKE 'P-' || extract(year from now())::text || '-%'), 0) WHERE "chave" LIKE 'projeto:%'`);
  });
}

beforeAll(async () => {
  await limpar();
  const cfg = await prisma.configuracaoEmpresa.findUniqueOrThrow({ where: { id: "singleton" }, select: { proximoNumeroProposta: true, anoNumeracaoProposta: true } });
  contador = { proximo: cfg.proximoNumeroProposta, ano: cfg.anoNumeracaoProposta };
  await criarUsuarioDeTeste(LOGIN, "senha-de-teste-123");
  usuario = await prisma.usuario.findUniqueOrThrow({ where: { login: LOGIN }, select: { id: true, nome: true } });
  clienteId = (await prisma.cliente.create({ data: { nome: `${PREFIXO} Cliente`, tipoPessoa: "PF" } })).id;
  contaFinanceiraId = (await prisma.contaFinanceira.create({ data: { nome: `${PREFIXO} Caixa` } })).id;
  categoriaReceitaId = (await prisma.categoriaFinanceira.create({ data: { nome: `${PREFIXO} Receita`, tipo: "RECEITA" } })).id;
  fornecedorId = (await prisma.fornecedor.create({ data: { razaoSocial: `${PREFIXO} Fornecedor` } })).id;
  produtoId = (await prisma.produto.create({ data: { codigo: "INT-DESF-1", descricao: `${PREFIXO} Produto` } })).id;
});

afterAll(async () => {
  await limpar();
  await comConexao((c) => c.query(`UPDATE "ConfiguracaoEmpresa" SET "proximoNumeroProposta" = $1, "anoNumeracaoProposta" = $2 WHERE id = 'singleton'`, [contador.proximo, contador.ano]));
  await prisma.$disconnect();
});

/** Projeto + proposta rascunho com uma opção, dois itens manuais e cronograma 50% na confirmação / 50% na entrega. */
type PrazoDaProposta = { modoPrazo: "TOTAL" | "POR_ETAPA"; prazoTotalMinDias?: number | null; prazoTotalMaxDias?: number | null; prazoMaterialDias?: number | null; prazoExecucaoDias?: number | null; prazoVidrosDias?: number | null };
const PRAZO_ORIGINAL: PrazoDaProposta = { modoPrazo: "TOTAL", prazoTotalMaxDias: 35 };
const PRAZO_DA_REVISAO: PrazoDaProposta = { modoPrazo: "POR_ETAPA", prazoTotalMinDias: null, prazoTotalMaxDias: null, prazoMaterialDias: 10, prazoExecucaoDias: 5, prazoVidrosDias: 8 };

async function montar(titulo: string, valores: number[] = [1200000, 80000], prazo: PrazoDaProposta = PRAZO_ORIGINAL) {
  return prisma.$transaction(async (tx) => {
    const projeto = await tx.projeto.create({ data: { codigo: await proximoCodigoDoProjeto(tx), titulo: `${PREFIXO} ${titulo}`, clienteId, status: "ELABORANDO_PROPOSTA" } });
    const { numero, sequencial, ano } = await reservarNumeroDeProposta(tx);
    const proposta = await tx.proposta.create({
      data: {
        projetoId: projeto.id,
        numero,
        numeroSequencial: sequencial,
        ano,
        data: new Date(),
        clienteNome: `${PREFIXO} Cliente`,
        ...prazo,
        opcoes: { create: [{ nome: "Opção 1", ordem: 0 }] },
        parcelas: {
          create: [
            { ordem: 1, descricao: "Sinal", percentualPb: 5000, gatilho: "CONFIRMACAO", forma: "PIX" },
            { ordem: 2, descricao: "Entrega e instalação", percentualPb: 5000, gatilho: "ENTREGA_E_INSTALACAO" },
          ],
        },
      },
      include: { opcoes: true },
    });
    for (const [i, v] of valores.entries()) {
      await tx.itemProposta.create({
        data: { propostaId: proposta.id, opcaoId: proposta.opcoes[0].id, ordem: i, descricao: `ITEM ${i + 1}`, modoPreco: "MANUAL", valorManualCentavos: v, precoTotalCentavos: v, medidas: { create: [{ larguraMm: 1000, alturaMm: 1000, quantidade: 1 }] } },
      });
    }
    return { projetoId: projeto.id, propostaId: proposta.id, opcaoId: proposta.opcoes[0].id, numero };
  });
}

const enviar = (propostaId: string) => prisma.$transaction((tx) => enviarProposta(tx, { usuario, propostaId }));
const revisar = (origemId: string) => prisma.$transaction((tx) => copiarProposta(tx, { usuarioId: usuario.id, origemId, modo: "REVISAO" }));
const aprovar = (propostaId: string, opcaoId: string, aceitaEm = "2026-11-16") =>
  prisma.$transaction((tx) => aprovarProposta(tx, { usuario, propostaId, opcaoId, forma: "WHATSAPP", aceitaEm }), { timeout: 30_000 });

describe("reprodução do caso real 2003-26: aprovar a original com a revisão ainda em rascunho", () => {
  it("o estado final é o relatado: original aprovada, revisão substituída, parcelas e tarefas da original, sem como voltar", async () => {
    const m = await montar("Reproducao");
    await enviar(m.propostaId);
    const rev = await revisar(m.propostaId);
    const revOpcao = (await prisma.opcaoProposta.findFirstOrThrow({ where: { propostaId: rev.id } })).id;
    // A revisão nunca foi enviada: sem snapshot.
    expect((await prisma.proposta.findUniqueOrThrow({ where: { id: rev.id } })).snapshot).toBeNull();

    await aprovar(m.propostaId, m.opcaoId);

    const original = await prisma.proposta.findUniqueOrThrow({ where: { id: m.propostaId } });
    const revisao = await prisma.proposta.findUniqueOrThrow({ where: { id: rev.id } });
    expect(original).toMatchObject({ status: "APROVADA", valorAprovadoCentavos: 1280000, formaAceite: "WHATSAPP" });
    expect(revisao.status).toBe("SUBSTITUIDA");

    const projeto = await prisma.projeto.findUniqueOrThrow({ where: { id: m.projetoId } });
    expect(projeto).toMatchObject({ status: "APROVADO", valorFechadoCentavos: 1280000 });
    expect(projeto.dataFechamento?.toISOString().slice(0, 10)).toBe("2026-11-16");

    const contas = await prisma.contaReceber.findMany({ where: { projetoId: m.projetoId }, orderBy: { ordem: "asc" } });
    expect(contas.map((c) => [c.propostaId, c.ordem, c.valorCentavos, c.status])).toEqual([
      [m.propostaId, 1, 640000, "ABERTA"],
      [m.propostaId, 2, 640000, "AGUARDANDO_GATILHO"],
    ]);
    expect(await prisma.tarefa.count({ where: { projetoId: m.projetoId, tipo: "AGENDAR_MEDICAO", chaveUnica: `medicao-exata:${m.propostaId}`, status: "ABERTA" } })).toBe(1);
    expect(await prisma.tarefa.count({ where: { projetoId: m.projetoId, tipo: "FOLLOW_UP_PROPOSTA", status: "ABERTA" } })).toBe(0);

    // O engano não tem saída: a revisão substituída não pode ser aprovada e a original não pode ser aprovada de novo.
    await expect(aprovar(rev.id, revOpcao)).rejects.toThrow();
    await expect(aprovar(m.propostaId, m.opcaoId)).rejects.toThrow(/já foi aprovada/);
  });
});

// ------------------------------------------------------------------------------------------------------------------
// Bloco 2: desfazer e reabrir
// ------------------------------------------------------------------------------------------------------------------

const desfazer = (propostaId: string, extra: { reabrirId?: string | null; motivo?: string } = {}) =>
  prisma.$transaction((tx) => desfazerAprovacao(tx, { usuario, propostaId, motivo: extra.motivo ?? "Aprovei por engano", reabrirId: extra.reabrirId ?? null }), { timeout: 30_000 });
const reabrir = (propostaId: string) => prisma.$transaction((tx) => reabrirRevisao(tx, { usuario, propostaId }), { timeout: 30_000 });
const ctxFinanceiro = () => ({ usuario: usuario as unknown as UsuarioSessao, ip: null });
const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** O que está VIVO no projeto, normalizado para comparar dois projetos gêmeos (ids e números não entram). */
async function estado(projetoId: string) {
  const projeto = await prisma.projeto.findUniqueOrThrow({ where: { id: projetoId } });
  const propostas = await prisma.proposta.findMany({ where: { projetoId, deletadoEm: null }, orderBy: { revisao: "asc" } });
  const parcelas = await prisma.contaReceber.findMany({ where: { projetoId, deletadoEm: null }, orderBy: { ordem: "asc" } });
  const etapas = await prisma.etapaProjeto.findMany({ where: { projetoId, deletadoEm: null }, orderBy: { ordem: "asc" } });
  const tarefas = await prisma.tarefa.findMany({ where: { projetoId, status: "ABERTA", deletadoEm: null } });
  return {
    projeto: {
      status: projeto.status,
      valorFechadoCentavos: projeto.valorFechadoCentavos,
      dataFechamento: dia(projeto.dataFechamento),
      prazo: [projeto.prazoModo, projeto.prazoDias, projeto.prazoMaterialDias, projeto.prazoExecucaoDias, projeto.prazoVidrosDias, projeto.tipoDiasPrazo],
    },
    propostas: propostas.map((p) => [p.revisao, p.status, p.valorAprovadoCentavos, dia(p.aceitaEm), p.formaAceite]),
    parcelas: parcelas.map((c) => [c.ordem, c.valorCentavos, c.status, c.gatilho, dia(c.vencimento), c.percentualPb]),
    etapas: etapas.map((e) => [e.tipo, e.ordem, e.status, dia(e.inicioPrevisto), dia(e.fimPrevisto), e.provisoria]),
    tarefasAbertas: tarefas.map((t) => t.tipo).sort(),
  };
}

const aprovadasDoNumero = (numero: string) => prisma.proposta.count({ where: { numero, status: "APROVADA", deletadoEm: null } });

/** Original enviada + Rev. 1 em rascunho, com a original APROVADA (o engano do caso real). */
async function cenarioDoEngano(titulo: string) {
  const m = await montar(titulo);
  await enviar(m.propostaId);
  const rev = await revisar(m.propostaId);
  const revOpcao = (await prisma.opcaoProposta.findFirstOrThrow({ where: { propostaId: rev.id } })).id;
  await aprovar(m.propostaId, m.opcaoId);
  return { ...m, revId: rev.id, revOpcaoId: revOpcao };
}

describe("desfazer a aprovação", () => {
  it("volta tudo ao que era: proposta, parcelas, tarefas, etapas, valor fechado, data e fase do projeto", async () => {
    const m = await montar("Desfazer tudo");
    await enviar(m.propostaId);
    const enviadaEm = (await prisma.proposta.findUniqueOrThrow({ where: { id: m.propostaId } })).enviadaEm;
    await aprovar(m.propostaId, m.opcaoId);
    // Pré-condição: a aprovação gerou etapas (depende do modelo de etapas padrão semeado; se faltar, o teste avisa aqui).
    expect(await prisma.etapaProjeto.count({ where: { projetoId: m.projetoId, deletadoEm: null } }), "o modelo de etapas padrão precisa estar semeado").toBeGreaterThan(0);

    const r = await desfazer(m.propostaId, { motivo: "Aprovei a original por engano" });
    expect(r).toMatchObject({ statusDaDesfeita: "ENVIADA", parcelasCanceladas: 2, tarefasCanceladas: 1, valorFechadoCentavos: null, faseDoProjeto: "PROPOSTA_ENVIADA", reaberta: null });
    expect(r.etapasRemovidas).toBeGreaterThan(0);

    const p = await prisma.proposta.findUniqueOrThrow({ where: { id: m.propostaId } });
    expect(p).toMatchObject({ status: "ENVIADA", aceitaEm: null, formaAceite: null, aceiteObservacao: null, opcaoAprovadaId: null, valorAprovadoCentavos: null });
    expect(p.snapshot).not.toBeNull(); // o que o cliente recebeu continua congelado
    expect(p.enviadaEm?.getTime()).toBe(enviadaEm?.getTime());

    // Parcelas: histórico (canceladas, excluídas, desligadas da proposta), nenhuma viva.
    const contas = await prisma.contaReceber.findMany({ where: { projetoId: m.projetoId }, orderBy: { ordem: "asc" } });
    expect(contas).toHaveLength(2);
    expect(contas.every((c) => c.status === "CANCELADA" && c.propostaId === null && c.deletadoEm !== null)).toBe(true);
    expect(contas[0].descricao).toContain(m.numero); // o histórico fica na própria linha

    // Tarefas: medição exata cancelada com a chave aposentada; follow-up novo aberto.
    const medicao = await prisma.tarefa.findMany({ where: { projetoId: m.projetoId, tipo: "AGENDAR_MEDICAO" } });
    expect(medicao).toHaveLength(1);
    expect(medicao[0].status).toBe("CANCELADA");
    expect(medicao[0].chaveUnica).toContain(":desfeita:");
    expect(await prisma.tarefa.count({ where: { projetoId: m.projetoId, tipo: "FOLLOW_UP_PROPOSTA", status: "ABERTA" } })).toBe(1);

    // Etapas: exclusão lógica, nenhuma viva, e o prazo da obra volta a "nenhum".
    expect(await prisma.etapaProjeto.count({ where: { projetoId: m.projetoId, deletadoEm: null } })).toBe(0);
    expect(await prisma.etapaProjeto.count({ where: { projetoId: m.projetoId, deletadoEm: { not: null } } })).toBe(r.etapasRemovidas);

    const projeto = await prisma.projeto.findUniqueOrThrow({ where: { id: m.projetoId } });
    expect(projeto).toMatchObject({ status: "PROPOSTA_ENVIADA", valorFechadoCentavos: null, dataFechamento: null, prazoModo: "NENHUM", prazoDias: null });
    const fases = await prisma.historicoFaseProjeto.findMany({ where: { projetoId: m.projetoId }, orderBy: { criadoEm: "asc" } });
    expect(fases.map((f) => f.para).slice(-2)).toEqual(["APROVADO", "PROPOSTA_ENVIADA"]);

    // Linha do tempo e auditoria dizem o motivo e o que mudou.
    const interacao = await prisma.interacao.findFirst({ where: { projetoId: m.projetoId, texto: { contains: "desfeita" } } });
    expect(interacao?.texto).toContain("Aprovei a original por engano");
    const log = await prisma.logAuditoria.findFirstOrThrow({ where: { entidade: "Proposta", entidadeId: m.propostaId, acao: "DESFAZER_APROVACAO" } });
    expect((log.antes as { parcelas: unknown[] }).parcelas).toHaveLength(2);
    expect((log.depois as { motivo: string }).motivo).toBe("Aprovei a original por engano");
  });

  it("exige o motivo e recusa a segunda vez (duplo clique): a primeira desfaz, a outra diz que já foi desfeita", async () => {
    const m = await montar("Motivo e repetição");
    await enviar(m.propostaId);
    await aprovar(m.propostaId, m.opcaoId);
    await expect(desfazer(m.propostaId, { motivo: "  " })).rejects.toThrow(/motivo/i);
    expect((await prisma.proposta.findUniqueOrThrow({ where: { id: m.propostaId } })).status).toBe("APROVADA");

    await desfazer(m.propostaId);
    await expect(desfazer(m.propostaId)).rejects.toThrow(/não está aprovada/);
  });

  it("três cliques ao mesmo tempo: exatamente um sucesso e nada duplicado", async () => {
    const m = await montar("Concorrência dupla");
    await enviar(m.propostaId);
    await aprovar(m.propostaId, m.opcaoId);
    const r = await Promise.allSettled([desfazer(m.propostaId), desfazer(m.propostaId), desfazer(m.propostaId)]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(r.filter((x) => x.status === "rejected")).toHaveLength(2);
    expect(await prisma.logAuditoria.count({ where: { entidade: "Proposta", entidadeId: m.propostaId, acao: "DESFAZER_APROVACAO" } })).toBe(1);
    expect(await prisma.historicoFaseProjeto.count({ where: { projetoId: m.projetoId, para: "PROPOSTA_ENVIADA" } })).toBe(2); // o envio e a volta
  });

  it("bloqueado por recebimento: diz qual parcela; depois do estorno, desfaz", async () => {
    const m = await montar("Bloqueio recebimento");
    await enviar(m.propostaId);
    await aprovar(m.propostaId, m.opcaoId);
    const parcela1 = await prisma.contaReceber.findFirstOrThrow({ where: { propostaId: m.propostaId, ordem: 1 } });
    const { lancamentoId } = await prisma.$transaction((tx) =>
      registrarRecebimento(tx, { contaReceberId: parcela1.id, data: dataLocalDoInstante(new Date()), valorCentavos: 100000, contaFinanceiraId, categoriaId: categoriaReceitaId, forma: "PIX", comNotaFiscal: false, observacao: null }, ctxFinanceiro()),
    );

    await expect(desfazer(m.propostaId)).rejects.toThrow(/parcela 1 já tem recebimento/);
    expect((await prisma.proposta.findUniqueOrThrow({ where: { id: m.propostaId } })).status).toBe("APROVADA"); // nada mudou

    await prisma.$transaction((tx) => estornarLancamento(tx, lancamentoId, "recebido por engano", ctxFinanceiro()));
    await expect(desfazer(m.propostaId)).resolves.toMatchObject({ statusDaDesfeita: "ENVIADA" });
  });

  it("bloqueado por etapa iniciada; liberado quando a etapa volta a pendente", async () => {
    const m = await montar("Bloqueio etapa");
    await enviar(m.propostaId);
    await aprovar(m.propostaId, m.opcaoId);
    const etapa = await prisma.etapaProjeto.findFirstOrThrow({ where: { projetoId: m.projetoId, deletadoEm: null, status: "PENDENTE" }, orderBy: { ordem: "asc" } });
    await prisma.etapaProjeto.update({ where: { id: etapa.id }, data: { status: "EM_ANDAMENTO", inicioReal: new Date("2026-11-17T00:00:00Z") } });

    await expect(desfazer(m.propostaId)).rejects.toThrow(new RegExp(`etapa "${etapa.nome}" já andou`));
    await prisma.etapaProjeto.update({ where: { id: etapa.id }, data: { status: "PENDENTE", inicioReal: null } });
    await expect(desfazer(m.propostaId)).resolves.toBeTruthy();
  });

  it("bloqueado por compra e por saída de estoque da obra; lista as duas de uma vez", async () => {
    const m = await montar("Bloqueio compra e estoque");
    await enviar(m.propostaId);
    await aprovar(m.propostaId, m.opcaoId);
    await prisma.compra.create({ data: { numero: proximoNumeroDeCompra++, fornecedorId, destino: "OBRA", projetoId: m.projetoId, status: "PEDIDO" } });
    await prisma.movimentoEstoque.create({ data: { produtoId, tipo: "SAIDA_OBRA", quantidade: 2, data: new Date("2026-11-17T00:00:00Z"), projetoId: m.projetoId } });

    const erro = await desfazer(m.propostaId).then(
      () => "",
      (e: Error) => e.message,
    );
    expect(erro).toMatch(/1 compra/);
    expect(erro).toMatch(/Saiu material do estoque/);
    expect((await prisma.proposta.findUniqueOrThrow({ where: { id: m.propostaId } })).status).toBe("APROVADA");
  });

  it.each([
    ["foto de obra", /tem 1 foto/, async (projetoId: string) => { await prisma.anexo.create({ data: { entidadeTipo: "Projeto", entidadeId: projetoId, categoria: "foto-obra", nome: "foto.jpg", caminho: `${PREFIXO}/${projetoId}/foto.jpg`, mime: "image/jpeg", tamanhoBytes: 10 } }); }],
    ["agendamento de instalação", /agendamento de instalação em \d{2}\/\d{2}\/\d{4}/, async (projetoId: string) => { await prisma.eventoAgenda.create({ data: { tipo: "INSTALACAO", inicio: new Date("2026-12-01T12:00:00Z"), fim: new Date("2026-12-01T14:00:00Z"), projetoId, status: "AGENDADO" } }); }],
    ["despesa lançada na obra", /1 despesa lançada/, async (projetoId: string) => { await prisma.lancamento.create({ data: { data: new Date("2026-11-16T00:00:00Z"), tipo: "SAIDA", valorCentavos: 1000, contaFinanceiraId, descricao: `${PREFIXO} despesa`, projetoId } }); }],
    ["registro de sucata", /1 registro de sucata/, async (projetoId: string) => { await prisma.movimentoSucata.create({ data: { tipo: "GERACAO", data: new Date("2026-11-16T00:00:00Z"), pesoKg: "1.500", projetoId } }); }],
    ["pausa registrada", /1 pausa registrada/, async (projetoId: string) => { const motivo = await prisma.motivoBloqueio.create({ data: { nome: `${PREFIXO} motivo ${projetoId}` } }); await prisma.pausaProjeto.create({ data: { projetoId, inicio: new Date("2026-11-16T00:00:00Z"), motivoBloqueioId: motivo.id, justificada: true } }); }],
  ])("bloqueado por %s (a consulta real, não só a regra pura)", async (_nome, texto, criar) => {
    const m = await montar(`Bloqueio ${_nome}`);
    await enviar(m.propostaId);
    await aprovar(m.propostaId, m.opcaoId);
    await criar(m.projetoId);
    await expect(desfazer(m.propostaId)).rejects.toThrow(texto);
    expect((await prisma.proposta.findUniqueOrThrow({ where: { id: m.propostaId } })).status).toBe("APROVADA");
  });

  it("bloqueado com a obra em execução", async () => {
    const m = await montar("Bloqueio execução");
    await enviar(m.propostaId);
    await aprovar(m.propostaId, m.opcaoId);
    await prisma.projeto.update({ where: { id: m.projetoId }, data: { status: "EM_EXECUCAO" } });
    await expect(desfazer(m.propostaId)).rejects.toThrow(/já está em execução/);
  });
});

describe("aprovar, desfazer e aprovar de novo", () => {
  it("o resultado é IGUAL ao de uma aprovação limpa (parcelas, tarefas, etapas, projeto, prazo)", async () => {
    const a = await montar("Gêmeo com desfazer");
    const b = await montar("Gêmeo limpo");
    for (const m of [a, b]) await enviar(m.propostaId);

    await aprovar(a.propostaId, a.opcaoId);
    await desfazer(a.propostaId);
    const r = await aprovar(a.propostaId, a.opcaoId);
    await aprovar(b.propostaId, b.opcaoId);

    expect(r).toMatchObject({ parcelasGeradas: 2, valorFechadoCentavos: 1280000 });
    const ea = await estado(a.projetoId);
    expect(ea.etapas.length).toBeGreaterThan(0);
    expect(ea).toEqual(await estado(b.projetoId));
    // As tarefas de medição existem de novo (chave nova) e a antiga ficou aposentada.
    expect(await prisma.tarefa.count({ where: { chaveUnica: `medicao-exata:${a.propostaId}`, status: "ABERTA" } })).toBe(1);
    expect(await prisma.tarefa.count({ where: { projetoId: a.projetoId, chaveUnica: { contains: ":desfeita:" } } })).toBe(1);
  });

  it("repetir várias vezes não acumula nada: sempre 2 parcelas vivas, 1 aprovada", async () => {
    const m = await montar("Vai e volta");
    await enviar(m.propostaId);
    for (let i = 0; i < 3; i++) {
      await aprovar(m.propostaId, m.opcaoId);
      await desfazer(m.propostaId, { motivo: `volta ${i + 1}` });
    }
    await aprovar(m.propostaId, m.opcaoId);
    const e = await estado(m.projetoId);
    expect(e.parcelas).toHaveLength(2);
    expect(await aprovadasDoNumero(m.numero)).toBe(1);
    expect(await prisma.contaReceber.count({ where: { projetoId: m.projetoId } })).toBe(8); // 3 × 2 históricas + 2 vivas
  });
});

describe("revisões do mesmo número ao desfazer", () => {
  it("escolhendo a revisão em rascunho: ela volta a RASCUNHO, a original a ENVIADA, e a auditoria da aprovação guardou o rastro", async () => {
    const c = await cenarioDoEngano("Reabrir rascunho");
    const logAprovar = await prisma.logAuditoria.findFirstOrThrow({ where: { entidade: "Proposta", entidadeId: c.propostaId, acao: "APROVAR" } });
    expect((logAprovar.depois as { substituidas: { id: string; de: string }[] }).substituidas).toEqual([expect.objectContaining({ id: c.revId, de: "RASCUNHO" })]);
    expect((await prisma.proposta.findUniqueOrThrow({ where: { id: c.revId } })).status).toBe("SUBSTITUIDA");

    const r = await desfazer(c.propostaId, { reabrirId: c.revId });
    expect(r.reaberta).toMatchObject({ id: c.revId, revisao: 1, status: "RASCUNHO" });
    expect((await prisma.proposta.findUniqueOrThrow({ where: { id: c.revId } })).status).toBe("RASCUNHO");
    expect((await prisma.proposta.findUniqueOrThrow({ where: { id: c.propostaId } })).status).toBe("ENVIADA");
  });

  it("revisão que já tinha sido ENVIADA: volta a ENVIADA e a desfeita passa a SUBSTITUIDA (uma só vale)", async () => {
    const m = await montar("Reabrir enviada");
    await enviar(m.propostaId);
    const rev = await revisar(m.propostaId);
    await enviar(rev.id); // a original vira SUBSTITUIDA
    const revOpcao = (await prisma.opcaoProposta.findFirstOrThrow({ where: { propostaId: rev.id } })).id;
    await aprovar(rev.id, revOpcao);

    const r = await desfazer(rev.id, { reabrirId: m.propostaId });
    expect(r.statusDaDesfeita).toBe("SUBSTITUIDA");
    expect((await prisma.proposta.findUniqueOrThrow({ where: { id: m.propostaId } })).status).toBe("ENVIADA");
    expect((await prisma.proposta.findUniqueOrThrow({ where: { id: rev.id } })).status).toBe("SUBSTITUIDA");
    expect((await prisma.projeto.findUniqueOrThrow({ where: { id: m.projetoId } })).status).toBe("PROPOSTA_ENVIADA");
  });

  it("recusa reabrir a própria desfeita ou uma revisão inexistente, sem mexer em nada", async () => {
    const c = await cenarioDoEngano("Escolha inválida");
    await expect(desfazer(c.propostaId, { reabrirId: c.propostaId })).rejects.toThrow(/outra revisão/);
    await expect(desfazer(c.propostaId, { reabrirId: "nao-existe" })).rejects.toThrow(/não foi encontrada/);
    expect((await prisma.proposta.findUniqueOrThrow({ where: { id: c.propostaId } })).status).toBe("APROVADA");
  });

  it("nunca duas aprovadas do mesmo número: depois de reabrir e aprovar a revisão, a original não aprova", async () => {
    const c = await cenarioDoEngano("Uma só aprovada");
    await desfazer(c.propostaId, { reabrirId: c.revId });
    await aprovar(c.revId, c.revOpcaoId);
    expect(await aprovadasDoNumero(c.numero)).toBe(1);
    expect((await prisma.proposta.findUniqueOrThrow({ where: { id: c.propostaId } })).status).toBe("SUBSTITUIDA");
    await expect(aprovar(c.propostaId, c.opcaoId)).rejects.toThrow();
    expect(await aprovadasDoNumero(c.numero)).toBe(1);
  });

  it("desfazer e aprovar a revisão ao mesmo tempo: no máximo uma aprovada, sem deadlock e com o estado final coerente", async () => {
    const c = await cenarioDoEngano("Corrida com a irmã");
    const r = await Promise.allSettled([desfazer(c.propostaId, { reabrirId: c.revId }), aprovar(c.revId, c.revOpcaoId)]);
    // Qualquer ordem vale, mas nunca duas aprovadas e nunca erro de banco (deadlock).
    const aprovadas = await aprovadasDoNumero(c.numero);
    expect(aprovadas).toBeLessThanOrEqual(1);
    for (const x of r) if (x.status === "rejected") expect(String((x.reason as Error).message)).not.toMatch(/deadlock/i);
    expect(r.some((x) => x.status === "fulfilled")).toBe(true);
    // Estado final coerente com o desfecho: com uma aprovada, o projeto está aprovado, com as 2 parcelas e as etapas dela;
    // sem nenhuma, volta ao funil, sem parcela, etapa nem valor fechado.
    const e = await estado(c.projetoId);
    if (aprovadas === 1) {
      expect(e.projeto.status).toBe("APROVADO");
      expect(e.parcelas).toHaveLength(2);
      expect(e.etapas.length).toBeGreaterThan(0);
      expect(e.projeto.valorFechadoCentavos).toBe(1280000);
      const dona = await prisma.proposta.findFirstOrThrow({ where: { numero: c.numero, status: "APROVADA", deletadoEm: null } });
      expect(await prisma.contaReceber.count({ where: { projetoId: c.projetoId, deletadoEm: null, propostaId: dona.id } })).toBe(2);
    } else {
      expect(e.projeto.status).toBe("PROPOSTA_ENVIADA");
      expect(e.parcelas).toHaveLength(0);
      expect(e.etapas).toHaveLength(0);
      expect(e.projeto.valorFechadoCentavos).toBeNull();
    }
    expect(e.propostas.filter((p) => p[1] === "ENVIADA" || p[1] === "APROVADA").length).toBeLessThanOrEqual(1);
  });

  it("reabrir uma revisão antiga e depois enviar a mais nova: só uma fica valendo (a enviada anterior sai de vigor)", async () => {
    const m = await montar("Reabrir e enviar");
    await enviar(m.propostaId);
    const rev1 = await revisar(m.propostaId);
    await enviar(rev1.id); // a original vira SUBSTITUIDA
    const rev2 = await revisar(rev1.id); // rascunho, a partir da Rev. 1
    expect((await prisma.proposta.findUniqueOrThrow({ where: { id: m.propostaId } })).status).toBe("SUBSTITUIDA");

    await reabrir(m.propostaId); // a original volta a ENVIADA e a Rev. 1 sai de vigor
    expect((await prisma.proposta.findUniqueOrThrow({ where: { id: rev1.id } })).status).toBe("SUBSTITUIDA");

    await enviar(rev2.id); // a Rev. 2 não nasceu da original: ainda assim a original enviada tem de sair de vigor
    const status = await prisma.proposta.findMany({ where: { numero: m.numero, deletadoEm: null }, orderBy: { revisao: "asc" }, select: { revisao: true, status: true } });
    expect(status.map((x) => [x.revisao, x.status])).toEqual([[0, "SUBSTITUIDA"], [1, "SUBSTITUIDA"], [2, "ENVIADA"]]);
  });
});

describe("reabrir revisão substituída (ação própria)", () => {
  it("sem irmã aprovada: a revisão sem snapshot volta a RASCUNHO e a enviada continua valendo", async () => {
    const c = await cenarioDoEngano("Reabrir própria");
    await desfazer(c.propostaId); // só a original volta; a revisão fica substituída
    expect((await prisma.proposta.findUniqueOrThrow({ where: { id: c.revId } })).status).toBe("SUBSTITUIDA");

    const r = await reabrir(c.revId);
    expect(r).toMatchObject({ revisao: 1, status: "RASCUNHO", substituidas: 0 });
    expect((await prisma.proposta.findUniqueOrThrow({ where: { id: c.propostaId } })).status).toBe("ENVIADA");
    expect(await prisma.logAuditoria.count({ where: { entidade: "Proposta", entidadeId: c.revId, acao: "REABRIR_REVISAO" } })).toBe(1);
  });

  it("com irmã aprovada: recusa e manda desfazer ou trocar antes", async () => {
    const c = await cenarioDoEngano("Reabrir recusada");
    await expect(reabrir(c.revId)).rejects.toThrow(/está aprovada/);
    expect(await aprovadasDoNumero(c.numero)).toBe(1);
  });

  it("não reabre quem não está substituída", async () => {
    const m = await montar("Reabrir enviada recusa");
    await enviar(m.propostaId);
    await expect(reabrir(m.propostaId)).rejects.toThrow(/não está substituída/);
  });
});

describe('"partes": desfazer uma parte e manter a outra', () => {
  it("o valor fechado e a data de fechamento viram os da parte que ficou; etapas e fase não mudam", async () => {
    const a = await montar("Partes");
    await enviar(a.propostaId);
    // Segunda parte no mesmo projeto, com outro número (as duas são enviadas antes de a obra sair do funil).
    const parte2 = await prisma.$transaction(async (tx) => {
      const { numero, sequencial, ano } = await reservarNumeroDeProposta(tx);
      const p = await tx.proposta.create({
        data: {
          projetoId: a.projetoId,
          numero,
          numeroSequencial: sequencial,
          ano,
          parte: "02/02",
          data: new Date(),
          clienteNome: `${PREFIXO} Cliente`,
          opcoes: { create: [{ nome: "Opção 1", ordem: 0 }] },
          parcelas: { create: [{ ordem: 1, descricao: "Tudo", percentualPb: 10000, gatilho: "CONFIRMACAO", forma: "PIX" }] },
        },
        include: { opcoes: true },
      });
      await tx.itemProposta.create({ data: { propostaId: p.id, opcaoId: p.opcoes[0].id, ordem: 0, descricao: "ITEM P2", modoPreco: "MANUAL", valorManualCentavos: 300000, precoTotalCentavos: 300000, medidas: { create: [{ larguraMm: 1000, alturaMm: 1000, quantidade: 1 }] } } });
      return { id: p.id, opcaoId: p.opcoes[0].id };
    });
    await enviar(parte2.id);
    await aprovar(a.propostaId, a.opcaoId, "2026-11-10");
    await aprovar(parte2.id, parte2.opcaoId, "2026-11-12");
    expect((await prisma.projeto.findUniqueOrThrow({ where: { id: a.projetoId } })).valorFechadoCentavos).toBe(1280000 + 300000);
    const etapasAntes = await prisma.etapaProjeto.count({ where: { projetoId: a.projetoId, deletadoEm: null } });

    const r = await desfazer(parte2.id);
    expect(r).toMatchObject({ valorFechadoCentavos: 1280000, faseDoProjeto: "APROVADO", etapasRemovidas: 0, parcelasCanceladas: 1 });
    const projeto = await prisma.projeto.findUniqueOrThrow({ where: { id: a.projetoId } });
    expect(projeto).toMatchObject({ status: "APROVADO", valorFechadoCentavos: 1280000 });
    expect(dia(projeto.dataFechamento)).toBe("2026-11-10");
    expect(await prisma.etapaProjeto.count({ where: { projetoId: a.projetoId, deletadoEm: null } })).toBe(etapasAntes);
    expect(await prisma.contaReceber.count({ where: { propostaId: a.propostaId, deletadoEm: null } })).toBe(2); // a parte 1 segue intacta
  });
});

describe("Lixeira: o que o desfazer exclui não aparece nem volta", () => {
  it("a Lixeira só tem cadastros e projetos; restaurar o projeto não traz de volta as parcelas e etapas desfeitas", async () => {
    const m = await montar("Lixeira");
    await enviar(m.propostaId);
    await aprovar(m.propostaId, m.opcaoId);
    await desfazer(m.propostaId);

    const { TIPOS_DA_LIXEIRA } = await import("@/modules/lixeira/tipos");
    expect(TIPOS_DA_LIXEIRA.some((t) => /etapa|parcela|conta/i.test(t))).toBe(false);

    await prisma.projeto.update({ where: { id: m.projetoId }, data: { deletadoEm: new Date() } });
    await restaurarDaLixeira({ usuario, tipo: "projetos", ids: [m.projetoId] });
    expect((await prisma.projeto.findUniqueOrThrow({ where: { id: m.projetoId } })).deletadoEm).toBeNull();
    expect(await prisma.etapaProjeto.count({ where: { projetoId: m.projetoId, deletadoEm: null } })).toBe(0);
    expect(await prisma.contaReceber.count({ where: { projetoId: m.projetoId, deletadoEm: null } })).toBe(0);
  });
});

// ------------------------------------------------------------------------------------------------------------------
// Bloco 3: trocar a aprovação e prévias
// ------------------------------------------------------------------------------------------------------------------

const trocar = (deId: string, paraId: string, opcaoId: string, extra: { aceitaEm?: string; motivo?: string } = {}) =>
  prisma.$transaction((tx) => trocarAprovacao(tx, { usuario, deId, paraId, opcaoId, forma: "WHATSAPP", aceitaEm: extra.aceitaEm ?? "2026-11-16", motivo: extra.motivo ?? "Aprovei a original por engano" }), { timeout: 30_000 });

/** A revisão em rascunho do caso real: outro valor e outro prazo (por etapa). */
async function ajustarRevisao(revId: string, valores: number[], prazo: PrazoDaProposta = PRAZO_DA_REVISAO) {
  const itens = await prisma.itemProposta.findMany({ where: { propostaId: revId, deletadoEm: null }, orderBy: { ordem: "asc" } });
  for (const [i, it] of itens.entries()) await prisma.itemProposta.update({ where: { id: it.id }, data: { valorManualCentavos: valores[i], precoTotalCentavos: valores[i] } });
  await prisma.proposta.update({ where: { id: revId }, data: prazo });
}

describe("trocar a aprovação (desfazer a original e aprovar a revisão, numa transação só)", () => {
  it("o caso real: a revisão passa a valer; parcelas, tarefas e valor fechado são os dela; a fase não faz ida e volta", async () => {
    const c = await cenarioDoEngano("Troca simples");
    await ajustarRevisao(c.revId, [1000000, 80000]);
    const fasesAntes = await prisma.historicoFaseProjeto.count({ where: { projetoId: c.projetoId } });

    const r = await trocar(c.propostaId, c.revId, c.revOpcaoId);
    expect(r).toMatchObject({ valorAprovadoCentavos: 1080000, parcelasGeradas: 2, valorFechadoCentavos: 1080000 });
    expect(r.etapasGeradas).toBeGreaterThan(0);

    const original = await prisma.proposta.findUniqueOrThrow({ where: { id: c.propostaId } });
    const revisao = await prisma.proposta.findUniqueOrThrow({ where: { id: c.revId } });
    expect(original).toMatchObject({ status: "SUBSTITUIDA", aceitaEm: null, valorAprovadoCentavos: null });
    expect(revisao).toMatchObject({ status: "APROVADA", valorAprovadoCentavos: 1080000, formaAceite: "WHATSAPP", opcaoAprovadaId: c.revOpcaoId });
    expect(revisao.snapshot).not.toBeNull(); // aprovar um rascunho congela antes
    expect(await aprovadasDoNumero(c.numero)).toBe(1);

    const projeto = await prisma.projeto.findUniqueOrThrow({ where: { id: c.projetoId } });
    expect(projeto).toMatchObject({ status: "APROVADO", valorFechadoCentavos: 1080000 });
    expect(dia(projeto.dataFechamento)).toBe("2026-11-16");
    expect(await prisma.historicoFaseProjeto.count({ where: { projetoId: c.projetoId } })).toBe(fasesAntes); // sem estado intermediário

    const vivas = await prisma.contaReceber.findMany({ where: { projetoId: c.projetoId, deletadoEm: null }, orderBy: { ordem: "asc" } });
    expect(vivas.map((x) => [x.propostaId, x.valorCentavos])).toEqual([[c.revId, 540000], [c.revId, 540000]]);
    expect(await prisma.contaReceber.count({ where: { projetoId: c.projetoId, deletadoEm: { not: null }, status: "CANCELADA", propostaId: null } })).toBe(2); // as da original, como histórico

    expect(await prisma.tarefa.count({ where: { chaveUnica: `medicao-exata:${c.revId}`, status: "ABERTA" } })).toBe(1);
    expect(await prisma.tarefa.count({ where: { projetoId: c.projetoId, tipo: "AGENDAR_MEDICAO", status: "ABERTA" } })).toBe(1);
    expect(await prisma.logAuditoria.count({ where: { entidade: "Proposta", entidadeId: c.revId, acao: "TROCAR_APROVACAO" } })).toBe(1);
    expect(await prisma.interacao.count({ where: { projetoId: c.projetoId, texto: { contains: "Aprovação trocada" } } })).toBe(1);
  });

  it("etapas e prazo são REFEITOS com o prazo da revisão: o resultado é igual ao de aprovar a revisão direto", async () => {
    const c = await cenarioDoEngano("Troca com outro prazo");
    await ajustarRevisao(c.revId, [1000000, 80000], PRAZO_DA_REVISAO);
    const antes = await estado(c.projetoId);
    expect(antes.projeto.prazo.slice(0, 2)).toEqual(["TOTAL", 35]); // o prazo da original

    await trocar(c.propostaId, c.revId, c.revOpcaoId);

    // Gêmeo: um projeto que aprova direto uma proposta com o mesmo conteúdo e o mesmo prazo da revisão.
    const g = await montar("Gêmeo da revisão", [1000000, 80000], PRAZO_DA_REVISAO);
    await enviar(g.propostaId);
    await aprovar(g.propostaId, g.opcaoId);

    const trocado = await estado(c.projetoId);
    const gemeo = await estado(g.projetoId);
    expect(trocado.etapas.length).toBeGreaterThan(0);
    expect(trocado.projeto.prazo.slice(0, 5)).toEqual(["POR_ETAPA", 23, 10, 5, 8]);
    expect(trocado.etapas).not.toEqual(antes.etapas); // as datas mudaram junto com o prazo
    const semPropostas = (e: Awaited<ReturnType<typeof estado>>) => Object.fromEntries(Object.entries(e).filter(([k]) => k !== "propostas"));
    expect(semPropostas(trocado)).toEqual(semPropostas(gemeo));
    // As etapas antigas não somem de vista: ficaram como excluídas (nenhuma viva repetida).
    expect(await prisma.etapaProjeto.count({ where: { projetoId: c.projetoId, deletadoEm: { not: null } } })).toBe(antes.etapas.length);
  });

  it("tudo ou nada: com recebimento na parcela da original, a troca é recusada e NADA muda", async () => {
    const c = await cenarioDoEngano("Troca bloqueada");
    const antes = await estado(c.projetoId);
    const parcela1 = await prisma.contaReceber.findFirstOrThrow({ where: { propostaId: c.propostaId, ordem: 1 } });
    await prisma.$transaction((tx) =>
      registrarRecebimento(tx, { contaReceberId: parcela1.id, data: dataLocalDoInstante(new Date()), valorCentavos: 50000, contaFinanceiraId, categoriaId: categoriaReceitaId, forma: "PIX", comNotaFiscal: false, observacao: null }, ctxFinanceiro()),
    );
    const comRecebimento = await estado(c.projetoId);

    await expect(trocar(c.propostaId, c.revId, c.revOpcaoId)).rejects.toThrow(/parcela 1 já tem recebimento/);
    expect(await estado(c.projetoId)).toEqual(comRecebimento);
    expect(comRecebimento.propostas).toEqual(antes.propostas);
    expect(await prisma.tarefa.count({ where: { chaveUnica: `medicao-exata:${c.propostaId}`, status: "ABERTA" } })).toBe(1);
  });

  it("tudo ou nada: revisão em rascunho incompleta (item sem valor) recusa a troca e a original continua aprovada, intacta", async () => {
    const c = await cenarioDoEngano("Troca incompleta");
    await ajustarRevisao(c.revId, [0, 80000]);
    const antes = await estado(c.projetoId);

    await expect(trocar(c.propostaId, c.revId, c.revOpcaoId)).rejects.toThrow(/sem valor/);
    expect(await estado(c.projetoId)).toEqual(antes);
    expect(await prisma.contaReceber.count({ where: { propostaId: c.propostaId, deletadoEm: null } })).toBe(2);
    expect(await prisma.etapaProjeto.count({ where: { projetoId: c.projetoId, deletadoEm: { not: null } } })).toBe(0); // nenhuma etapa saiu
    expect(await prisma.logAuditoria.count({ where: { entidade: "Proposta", entidadeId: c.propostaId, acao: "DESFAZER_APROVACAO" } })).toBe(0);
  });

  it("recusa o que não faz sentido: própria proposta, números diferentes, proposta que não está aprovada", async () => {
    const c = await cenarioDoEngano("Troca inválida");
    const outra = await montar("Troca outro número");
    await enviar(outra.propostaId);
    await expect(trocar(c.propostaId, c.propostaId, c.opcaoId)).rejects.toThrow(/outra revisão/);
    await expect(trocar(c.propostaId, outra.propostaId, outra.opcaoId)).rejects.toThrow(/mesmo número/);
    await expect(trocar(c.revId, c.propostaId, c.opcaoId)).rejects.toThrow(/não está aprovada/);
    expect((await prisma.proposta.findUniqueOrThrow({ where: { id: c.propostaId } })).status).toBe("APROVADA");
  });

  it("duas pessoas trocando ao mesmo tempo: exatamente um sucesso, uma aprovada e só as parcelas da revisão", async () => {
    const c = await cenarioDoEngano("Troca concorrente");
    const r = await Promise.allSettled([trocar(c.propostaId, c.revId, c.revOpcaoId), trocar(c.propostaId, c.revId, c.revOpcaoId)]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    for (const x of r) if (x.status === "rejected") expect(String((x.reason as Error).message)).not.toMatch(/deadlock/i);
    expect(await aprovadasDoNumero(c.numero)).toBe(1);
    expect(await prisma.contaReceber.count({ where: { projetoId: c.projetoId, deletadoEm: null } })).toBe(2);
    expect(await prisma.logAuditoria.count({ where: { entidade: "Proposta", entidadeId: c.revId, acao: "TROCAR_APROVACAO" } })).toBe(1);
  });
});

describe("prévias: o que a tela mostra bate com o que acontece", () => {
  it("prévia do desfazer: bloqueios, efeitos, revisões que podem voltar e o padrão (a mais recente)", async () => {
    const c = await cenarioDoEngano("Prévia desfazer");
    const p = await previaDoDesfazer(prisma, c.propostaId);
    expect(p).toMatchObject({ aprovada: true, bloqueios: [] });
    expect(p.aceite).toMatchObject({ aceitaEm: "2026-11-16", forma: "WHATSAPP", valorCentavos: 1280000 });
    expect(p.efeitos).toMatchObject({ parcelas: 2, tarefas: 1, valorFechadoDepoisCentavos: null, faseDepois: "PROPOSTA_ENVIADA", etapasMantidasPorOutraParte: false });
    expect(p.efeitos.etapasRemovidas).toBeGreaterThan(0);
    expect(p.revisoes).toEqual([expect.objectContaining({ id: c.revId, revisao: 1, voltaComo: "RASCUNHO" })]);
    expect(p.padraoReabrirId).toBe(c.revId);

    // O que a prévia diz é o que acontece.
    const r = await desfazer(c.propostaId, { reabrirId: p.padraoReabrirId });
    expect(r).toMatchObject({ parcelasCanceladas: p.efeitos.parcelas, etapasRemovidas: p.efeitos.etapasRemovidas, tarefasCanceladas: p.efeitos.tarefas, faseDoProjeto: p.efeitos.faseDepois });
  });

  it("prévia do desfazer lista os bloqueios", async () => {
    const m = await montar("Prévia bloqueio");
    await enviar(m.propostaId);
    await aprovar(m.propostaId, m.opcaoId);
    await prisma.compra.create({ data: { numero: proximoNumeroDeCompra++, fornecedorId, destino: "OBRA", projetoId: m.projetoId, status: "RASCUNHO" } });
    const p = await previaDoDesfazer(prisma, m.propostaId);
    expect(p.bloqueios.map((b) => b.codigo)).toEqual(["COMPRA"]);
  });

  it("prévia da troca: parcelas, valor fechado, etapas e prazo antes e depois; e o resultado real é o mesmo", async () => {
    const c = await cenarioDoEngano("Prévia troca");
    await ajustarRevisao(c.revId, [1000000, 80000], PRAZO_DA_REVISAO);

    const p = await previaDaTroca(prisma, { deId: c.propostaId, paraId: c.revId });
    expect(p).toMatchObject({ erro: null, bloqueios: [], problemasDaRevisao: [], deRotulo: "original", paraRotulo: "Rev. 1", aceite: { aceitaEm: "2026-11-16", forma: "WHATSAPP" } });
    expect(p.opcoes).toEqual([expect.objectContaining({ id: c.revOpcaoId, totalCentavos: 1080000 })]);
    expect(p.opcaoPadraoId).toBe(c.revOpcaoId);
    expect(p.parcelas.antes.map((x) => x.valorCentavos)).toEqual([640000, 640000]);
    expect(p.parcelas.depois.map((x) => x.valorCentavos)).toEqual([540000, 540000]);
    expect(p.valorFechado).toEqual({ antesCentavos: 1280000, depoisCentavos: 1080000 });
    expect(p.etapas.prazoAntes).toMatch(/^35 dias (úteis|corridos)$/);
    expect(p.etapas.prazoDepois).toMatch(/^23 dias (úteis|corridos) \(material 10 \+ execução 5 \+ vidros e acabamento 8\)$/);
    expect(p.etapas.removidas).toBeGreaterThan(0);
    expect(p.tarefas.canceladas).toBe(1);

    await trocar(c.propostaId, c.revId, c.revOpcaoId);
    const depois = await estado(c.projetoId);
    expect(depois.parcelas.map((x) => x[1])).toEqual(p.parcelas.depois.map((x) => x.valorCentavos));
    expect(depois.projeto.valorFechadoCentavos).toBe(p.valorFechado.depoisCentavos);
  });

  it("prévia da troca avisa o que falta na revisão em rascunho e o que não faz sentido", async () => {
    const c = await cenarioDoEngano("Prévia incompleta");
    await ajustarRevisao(c.revId, [0, 80000]);
    const p = await previaDaTroca(prisma, { deId: c.propostaId, paraId: c.revId });
    expect(p.problemasDaRevisao.join(" ")).toMatch(/sem valor/);
    expect((await previaDaTroca(prisma, { deId: c.revId, paraId: c.propostaId })).erro).toMatch(/não está aprovada/);
  });
});

describe("indicadores depois de desfazer e de trocar (Vendido pela data do aceite)", () => {
  const JUN: Periodo = { de: "2020-06-01", ate: "2020-06-30" };
  const JUL: Periodo = { de: "2020-07-01", ate: "2020-07-31" };
  const EM_SP = (coluna: string) => `((${coluna} AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')::date`;

  /** Soma independente (SQL cru, outra conexão), como o teste do painel. */
  const vendidoSql = (p: Periodo) =>
    comConexao(async (c) => {
      const r = await c.query<{ total: string }>(
        `SELECT COALESCE(sum(pr."valorAprovadoCentavos"), 0)::text AS total FROM "Proposta" pr JOIN "Projeto" j ON j.id = pr."projetoId"
          WHERE pr.status = 'APROVADA' AND pr."deletadoEm" IS NULL AND j."deletadoEm" IS NULL AND ${EM_SP(`pr."aceitaEm"`)} BETWEEN $1::date AND $2::date`,
        [p.de, p.ate],
      );
      return Number(r.rows[0].total);
    });
  const foto = async () => ({ jun: await vendidoNoPeriodo(JUN), jul: await vendidoNoPeriodo(JUL), junSql: await vendidoSql(JUN), julSql: await vendidoSql(JUL) });

  it("aceite do último dia do mês: conta no mês; desfazer tira; trocar com aceite no mês seguinte move a venda; painel = lista = SQL", async () => {
    const base = await foto();
    const m = await montar("Vendido jun");
    await enviar(m.propostaId);
    const rev = await revisar(m.propostaId);
    const revOpcao = (await prisma.opcaoProposta.findFirstOrThrow({ where: { propostaId: rev.id } })).id;
    await ajustarRevisao(rev.id, [1000000, 80000], PRAZO_ORIGINAL);
    await aprovar(m.propostaId, m.opcaoId, "2020-06-30");

    let f = await foto();
    expect(f.jun.totalCentavos - base.jun.totalCentavos).toBe(1280000);
    expect(f.junSql - base.junSql).toBe(1280000);
    expect(f.jun.totalCentavos).toBe(f.junSql);
    expect((await listarVendas(JUN)).linhas.some((l) => l.id === m.propostaId)).toBe(true);

    // Desfazer: foi engano de operação, deixa de contar (decisão 126).
    const previa = await previaDoDesfazer(prisma, m.propostaId, new Date("2026-11-16T12:00:00Z"));
    expect(previa.avisoDeMes).toContain("junho/2020");
    await desfazer(m.propostaId, { reabrirId: rev.id });
    f = await foto();
    expect(f.jun.totalCentavos).toBe(base.jun.totalCentavos);
    expect(f.junSql).toBe(base.junSql);
    expect((await listarVendas(JUN)).linhas.some((l) => l.id === m.propostaId)).toBe(false);
    expect((await prisma.projeto.findUniqueOrThrow({ where: { id: m.projetoId } })).dataFechamento).toBeNull();

    // Aprovar a revisão de novo, agora com aceite em julho (por troca a partir da original reaprovada).
    await aprovar(m.propostaId, m.opcaoId, "2020-06-30");
    await trocar(m.propostaId, rev.id, revOpcao, { aceitaEm: "2020-07-01" });
    f = await foto();
    expect(f.jun.totalCentavos).toBe(base.jun.totalCentavos);
    expect(f.jul.totalCentavos - base.jul.totalCentavos).toBe(1080000);
    expect(f.julSql - base.julSql).toBe(1080000);
    expect(f.jul.totalCentavos).toBe(f.julSql);
    const lista = await listarVendas(JUL);
    expect(lista.linhas.some((l) => l.id === rev.id)).toBe(true);
    expect(lista.linhas.some((l) => l.id === m.propostaId)).toBe(false);
    expect(lista.linhas.filter((l) => l.projetoId === m.projetoId).reduce((s, l) => s + l.valorCentavos, 0)).toBe(1080000);
    expect(dia((await prisma.projeto.findUniqueOrThrow({ where: { id: m.projetoId } })).dataFechamento)).toBe("2020-07-01");
  });
});

// ------------------------------------------------------------------------------------------------------------------
// Concorrência: receber uma parcela × desfazer a aprovação (Fase 7B, Bloco 5k(3))
//
// A ordem das travas tem de ser a mesma nos dois: Projeto → parcelas. Antes da correção o recebimento travava a parcela e
// DEPOIS pegava a chave do Projeto (pela chave estrangeira do lançamento), e o desfazer fazia o contrário: deadlock.
// O intervalo é provocado de forma DETERMINÍSTICA, sem depender de sorte: o teste segura a linha da ContaFinanceira (que é
// DELE, com prefixo; nunca uma conta real) e o lançamento do recebimento fica esperando por ela, já com a parcela travada.
// ------------------------------------------------------------------------------------------------------------------

describe("receber uma parcela e desfazer a aprovação ao mesmo tempo (ordem única de travas)", () => {
  let contaDaCorridaId: string;

  beforeAll(async () => {
    contaDaCorridaId = (await prisma.contaFinanceira.create({ data: { nome: `${PREFIXO} Caixa da corrida` } })).id;
  });

  type Desfecho = { ok: true } | { ok: false; erro: unknown };
  const desfecho = (p: Promise<unknown>): Promise<Desfecho> => p.then(() => ({ ok: true as const }), (erro: unknown) => ({ ok: false as const, erro }));
  const mensagem = (d: Desfecho) => (d.ok ? "" : d.erro instanceof Error ? d.erro.message : String(d.erro));

  /** Espera (até `ms`) o banco mostrar uma sessão presa numa trava cuja consulta combina com o padrão. */
  async function esperarBloqueio(c: Client, padrao: RegExp, ms = 10_000): Promise<boolean> {
    const limite = Date.now() + ms;
    while (Date.now() < limite) {
      const r = await c.query<{ query: string }>(`SELECT query FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()`);
      if (r.rows.some((l) => padrao.test(l.query))) return true;
      await new Promise((res) => setTimeout(res, 100));
    }
    return false;
  }

  const receberParcela = (contaReceberId: string) =>
    prisma.$transaction(
      (tx) => registrarRecebimento(tx, { contaReceberId, data: dataLocalDoInstante(new Date()), valorCentavos: 100000, contaFinanceiraId: contaDaCorridaId, categoriaId: categoriaReceitaId, forma: "PIX", comNotaFiscal: false, observacao: null }, ctxFinanceiro()),
      { timeout: 60_000, maxWait: 30_000 }, // maxWait: a máquina ocupada não pode derrubar a corrida por falta de vaga no pool
    );

  const desfazerSemPressa = (propostaId: string) =>
    prisma.$transaction((tx) => desfazerAprovacao(tx, { usuario, propostaId, motivo: "Aprovei por engano", reabrirId: null }), { timeout: 60_000, maxWait: 30_000 });

  /** O recebimento chega primeiro e fica parado no lançamento (já com a parcela travada); o desfazer chega no meio. */
  async function receberChegaPrimeiro(titulo: string) {
    const c = await cenarioDoEngano(titulo);
    const parcela = await prisma.contaReceber.findFirstOrThrow({ where: { propostaId: c.propostaId, ordem: 1 } });
    return comConexao(async (trava) => {
      await trava.query("BEGIN");
      try {
        await trava.query(`SELECT id FROM "ContaFinanceira" WHERE id = $1 FOR UPDATE`, [contaDaCorridaId]);
        const receber = desfecho(receberParcela(parcela.id));
        await esperarBloqueio(trava, /INSERT INTO\s+"?public"?\."?Lancamento"?/i); // o recebimento está esperando a conta financeira
        const desfazerAprovacao = desfecho(desfazerSemPressa(c.propostaId));
        await esperarBloqueio(trava, /FOR (KEY SHARE|UPDATE)/i); // o desfazer também parou numa trava
        await trava.query("ROLLBACK"); // solta a conta financeira: o recebimento segue e a corrida acontece
        const [r, d] = await Promise.all([receber, desfazerAprovacao]);
        return { c, parcela, r, d };
      } finally {
        await trava.query("ROLLBACK").catch(() => undefined);
      }
    });
  }

  /** O desfazer chega primeiro e fica parado numa etapa (travada pelo teste); o recebimento chega no meio. */
  async function desfazerChegaPrimeiro(titulo: string) {
    const c = await cenarioDoEngano(titulo);
    const parcela = await prisma.contaReceber.findFirstOrThrow({ where: { propostaId: c.propostaId, ordem: 1 } });
    const etapa = await prisma.etapaProjeto.findFirstOrThrow({ where: { projetoId: c.projetoId, deletadoEm: null } });
    return comConexao(async (trava) => {
      await trava.query("BEGIN");
      try {
        await trava.query(`SELECT id FROM "EtapaProjeto" WHERE id = $1 FOR UPDATE`, [etapa.id]);
        const desfazerAprovacao = desfecho(desfazerSemPressa(c.propostaId));
        await esperarBloqueio(trava, /"EtapaProjeto"[\s\S]*FOR UPDATE/i); // o desfazer já travou o projeto e a parcela e espera a etapa
        const receber = desfecho(receberParcela(parcela.id));
        await esperarBloqueio(trava, /"Projeto"[\s\S]*FOR KEY SHARE|"ContaReceber"[\s\S]*FOR UPDATE/i); // o recebimento chegou e parou
        await trava.query("ROLLBACK");
        const [r, d] = await Promise.all([receber, desfazerAprovacao]);
        return { c, parcela, r, d };
      } finally {
        await trava.query("ROLLBACK").catch(() => undefined);
      }
    });
  }

  it("20 corridas, cada uma com obra nova: sem deadlock; o recebimento termina e o desfazer é recusado por 'já tem recebimento'", async () => {
    const problemas: string[] = [];
    for (let i = 1; i <= 20; i++) {
      const { c, parcela, r, d } = await receberChegaPrimeiro(`Corrida receber primeiro ${i}`);
      const deadlocks = [r, d].filter((x) => !x.ok && ehDeadlock(x.erro)).length;
      if (deadlocks > 0) problemas.push(`#${i}: deadlock (${[r, d].map((x) => (x.ok ? "ok" : mensagem(x).slice(0, 60))).join(" | ")})`);
      else if (!r.ok) problemas.push(`#${i}: o recebimento falhou: ${mensagem(r).slice(0, 80)}`);
      else if (d.ok || !/parcela 1 já tem recebimento/.test(mensagem(d))) problemas.push(`#${i}: o desfazer devia ser recusado por recebimento: ${d.ok ? "passou" : mensagem(d).slice(0, 80)}`);
      else if ((await prisma.lancamento.count({ where: { contaReceberId: parcela.id, estornadoEm: null } })) !== 1 || (await aprovadasDoNumero(c.numero)) !== 1) problemas.push(`#${i}: estado final incoerente`);
    }
    expect(problemas, `corridas com problema (${problemas.length} de 20)`).toEqual([]);
  }, 900_000);

  it("o desfazer termina antes e o recebimento é recusado, em português simples (parcela removida), sem gravar nada", async () => {
    const { c, parcela, r, d } = await desfazerChegaPrimeiro("Corrida desfazer primeiro");
    expect(d, `desfazer: ${mensagem(d)}`).toEqual({ ok: true });
    expect(r.ok).toBe(false);
    expect(mensagem(r)).toMatch(/foi removida|não existe mais/);
    expect(mensagem(r)).toMatch(/aprovação/);
    expect(ehDeadlock((r as { erro: unknown }).erro)).toBe(false);
    expect(await prisma.lancamento.count({ where: { contaReceberId: parcela.id } })).toBe(0);
    expect(await prisma.proposta.findUniqueOrThrow({ where: { id: c.propostaId } })).toMatchObject({ status: "ENVIADA" }); // o desfazer valeu
  }, 120_000);
});
