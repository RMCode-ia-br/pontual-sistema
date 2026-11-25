import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { criarClientePrisma } from "@/lib/db/criar-cliente";
import type { Periodo } from "@/lib/periodo";
import { vendidoNoPeriodo } from "@/modules/indicadores/vendas";
import { carregarCustoDaObra } from "@/modules/obras/queries-custo";
import { proximoCodigoDoProjeto } from "@/modules/projetos/servico";
import { previaDaTroca } from "@/modules/propostas/previa-desfazer";
import { reservarNumeroDeProposta } from "@/modules/propostas/servico";
import { aprovarProposta, copiarProposta, enviarProposta } from "@/modules/propostas/servico-ciclo";
import { desfazerAprovacao, trocarAprovacao } from "@/modules/propostas/servico-desfazer";

import { comConexao, criarUsuarioDeTeste } from "./banco-teste";

/**
 * Fase 3.6a, Bloco 4: aprovar escolhendo a forma de pagamento. Opção A vale R$ 15.360,00 (à vista); a forma "Cartão 10x" tem o total
 * digitado de R$ 17.350,00 (acréscimo de R$ 1.990,00 marcado como taxa da maquininha) e "Pix" dá 5% de desconto (R$ 14.592,00).
 * Tudo com prefixo "Int Aap", em agosto de 2020 (o Vendido é conferido por DIFERENÇA, nunca supondo o mês vazio).
 */
const PREFIXO = "Int Aap";
const LOGIN = "int-aprova-formas";
const prisma = criarClientePrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL);
const AGO: Periodo = { de: "2020-08-01", ate: "2020-08-31" };
const ACEITE = "2020-08-14";

let usuario: { id: string; nome: string };
let clienteId: string;
let contador: { proximo: number | null; ano: number | null };

