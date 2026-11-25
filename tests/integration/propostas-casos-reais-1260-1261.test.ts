import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ajusteEfetivoPb, parcelasDoCartao } from "@/lib/dominio/alternativas-pagamento";
import { criarClientePrisma } from "@/lib/db/criar-cliente";
import { proximoCodigoDoProjeto } from "@/modules/projetos/servico";
import type { ConteudoProposta } from "@/modules/propostas/conteudo";
import { reservarNumeroDeProposta } from "@/modules/propostas/servico";
import { aprovarProposta, enviarProposta } from "@/modules/propostas/servico-ciclo";

import { comConexao, criarUsuarioDeTeste } from "./banco-teste";

/**
 * Fase 3.6a, Bloco 5: as propostas 1260-26 e 1261-26 do Marcelo, INTEIRAS, pelos serviços reais (enviar e aprovar), e os valores
 * conferidos contra os PDFs dele, sem diferença de centavo. Nos dois casos a soma dos itens é o valor à vista; "VALOR TOTAL" e
 * cada cartão são totais próprios digitados por ele; o à vista tem 50% de sinal na confirmação e o restante na instalação.
 * Prefixo "Int Rea"; uma proposta por forma (cada uma aprovada uma vez).
 */
const PREFIXO = "Int Rea";
const LOGIN = "int-casos-reais";
const prisma = criarClientePrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL);

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

type Caso = {
  nome: string;
  /** Preço de cada item, em centavos (a soma é o valor à vista). */
  itens: number[];
  aVista: number;
  sinal: number;
  /** Cartões: vezes, total digitado e a parcela impressa no PDF do Marcelo (centavos). */
  cartoes: { n: number; total: number; parcelaDoPdf: number; ajustePb: number }[];
};

// 1260-26: 12 janelas × R$ 980,00 + porta R$ 2.550,00 + porta R$ 1.050,00 = R$ 15.360,00 (à vista).
// PDF: "VALOR TOTAL R$ 16.200,00 / 03X R$ 5.400,00 / 06X R$ 2.775,00 / 10X R$ 1.735,00 / À VISTA R$ 15.360,00, sinal de 50%".
const CASO_1260: Caso = {
  nome: "1260-26",
  itens: [12 * 98_000, 255_000, 105_000],
  aVista: 1_536_000,
  sinal: 768_000,
  cartoes: [
    { n: 3, total: 1_620_000, parcelaDoPdf: 540_000, ajustePb: 547 },
    { n: 6, total: 1_665_000, parcelaDoPdf: 277_500, ajustePb: 840 },
    { n: 10, total: 1_735_000, parcelaDoPdf: 173_500, ajustePb: 1296 },
  ],
};

// 1261-26: guarda-corpo R$ 4.650,00 + R$ 4.300,00 + portinholas R$ 1.100,00 = R$ 10.050,00 (à vista).
// PDF: "VALOR TOTAL R$ 10.620,00 / 03X R$ 3.540,00 / 06X R$ 1.815,00 / 10X R$ 1.135,00 / À VISTA R$ 10.050,00, 50% de sinal".
const CASO_1261: Caso = {
  nome: "1261-26",
  itens: [465_000, 430_000, 110_000],
  aVista: 1_005_000,
  sinal: 502_500,
  cartoes: [
    { n: 3, total: 1_062_000, parcelaDoPdf: 354_000, ajustePb: 567 },
    { n: 6, total: 1_089_000, parcelaDoPdf: 181_500, ajustePb: 836 },
    { n: 10, total: 1_135_000, parcelaDoPdf: 113_500, ajustePb: 1294 },
  ],
};

/** A proposta inteira do Marcelo: itens, à vista 50% + 50% como forma principal e os três cartões com o total digitado. */
async function montar(c: Caso, rotulo: string) {
  const m = await prisma.$transaction(async (tx) => {
    const projeto = await tx.projeto.create({ data: { codigo: await proximoCodigoDoProjeto(tx), titulo: `${PREFIXO} ${c.nome} ${rotulo}`, clienteId, status: "ELABORANDO_PROPOSTA" } });
    const { numero, sequencial, ano } = await reservarNumeroDeProposta(tx);
    const proposta = await tx.proposta.create({
      data: {
        projetoId: projeto.id,
        numero,
        numeroSequencial: sequencial,
        ano,
        data: new Date(),
        clienteNome: `${PREFIXO} Cliente`,
        nomePagamentoPrincipal: "À vista",
        opcoes: { create: [{ nome: "Opção 1", ordem: 0 }] },
        parcelas: {
          create: [
            { ordem: 1, descricao: "Sinal na confirmação", percentualPb: 5000, gatilho: "CONFIRMACAO" },
            { ordem: 2, descricao: "Restante na instalação", percentualPb: 5000, gatilho: "ENTREGA_E_INSTALACAO" },
          ],
        },
      },
      include: { opcoes: true },
    });
    for (const [i, valor] of c.itens.entries()) {
      await tx.itemProposta.create({ data: { propostaId: proposta.id, opcaoId: proposta.opcoes[0].id, ordem: i, descricao: `ITEM ${i + 1}`, modoPreco: "MANUAL", valorManualCentavos: valor, precoTotalCentavos: valor, medidas: { create: [{ larguraMm: 1000, alturaMm: 1000, quantidade: 1 }] } } });
    }
    return { projetoId: projeto.id, propostaId: proposta.id, numero, opcaoId: proposta.opcoes[0].id };
  });
  for (const [i, k] of c.cartoes.entries()) {
    const forma = await prisma.alternativaPagamento.create({ data: { propostaId: m.propostaId, ordem: i + 1, nome: `Cartão ${k.n}x`, modoAjuste: "TOTAL_DIGITADO", repasseCartao: true } });
    await prisma.propostaParcela.create({ data: { propostaId: m.propostaId, alternativaId: forma.id, ordem: 1, descricao: "No cartão", percentualPb: 10000, gatilho: "CONFIRMACAO", forma: "CARTAO_CREDITO", parcelasCartao: k.n } });
    await prisma.alternativaPagamentoTotal.create({ data: { alternativaId: forma.id, opcaoId: m.opcaoId, baseCentavos: k.total } });
  }
  return m;
}

