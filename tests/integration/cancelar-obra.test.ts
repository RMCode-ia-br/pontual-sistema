import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { UsuarioSessao } from "@/lib/auth/sessao";
import { criarClientePrisma } from "@/lib/db/criar-cliente";
import { dataLocalDoInstante } from "@/lib/formatadores";
import { cancelarObraAprovada, previaDoCancelamento } from "@/modules/obras/servico-cancelar";
import { vendidoNoPeriodo } from "@/modules/indicadores/vendas";
import { listarCancelamentos } from "@/modules/indicadores/cancelamentos";
import { registrarRecebimento } from "@/modules/financeiro/servico-receber";
import { proximoCodigoDoProjeto } from "@/modules/projetos/servico";
import { aprovarProposta, enviarProposta } from "@/modules/propostas/servico-ciclo";
import { reservarNumeroDeProposta } from "@/modules/propostas/servico";

import { comConexao, criarUsuarioDeTeste } from "./banco-teste";

/**
 * Fase 7C, Bloco 8: cancelar obra já aprovada. Só toca registros com o prefixo "Int Canc" (nunca dados reais) e devolve o
 * contador de propostas e de projetos ao que era. Os dois contadores do mês não mudam: o cancelamento não anula a venda.
 */
const PREFIXO = "Int Canc";
const LOGIN = "int-cancelar";
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
  produtoId = (await prisma.produto.create({ data: { codigo: "INT-CANC-1", descricao: `${PREFIXO} Produto` } })).id;
});

afterAll(async () => {
  await limpar();
  await comConexao((c) => c.query(`UPDATE "ConfiguracaoEmpresa" SET "proximoNumeroProposta" = $1, "anoNumeracaoProposta" = $2 WHERE id = 'singleton'`, [contador.proximo, contador.ano]));
  await prisma.$disconnect();
});

/** Projeto + proposta rascunho com uma opção, dois itens manuais e cronograma 50% na confirmação / 50% na entrega. */
type PrazoDaProposta = { modoPrazo: "TOTAL" | "POR_ETAPA"; prazoTotalMinDias?: number | null; prazoTotalMaxDias?: number | null; prazoMaterialDias?: number | null; prazoExecucaoDias?: number | null; prazoVidrosDias?: number | null };
const PRAZO_ORIGINAL: PrazoDaProposta = { modoPrazo: "TOTAL", prazoTotalMaxDias: 35 };

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
const aprovar = (propostaId: string, opcaoId: string, aceitaEm = "2026-11-16") =>
  prisma.$transaction((tx) => aprovarProposta(tx, { usuario, propostaId, opcaoId, forma: "WHATSAPP", aceitaEm }), { timeout: 30_000 });


const ctxFinanceiro = () => ({ usuario: usuario as unknown as UsuarioSessao, ip: null });
const cancelar = (projetoId: string, motivo = "Cliente desistiu da obra") => prisma.$transaction((tx) => cancelarObraAprovada(tx, { usuario, projetoId, motivo }), { timeout: 30_000 });

async function aprovada(titulo: string) {
  const m = await montar(titulo);
  await enviar(m.propostaId);
  await aprovar(m.propostaId, m.opcaoId);
  return m;
}

