import { randomUUID } from "node:crypto";

import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { compararRevisoes, type ConteudoComparavel } from "@/lib/dominio/ciclo-proposta";
import { marcaDoDesenho, marcaDoTamanho } from "@/lib/dominio/desenho-item";
import { criarClientePrisma } from "@/lib/db/criar-cliente";
import { processarImagemDeDesenho } from "@/lib/imagem/processar";
import { gravarObjeto, removerObjeto } from "@/lib/storage";
import { proximoCodigoDoProjeto } from "@/modules/projetos/servico";
import type { ConteudoProposta } from "@/modules/propostas/conteudo";
import { carregarImagensDoDesenho, conteudoParaPdf, gerarPdfDaProposta, gerarPdfDeProducao } from "@/modules/propostas/pdf/gerar";
import { CAIXAS_DA_IMAGEM } from "@/modules/propostas/pdf/imagens";
import { reservarNumeroDeProposta } from "@/modules/propostas/servico";
import { aprovarProposta, construirConteudo, copiarProposta, enviarProposta } from "@/modules/propostas/servico-ciclo";
import { definirDesenhoDoItem, removerDesenhoDoItem } from "@/modules/propostas/servico-desenho";
import { desfazerAprovacao } from "@/modules/propostas/servico-desfazer";
import { definirDesenhoDaTipologia, mudarTamanhoDoDesenhoDaTipologia, removerDesenhoDaTipologia, salvarDesenhoComoNovaTipologia } from "@/modules/tipologias/servico-desenho";

import { imagensDoPdf } from "../e2e/desenho-ajudantes";
import { comConexao, criarUsuarioDeTeste } from "./banco-teste";

/**
 * Fase 3.6b-3 (Bloco 3): o desenho da tipologia na proposta, com o Storage REAL. Só toca registros "Int DesTip" e os
 * objetos "IntDesTip/..." do bucket (removidos no fim).
 */
