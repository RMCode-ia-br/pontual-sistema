import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { criarClientePrisma } from "@/lib/db/criar-cliente";
import { compararRevisoes, type ConteudoComparavel } from "@/lib/dominio/ciclo-proposta";
import { proximoCodigoDoProjeto } from "@/modules/projetos/servico";
import type { ConteudoProposta } from "@/modules/propostas/conteudo";
import { reservarNumeroDeProposta } from "@/modules/propostas/servico";
import { aprovarProposta, construirConteudo, copiarProposta, enviarProposta, MENSAGEM_APROVACAO_EM_PREPARO, problemasDaProposta } from "@/modules/propostas/servico-ciclo";

import { comConexao, criarUsuarioDeTeste } from "./banco-teste";

// Fase 3.6a, Bloco 3: formas de pagamento no snapshot, no envio e na cópia de revisão. Tudo com prefixo "Int Alt".
const PREFIXO = "Int Alt";
const LOGIN = "int-alt";
const prisma = criarClientePrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL);

let usuario: { id: string; nome: string };
let clienteId: string;
let contador: { proximo: number | null; ano: number | null };

async function limpar() {
  await comConexao(async (c) => {
    const projetos = `SELECT id FROM "Projeto" WHERE titulo LIKE $1`;
    const propostas = `SELECT id FROM "Proposta" WHERE "projetoId" IN (${projetos})`;
    await c.query(`DELETE FROM "LogAuditoria" WHERE "entidade" IN ('Proposta','Projeto') AND ("entidadeId" IN (${propostas}) OR "entidadeId" IN (${projetos}))`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "ItemPropostaMedida" WHERE "itemId" IN (SELECT id FROM "ItemProposta" WHERE "propostaId" IN (${propostas}))`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "ItemProposta" WHERE "propostaId" IN (${propostas})`, [`${PREFIXO}%`]);
    await c.query(`UPDATE "Proposta" SET "alternativaAprovadaId" = NULL WHERE id IN (${propostas})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "PropostaParcela" WHERE "propostaId" IN (${propostas})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "AlternativaPagamentoTotal" WHERE "alternativaId" IN (SELECT id FROM "AlternativaPagamento" WHERE "propostaId" IN (${propostas}))`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "AlternativaPagamento" WHERE "propostaId" IN (${propostas})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "GrupoProposta" WHERE "propostaId" IN (${propostas})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "OpcaoProposta" WHERE "propostaId" IN (${propostas})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Proposta" WHERE "projetoId" IN (${projetos})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Interacao" WHERE "projetoId" IN (${projetos})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Tarefa" WHERE "projetoId" IN (${projetos})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "HistoricoFaseProjeto" WHERE "projetoId" IN (${projetos})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Projeto" WHERE titulo LIKE $1`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Cliente" WHERE nome LIKE $1`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Usuario" WHERE login = $1`, [LOGIN]);
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
});

afterAll(async () => {
  await limpar();
  await comConexao((c) => c.query(`UPDATE "ConfiguracaoEmpresa" SET "proximoNumeroProposta" = $1, "anoNumeracaoProposta" = $2 WHERE id = 'singleton'`, [contador.proximo, contador.ano]));
  await prisma.$disconnect();
});

/** Proposta rascunho: duas opções (A = R$ 15.360,00; B = R$ 15.000,00 com desconto), cronograma 50% + 50%. */
async function montar(titulo: string, o: { comNota?: boolean } = {}) {
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
        comNotaFiscal: o.comNota ?? false,
        acrescimoNotaPb: 500,
        nomePagamentoPrincipal: "À vista",
        opcoes: { create: [{ nome: "Linha Suprema", ordem: 0 }, { nome: "Linha Gold", ordem: 1, descontoCentavos: 36_000 }] },
        parcelas: {
          create: [
            { ordem: 1, descricao: "Sinal", percentualPb: 5000, gatilho: "CONFIRMACAO", forma: "PIX" },
            { ordem: 2, descricao: "Instalação", percentualPb: 5000, gatilho: "ENTREGA_E_INSTALACAO" },
          ],
        },
      },
      include: { opcoes: { orderBy: { ordem: "asc" } } },
    });
    for (const op of proposta.opcoes) {
      await tx.itemProposta.create({
        data: { propostaId: proposta.id, opcaoId: op.id, ordem: 0, descricao: "JANELA", modoPreco: "MANUAL", valorManualCentavos: 1_536_000, precoTotalCentavos: 1_536_000, medidas: { create: [{ larguraMm: 1000, alturaMm: 1000, quantidade: 1 }] } },
      });
    }
    return { projetoId: projeto.id, propostaId: proposta.id, numero, opcaoA: proposta.opcoes[0].id, opcaoB: proposta.opcoes[1].id };
  });
}

