import { randomUUID } from "node:crypto";

import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { criarClientePrisma } from "@/lib/db/criar-cliente";
import { processarImagemDeDesenho } from "@/lib/imagem/processar";
import { gravarObjeto, removerObjeto } from "@/lib/storage";
import type { ConteudoProposta } from "@/modules/propostas/conteudo";
import { carregarImagensDoDesenho, conteudoParaPdf, gerarPdfDaProposta, gerarPdfDeProducao } from "@/modules/propostas/pdf/gerar";
import { CAIXAS_DA_IMAGEM, ErroDesenhoIndisponivel } from "@/modules/propostas/pdf/imagens";
import { proximoCodigoDoProjeto } from "@/modules/projetos/servico";
import { reservarNumeroDeProposta } from "@/modules/propostas/servico";
import { aprovarProposta, copiarProposta, enviarProposta } from "@/modules/propostas/servico-ciclo";
import { definirDesenhoDoItem, removerDesenhoDoItem } from "@/modules/propostas/servico-desenho";
import { desfazerAprovacao } from "@/modules/propostas/servico-desfazer";

import { imagensDoPdf } from "../e2e/desenho-ajudantes";
import { comConexao, criarUsuarioDeTeste } from "./banco-teste";

/**
 * Fase 3.6b-1 (Bloco 3): a imagem do desenho no snapshot, nos PDFs e nas revisões, com o Storage REAL.
 * Só toca registros "Int DesPdf" e os objetos "IntDesPdf/..." do bucket (removidos no fim).
 */
const PREFIXO = "Int DesPdf";
const LOGIN = "int-desenho-pdf";
const prisma = criarClientePrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL);

let usuario: { id: string; nome: string };
let clienteId: string;
let contador: { proximo: number | null; ano: number | null };
const objetosNoStorage: string[] = [];