const PREFIXO = "Int DesTip";
const LOGIN = "int-desenho-tipologia-prop";
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
    await c.query(`DELETE FROM "LogAuditoria" WHERE "entidade" = 'Tipologia' AND "entidadeId" IN (SELECT id FROM "Tipologia" WHERE nome LIKE $1)`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "LogAuditoria" WHERE "entidade" = 'ItemProposta' AND "entidadeId" IN (${itens})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "LogAuditoria" WHERE "entidade" IN ('Proposta','Projeto') AND ("entidadeId" IN (${propostas}) OR "entidadeId" IN (${projetos}))`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "LogAuditoria" WHERE "entidade" = 'ContaReceber' AND "entidadeId" IN (${contas})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "MovimentoEstoque" WHERE "projetoId" IN (${projetos})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "PausaProjeto" WHERE "projetoId" IN (${projetos})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "ContaReceber" WHERE "projetoId" IN (${projetos})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "EventoAgenda" WHERE "projetoId" IN (${projetos})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "EtapaProjeto" WHERE "projetoId" IN (${projetos})`, [`${PREFIXO}%`]);
    // Ordem: itens (apontam para a tipologia), depois tipologias (apontam para o item de origem e o anexo), depois anexos.
    await c.query(`DELETE FROM "ItemPropostaMedida" WHERE "itemId" IN (${itens})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "ItemProposta" WHERE "propostaId" IN (${propostas})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Tipologia" WHERE nome LIKE $1`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "LogAuditoria" WHERE "entidade" = 'Anexo' AND "entidadeId" IN (SELECT id FROM "Anexo" WHERE caminho LIKE 'IntDesTip/%')`);
    await c.query(`DELETE FROM "Anexo" WHERE caminho LIKE 'IntDesTip/%'`);
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

const novaTipologia = (nome: string) => prisma.tipologia.create({ data: { nome: `${PREFIXO} ${nome}`, templateDescricao: "JANELA {FOLHAS}", tipoDesenho: "JANELA_CORRER" }, select: { id: true } });

/** Projeto + proposta rascunho (1 opção, `n` itens manuais; o item `comTipologia` (índice) usa a tipologia; cronograma 50% / 50%). */
async function montar(titulo: string, tipologiaId: string | null, n = 2) {
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
      // O primeiro item usa a tipologia; os outros ficam sem tipologia (item livre).
      const item = await tx.itemProposta.create({
        data: { propostaId: proposta.id, opcaoId: proposta.opcoes[0].id, ordem: i, tipologiaId: i === 0 ? tipologiaId : null, descricao: `ITEM ${i + 1}`, modoPreco: "MANUAL", valorManualCentavos: 100000, precoTotalCentavos: 100000, medidas: { create: [{ larguraMm: 1000, alturaMm: 1000, quantidade: 1 }] } },
      });
      itens.push(item.id);
    }
    return { projetoId: projeto.id, propostaId: proposta.id, opcaoId: proposta.opcoes[0].id, itens };
  });
}

async function imagemNoStorage(cor: string, l = 900, a = 400) {
  const processada = await processarImagemDeDesenho(await sharp({ create: { width: l, height: a, channels: 3, background: cor } }).png().toBuffer());
  const caminho = `IntDesTip/${randomUUID()}.png`;
  await gravarObjeto(caminho, processada.bytes, processada.mime);
  objetosNoStorage.push(caminho);
  return { ...processada, caminho };
}
type ImagemTeste = Awaited<ReturnType<typeof imagemNoStorage>>;
const gravada = (i: ImagemTeste) => ({ caminho: i.caminho, mime: i.mime, tamanhoBytes: i.bytes.length, sha256: i.sha256, larguraPx: i.larguraPx, alturaPx: i.alturaPx });

const naTipologia = (tipologiaId: string, i: ImagemTeste) => prisma.$transaction((tx) => definirDesenhoDaTipologia(tx, { usuario, tipologiaId, imagem: gravada(i) }));
const tirarDaTipologia = (tipologiaId: string) => prisma.$transaction((tx) => removerDesenhoDaTipologia(tx, { usuario, tipologiaId }));
const tamanhoDaTipologia = (tipologiaId: string, tamanho: "NORMAL" | "GRANDE") => prisma.$transaction((tx) => mudarTamanhoDoDesenhoDaTipologia(tx, { usuario, tipologiaId, tamanho }));
const noItem = (propostaId: string, itemId: string, i: ImagemTeste) => prisma.$transaction((tx) => definirDesenhoDoItem(tx, { usuario, propostaId, itemId, imagem: gravada(i) }));
const tirarDoItem = (propostaId: string, itemId: string) => prisma.$transaction((tx) => removerDesenhoDoItem(tx, { usuario, propostaId, itemId }));
const enviar = (propostaId: string) => prisma.$transaction((tx) => enviarProposta(tx, { usuario, propostaId }));
const revisar = (origemId: string) => prisma.$transaction((tx) => copiarProposta(tx, { usuarioId: usuario.id, origemId, modo: "REVISAO" }));
const aoVivo = (propostaId: string) => construirConteudo(prisma, propostaId);
const snapshotDe = async (propostaId: string) => (await prisma.proposta.findUniqueOrThrow({ where: { id: propostaId } })).snapshot as unknown as ConteudoProposta;
const itensDo = (c: ConteudoProposta) => c.opcoes.flatMap((o) => o.secoes.flatMap((s) => s.itens));
const ehPdf = (b: Buffer) => b.subarray(0, 5).toString("latin1") === "%PDF-";
const shaDoItem = (c: ConteudoProposta, k: number) => itensDo(c)[k].desenhoImagem?.sha256;

function paraComparavel(c: ConteudoProposta): ConteudoComparavel {
  return {
    numero: c.numero,
    revisao: c.revisao,
    comNotaFiscal: c.comNotaFiscal,
    opcoes: c.opcoes.map((o) => ({
      nome: o.nome,
      totalCentavos: o.totais.totalCentavos,
      itens: o.secoes.flatMap((s) => s.itens).map((i) => ({ descricao: i.descricao, medidas: i.medidas.map((m) => `${m.larguraMm} X ${m.alturaMm}`).join(" / "), precoTotalCentavos: i.precoTotalCentavos, desenho: marcaDoDesenho(i), tamanho: marcaDoTamanho(i) })),
    })),
  };
}

describe("o item herda o desenho da tipologia (rascunho ao vivo)", () => {
  it("item da tipologia com imagem: o conteúdo traz a imagem da tipologia; item livre e proposta sem imagem não ganham o campo", async () => {
    const a = await imagemNoStorage("#3366cc");
    const t = await novaTipologia("Herda");
    const r = await naTipologia(t.id, a);
    const m = await montar("Herda", t.id);
    const [i1, i2] = itensDo(await aoVivo(m.propostaId));
    expect(i1.desenhoImagem).toEqual({ anexoId: r.anexoId, caminho: a.caminho, sha256: a.sha256, mime: "image/png", larguraPx: a.larguraPx, alturaPx: a.alturaPx });
    expect("tamanhoDesenho" in i1).toBe(false); // Normal: sem a chave, como sempre
    expect("desenhoImagem" in i2).toBe(false);

    const semImagem = await novaTipologia("SemImagem");
    const n = await montar("SemImagemNenhuma", semImagem.id);
    for (const i of itensDo(await aoVivo(n.propostaId))) expect("desenhoImagem" in i).toBe(false);
  });

  it("o tamanho herdado é o da tipologia (Grande entra no conteúdo)", async () => {
    const t = await novaTipologia("TamanhoHerdado");
    await naTipologia(t.id, await imagemNoStorage("#3366cc"));
    await tamanhoDaTipologia(t.id, "GRANDE");
    const m = await montar("TamanhoHerdado", t.id);
    expect(itensDo(await aoVivo(m.propostaId))[0].tamanhoDesenho).toBe("GRANDE");
  });

  it("a imagem do ITEM vence a da tipologia (e o tamanho é o do item)", async () => {
    const [da, db] = [await imagemNoStorage("#3366cc"), await imagemNoStorage("#22aa55")];
    const t = await novaTipologia("ItemVence");
    await naTipologia(t.id, da);
    await tamanhoDaTipologia(t.id, "GRANDE");
    const m = await montar("ItemVence", t.id);
    await noItem(m.propostaId, m.itens[0], db);
    const i1 = itensDo(await aoVivo(m.propostaId))[0];
    expect(i1.desenhoImagem?.sha256).toBe(db.sha256);
    expect("tamanhoDesenho" in i1).toBe(false); // o item é Normal, mesmo com a tipologia Grande
  });

  it("remover a imagem do item volta à da tipologia (não ao automático)", async () => {
    const [da, db] = [await imagemNoStorage("#3366cc"), await imagemNoStorage("#22aa55")];
    const t = await novaTipologia("VoltaTipologia");
    await naTipologia(t.id, da);
    const m = await montar("VoltaTipologia", t.id);
    await noItem(m.propostaId, m.itens[0], db);
    expect(shaDoItem(await aoVivo(m.propostaId), 0)).toBe(db.sha256);
    await tirarDoItem(m.propostaId, m.itens[0]);
    expect(shaDoItem(await aoVivo(m.propostaId), 0)).toBe(da.sha256);
  });

  it("o rascunho acompanha a tipologia: trocar muda, remover volta ao automático", async () => {
    const [da, db] = [await imagemNoStorage("#3366cc"), await imagemNoStorage("#22aa55")];
    const t = await novaTipologia("Acompanha");
    await naTipologia(t.id, da);
    const m = await montar("Acompanha", t.id);
    expect(shaDoItem(await aoVivo(m.propostaId), 0)).toBe(da.sha256);
    await naTipologia(t.id, db);
    expect(shaDoItem(await aoVivo(m.propostaId), 0)).toBe(db.sha256);
    await tirarDaTipologia(t.id);
    expect(shaDoItem(await aoVivo(m.propostaId), 0)).toBeUndefined();
  });

  it("tipologia ARQUIVADA (ativo = false) continua valendo", async () => {
    const a = await imagemNoStorage("#3366cc");
    const t = await novaTipologia("Arquivada");
    await naTipologia(t.id, a);
    const m = await montar("Arquivada", t.id);
    await prisma.tipologia.update({ where: { id: t.id }, data: { ativo: false } });
    expect(shaDoItem(await aoVivo(m.propostaId), 0)).toBe(a.sha256);
  });
});

describe("enviar congela a imagem RESOLVIDA; a enviada nunca relê a tipologia", () => {
  it("depois de enviar: trocar, tamanho, remover e arquivar a tipologia não mudam o snapshot nem o PDF", async () => {
    const [da, db] = [await imagemNoStorage("#3366cc", 1200, 400), await imagemNoStorage("#22aa55")];
    const t = await novaTipologia("Congela");
    const r = await naTipologia(t.id, da);
    const m = await montar("Congela", t.id);
    await enviar(m.propostaId);
    const congelado = await snapshotDe(m.propostaId);
    expect(itensDo(congelado)[0].desenhoImagem).toEqual({ anexoId: r.anexoId, caminho: da.caminho, sha256: da.sha256, mime: "image/png", larguraPx: da.larguraPx, alturaPx: da.alturaPx });
    const pdfAntes = await gerarPdfDaProposta((await conteudoParaPdf(m.propostaId))!.conteudo);

    await naTipologia(t.id, db);
    await tamanhoDaTipologia(t.id, "GRANDE");
    await prisma.tipologia.update({ where: { id: t.id }, data: { ativo: false } });
    await tirarDaTipologia(t.id);

    expect(await snapshotDe(m.propostaId)).toEqual(congelado);
    const dados = (await conteudoParaPdf(m.propostaId))!;
    expect(Object.keys(await carregarImagensDoDesenho(dados.conteudo))).toEqual([da.sha256]); // só a imagem congelada é carregada
    const pdfDepois = await gerarPdfDaProposta(dados.conteudo);
    expect(ehPdf(pdfDepois)).toBe(true);
    expect(await imagensDoPdf(pdfDepois)).toHaveLength((await imagensDoPdf(pdfAntes)).length);
    // Continua a imagem congelada (1200 x 400), nunca a nova (900 x 400) nem a que ficou na tipologia.
    expect((await imagensDoPdf(pdfDepois)).filter((x) => x.larguraPx === da.larguraPx && x.alturaPx === da.alturaPx)).toHaveLength(1);
    expect((await imagensDoPdf(pdfDepois)).filter((x) => x.larguraPx === db.larguraPx && x.alturaPx === db.alturaPx)).toHaveLength(0);
    expect(ehPdf(await gerarPdfDeProducao(dados.conteudo, null))).toBe(true);
  });

  it("aprovar um RASCUNHO direto congela a imagem herdada; desfazer mantém; mudar a tipologia depois não altera", async () => {
    const [da, db] = [await imagemNoStorage("#3366cc"), await imagemNoStorage("#22aa55")];
    const t = await novaTipologia("Aprova");
    await naTipologia(t.id, da);
    const m = await montar("Aprova", t.id);
    await prisma.$transaction((tx) => aprovarProposta(tx, { usuario, propostaId: m.propostaId, opcaoId: m.opcaoId, forma: "WHATSAPP", aceitaEm: "2026-11-16" }), { timeout: 30_000 });
    const aprovada = await prisma.proposta.findUniqueOrThrow({ where: { id: m.propostaId } });
    expect(aprovada).toMatchObject({ status: "APROVADA", valorAprovadoCentavos: 200000 }); // o dinheiro não depende da imagem
    expect(shaDoItem(aprovada.snapshot as unknown as ConteudoProposta, 0)).toBe(da.sha256);

    await naTipologia(t.id, db);
    await prisma.$transaction((tx) => desfazerAprovacao(tx, { usuario, propostaId: m.propostaId, motivo: "Aprovei por engano", reabrirId: null }), { timeout: 30_000 });
    const depois = await prisma.proposta.findUniqueOrThrow({ where: { id: m.propostaId } });
    expect(depois.status).not.toBe("APROVADA");
    expect(shaDoItem(depois.snapshot as unknown as ConteudoProposta, 0)).toBe(da.sha256);
  });

  it("proposta enviada com imagem PRÓPRIA no item: a troca da tipologia também não conta", async () => {
    const [da, db] = [await imagemNoStorage("#3366cc"), await imagemNoStorage("#22aa55")];
    const t = await novaTipologia("PropriaCongela");
    await naTipologia(t.id, da);
    const m = await montar("PropriaCongela", t.id);
    await noItem(m.propostaId, m.itens[0], db);
    await enviar(m.propostaId);
    await tirarDaTipologia(t.id);
    expect(shaDoItem(await snapshotDe(m.propostaId), 0)).toBe(db.sha256);
  });
});

describe("comparação de revisões", () => {
  it("a tipologia mudou de desenho entre a enviada e a revisão: aparece 'trocado'; sem mudança, nada aparece", async () => {
    const [da, db] = [await imagemNoStorage("#3366cc"), await imagemNoStorage("#22aa55")];
    const t = await novaTipologia("Compara");
    await naTipologia(t.id, da);
    const m = await montar("Compara", t.id);
    await enviar(m.propostaId);
    const rev = await revisar(m.propostaId);

    // Sem mudança na tipologia: o rascunho da revisão resolve a mesma imagem da enviada.
    const igual = compararRevisoes(paraComparavel(await snapshotDe(m.propostaId)), paraComparavel(await aoVivo(rev.id)));
    expect(igual.semMudancas).toBe(true);

    await naTipologia(t.id, db);
    const trocado = compararRevisoes(paraComparavel(await snapshotDe(m.propostaId)), paraComparavel(await aoVivo(rev.id)));
    expect(trocado.semMudancas).toBe(false);
    expect(trocado.opcoes[0].itens).toEqual([expect.objectContaining({ tipo: "ALTERADO", desenho: "TROCADO" })]);

    await tirarDaTipologia(t.id);
    const removido = compararRevisoes(paraComparavel(await snapshotDe(m.propostaId)), paraComparavel(await aoVivo(rev.id)));
    expect(removido.opcoes[0].itens).toEqual([expect.objectContaining({ tipo: "ALTERADO", desenho: "REMOVIDO" })]);
  });
});

describe("PDF com a imagem herdada: dentro da caixa, Normal e Grande, proposta e folha de produção", () => {
  it.each([["NORMAL" as const], ["GRANDE" as const]])("tamanho %s da tipologia", async (tamanho) => {
    const a = await imagemNoStorage("#3366cc", 1200, 400);
    const t = await novaTipologia(`Pdf ${tamanho}`);
    await naTipologia(t.id, a);
    if (tamanho === "GRANDE") await tamanhoDaTipologia(t.id, "GRANDE");
    const m = await montar(`Pdf ${tamanho}`, t.id);
    const dados = (await conteudoParaPdf(m.propostaId))!;
    for (const [nome, pdf, caixa] of [
      ["proposta", await gerarPdfDaProposta(dados.conteudo), CAIXAS_DA_IMAGEM[tamanho].proposta],
      ["produção", await gerarPdfDeProducao(dados.conteudo, null), CAIXAS_DA_IMAGEM[tamanho].producao],
    ] as const) {
      const imgs = (await imagensDoPdf(pdf)).filter((x) => x.larguraPx === a.larguraPx && x.alturaPx === a.alturaPx);
      expect(imgs, `${nome}: uma imagem herdada`).toHaveLength(1);
      expect(imgs[0].larguraPt, `${nome}: cabe na largura`).toBeLessThanOrEqual(caixa.largura + 0.6);
      expect(imgs[0].alturaPt, `${nome}: cabe na altura`).toBeLessThanOrEqual(caixa.altura + 0.6);
      expect(Math.abs(imgs[0].larguraPt / imgs[0].alturaPt - a.larguraPx / a.alturaPx), `${nome}: sem esticar`).toBeLessThan(0.02);
    }
  });
});

describe("salvar o desenho do item como nova tipologia: a nova tipologia é herdada por outro item", () => {
  it("cria a tipologia com o mesmo anexo e um item novo que a usa passa a ter a imagem", async () => {
    const a = await imagemNoStorage("#aa5522");
    const m = await montar("SalvarComo", null);
    const doItem = await noItem(m.propostaId, m.itens[0], a);
    const r = await prisma.$transaction((tx) => salvarDesenhoComoNovaTipologia(tx, { usuario, itemId: m.itens[0], nome: `${PREFIXO} Janela salva`, tipoDesenho: "JANELA_CORRER", templateDescricao: "JANELA DE CORRER {FOLHAS}" }));
    const nova = await prisma.tipologia.findUniqueOrThrow({ where: { id: r.tipologiaId } });
    expect(nova).toMatchObject({ desenhoAnexoId: doItem.anexoId, revisarCadastro: true, criadaDeItemId: m.itens[0] });

    const outra = await montar("SalvarComoOutra", r.tipologiaId);
    expect(shaDoItem(await aoVivo(outra.propostaId), 0)).toBe(a.sha256);
    // O item de origem continua com a imagem dele.
    expect(shaDoItem(await aoVivo(m.propostaId), 0)).toBe(a.sha256);
  });
});

describe("imagem incompleta: a mensagem diz onde reenviar", () => {
  it("tipologia com imagem sem hash: o rascunho avisa para reenviar NO CADASTRO DA TIPOLOGIA (e o item com imagem própria incompleta continua pedindo no item)", async () => {
    const t = await novaTipologia("Incompleta");
    const sem = await prisma.anexo.create({
      data: { entidadeTipo: "Tipologia", entidadeId: t.id, categoria: "desenho-tipologia", nome: "desenho-tipologia.png", caminho: `IntDesTip/${randomUUID()}.png`, mime: "image/png", tamanhoBytes: 10, usarNoPortfolio: false, criadoPorId: usuario.id },
      select: { id: true },
    });
    await prisma.tipologia.update({ where: { id: t.id }, data: { desenhoAnexoId: sem.id } });
    const m = await montar("Incompleta", t.id);
    await expect(aoVivo(m.propostaId)).rejects.toThrow("O desenho da tipologia usada no item 1 está incompleto. Envie a imagem de novo no cadastro da tipologia.");

    // Imagem PRÓPRIA do item incompleta: a mensagem de sempre (reenviar no item), mesmo havendo imagem na tipologia.
    const outroSem = await prisma.anexo.create({
      data: { entidadeTipo: "ItemProposta", entidadeId: m.itens[0], categoria: "desenho-item", nome: "desenho-item.png", caminho: `IntDesTip/${randomUUID()}.png`, mime: "image/png", tamanhoBytes: 10, usarNoPortfolio: false, criadoPorId: usuario.id },
      select: { id: true },
    });
    await prisma.itemProposta.update({ where: { id: m.itens[0] }, data: { desenhoAnexoId: outroSem.id } });
    await expect(aoVivo(m.propostaId)).rejects.toThrow("O desenho personalizado do item 1 está incompleto. Envie a imagem de novo.");
  });
});