describe("cancelar obra aprovada (banco real, registros de teste)", () => {
  it("cancela: projeto CANCELADO com histórico, proposta continua APROVADA, parcelas e tarefas canceladas, linha do tempo e auditoria", async () => {
    const m = await aprovada("Cancela tudo");
    const previa = await previaDoCancelamento(prisma, m.projetoId);
    expect(previa.bloqueios).toEqual([]);
    expect(previa.plano.parcelasACancelar.map((p) => p.ordem)).toEqual([1, 2]);
    expect(previa.plano.tarefasACancelar).toBeGreaterThanOrEqual(1);

    const r = await cancelar(m.projetoId);
    expect(r).toMatchObject({ parcelasCanceladas: 2, parcelasQueFicam: 0 });

    const projeto = await prisma.projeto.findUniqueOrThrow({ where: { id: m.projetoId } });
    expect(projeto.status).toBe("CANCELADO");
    expect((await prisma.historicoFaseProjeto.findMany({ where: { projetoId: m.projetoId, para: "CANCELADO" } })).length).toBe(1);

    // A venda NÃO some: a proposta continua aprovada, com o valor.
    expect(await prisma.proposta.findUniqueOrThrow({ where: { id: m.propostaId } })).toMatchObject({ status: "APROVADA", valorAprovadoCentavos: 1280000 });
    expect(projeto.valorFechadoCentavos).toBe(1280000);

    const contas = await prisma.contaReceber.findMany({ where: { projetoId: m.projetoId }, orderBy: { ordem: "asc" } });
    expect(contas.map((c) => [c.ordem, c.status, c.deletadoEm === null])).toEqual([[1, "CANCELADA", true], [2, "CANCELADA", true]]);
    expect(contas[0]!.observacao).toContain("Cancelada com a obra: Cliente desistiu da obra");
    expect(await prisma.tarefa.count({ where: { projetoId: m.projetoId, status: "ABERTA", deletadoEm: null } })).toBe(0);

    const interacoes = await prisma.interacao.findMany({ where: { projetoId: m.projetoId, tipo: "SISTEMA" }, select: { texto: true } });
    expect(interacoes.some((i) => i.texto.includes("cancelada. Motivo: Cliente desistiu da obra"))).toBe(true);
    const log = await prisma.logAuditoria.findMany({ where: { entidade: "Projeto", entidadeId: m.projetoId, acao: "CANCELAR_OBRA" } });
    expect(log).toHaveLength(1);
    expect(JSON.stringify(log[0]!.depois)).toContain("Cliente desistiu da obra");
  });

  it("a venda do mês da aprovação continua contada e o cancelamento aparece na linha própria", async () => {
    const hoje = dataLocalDoInstante(new Date());
    const periodo = { de: `${hoje.slice(0, 8)}01`, ate: hoje };
    const m = await montar("Vendido continua");
    await enviar(m.propostaId);
    await aprovar(m.propostaId, m.opcaoId, hoje);
    const antes = await vendidoNoPeriodo(periodo);
    expect(antes.totalCentavos).toBeGreaterThanOrEqual(1280000);

    await cancelar(m.projetoId);
    expect((await vendidoNoPeriodo(periodo)).totalCentavos).toBe(antes.totalCentavos);
    const { linhas } = await listarCancelamentos(periodo);
    const linha = linhas.find((l) => l.projetoId === m.projetoId);
    expect(linha?.valorAprovadoCentavos).toBe(1280000);
  });

  it("parcela com recebimento FICA (o dinheiro não é mexido) e a prévia e o resultado avisam do estorno à parte", async () => {
    const m = await aprovada("Com recebimento");
    const parcela1 = await prisma.contaReceber.findFirstOrThrow({ where: { projetoId: m.projetoId, ordem: 1 } });
    await prisma.$transaction((tx) =>
      registrarRecebimento(tx, { contaReceberId: parcela1.id, data: dataLocalDoInstante(new Date()), valorCentavos: 100000, contaFinanceiraId, categoriaId: categoriaReceitaId, forma: "PIX", comNotaFiscal: false, observacao: null }, ctxFinanceiro()),
    );
    const previa = await previaDoCancelamento(prisma, m.projetoId);
    expect(previa.plano.parcelasQueFicam).toEqual([{ ordem: 1, valorPagoCentavos: 100000 }]);
    expect(previa.plano.avisos.find((a) => a.codigo === "RECEBIDO")?.texto).toMatch(/NÃO devolve dinheiro/);

    const r = await cancelar(m.projetoId);
    expect(r).toMatchObject({ parcelasCanceladas: 1, parcelasQueFicam: 1, valorRecebidoCentavos: 100000 });
    const contas = await prisma.contaReceber.findMany({ where: { projetoId: m.projetoId }, orderBy: { ordem: "asc" } });
    expect(contas.map((c) => [c.ordem, c.status, c.valorPagoCentavos])).toEqual([[1, "PARCIAL", 100000], [2, "CANCELADA", 0]]);
    const lancamentos = await prisma.lancamento.findMany({ where: { projetoId: m.projetoId } });
    expect(lancamentos).toHaveLength(1);
    expect(lancamentos[0]!.estornadoEm).toBeNull(); // o recebimento não foi estornado
  });

  it("compra e saída de estoque NÃO são desfeitas: só avisadas", async () => {
    const m = await aprovada("Com compra");
    const compra = await prisma.compra.create({ data: { numero: proximoNumeroDeCompra++, fornecedorId, destino: "OBRA", projetoId: m.projetoId, status: "PEDIDO" } });
    await prisma.movimentoEstoque.create({ data: { produtoId, tipo: "SAIDA_OBRA", quantidade: 2, data: new Date("2026-11-17T00:00:00Z"), projetoId: m.projetoId } });
    const previa = await previaDoCancelamento(prisma, m.projetoId);
    expect(previa.bloqueios).toEqual([]);
    expect(previa.plano.avisos.map((a) => a.codigo)).toEqual(expect.arrayContaining(["COMPRA", "ESTOQUE"]));

    const r = await cancelar(m.projetoId);
    expect(r.avisos.map((a) => a.codigo)).toEqual(expect.arrayContaining(["COMPRA", "ESTOQUE"]));
    expect((await prisma.compra.findUniqueOrThrow({ where: { id: compra.id } })).status).toBe("PEDIDO");
    expect(await prisma.movimentoEstoque.count({ where: { projetoId: m.projetoId, estornoDeId: { not: null } } })).toBe(0);
  });

  it("obra concluída e obra já cancelada são recusadas, e nada muda", async () => {
    const m = await aprovada("Concluida");
    await prisma.projeto.update({ where: { id: m.projetoId }, data: { status: "CONCLUIDO" } });
    await expect(cancelar(m.projetoId)).rejects.toThrow(/já foi concluída/);
    expect((await prisma.contaReceber.findMany({ where: { projetoId: m.projetoId } })).every((c) => c.status !== "CANCELADA")).toBe(true);

    const n = await aprovada("Duas vezes");
    await cancelar(n.projetoId);
    await expect(cancelar(n.projetoId)).rejects.toThrow(/já está cancelada/);
    expect(await prisma.historicoFaseProjeto.count({ where: { projetoId: n.projetoId, para: "CANCELADO" } })).toBe(1);
  });

  it("projeto ainda não aprovado não pode ser cancelado por aqui; motivo curto é recusado", async () => {
    const m = await montar("Nao aprovado");
    await enviar(m.propostaId);
    await expect(cancelar(m.projetoId)).rejects.toThrow(/ainda não foi aprovado/);
    const n = await aprovada("Motivo curto");
    await expect(cancelar(n.projetoId, "x")).rejects.toThrow(/motivo/i);
    expect((await prisma.projeto.findUniqueOrThrow({ where: { id: n.projetoId } })).status).toBe("APROVADO");
  });

  it("duas tentativas ao mesmo tempo: uma cancela, a outra é recusada (sem duplicar histórico)", async () => {
    const m = await aprovada("Corrida");
    const resultados = await Promise.allSettled([cancelar(m.projetoId), cancelar(m.projetoId)]);
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.historicoFaseProjeto.count({ where: { projetoId: m.projetoId, para: "CANCELADO" } })).toBe(1);
  });
});