async function limpar() {
  await comConexao(async (c) => {
    const projetos = `SELECT id FROM "Projeto" WHERE titulo LIKE $1`;
    const propostas = `SELECT id FROM "Proposta" WHERE "projetoId" IN (${projetos})`;
    const itens = `SELECT id FROM "ItemProposta" WHERE "propostaId" IN (${propostas})`;
    const contas = `SELECT id FROM "ContaReceber" WHERE "projetoId" IN (${projetos})`;
    await c.query(`DELETE FROM "LogAuditoria" WHERE "entidade" = 'ItemProposta' AND "entidadeId" IN (${itens})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "LogAuditoria" WHERE "entidade" IN ('Proposta','Projeto') AND ("entidadeId" IN (${propostas}) OR "entidadeId" IN (${projetos}))`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "LogAuditoria" WHERE "entidade" = 'ContaReceber' AND "entidadeId" IN (${contas})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "MovimentoEstoque" WHERE "projetoId" IN (${projetos})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "PausaProjeto" WHERE "projetoId" IN (${projetos})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "ContaReceber" WHERE "projetoId" IN (${projetos})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "EventoAgenda" WHERE "projetoId" IN (${projetos})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "EtapaProjeto" WHERE "projetoId" IN (${projetos})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "ItemPropostaMedida" WHERE "itemId" IN (${itens})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "ItemProposta" WHERE "propostaId" IN (${propostas})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "LogAuditoria" WHERE "entidade" = 'Anexo' AND "entidadeId" IN (SELECT id FROM "Anexo" WHERE caminho LIKE 'IntDesPdf/%')`);
    await c.query(`DELETE FROM "Anexo" WHERE caminho LIKE 'IntDesPdf/%'`);
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
  await Promise.all(objetosNoStorage.map((c) => removerObjeto(c).catch(() => undefined)));
  await comConexao((c) => c.query(`UPDATE "ConfiguracaoEmpresa" SET "proximoNumeroProposta" = $1, "anoNumeracaoProposta" = $2 WHERE id = 'singleton'`, [contador.proximo, contador.ano]));
  await prisma.$disconnect();
});

/** Projeto + proposta rascunho (1 opção, `n` itens manuais, cronograma 50% / 50%). */
async function montar(titulo: string, n = 2) {
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
        modoPrazo: "TOTAL",
        prazoTotalMaxDias: 30,
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
    const itens: string[] = [];
    for (let i = 0; i < n; i++) {
      const item = await tx.itemProposta.create({
        data: { propostaId: proposta.id, opcaoId: proposta.opcoes[0].id, ordem: i, descricao: `ITEM ${i + 1}`, modoPreco: "MANUAL", valorManualCentavos: 100000, precoTotalCentavos: 100000, medidas: { create: [{ larguraMm: 1000, alturaMm: 1000, quantidade: 1 }] } },
      });
      itens.push(item.id);
    }
    return { projetoId: projeto.id, propostaId: proposta.id, opcaoId: proposta.opcoes[0].id, itens };
  });
}

/** Sobe uma imagem de verdade ao Storage (processada como o servidor faz) e a liga ao item pelo serviço. */
async function imagemNoStorage(cor: string, l = 900, a = 400) {
  const processada = await processarImagemDeDesenho(await sharp({ create: { width: l, height: a, channels: 3, background: cor } }).png().toBuffer());
  const caminho = `IntDesPdf/${randomUUID()}.png`;
  await gravarObjeto(caminho, processada.bytes, processada.mime);
  objetosNoStorage.push(caminho);
  return { ...processada, caminho };
}
type ImagemTeste = Awaited<ReturnType<typeof imagemNoStorage>>;

const ligar = (propostaId: string, itemId: string, i: ImagemTeste) =>
  prisma.$transaction((tx) => definirDesenhoDoItem(tx, { usuario, propostaId, itemId, imagem: { caminho: i.caminho, mime: i.mime, tamanhoBytes: i.bytes.length, sha256: i.sha256, larguraPx: i.larguraPx, alturaPx: i.alturaPx } }));
const enviar = (propostaId: string) => prisma.$transaction((tx) => enviarProposta(tx, { usuario, propostaId }));
const revisar = (origemId: string) => prisma.$transaction((tx) => copiarProposta(tx, { usuarioId: usuario.id, origemId, modo: "REVISAO" }));
const snapshotDe = async (propostaId: string) => (await prisma.proposta.findUniqueOrThrow({ where: { id: propostaId } })).snapshot as unknown as ConteudoProposta;
const itensDo = (c: ConteudoProposta) => c.opcoes.flatMap((o) => o.secoes.flatMap((s) => s.itens));
const ehPdf = (b: Buffer) => b.subarray(0, 5).toString("latin1") === "%PDF-";

describe("snapshot", () => {
  it("enviar congela a imagem (caminho, hash, tipo, dimensões); o item SEM imagem fica sem o campo (snapshot de antes)", async () => {
    const m = await montar("Congela");
    const a = await imagemNoStorage("#3366cc");
    const r = await ligar(m.propostaId, m.itens[0], a);
    await enviar(m.propostaId);
    const [i1, i2] = itensDo(await snapshotDe(m.propostaId));
    expect(i1.desenhoImagem).toEqual({ anexoId: r.anexoId, caminho: a.caminho, sha256: a.sha256, mime: "image/png", larguraPx: a.larguraPx, alturaPx: a.alturaPx });
    expect("desenhoImagem" in i2).toBe(false);
  });

  it("proposta sem nenhuma imagem: o snapshot não ganha o campo em item nenhum", async () => {
    const m = await montar("SemImagem");
    await enviar(m.propostaId);
    for (const i of itensDo(await snapshotDe(m.propostaId))) expect("desenhoImagem" in i).toBe(false);
  });

  it("a revisão copia a imagem e, ao ser enviada, congela a MESMA referência", async () => {
    const m = await montar("Revisao");
    const a = await imagemNoStorage("#aa5522");
    await ligar(m.propostaId, m.itens[0], a);
    await enviar(m.propostaId);
    const rev = await revisar(m.propostaId);
    await enviar(rev.id);
    expect(itensDo(await snapshotDe(rev.id))[0].desenhoImagem?.sha256).toBe(a.sha256);
  });
});

describe("o PDF da proposta enviada lê a imagem do SNAPSHOT, nunca do item", () => {
  it("trocar a imagem na revisão (e até repontar o item da original) não muda o PDF da enviada; o rascunho usa a nova", async () => {
    const m = await montar("PelaSnapshot");
    const a = await imagemNoStorage("#3366cc");
    await ligar(m.propostaId, m.itens[0], a);
    await enviar(m.propostaId);
    const rev = await revisar(m.propostaId);
    const itemDaRevisao = (await prisma.itemProposta.findFirstOrThrow({ where: { propostaId: rev.id, deletadoEm: null }, orderBy: { ordem: "asc" } })).id;
    const b = await imagemNoStorage("#22aa55");
    const rb = await ligar(rev.id, itemDaRevisao, b);
    // Pior caso: a linha do item da ORIGINAL passa a apontar para a imagem B.
    await prisma.itemProposta.update({ where: { id: m.itens[0] }, data: { desenhoAnexoId: rb.anexoId } });

    const enviada = await conteudoParaPdf(m.propostaId);
    expect(Object.keys(await carregarImagensDoDesenho(enviada!.conteudo))).toEqual([a.sha256]);
    expect(ehPdf(await gerarPdfDaProposta(enviada!.conteudo))).toBe(true);
    expect(ehPdf(await gerarPdfDeProducao(enviada!.conteudo, null))).toBe(true);

    const rascunho = await conteudoParaPdf(rev.id);
    expect(Object.keys(await carregarImagensDoDesenho(rascunho!.conteudo))).toEqual([b.sha256]);
  });

  it("imagem compartilhada entre revisões continua legível depois de excluir logicamente a original", async () => {
    const m = await montar("Compartilhada");
    const a = await imagemNoStorage("#775599");
    const r = await ligar(m.propostaId, m.itens[0], a);
    await enviar(m.propostaId);
    const rev = await revisar(m.propostaId);
    await prisma.anexo.update({ where: { id: r.anexoId }, data: { deletadoEm: new Date() } });
    for (const id of [m.propostaId, rev.id]) {
      const dados = await conteudoParaPdf(id);
      expect(Object.keys(await carregarImagensDoDesenho(dados!.conteudo)), `proposta ${id}`).toEqual([a.sha256]);
      expect(ehPdf(await gerarPdfDaProposta(dados!.conteudo))).toBe(true);
    }
  });
});

describe("falha segura: a geração falha, nunca cai no desenho automático", () => {
  it("arquivo removido do Storage: erro legível com o número do item (proposta e folha de produção)", async () => {
    const m = await montar("Sumiu");
    const a = await imagemNoStorage("#3366cc");
    await ligar(m.propostaId, m.itens[0], a);
    await enviar(m.propostaId);
    const dados = (await conteudoParaPdf(m.propostaId))!;
    expect(ehPdf(await gerarPdfDaProposta(dados.conteudo))).toBe(true); // antes de sumir, sai normal

    await removerObjeto(a.caminho);
    const erro = await gerarPdfDaProposta(dados.conteudo).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroDesenhoIndisponivel);
    expect((erro as Error).message).toBe("Não foi possível carregar o desenho do item 1; tente de novo.");
    await expect(gerarPdfDeProducao(dados.conteudo, null)).rejects.toBeInstanceOf(ErroDesenhoIndisponivel);
  });

  it("arquivo ALTERADO (outro conteúdo no mesmo caminho): o hash não confere e a geração falha", async () => {
    const m = await montar("Alterado");
    const a = await imagemNoStorage("#3366cc");
    await ligar(m.propostaId, m.itens[0], a);
    await enviar(m.propostaId);
    const dados = (await conteudoParaPdf(m.propostaId))!;
    const outra = await processarImagemDeDesenho(await sharp({ create: { width: 900, height: 400, channels: 3, background: "#ff0000" } }).png().toBuffer());
    await removerObjeto(a.caminho);
    await gravarObjeto(a.caminho, outra.bytes, outra.mime);
    await expect(gerarPdfDaProposta(dados.conteudo)).rejects.toThrow("Não foi possível carregar o desenho do item 1; tente de novo.");
  });

  it("vários itens: avisa o de MENOR número que falhou; o que está íntegro não esconde a falha", async () => {
    const m = await montar("Varios", 3);
    const [a, b] = [await imagemNoStorage("#3366cc"), await imagemNoStorage("#22aa55")];
    await ligar(m.propostaId, m.itens[1], a);
    await ligar(m.propostaId, m.itens[2], b);
    await enviar(m.propostaId);
    const dados = (await conteudoParaPdf(m.propostaId))!;
    await removerObjeto(b.caminho);
    await expect(gerarPdfDaProposta(dados.conteudo)).rejects.toThrow("do item 3;");
    await removerObjeto(a.caminho);
    await expect(gerarPdfDaProposta(dados.conteudo)).rejects.toThrow("do item 2;");
  });

  it("a folha de produção de uma opção só carrega as imagens dela", async () => {
    const m = await montar("Opcao");
    const a = await imagemNoStorage("#3366cc");
    await ligar(m.propostaId, m.itens[0], a);
    await enviar(m.propostaId);
    const dados = (await conteudoParaPdf(m.propostaId))!;
    expect(Object.keys(await carregarImagensDoDesenho(dados.conteudo, "id-de-outra-opcao"))).toEqual([]);
    expect(Object.keys(await carregarImagensDoDesenho(dados.conteudo, m.opcaoId))).toEqual([a.sha256]);
  });
});

describe("aprovar, desfazer e remover continuam corretos", () => {
  it("aprovar um RASCUNHO direto congela a imagem; desfazer a aprovação mantém o snapshot e o PDF", async () => {
    const m = await montar("Aprova");
    const a = await imagemNoStorage("#3366cc");
    const r = await ligar(m.propostaId, m.itens[0], a);
    await prisma.$transaction((tx) => aprovarProposta(tx, { usuario, propostaId: m.propostaId, opcaoId: m.opcaoId, forma: "WHATSAPP", aceitaEm: "2026-11-16" }), { timeout: 30_000 });
    const aprovada = await prisma.proposta.findUniqueOrThrow({ where: { id: m.propostaId } });
    expect(aprovada).toMatchObject({ status: "APROVADA", valorAprovadoCentavos: 200000 }); // o dinheiro não depende da imagem
    expect(itensDo(aprovada.snapshot as unknown as ConteudoProposta)[0].desenhoImagem?.sha256).toBe(a.sha256);

    await prisma.$transaction((tx) => desfazerAprovacao(tx, { usuario, propostaId: m.propostaId, motivo: "Aprovei por engano", reabrirId: null }), { timeout: 30_000 });
    const depois = await prisma.proposta.findUniqueOrThrow({ where: { id: m.propostaId } });
    expect(depois.status).not.toBe("APROVADA");
    expect(itensDo(depois.snapshot as unknown as ConteudoProposta)[0].desenhoImagem?.sha256).toBe(a.sha256);
    expect((await prisma.itemProposta.findUniqueOrThrow({ where: { id: m.itens[0] } })).desenhoAnexoId).toBe(r.anexoId);
    expect(ehPdf(await gerarPdfDaProposta((await conteudoParaPdf(m.propostaId))!.conteudo))).toBe(true);
  });

  it("remover o desenho no rascunho volta ao automático: o PDF sai sem imagem e o snapshot da enviada anterior não muda", async () => {
    const m = await montar("Remove");
    const a = await imagemNoStorage("#3366cc");
    await ligar(m.propostaId, m.itens[0], a);
    await enviar(m.propostaId);
    const rev = await revisar(m.propostaId);
    const itemDaRevisao = (await prisma.itemProposta.findFirstOrThrow({ where: { propostaId: rev.id, deletadoEm: null }, orderBy: { ordem: "asc" } })).id;
    await prisma.$transaction((tx) => removerDesenhoDoItem(tx, { usuario, propostaId: rev.id, itemId: itemDaRevisao }));
    expect(Object.keys(await carregarImagensDoDesenho((await conteudoParaPdf(rev.id))!.conteudo))).toEqual([]);
    expect(Object.keys(await carregarImagensDoDesenho((await conteudoParaPdf(m.propostaId))!.conteudo))).toEqual([a.sha256]);
  });
});

describe("tamanho do desenho no snapshot (Bloco 5)", () => {
  const GRANDE = { tamanhoDesenho: "GRANDE" };
  const tamanhoDe = (i: { tamanhoDesenho?: string }) => ("tamanhoDesenho" in i ? i.tamanhoDesenho : undefined);

  it("só entra no snapshot quando o item tem imagem E o tamanho é Grande (item sem imagem nunca ganha o campo)", async () => {
    const m = await montar("TamanhoSnapshot", 3);
    const a = await imagemNoStorage("#3366cc");
    const b = await imagemNoStorage("#22aa55");
    await ligar(m.propostaId, m.itens[0], a); // com imagem, Grande
    await ligar(m.propostaId, m.itens[1], b); // com imagem, Normal (sem configuração)
    await prisma.itemProposta.update({ where: { id: m.itens[0] }, data: { desenhoConfig: GRANDE } });
    await prisma.itemProposta.update({ where: { id: m.itens[2] }, data: { desenhoConfig: GRANDE } }); // Grande, mas SEM imagem
    await enviar(m.propostaId);
    const [i1, i2, i3] = itensDo(await snapshotDe(m.propostaId));
    expect(tamanhoDe(i1)).toBe("GRANDE");
    expect("tamanhoDesenho" in i2).toBe(false);
    expect("tamanhoDesenho" in i3).toBe(false);
  });

  it("depois de enviar, mudar o tamanho do item NÃO muda o PDF da enviada (lê o snapshot); a revisão copia o tamanho", async () => {
    const m = await montar("TamanhoCongela");
    const a = await imagemNoStorage("#3366cc", 1200, 400);
    await ligar(m.propostaId, m.itens[0], a);
    await prisma.itemProposta.update({ where: { id: m.itens[0] }, data: { desenhoConfig: GRANDE } });
    await enviar(m.propostaId);
    await prisma.itemProposta.update({ where: { id: m.itens[0] }, data: { desenhoConfig: { tamanhoDesenho: "NORMAL" } } }); // pior caso: a linha muda por fora

    const dados = (await conteudoParaPdf(m.propostaId))!;
    const [i] = (await imagensDoPdf(await gerarPdfDaProposta(dados.conteudo))).filter((x) => x.larguraPx === a.larguraPx && x.alturaPx === a.alturaPx);
    const caixa = CAIXAS_DA_IMAGEM.GRANDE.proposta;
    expect(Math.abs(i.larguraPt - caixa.largura) < 0.6 || Math.abs(i.alturaPt - caixa.altura) < 0.6, "continua no tamanho Grande congelado").toBe(true);
    expect(i.larguraPt).toBeGreaterThan(CAIXAS_DA_IMAGEM.NORMAL.proposta.largura + 1);

    const rev = await revisar(m.propostaId);
    const itemDaRevisao = await prisma.itemProposta.findFirstOrThrow({ where: { propostaId: rev.id, deletadoEm: null }, orderBy: { ordem: "asc" } });
    expect(itemDaRevisao.desenhoConfig).toEqual({ tamanhoDesenho: "NORMAL" }); // a revisão parte do estado ATUAL do item, como o resto do item
  });
});