/** Cartão 3x (total digitado por opção) + Pix com 5% de desconto. */
async function adicionarFormas(p: { propostaId: string; opcaoA: string; opcaoB: string }, totalDigitadoB = 1_575_000) {
  const cartao = await prisma.alternativaPagamento.create({
    data: { propostaId: p.propostaId, ordem: 1, nome: "Cartão 3x", modoAjuste: "TOTAL_DIGITADO", repasseCartao: true },
  });
  await prisma.propostaParcela.create({ data: { propostaId: p.propostaId, alternativaId: cartao.id, ordem: 1, descricao: "No cartão", percentualPb: 10000, gatilho: "CONFIRMACAO", forma: "CARTAO_CREDITO", parcelasCartao: 3 } });
  await prisma.alternativaPagamentoTotal.createMany({ data: [{ alternativaId: cartao.id, opcaoId: p.opcaoA, baseCentavos: 1_620_000 }, { alternativaId: cartao.id, opcaoId: p.opcaoB, baseCentavos: totalDigitadoB }] });
  const pix = await prisma.alternativaPagamento.create({ data: { propostaId: p.propostaId, ordem: 2, nome: "Pix", modoAjuste: "PERCENTUAL", ajustePb: -500 } });
  await prisma.propostaParcela.create({ data: { propostaId: p.propostaId, alternativaId: pix.id, ordem: 1, descricao: "No Pix", percentualPb: 10000, gatilho: "CONFIRMACAO", forma: "PIX" } });
  return { cartaoId: cartao.id, pixId: pix.id };
}

const enviar = (propostaId: string) => prisma.$transaction((tx) => enviarProposta(tx, { usuario, propostaId }), { timeout: 30_000 });
const snapshotDe = async (id: string) => (await prisma.proposta.findUniqueOrThrow({ where: { id }, select: { snapshot: true } })).snapshot as unknown as ConteudoProposta;