const enviar = (propostaId: string) => prisma.$transaction((tx) => enviarProposta(tx, { usuario, propostaId }), { timeout: 30_000 });
const aprovar = (propostaId: string, opcaoId: string, formaPagamento: string) =>
  prisma.$transaction((tx) => aprovarProposta(tx, { usuario, propostaId, opcaoId, formaPagamento, forma: "WHATSAPP", aceitaEm: "2020-10-20" }), { timeout: 30_000 });

for (const caso of [CASO_1260, CASO_1261]) {
  describe(`caso real ${caso.nome}: totais, parcelas e à vista com sinal de 50% iguais ao PDF do Marcelo`, () => {
    it("a soma dos itens é o valor à vista e o snapshot congela os valores do PDF, sem diferença de centavo", async () => {
      const m = await montar(caso, "snapshot");
      await enviar(m.propostaId);
      const snap = (await prisma.proposta.findUniqueOrThrow({ where: { id: m.propostaId }, select: { snapshot: true } })).snapshot as unknown as ConteudoProposta;
      expect(snap.opcoes[0].totais.totalCentavos).toBe(caso.aVista);
      const formas = snap.formasPagamento!;
      expect(formas.map((f) => f.nome)).toEqual(["À vista", ...caso.cartoes.map((k) => `Cartão ${k.n}x`)]);
      expect(formas.map((f) => f.porOpcao[0].totalCentavos)).toEqual([caso.aVista, ...caso.cartoes.map((k) => k.total)]);
      // O percentual que o Marcelo "embutiu" em cada cartão, derivado (o sistema mostra o %, ele digita o total).
      expect(formas.slice(1).map((f) => ajusteEfetivoPb(caso.aVista, f.porOpcao[0].totalCentavos))).toEqual(caso.cartoes.map((k) => k.ajustePb));
      // À vista: 50% de sinal na confirmação e o restante na instalação (R$ 7.680,00 + R$ 7.680,00 / R$ 5.025,00 + R$ 5.025,00).
      expect(formas[0].parcelas.map((p) => [p.percentualPb, p.gatilho])).toEqual([[5000, "CONFIRMACAO"], [5000, "ENTREGA_E_INSTALACAO"]]);
    });

    it("à vista: sinal de 50% na confirmação e o restante na instalação, somando R$ do PDF", async () => {
      const m = await montar(caso, "a vista");
      await enviar(m.propostaId);
      const r = await aprovar(m.propostaId, m.opcaoId, "À vista");
      expect(r).toMatchObject({ valorAprovadoCentavos: caso.aVista, parcelasGeradas: 2 });
      const contas = await prisma.contaReceber.findMany({ where: { propostaId: m.propostaId, deletadoEm: null }, orderBy: { ordem: "asc" } });
      expect(contas.map((c) => c.valorCentavos)).toEqual([caso.sinal, caso.aVista - caso.sinal]);
      expect(contas.map((c) => c.gatilho)).toEqual(["CONFIRMACAO", "ENTREGA_E_INSTALACAO"]);
      expect(contas.map((c) => c.status)).toEqual(["ABERTA", "AGUARDANDO_GATILHO"]); // o sinal vence no aceite; o restante espera a instalação
      const p = await prisma.proposta.findUniqueOrThrow({ where: { id: m.propostaId } });
      expect([p.ajusteAprovadoCentavos, p.repasseCartaoAprovadoCentavos]).toEqual([0, 0]);
    });

    for (const k of caso.cartoes) {
      it(`cartão em ${k.n}x: total R$ do PDF, ${k.n} parcelas iguais à do PDF (${k.parcelaDoPdf} centavos), sem diferença de centavo`, async () => {
        const m = await montar(caso, `cartao ${k.n}x`);
        await enviar(m.propostaId);
        const r = await aprovar(m.propostaId, m.opcaoId, `Cartão ${k.n}x`);
        expect(r.valorAprovadoCentavos).toBe(k.total);
        const contas = await prisma.contaReceber.findMany({ where: { propostaId: m.propostaId, deletadoEm: null } });
        expect(contas).toHaveLength(1);
        expect(contas[0]).toMatchObject({ valorCentavos: k.total, forma: "CARTAO_CREDITO", parcelasCartao: k.n });
        const parcelas = parcelasDoCartao(contas[0].valorCentavos, contas[0].parcelasCartao!);
        expect(parcelas).toHaveLength(k.n);
        expect(parcelas.every((v) => v === k.parcelaDoPdf)).toBe(true);
        expect(parcelas.reduce((s, v) => s + v, 0)).toBe(k.total);
        // O acréscimo do cartão é a taxa da maquininha repassada: dentro do Vendido, fora da margem.
        const p = await prisma.proposta.findUniqueOrThrow({ where: { id: m.propostaId } });
        expect({ referencia: p.valorReferenciaAprovadoCentavos, ajuste: p.ajusteAprovadoCentavos, cartao: p.repasseCartaoAprovadoCentavos }).toEqual({ referencia: caso.aVista, ajuste: k.total - caso.aVista, cartao: k.total - caso.aVista });
      });
    }
  });
}
