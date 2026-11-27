import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { criarClientePrisma } from "@/lib/db/criar-cliente";
import { proximoCodigoDoProjeto } from "@/modules/projetos/servico";
import { reservarNumeroDeProposta } from "@/modules/propostas/servico";
import { definirDesenhoDoItem, exigirConfigDoDesenho, removerDesenhoDoItem, type ImagemGravada } from "@/modules/propostas/servico-desenho";
import {
  definirDesenhoDaTipologia,
  marcarTipologiaComoRevisada,
  mudarTamanhoDoDesenhoDaTipologia,
  removerDesenhoDaTipologia,
  salvarDesenhoComoNovaTipologia,
} from "@/modules/tipologias/servico-desenho";

import { comConexao, criarUsuarioDeTeste } from "./banco-teste";

/**
 * Fase 3.6b-3 (Bloco 1): desenho na tipologia e "salvar o desenho do item como nova tipologia". Só toca registros com o
 * prefixo "Int Dtp" (anexos de teste usam o caminho "Int Dtp/..." e NÃO existem no Storage: o serviço só registra a imagem
 * já gravada). Não depende de nenhuma tipologia, linha ou condição que o dono possa editar.
 */
const PREFIXO = "Int Dtp";
const LOGIN = "int-desenho-tipologia";
const prisma = criarClientePrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL);

let usuario: { id: string; nome: string };
let clienteId: string;
let contador: { proximo: number | null; ano: number | null };