describe("snapshot e envio", () => {
  it("sem formas extras: o conteúdo NÃO tem o campo novo (snapshot igual ao de antes) e envia normalmente", async () => {
    const p = await montar("sem extras");
    const antes = await prisma.$transaction((tx) => construirConteudo(tx, p.propostaId));
    expect("formasPagamento" in antes).toBe(false);
    await enviar(p.propostaId);
    const snap = await snapshotDe(p.propostaId);
    expect("formasPagamento" in snap).toBe(false);
    expect(snap.pagamento.parcelas).toHaveLength(2);
  });

  it("com formas extras: envia e congela a principal + as extras, com o total de cada uma por opção", async () => {
    const p = await montar("com extras");
    await adicionarFormas(p);
    expect(await prisma.$transaction((tx) => problemasDaProposta(tx, p.propostaId))).toEqual([]);
    await enviar(p.propostaId);
    const snap = await snapshotDe(p.propostaId);
    const formas = snap.formasPagamento!;
    expect(formas.map((f) => [f.nome, f.principal])).toEqual([["À vista", true], ["Cartão 3x", false], ["Pix", false]]);
    // Opção A: à vista 15.360; cartão (digitado) 16.200; Pix −5% = 14.592. Opção B (base 15.000): cartão digitado 15.750; Pix 14.250.
    const totais = (i: number) => formas.map((f) => f.porOpcao.find((x) => x.opcaoId === (i === 0 ? p.opcaoA : p.opcaoB))!.totalCentavos);
    expect(totais(0)).toEqual([1_536_000, 1_620_000, 1_459_200]);
    expect(totais(1)).toEqual([1_500_000, 1_575_000, 1_425_000]);
    expect(formas[1].repasseCartao).toBe(true);
    expect(formas[1].porOpcao[0].ajusteCentavos).toBe(84_000);
    expect(formas[2].porOpcao[0].ajusteCentavos).toBe(-76_800);
    // A condição principal do snapshot continua só com o cronograma da principal (as parcelas das extras não vazam para ela).
    expect(snap.pagamento.parcelas.map((x) => x.descricao)).toEqual(["Sinal", "Instalação"]);
    expect(formas[1].parcelas).toMatchObject([{ forma: "CARTAO_CREDITO", parcelasCartao: 3 }]);
  });

  it("com nota fiscal: a nota entra por último, sobre o valor de cada forma", async () => {
    const p = await montar("com nota", { comNota: true });
    await adicionarFormas(p);
    await enviar(p.propostaId);
    const formas = (await snapshotDe(p.propostaId)).formasPagamento!;
    const pixA = formas[2].porOpcao.find((x) => x.opcaoId === p.opcaoA)!;
    expect(pixA).toMatchObject({ baseCentavos: 1_459_200, acrescimoNotaCentavos: 72_960, totalCentavos: 1_532_160 });
    expect(formas[0].porOpcao.find((x) => x.opcaoId === p.opcaoA)).toMatchObject({ baseCentavos: 1_536_000, acrescimoNotaCentavos: 76_800, totalCentavos: 1_612_800 });
  });

  it("forma que não fecha (total a mais de 50% da opção) segura o envio com mensagem em português", async () => {
    const p = await montar("forma ruim");
    await adicionarFormas(p, 3_000_000);
    const problemas = await prisma.$transaction((tx) => problemasDaProposta(tx, p.propostaId));
    expect(problemas.join(" ")).toMatch(/Cartão 3x.*Linha Gold.*50%/);
    await expect(enviar(p.propostaId)).rejects.toThrow(/ainda não está pronta/);
  });
});

describe("aprovação fica bloqueada até o Bloco 4", () => {
  it("proposta com formas extras (rascunho ou enviada) não é aprovada, e nada é gravado", async () => {
    const p = await montar("bloqueio");
    await adicionarFormas(p);
    const tentar = () => prisma.$transaction((tx) => aprovarProposta(tx, { usuario, propostaId: p.propostaId, opcaoId: p.opcaoA, forma: "WHATSAPP", aceitaEm: "2026-11-13" }));
    await expect(tentar()).rejects.toThrow(MENSAGEM_APROVACAO_EM_PREPARO);
    expect((await prisma.proposta.findUniqueOrThrow({ where: { id: p.propostaId } })).status).toBe("RASCUNHO");
    await enviar(p.propostaId);
    await expect(tentar()).rejects.toThrow(MENSAGEM_APROVACAO_EM_PREPARO);
    const depois = await prisma.proposta.findUniqueOrThrow({ where: { id: p.propostaId } });
    expect(depois.status).toBe("ENVIADA");
    expect(depois.valorAprovadoCentavos).toBeNull();
    expect(await prisma.contaReceber.count({ where: { propostaId: p.propostaId } })).toBe(0);
  });
});