async function limpar() {
  await comConexao(async (c) => {
    const projetos = `SELECT id FROM "Projeto" WHERE titulo LIKE $1`;
    const propostas = `SELECT id FROM "Proposta" WHERE "projetoId" IN (${projetos})`;
    await c.query(`DELETE FROM "LogAuditoria" WHERE "usuarioId" IN (SELECT id FROM "Usuario" WHERE login = $2) OR ("entidade" IN ('Proposta','Projeto') AND ("entidadeId" IN (${propostas}) OR "entidadeId" IN (${projetos})))`, [`${PREFIXO}%`, LOGIN]);
    await c.query(`DELETE FROM "ContaReceber" WHERE "projetoId" IN (${projetos})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "EventoAgenda" WHERE "projetoId" IN (${projetos})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "EtapaProjeto" WHERE "projetoId" IN (${projetos})`, [`${PREFIXO}%`]);
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

type Montada = { projetoId: string; propostaId: string; numero: string; opcaoA: string; opcaoB: string };

/** Rascunho com duas opções (A: 15.360,00; B: 15.000,00 com desconto) e cronograma principal 50% + 50% ("À vista"). */
async function montar(titulo: string, o: { comNota?: boolean; comFormas?: boolean } = {}): Promise<Montada> {
  const m = await prisma.$transaction(async (tx) => {
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
        nomePagamentoPrincipal: o.comFormas === false ? null : "À vista",
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
      await tx.itemProposta.create({ data: { propostaId: proposta.id, opcaoId: op.id, ordem: 0, descricao: "JANELA", modoPreco: "MANUAL", valorManualCentavos: 1_536_000, precoTotalCentavos: 1_536_000, medidas: { create: [{ larguraMm: 1000, alturaMm: 1000, quantidade: 1 }] } } });
    }
    return { projetoId: projeto.id, propostaId: proposta.id, numero, opcaoA: proposta.opcoes[0].id, opcaoB: proposta.opcoes[1].id };
  });
  if (o.comFormas !== false) await adicionarFormas(m);
  return m;
}

/** "Cartão 10x" (total digitado por opção, marcada como taxa da maquininha) e "Pix" (−5%, também marcada: desconto NUNCA é repasse). */
async function adicionarFormas(m: Montada) {
  const cartao = await prisma.alternativaPagamento.create({ data: { propostaId: m.propostaId, ordem: 1, nome: "Cartão 10x", modoAjuste: "TOTAL_DIGITADO", repasseCartao: true } });
  await prisma.propostaParcela.create({ data: { propostaId: m.propostaId, alternativaId: cartao.id, ordem: 1, descricao: "No cartão", percentualPb: 10000, gatilho: "CONFIRMACAO", forma: "CARTAO_CREDITO", parcelasCartao: 10 } });
  await prisma.alternativaPagamentoTotal.createMany({ data: [{ alternativaId: cartao.id, opcaoId: m.opcaoA, baseCentavos: 1_735_000 }, { alternativaId: cartao.id, opcaoId: m.opcaoB, baseCentavos: 1_650_000 }] });
  const pix = await prisma.alternativaPagamento.create({ data: { propostaId: m.propostaId, ordem: 2, nome: "Pix", modoAjuste: "PERCENTUAL", ajustePb: -500, repasseCartao: true } });
  await prisma.propostaParcela.create({ data: { propostaId: m.propostaId, alternativaId: pix.id, ordem: 1, descricao: "No Pix", percentualPb: 10000, gatilho: "CONFIRMACAO", forma: "PIX" } });
}

const enviar = (propostaId: string) => prisma.$transaction((tx) => enviarProposta(tx, { usuario, propostaId }), { timeout: 30_000 });
const revisar = (origemId: string) => prisma.$transaction((tx) => copiarProposta(tx, { usuarioId: usuario.id, origemId, modo: "REVISAO" }), { timeout: 30_000 });
const aprovar = (propostaId: string, opcaoId: string, formaPagamento?: string) =>
  prisma.$transaction((tx) => aprovarProposta(tx, { usuario, propostaId, opcaoId, formaPagamento, forma: "WHATSAPP", aceitaEm: ACEITE }), { timeout: 30_000 });
const desfazer = (propostaId: string) => prisma.$transaction((tx) => desfazerAprovacao(tx, { usuario, propostaId, motivo: "engano do teste" }), { timeout: 30_000 });
const proposta = (id: string) => prisma.proposta.findUniqueOrThrow({ where: { id } });
const contas = (propostaId: string) => prisma.contaReceber.findMany({ where: { propostaId, deletadoEm: null }, orderBy: { ordem: "asc" } });
const camposDoAceite = (p: Awaited<ReturnType<typeof proposta>>) => ({ alternativaAprovadaId: p.alternativaAprovadaId, referencia: p.valorReferenciaAprovadoCentavos, ajuste: p.ajusteAprovadoCentavos, nota: p.acrescimoNotaAprovadoCentavos, cartao: p.repasseCartaoAprovadoCentavos });

describe("aprovar com a forma de pagamento escolhida", () => {
  it("cartão 10x: parcelas somam o total com acréscimo, Vendido = total, margem sem o repasse, e tudo é gravado e dito na interação e na auditoria", async () => {
    const m = await montar("cartao 10x");
    await enviar(m.propostaId);
    const antes = await vendidoNoPeriodo(AGO);
    const r = await aprovar(m.propostaId, m.opcaoA, "Cartão 10x");
    expect(r).toMatchObject({ valorAprovadoCentavos: 1_735_000, parcelasGeradas: 1, formaPagamento: "Cartão 10x" });

    const p = await proposta(m.propostaId);
    const cartao = await prisma.alternativaPagamento.findFirstOrThrow({ where: { propostaId: m.propostaId, nome: "Cartão 10x" } });
    expect(p.status).toBe("APROVADA");
    expect(p.valorAprovadoCentavos).toBe(1_735_000);
    expect(camposDoAceite(p)).toEqual({ alternativaAprovadaId: cartao.id, referencia: 1_536_000, ajuste: 199_000, nota: 0, cartao: 199_000 });

    // Parcelas a receber: UMA conta no cartão em 10x com o total que o cliente paga (já com o acréscimo).
    const cs = await contas(m.propostaId);
    expect(cs).toHaveLength(1);
    expect(cs[0]).toMatchObject({ valorCentavos: 1_735_000, forma: "CARTAO_CREDITO", parcelasCartao: 10 });
    expect(cs[0].descricao).toContain("Cartão 10x");
    expect(cs.reduce((s, c) => s + c.valorCentavos, 0)).toBe(p.valorAprovadoCentavos);

    // Vendido = total da forma; o repasse de cartão aparece à parte, e o de imposto não se mexe.
    const depois = await vendidoNoPeriodo(AGO);
    expect(depois.totalCentavos - antes.totalCentavos).toBe(1_735_000);
    expect(depois.repasseDeCartaoCentavos - antes.repasseDeCartaoCentavos).toBe(199_000);
    expect(depois.repasseDeImpostoCentavos - antes.repasseDeImpostoCentavos).toBe(0);

    // Margem: o valor fechado inclui o acréscimo, a receita da margem NÃO.
    const obra = await carregarCustoDaObra(m.projetoId);
    expect(obra.receitaFechadaCentavos).toBe(1_735_000);
    expect(obra.resultado.receitaDaMargemCentavos).toBe(1_536_000);
    expect(obra.resultado.repasseDeCartaoCentavos).toBe(199_000);
    expect(obra.resultado.repasseDeImpostoCentavos).toBe(0);

    const interacao = await prisma.interacao.findFirst({ where: { projetoId: m.projetoId, texto: { contains: "Forma de pagamento: \"Cartão 10x\"" } } });
    expect(interacao).not.toBeNull();
    const auditoria = await prisma.logAuditoria.findFirst({ where: { entidade: "Proposta", entidadeId: m.propostaId, acao: "APROVAR" } });
    expect(JSON.stringify(auditoria?.depois)).toContain("Cartão 10x");
    expect(JSON.stringify(auditoria?.depois)).toContain("199000");
  });

  it("desconto à vista (Pix −5%): Vendido menor, margem menor, e NENHUM repasse mesmo com a marca ligada", async () => {
    const m = await montar("pix desconto");
    await enviar(m.propostaId);
    const antes = await vendidoNoPeriodo(AGO);
    const r = await aprovar(m.propostaId, m.opcaoA, "Pix");
    expect(r.valorAprovadoCentavos).toBe(1_459_200);
    const p = await proposta(m.propostaId);
    expect(camposDoAceite(p)).toMatchObject({ referencia: 1_536_000, ajuste: -76_800, nota: 0, cartao: 0 });

    const cs = await contas(m.propostaId);
    expect(cs).toHaveLength(1);
    expect(cs[0]).toMatchObject({ valorCentavos: 1_459_200, forma: "PIX" });

    const depois = await vendidoNoPeriodo(AGO);
    expect(depois.totalCentavos - antes.totalCentavos).toBe(1_459_200);
    expect(depois.repasseDeCartaoCentavos - antes.repasseDeCartaoCentavos).toBe(0);
    const obra = await carregarCustoDaObra(m.projetoId);
    expect(obra.resultado.receitaDaMargemCentavos).toBe(1_459_200); // o desconto reduz a margem: 15.360,00 → 14.592,00
    expect(obra.resultado.repasseDeCartaoCentavos).toBe(0);
  });

  it("a forma principal escolhida (À vista): como sempre, 50% + 50%, sem ajuste", async () => {
    const m = await montar("principal");
    await enviar(m.propostaId);
    const r = await aprovar(m.propostaId, m.opcaoA, "À vista");
    expect(r).toMatchObject({ valorAprovadoCentavos: 1_536_000, parcelasGeradas: 2, formaPagamento: "À vista" });
    const p = await proposta(m.propostaId);
    expect(camposDoAceite(p)).toEqual({ alternativaAprovadaId: null, referencia: 1_536_000, ajuste: 0, nota: 0, cartao: 0 });
    const cs = await contas(m.propostaId);
    expect(cs.map((c) => c.valorCentavos)).toEqual([768_000, 768_000]);
    expect(cs[0].descricao).toContain("À vista");
  });

  it("com nota fiscal: a nota é por último sobre o valor da forma, e o repasse de cartão é só o ajuste", async () => {
    const m = await montar("cartao com nota", { comNota: true });
    await enviar(m.propostaId);
    const r = await aprovar(m.propostaId, m.opcaoA, "Cartão 10x");
    // 17.350,00 + 5% de nota = 18.217,50; repasse de cartão = 1.990,00; repasse de nota = 867,50.
    expect(r.valorAprovadoCentavos).toBe(1_821_750);
    expect(camposDoAceite(await proposta(m.propostaId))).toMatchObject({ referencia: 1_536_000, ajuste: 199_000, nota: 86_750, cartao: 199_000 });
    const obra = await carregarCustoDaObra(m.projetoId);
    expect(obra.resultado.receitaDaMargemCentavos).toBe(1_536_000); // 18.217,50 − 867,50 − 1.990,00
    expect(obra.resultado.repasseDeImpostoCentavos).toBe(86_750);
    expect(obra.resultado.repasseDeCartaoCentavos).toBe(199_000);
  });

  it("sem formas extras: igual a antes (valor da opção, cronograma do conteúdo congelado, repasse zero)", async () => {
    const m = await montar("sem extras", { comNota: true, comFormas: false });
    await enviar(m.propostaId);
    const r = await aprovar(m.propostaId, m.opcaoA);
    expect(r).toMatchObject({ valorAprovadoCentavos: 1_612_800, parcelasGeradas: 2, formaPagamento: null });
    const p = await proposta(m.propostaId);
    expect(camposDoAceite(p)).toEqual({ alternativaAprovadaId: null, referencia: 1_536_000, ajuste: 0, nota: 76_800, cartao: 0 });
    const cs = await contas(m.propostaId);
    expect(cs.map((c) => c.valorCentavos)).toEqual([806_400, 806_400]);
    expect(cs[0].descricao).not.toContain("À vista");
    expect(cs.every((c) => c.comNotaFiscal)).toBe(true);
  });

  it("a forma é obrigatória quando há mais de uma e tem de existir: nada é gravado", async () => {
    const m = await montar("obrigatoria");
    await enviar(m.propostaId);
    await expect(aprovar(m.propostaId, m.opcaoA)).rejects.toThrow(/Escolha a forma de pagamento/);
    await expect(aprovar(m.propostaId, m.opcaoA, "Boleto")).rejects.toThrow(/não existe nesta proposta/);
    const p = await proposta(m.propostaId);
    expect(p.status).toBe("ENVIADA");
    expect(camposDoAceite(p)).toEqual({ alternativaAprovadaId: null, referencia: null, ajuste: null, nota: null, cartao: null });
    expect(await contas(m.propostaId)).toHaveLength(0);
  });

  it("o SNAPSHOT manda: mudar a forma depois de enviada (linha viva) não muda o que foi aprovado", async () => {
    const m = await montar("snapshot manda");
    await enviar(m.propostaId);
    await prisma.alternativaPagamento.updateMany({ where: { propostaId: m.propostaId, nome: "Pix" }, data: { ajustePb: -1000 } });
    await prisma.propostaParcela.updateMany({ where: { propostaId: m.propostaId, alternativaId: { not: null }, forma: "PIX" }, data: { percentualPb: 5000 } });
    const r = await aprovar(m.propostaId, m.opcaoA, "Pix");
    expect(r.valorAprovadoCentavos).toBe(1_459_200); // −5% do snapshot, não −10% da linha viva
    expect((await contas(m.propostaId)).map((c) => c.valorCentavos)).toEqual([1_459_200]);
  });

  it("aprovar direto do rascunho congela e usa a forma escolhida", async () => {
    const m = await montar("rascunho direto");
    const r = await aprovar(m.propostaId, m.opcaoB, "Cartão 10x");
    expect(r.valorAprovadoCentavos).toBe(1_650_000); // opção B: base 15.000,00 e total digitado R$ 16.500,00
    const p = await proposta(m.propostaId);
    expect(p.snapshot).not.toBeNull();
    expect(camposDoAceite(p)).toMatchObject({ referencia: 1_500_000, ajuste: 150_000, cartao: 150_000 });
  });
});

describe("desfazer, reaprovar e trocar com a forma de pagamento", () => {
  it("desfazer limpa a forma e todos os campos do aceite; reaprovar com OUTRA forma dá o resultado de uma aprovação limpa", async () => {
    const m = await montar("desfazer");
    await enviar(m.propostaId);
    const antes = await vendidoNoPeriodo(AGO);
    await aprovar(m.propostaId, m.opcaoA, "Cartão 10x");
    expect((await vendidoNoPeriodo(AGO)).totalCentavos - antes.totalCentavos).toBe(1_735_000);

    await desfazer(m.propostaId);
    const d = await proposta(m.propostaId);
    expect(d.status).toBe("ENVIADA");
    expect(d.valorAprovadoCentavos).toBeNull();
    expect(camposDoAceite(d)).toEqual({ alternativaAprovadaId: null, referencia: null, ajuste: null, nota: null, cartao: null });
    expect(await contas(m.propostaId)).toHaveLength(0); // as parcelas viram histórico (canceladas e fora da proposta)
    const livre = await vendidoNoPeriodo(AGO);
    expect(livre.totalCentavos).toBe(antes.totalCentavos); // aprovação desfeita não conta como venda
    expect(livre.repasseDeCartaoCentavos).toBe(antes.repasseDeCartaoCentavos);

    await aprovar(m.propostaId, m.opcaoA, "Pix");
    const novo = await proposta(m.propostaId);
    expect(novo.valorAprovadoCentavos).toBe(1_459_200);
    expect(camposDoAceite(novo)).toMatchObject({ referencia: 1_536_000, ajuste: -76_800, cartao: 0 });
    expect((await contas(m.propostaId)).map((c) => [c.valorCentavos, c.forma])).toEqual([[1_459_200, "PIX"]]);
    const fim = await vendidoNoPeriodo(AGO);
    expect(fim.totalCentavos - antes.totalCentavos).toBe(1_459_200);
    expect(fim.repasseDeCartaoCentavos - antes.repasseDeCartaoCentavos).toBe(0);
  });

  /** Original aprovada no "Cartão 10x" e uma revisão copiada (rascunho) que passa a SUBSTITUÍDA, pronta para a troca. */
  async function prepararTroca(titulo: string) {
    const m = await montar(titulo);
    await enviar(m.propostaId);
    const rev = await revisar(m.propostaId);
    await aprovar(m.propostaId, m.opcaoA, "Cartão 10x");
    expect((await proposta(rev.id)).status).toBe("SUBSTITUIDA");
    const opcaoRev = (await prisma.opcaoProposta.findFirstOrThrow({ where: { propostaId: rev.id, nome: "Linha Suprema" } })).id;
    return { m, revId: rev.id, opcaoRev };
  }
  const trocar = (deId: string, paraId: string, opcaoId: string, formaPagamento?: string) =>
    prisma.$transaction((tx) => trocarAprovacao(tx, { usuario, deId, paraId, opcaoId, formaPagamento, forma: "WHATSAPP", aceitaEm: ACEITE, motivo: "o cliente fechou a revisão" }), { timeout: 30_000 });

  it("trocar de revisão: a forma casa pelo NOME (a prévia já vem com ela) e a aprovação passa para a linha da revisão", async () => {
    const { m, revId, opcaoRev } = await prepararTroca("troca casa");
    const previa = await previaDaTroca(prisma, { deId: m.propostaId, paraId: revId });
    expect(previa.formas.map((f) => f.nome)).toEqual(["À vista", "Cartão 10x", "Pix"]);
    expect(previa.formaEscolhida).toBe("Cartão 10x");
    expect(previa.parcelas.depois).toHaveLength(1);
    expect(previa.parcelas.depois[0].valorCentavos).toBe(1_735_000);

    const r = await trocar(m.propostaId, revId, opcaoRev, "Cartão 10x");
    expect(r.valorAprovadoCentavos).toBe(1_735_000);
    const nova = await proposta(revId);
    expect(nova.status).toBe("APROVADA");
    const linha = await prisma.alternativaPagamento.findUniqueOrThrow({ where: { id: nova.alternativaAprovadaId! } });
    expect(linha.propostaId).toBe(revId); // a forma da REVISÃO, não a da original
    expect(camposDoAceite(nova)).toMatchObject({ referencia: 1_536_000, ajuste: 199_000, cartao: 199_000 });
    const antiga = await proposta(m.propostaId);
    expect(antiga.status).not.toBe("APROVADA");
    expect(camposDoAceite(antiga)).toEqual({ alternativaAprovadaId: null, referencia: null, ajuste: null, nota: null, cartao: null });
    expect((await contas(revId)).map((c) => c.valorCentavos)).toEqual([1_735_000]);
    expect(await contas(m.propostaId)).toHaveLength(0);
  });

  it("se a forma não casar com a da revisão, a troca pede a escolha (nada muda sem ela)", async () => {
    const { m, revId, opcaoRev } = await prepararTroca("troca nao casa");
    await prisma.alternativaPagamento.updateMany({ where: { propostaId: revId, nome: "Cartão 10x" }, data: { nome: "Cartão 12x" } });
    const previa = await previaDaTroca(prisma, { deId: m.propostaId, paraId: revId });
    expect(previa.formaEscolhida).toBeNull();
    expect(previa.parcelas.depois).toEqual([]);
    expect(previa.valorFechado.depoisCentavos).toBeNull();

    await expect(trocar(m.propostaId, revId, opcaoRev)).rejects.toThrow(/Escolha a forma de pagamento/);
    expect((await proposta(m.propostaId)).status).toBe("APROVADA"); // tudo ou nada
    expect((await proposta(revId)).status).toBe("SUBSTITUIDA");

    await trocar(m.propostaId, revId, opcaoRev, "Cartão 12x");
    expect((await proposta(revId)).status).toBe("APROVADA");
    expect((await proposta(revId)).valorAprovadoCentavos).toBe(1_735_000);
  });
});

describe("concorrência", () => {
  it("duas aprovações ao mesmo tempo com formas diferentes: só uma vale e o estado fica coerente", async () => {
    const m = await montar("concorrencia");
    await enviar(m.propostaId);
    const resultados = await Promise.allSettled([aprovar(m.propostaId, m.opcaoA, "Cartão 10x"), aprovar(m.propostaId, m.opcaoA, "Pix")]);
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const perdeu = resultados.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(String(perdeu.reason)).toMatch(/já foi aprovada|Outra revisão/);

    const p = await proposta(m.propostaId);
    expect(p.status).toBe("APROVADA");
    const cs = await contas(m.propostaId);
    expect(cs).toHaveLength(1); // uma conta só, da forma vencedora
    expect(cs[0].valorCentavos).toBe(p.valorAprovadoCentavos);
    const nomeDaVencedora = p.alternativaAprovadaId ? (await prisma.alternativaPagamento.findUniqueOrThrow({ where: { id: p.alternativaAprovadaId } })).nome : "À vista";
    expect(["Cartão 10x", "Pix"]).toContain(nomeDaVencedora);
    expect(p.valorAprovadoCentavos).toBe(nomeDaVencedora === "Cartão 10x" ? 1_735_000 : 1_459_200);
    expect(p.repasseCartaoAprovadoCentavos).toBe(nomeDaVencedora === "Cartão 10x" ? 199_000 : 0);
  });
});