async function limpar() {
  await comConexao(async (c) => {
    const projetos = `SELECT id FROM "Projeto" WHERE titulo LIKE $1`;
    const propostas = `SELECT id FROM "Proposta" WHERE "projetoId" IN (${projetos})`;
    const itens = `SELECT id FROM "ItemProposta" WHERE "propostaId" IN (${propostas})`;
    const tipologias = `SELECT id FROM "Tipologia" WHERE nome LIKE $1`;
    await c.query(`DELETE FROM "LogAuditoria" WHERE "entidade" = 'Tipologia' AND "entidadeId" IN (${tipologias})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "LogAuditoria" WHERE "entidade" = 'ItemProposta' AND "entidadeId" IN (${itens})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "LogAuditoria" WHERE "entidade" IN ('Proposta','Projeto') AND ("entidadeId" IN (${propostas}) OR "entidadeId" IN (${projetos}))`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "LogAuditoria" WHERE "entidade" = 'OpcaoProposta' AND "entidadeId" IN (SELECT id FROM "OpcaoProposta" WHERE "propostaId" IN (${propostas}))`, [`${PREFIXO}%`]);
    // O item aponta para a tipologia (tipologiaId, RESTRICT) e a tipologia aponta para o item de origem (SET NULL) e para o
    // anexo (RESTRICT): primeiro os itens, depois as tipologias, por fim os anexos.
    await c.query(`DELETE FROM "ItemPropostaMedida" WHERE "itemId" IN (${itens})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "ItemProposta" WHERE "propostaId" IN (${propostas})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Tipologia" WHERE nome LIKE $1`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "LogAuditoria" WHERE "entidade" = 'Anexo' AND "entidadeId" IN (SELECT id FROM "Anexo" WHERE caminho LIKE 'Int Dtp/%')`);
    await c.query(`DELETE FROM "Anexo" WHERE caminho LIKE 'Int Dtp/%'`);
    await c.query(`DELETE FROM "PropostaParcela" WHERE "propostaId" IN (${propostas})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "GrupoProposta" WHERE "propostaId" IN (${propostas})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "OpcaoProposta" WHERE "propostaId" IN (${propostas})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Proposta" WHERE "projetoId" IN (${projetos})`, [`${PREFIXO}%`]);
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

const imagem = (extra: Partial<ImagemGravada> = {}): ImagemGravada => ({
  caminho: `Int Dtp/${randomUUID()}.png`,
  mime: "image/png",
  tamanhoBytes: 12_345,
  sha256: randomUUID().replace(/-/g, "").padEnd(64, "a"),
  larguraPx: 800,
  alturaPx: 600,
  ...extra,
});

const novaTipologia = (nome: string, extra: Record<string, unknown> = {}) =>
  prisma.tipologia.create({ data: { nome: `${PREFIXO} ${nome}`, templateDescricao: "JANELA {FOLHAS}", ...extra }, select: { id: true } });

/** Projeto + proposta rascunho com uma opção e um item (opcionalmente ligado a uma tipologia). */
async function montar(titulo: string, tipologiaId: string | null = null) {
  return prisma.$transaction(async (tx) => {
    const projeto = await tx.projeto.create({ data: { codigo: await proximoCodigoDoProjeto(tx), titulo: `${PREFIXO} ${titulo}`, clienteId, status: "ELABORANDO_PROPOSTA" } });
    const { numero, sequencial, ano } = await reservarNumeroDeProposta(tx);
    const proposta = await tx.proposta.create({
      data: { projetoId: projeto.id, numero, numeroSequencial: sequencial, ano, data: new Date(), clienteNome: `${PREFIXO} Cliente`, modoPrazo: "TOTAL", prazoTotalMaxDias: 30, opcoes: { create: [{ nome: "Opção 1", ordem: 0 }] } },
      include: { opcoes: true },
    });
    const item = await tx.itemProposta.create({
      data: { propostaId: proposta.id, opcaoId: proposta.opcoes[0].id, ordem: 0, descricao: "ITEM 1", tipologiaId, modoPreco: "MANUAL", valorManualCentavos: 100000, precoTotalCentavos: 100000, medidas: { create: [{ larguraMm: 1000, alturaMm: 1000, quantidade: 1 }] } },
    });
    return { propostaId: proposta.id, itemId: item.id };
  });
}

const definirNaTipologia = (tipologiaId: string, img: ImagemGravada = imagem()) => prisma.$transaction((tx) => definirDesenhoDaTipologia(tx, { usuario, tipologiaId, imagem: img }));
const tirarDaTipologia = (tipologiaId: string) => prisma.$transaction((tx) => removerDesenhoDaTipologia(tx, { usuario, tipologiaId }));
const tamanhoNaTipologia = (tipologiaId: string, tamanho: "NORMAL" | "GRANDE") => prisma.$transaction((tx) => mudarTamanhoDoDesenhoDaTipologia(tx, { usuario, tipologiaId, tamanho }));
const definirNoItem = (propostaId: string, itemId: string, img: ImagemGravada = imagem()) => prisma.$transaction((tx) => definirDesenhoDoItem(tx, { usuario, propostaId, itemId, imagem: img }));
const tirarDoItem = (propostaId: string, itemId: string) => prisma.$transaction((tx) => removerDesenhoDoItem(tx, { usuario, propostaId, itemId }));
const salvarComo = (itemId: string, nome: string, extra: Partial<{ tipoDesenho: "JANELA_CORRER" | "GENERICO" | "BOX_FRONTAL"; templateDescricao: string }> = {}) =>
  prisma.$transaction((tx) => salvarDesenhoComoNovaTipologia(tx, { usuario, itemId, nome: `${PREFIXO} ${nome}`, tipoDesenho: "JANELA_CORRER", templateDescricao: "JANELA DE CORRER {FOLHAS}", ...extra }));
const tipologia = (id: string) => prisma.tipologia.findUniqueOrThrow({ where: { id } });
const anexo = (id: string) => prisma.anexo.findUniqueOrThrow({ where: { id } });

describe("desenho da tipologia: definir, trocar e remover", () => {
  it("registra o anexo (categoria, entidade, hash, fora do portfólio), liga a tipologia e audita", async () => {
    const t = await novaTipologia("Definir");
    const img = imagem();
    const r = await definirNaTipologia(t.id, img);
    expect((await tipologia(t.id)).desenhoAnexoId).toBe(r.anexoId);
    expect(await anexo(r.anexoId)).toMatchObject({ entidadeTipo: "Tipologia", entidadeId: t.id, categoria: "desenho-tipologia", caminho: img.caminho, sha256: img.sha256, larguraPx: 800, alturaPx: 600, usarNoPortfolio: false, deletadoEm: null, criadoPorId: usuario.id });
    expect((await anexo(r.anexoId)).nome).toBe("desenho-tipologia.png");
    expect(await prisma.logAuditoria.count({ where: { entidade: "Tipologia", entidadeId: t.id, acao: "ATUALIZAR" } })).toBe(1);
    // Não vira foto de obra nem anexo de projeto/proposta.
    expect(await prisma.anexo.count({ where: { categoria: "foto-obra", entidadeId: t.id } })).toBe(0);
  });

  it("trocar aposenta o anexo antigo (sem uso em lugar nenhum); o novo vale", async () => {
    const t = await novaTipologia("Trocar");
    const a = await definirNaTipologia(t.id);
    const b = await definirNaTipologia(t.id);
    expect((await tipologia(t.id)).desenhoAnexoId).toBe(b.anexoId);
    expect((await anexo(a.anexoId)).deletadoEm).not.toBeNull();
    expect((await anexo(b.anexoId)).deletadoEm).toBeNull();
  });

  it("remover desliga a referência, zera o tamanho e aposenta o anexo; remover de novo é recusado", async () => {
    const t = await novaTipologia("Remover");
    const a = await definirNaTipologia(t.id);
    await tamanhoNaTipologia(t.id, "GRANDE");
    await tirarDaTipologia(t.id);
    const depois = await tipologia(t.id);
    expect(depois.desenhoAnexoId).toBeNull();
    expect(depois.desenhoConfig).toBeNull();
    expect((await anexo(a.anexoId)).deletadoEm).not.toBeNull();
    await expect(tirarDaTipologia(t.id)).rejects.toThrow("já usa o desenho automático");
  });

  it("tipologia excluída ou inexistente não recebe desenho", async () => {
    const t = await novaTipologia("Excluida", { deletadoEm: new Date() });
    await expect(definirNaTipologia(t.id)).rejects.toThrow("Tipologia não encontrada");
    await expect(definirNaTipologia("nao-existe")).rejects.toThrow("Tipologia não encontrada");
  });

  it("arquivar (ativo=false) não mexe no desenho: continua ligado e legível", async () => {
    const t = await novaTipologia("Arquivar");
    const a = await definirNaTipologia(t.id);
    await prisma.tipologia.update({ where: { id: t.id }, data: { ativo: false } });
    expect((await tipologia(t.id)).desenhoAnexoId).toBe(a.anexoId);
    expect((await anexo(a.anexoId)).deletadoEm).toBeNull();
  });
});

describe("tamanho do desenho da tipologia (configuração estrita)", () => {
  it("Grande grava só {tamanhoDesenho:'GRANDE'}; Normal volta a nulo; sem desenho é recusado", async () => {
    const t = await novaTipologia("Tamanho");
    await expect(tamanhoNaTipologia(t.id, "GRANDE")).rejects.toThrow("Envie um desenho");
    await definirNaTipologia(t.id);
    await tamanhoNaTipologia(t.id, "GRANDE");
    expect((await tipologia(t.id)).desenhoConfig).toEqual({ tamanhoDesenho: "GRANDE" });
    await tamanhoNaTipologia(t.id, "NORMAL");
    expect((await tipologia(t.id)).desenhoConfig).toBeNull();
  });

  it("outra chave ou outro valor é recusado antes de gravar (item e tipologia usam a mesma validação)", () => {
    expect(exigirConfigDoDesenho(null)).toBeNull();
    expect(exigirConfigDoDesenho({ tamanhoDesenho: "GRANDE" })).toEqual({ tamanhoDesenho: "GRANDE" });
    for (const ruim of [{}, { tamanhoDesenho: "grande" }, { tamanhoDesenho: "NORMAL" }, { tamanhoDesenho: "GRANDE", x: 1 }, { x: 1 }]) {
      expect(() => exigirConfigDoDesenho(ruim)).toThrow("Configuração do desenho inválida");
    }
  });
});

describe("salvar o desenho do item como nova tipologia", () => {
  it("cria a tipologia com o MESMO anexo, marcada para revisar, sem nada comercial; o item continua com a imagem", async () => {
    const origem = await novaTipologia("Origem", { categoria: "JANELA", opcoesFolhas: [2, 3], cobrancaPadrao: "POR_UNIDADE", categoriaMarkup: "VIDRO_TEMPERADO", exigeEsquadria: false });
    const m = await montar("Salvar", origem.id);
    const img = await definirNoItem(m.propostaId, m.itemId);

    const r = await salvarComo(m.itemId, "Janela do Marcelo");
    expect(r.jaExistia).toBe(false);
    const nova = await tipologia(r.tipologiaId);
    expect(nova).toMatchObject({
      nome: `${PREFIXO} Janela do Marcelo`,
      tipoDesenho: "JANELA_CORRER",
      templateDescricao: "JANELA DE CORRER {FOLHAS}",
      desenhoAnexoId: img.anexoId, // a MESMA referência, nenhum arquivo copiado
      revisarCadastro: true,
      revisarTexto: true,
      criadaDeItemId: m.itemId,
      ativo: true,
      exemplo: false,
      categoria: "JANELA", // dado descritivo da tipologia de origem
      opcoesFolhas: [2, 3],
      // Nada comercial copiado da origem: padrões neutros do banco.
      cobrancaPadrao: "POR_M2",
      categoriaMarkup: "PADRAO",
      exigeEsquadria: true,
      desenhoConfig: null,
    });
    expect(await prisma.composicaoInsumo.count({ where: { tipologiaId: nova.id } })).toBe(0);
    expect(await prisma.composicaoMaoDeObra.count({ where: { tipologiaId: nova.id } })).toBe(0);
    expect(await prisma.tabelaPreco.count({ where: { tipologiaId: nova.id } })).toBe(0);
    // Nenhum anexo novo: um só registro para a imagem; o item continua com ela.
    expect(await prisma.anexo.count({ where: { caminho: (await anexo(img.anexoId)).caminho } })).toBe(1);
    expect((await prisma.itemProposta.findUniqueOrThrow({ where: { id: m.itemId } })).desenhoAnexoId).toBe(img.anexoId);
    expect(await prisma.logAuditoria.count({ where: { entidade: "Tipologia", entidadeId: nova.id, acao: "CRIAR" } })).toBe(1);
  });

  it("item sem tipologia de origem usa categoria OUTRO e folhas vazias; tamanho Grande do item é copiado", async () => {
    const m = await montar("SemOrigem");
    await definirNoItem(m.propostaId, m.itemId);
    await prisma.itemProposta.update({ where: { id: m.itemId }, data: { desenhoConfig: { tamanhoDesenho: "GRANDE" } } });
    const r = await salvarComo(m.itemId, "Sem origem", { tipoDesenho: "GENERICO" });
    expect(await tipologia(r.tipologiaId)).toMatchObject({ categoria: "OUTRO", opcoesFolhas: [], tipoDesenho: "GENERICO", desenhoConfig: { tamanhoDesenho: "GRANDE" } });
  });

  it("item sem imagem própria não vira tipologia", async () => {
    const m = await montar("SemImagem");
    await expect(salvarComo(m.itemId, "Nao deve nascer")).rejects.toThrow("desenho personalizado");
    expect(await prisma.tipologia.count({ where: { nome: `${PREFIXO} Nao deve nascer` } })).toBe(0);
  });

  it("nome repetido (sem diferenciar maiúsculas) de outra tipologia viva é recusado", async () => {
    await novaTipologia("Nome Ocupado");
    const m = await montar("NomeRepetido");
    await definirNoItem(m.propostaId, m.itemId);
    await expect(salvarComo(m.itemId, "NOME ocupado")).rejects.toThrow("Já existe uma tipologia com esse nome.");
  });

  it("clique duplo (mesmo item, mesmo nome, em sequência) devolve a mesma tipologia", async () => {
    const m = await montar("CliqueDuplo");
    await definirNoItem(m.propostaId, m.itemId);
    const a = await salvarComo(m.itemId, "Clique duplo");
    const b = await salvarComo(m.itemId, "clique DUPLO");
    expect(b.tipologiaId).toBe(a.tipologiaId);
    expect(b.jaExistia).toBe(true);
    expect(await prisma.tipologia.count({ where: { criadaDeItemId: m.itemId, deletadoEm: null } })).toBe(1);
  });

  it("chamadas simultâneas do mesmo item e nome geram UMA tipologia", async () => {
    const m = await montar("Paralelo");
    await definirNoItem(m.propostaId, m.itemId);
    const rs = await Promise.all([salvarComo(m.itemId, "Paralelo"), salvarComo(m.itemId, "Paralelo"), salvarComo(m.itemId, "Paralelo")]);
    expect(new Set(rs.map((r) => r.tipologiaId)).size).toBe(1);
    expect(await prisma.tipologia.count({ where: { criadaDeItemId: m.itemId, deletadoEm: null } })).toBe(1);
  });

  it("o mesmo item com OUTRO nome cria outra tipologia (as duas dividem o anexo)", async () => {
    const m = await montar("DoisNomes");
    const img = await definirNoItem(m.propostaId, m.itemId);
    const a = await salvarComo(m.itemId, "Dois nomes A");
    const b = await salvarComo(m.itemId, "Dois nomes B");
    expect(a.tipologiaId).not.toBe(b.tipologiaId);
    expect((await tipologia(a.tipologiaId)).desenhoAnexoId).toBe(img.anexoId);
    expect((await tipologia(b.tipologiaId)).desenhoAnexoId).toBe(img.anexoId);
  });

  it("marcar como revisada tira o selo e audita; repetir não faz nada", async () => {
    const m = await montar("Revisar");
    await definirNoItem(m.propostaId, m.itemId);
    const r = await salvarComo(m.itemId, "Para revisar");
    await prisma.$transaction((tx) => marcarTipologiaComoRevisada(tx, { usuario, tipologiaId: r.tipologiaId }));
    expect((await tipologia(r.tipologiaId)).revisarCadastro).toBe(false);
    await prisma.$transaction((tx) => marcarTipologiaComoRevisada(tx, { usuario, tipologiaId: r.tipologiaId }));
    expect(await prisma.logAuditoria.count({ where: { entidade: "Tipologia", entidadeId: r.tipologiaId, acao: "ATUALIZAR" } })).toBe(1);
  });
});

describe("anexo compartilhado entre item e tipologia", () => {
  it("só é aposentado quando nenhum item vivo E nenhuma tipologia viva o usa", async () => {
    const m = await montar("Compartilhado");
    const img = await definirNoItem(m.propostaId, m.itemId);
    const r = await salvarComo(m.itemId, "Compartilhado");

    // O item solta a imagem: a tipologia ainda usa, o anexo segue vivo.
    await tirarDoItem(m.propostaId, m.itemId);
    expect((await anexo(img.anexoId)).deletadoEm).toBeNull();

    // A tipologia solta: agora ninguém usa, aposenta (o arquivo no Storage nunca é apagado por este serviço).
    await tirarDaTipologia(r.tipologiaId);
    expect((await anexo(img.anexoId)).deletadoEm).not.toBeNull();
  });

  it("trocar a imagem do item não aposenta o anexo que a tipologia usa", async () => {
    const m = await montar("TrocaItem");
    const img = await definirNoItem(m.propostaId, m.itemId);
    await salvarComo(m.itemId, "Troca item");
    await definirNoItem(m.propostaId, m.itemId); // nova imagem no item
    expect((await anexo(img.anexoId)).deletadoEm).toBeNull(); // a tipologia criada continua com a antiga
  });

  it("trocar a imagem da tipologia não aposenta o anexo que um item usa", async () => {
    const t = await novaTipologia("TrocaTipologia");
    const m = await montar("TrocaTipologiaItem");
    const doItem = await definirNoItem(m.propostaId, m.itemId);
    await prisma.tipologia.update({ where: { id: t.id }, data: { desenhoAnexoId: doItem.anexoId } });
    await definirNaTipologia(t.id); // troca: o anexo antigo ainda é do item
    expect((await anexo(doItem.anexoId)).deletadoEm).toBeNull();
  });
});