describe("cópia de revisão", () => {
  it("copia as formas, o cronograma de cada uma, a marca de repasse e os totais digitados (com os ids novos das opções)", async () => {
    const p = await montar("revisão");
    await adicionarFormas(p);
    await enviar(p.propostaId);
    const rev = await prisma.$transaction((tx) => copiarProposta(tx, { usuarioId: usuario.id, origemId: p.propostaId, modo: "REVISAO" }), { timeout: 30_000 });
    const nova = await prisma.proposta.findUniqueOrThrow({
      where: { id: rev.id },
      include: {
        opcoes: { where: { deletadoEm: null }, orderBy: { ordem: "asc" } },
        parcelas: { where: { deletadoEm: null, alternativaId: null } },
        alternativasPagamento: { where: { deletadoEm: null }, orderBy: { ordem: "asc" }, include: { parcelas: { where: { deletadoEm: null } }, totais: { where: { deletadoEm: null } } } },
      },
    });
    expect(nova.nomePagamentoPrincipal).toBe("À vista");
    expect(nova.parcelas).toHaveLength(2); // a principal não ganha as parcelas das extras
    expect(nova.alternativasPagamento.map((a) => [a.nome, a.modoAjuste, a.ajustePb, a.repasseCartao, a.parcelas.length])).toEqual([["Cartão 3x", "TOTAL_DIGITADO", 0, true, 1], ["Pix", "PERCENTUAL", -500, false, 1]]);
    const cartao = nova.alternativasPagamento[0];
    expect(cartao.parcelas[0]).toMatchObject({ forma: "CARTAO_CREDITO", parcelasCartao: 3 });
    // Os totais digitados apontam para as opções da REVISÃO, não para as da original.
    const idsNovos = nova.opcoes.map((o) => o.id);
    expect(cartao.totais.map((t) => t.opcaoId).sort()).toEqual([...idsNovos].sort());
    expect(idsNovos).not.toContain(p.opcaoA);
    expect(cartao.totais.find((t) => t.opcaoId === nova.opcoes[0].id)?.baseCentavos).toBe(1_620_000);
    expect(cartao.totais.find((t) => t.opcaoId === nova.opcoes[1].id)?.baseCentavos).toBe(1_575_000);
    // A original ficou como estava.
    expect(await prisma.alternativaPagamento.count({ where: { propostaId: p.propostaId, deletadoEm: null } })).toBe(2);
  });

  it("a revisão copiada gera o mesmo conteúdo de formas que a original (comparação sem mudanças) e mostra o que mudou depois", async () => {
    const p = await montar("comparar");
    await adicionarFormas(p);
    await enviar(p.propostaId);
    const rev = await prisma.$transaction((tx) => copiarProposta(tx, { usuarioId: usuario.id, origemId: p.propostaId, modo: "REVISAO" }), { timeout: 30_000 });
    const comparavel = (c: ConteudoProposta): ConteudoComparavel => ({
      numero: c.numero,
      revisao: c.revisao,
      comNotaFiscal: c.comNotaFiscal,
      opcoes: c.opcoes.map((o) => ({ nome: o.nome, totalCentavos: o.totais.totalCentavos, itens: [] })),
      formas: (c.formasPagamento ?? []).map((f) => ({ nome: f.nome, totais: f.porOpcao.map((t) => ({ opcaoNome: c.opcoes.find((o) => o.id === t.opcaoId)?.nome ?? "", totalCentavos: t.totalCentavos })) })),
    });
    const original = await snapshotDe(p.propostaId);
    const igual = compararRevisoes(comparavel(original), comparavel(await prisma.$transaction((tx) => construirConteudo(tx, rev.id))));
    expect(igual.semMudancas).toBe(true);
    // Muda o total digitado do cartão na opção B da revisão: a comparação aponta só essa forma.
    const alt = await prisma.alternativaPagamento.findFirstOrThrow({ where: { propostaId: rev.id, nome: "Cartão 3x", deletadoEm: null } });
    const opcaoB = await prisma.opcaoProposta.findFirstOrThrow({ where: { propostaId: rev.id, nome: "Linha Gold" } });
    await prisma.alternativaPagamentoTotal.updateMany({ where: { alternativaId: alt.id, opcaoId: opcaoB.id }, data: { baseCentavos: 1_600_000 } });
    const mudou = compararRevisoes(comparavel(original), comparavel(await prisma.$transaction((tx) => construirConteudo(tx, rev.id))));
    expect(mudou.semMudancas).toBe(false);
    expect(mudou.formas.filter((f) => f.mudancas.length > 0).map((f) => [f.nome, f.mudancas[0].opcaoNome, f.mudancas[0].antesCentavos, f.mudancas[0].depoisCentavos])).toEqual([["Cartão 3x", "Linha Gold", 1_575_000, 1_600_000]]);
  });
});
