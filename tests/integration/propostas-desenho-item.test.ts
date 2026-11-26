import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { criarClientePrisma } from "@/lib/db/criar-cliente";
import { proximoCodigoDoProjeto } from "@/modules/projetos/servico";
import { reservarNumeroDeProposta } from "@/modules/propostas/servico";
import { copiarProposta } from "@/modules/propostas/servico-ciclo";
import { definirDesenhoDoItem, removerDesenhoDoItem, type ImagemGravada } from "@/modules/propostas/servico-desenho";

import { comConexao, criarUsuarioDeTeste } from "./banco-teste";

/**
 * Fase 3.6b-1 (Bloco 1): desenho personalizado do item. Só toca registros com o prefixo "Int Des" (os anexos de teste
 * usam o caminho "Int Des/..." e NÃO existem no Storage: o serviço só registra a imagem já gravada).
 */
const PREFIXO = "Int Des";
const LOGIN = "int-desenho-item";
const prisma = criarClientePrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL);

let usuario: { id: string; nome: string };
let clienteId: string;
let contador: { proximo: number | null; ano: number | null };

async function limpar() {
  await comConexao(async (c) => {
    const projetos = `SELECT id FROM "Projeto" WHERE titulo LIKE $1`;
    const propostas = `SELECT id FROM "Proposta" WHERE "projetoId" IN (${projetos})`;
    const itens = `SELECT id FROM "ItemProposta" WHERE "propostaId" IN (${propostas})`;
    await c.query(`DELETE FROM "LogAuditoria" WHERE "entidade" = 'ItemProposta' AND "entidadeId" IN (${itens})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "LogAuditoria" WHERE "entidade" IN ('Proposta','Projeto') AND ("entidadeId" IN (${propostas}) OR "entidadeId" IN (${projetos}))`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "ItemPropostaMedida" WHERE "itemId" IN (${itens})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "ItemProposta" WHERE "propostaId" IN (${propostas})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "LogAuditoria" WHERE "entidade" = 'Anexo' AND "entidadeId" IN (SELECT id FROM "Anexo" WHERE caminho LIKE 'Int Des/%')`);
    await c.query(`DELETE FROM "Anexo" WHERE caminho LIKE 'Int Des/%'`);
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

/** Projeto + proposta rascunho com uma opção e dois itens. */
async function montar(titulo: string) {
  return prisma.$transaction(async (tx) => {
    const projeto = await tx.projeto.create({ data: { codigo: await proximoCodigoDoProjeto(tx), titulo: `${PREFIXO} ${titulo}`, clienteId, status: "ELABORANDO_PROPOSTA" } });
    const { numero, sequencial, ano } = await reservarNumeroDeProposta(tx);
    const proposta = await tx.proposta.create({
      data: { projetoId: projeto.id, numero, numeroSequencial: sequencial, ano, data: new Date(), clienteNome: `${PREFIXO} Cliente`, modoPrazo: "TOTAL", prazoTotalMaxDias: 30, opcoes: { create: [{ nome: "Opção 1", ordem: 0 }] } },
      include: { opcoes: true },
    });
    const itens: string[] = [];
    for (const i of [0, 1]) {
      const item = await tx.itemProposta.create({
        data: { propostaId: proposta.id, opcaoId: proposta.opcoes[0].id, ordem: i, descricao: `ITEM ${i + 1}`, modoPreco: "MANUAL", valorManualCentavos: 100000, precoTotalCentavos: 100000, medidas: { create: [{ larguraMm: 1000, alturaMm: 1000, quantidade: 1 }] } },
      });
      itens.push(item.id);
    }
    return { projetoId: projeto.id, propostaId: proposta.id, itens };
  });
}

const imagem = (extra: Partial<ImagemGravada> = {}): ImagemGravada => ({
  caminho: `Int Des/${randomUUID()}.png`,
  mime: "image/png",
  tamanhoBytes: 12_345,
  sha256: randomUUID().replace(/-/g, "").padEnd(64, "a"),
  larguraPx: 800,
  alturaPx: 600,
  ...extra,
});

const definir = (propostaId: string, itemId: string, img: ImagemGravada = imagem()) => prisma.$transaction((tx) => definirDesenhoDoItem(tx, { usuario, propostaId, itemId, imagem: img }));
const remover = (propostaId: string, itemId: string) => prisma.$transaction((tx) => removerDesenhoDoItem(tx, { usuario, propostaId, itemId }));
const item = (id: string) => prisma.itemProposta.findUniqueOrThrow({ where: { id } });
const anexo = (id: string) => prisma.anexo.findUniqueOrThrow({ where: { id } });

describe("subir o desenho do item", () => {
  it("registra o anexo (categoria, hash, dimensões, fora do portfólio) e liga o item; audita", async () => {
    const m = await montar("Subir");
    const img = imagem();
    const r = await definir(m.propostaId, m.itens[0], img);
    expect((await item(m.itens[0])).desenhoAnexoId).toBe(r.anexoId);
    expect(await anexo(r.anexoId)).toMatchObject({
      entidadeTipo: "ItemProposta",
      entidadeId: m.itens[0],
      categoria: "desenho-item",
      caminho: img.caminho,
      mime: "image/png",
      sha256: img.sha256,
      larguraPx: 800,
      alturaPx: 600,
      usarNoPortfolio: false,
      momento: null,
      deletadoEm: null,
      criadoPorId: usuario.id,
    });
    expect((await anexo(r.anexoId)).nome).toBe("desenho-item.png"); // nome do sistema, nunca o enviado
    expect(await prisma.logAuditoria.count({ where: { entidade: "ItemProposta", entidadeId: m.itens[0], acao: "ATUALIZAR" } })).toBe(1);
    // O outro item da proposta não muda.
    expect((await item(m.itens[1])).desenhoAnexoId).toBeNull();
  });

  it("o desenho do item não aparece como foto de obra nem em anexos do projeto", async () => {
    const m = await montar("NaoEhFoto");
    await definir(m.propostaId, m.itens[0]);
    expect(await prisma.anexo.count({ where: { entidadeTipo: "Projeto", entidadeId: m.projetoId } })).toBe(0);
    expect(await prisma.anexo.count({ where: { entidadeTipo: "Proposta", entidadeId: m.propostaId } })).toBe(0);
    expect(await prisma.anexo.count({ where: { categoria: "foto-obra", entidadeId: m.itens[0] } })).toBe(0);
  });
});

describe("trocar e remover", () => {
  it("trocar liga o novo e aposenta o antigo (exclusão lógica, o registro e o caminho ficam)", async () => {
    const m = await montar("Trocar");
    const a = await definir(m.propostaId, m.itens[0]);
    const b = await definir(m.propostaId, m.itens[0]);
    expect(b.anexoId).not.toBe(a.anexoId);
    expect((await item(m.itens[0])).desenhoAnexoId).toBe(b.anexoId);
    const antigo = await anexo(a.anexoId);
    expect(antigo.deletadoEm).not.toBeNull();
    expect(antigo.caminho).toMatch(/^Int Des\//);
    expect((await anexo(b.anexoId)).deletadoEm).toBeNull();
  });

  it("remover volta ao automático e aposenta o anexo; remover de novo é recusado", async () => {
    const m = await montar("Remover");
    const a = await definir(m.propostaId, m.itens[0]);
    await remover(m.propostaId, m.itens[0]);
    expect((await item(m.itens[0])).desenhoAnexoId).toBeNull();
    expect((await anexo(a.anexoId)).deletadoEm).not.toBeNull();
    await expect(remover(m.propostaId, m.itens[0])).rejects.toThrow(/desenho automático/);
  });

  it("anexo ainda usado por outro item vivo (revisão ou duplicata) NÃO é aposentado", async () => {
    const m = await montar("Compartilhado");
    const a = await definir(m.propostaId, m.itens[0]);
    // O segundo item passa a usar o mesmo arquivo (é o que duplicar item e revisão fazem).
    await prisma.itemProposta.update({ where: { id: m.itens[1] }, data: { desenhoAnexoId: a.anexoId } });
    await remover(m.propostaId, m.itens[0]);
    expect((await anexo(a.anexoId)).deletadoEm).toBeNull();
    expect((await item(m.itens[1])).desenhoAnexoId).toBe(a.anexoId);
    // Quando o último uso sai, aí sim.
    await remover(m.propostaId, m.itens[1]);
    expect((await anexo(a.anexoId)).deletadoEm).not.toBeNull();
  });
});

describe("recusas", () => {
  it("proposta que não é rascunho recusa subir, trocar e remover", async () => {
    const m = await montar("Enviada");
    const a = await definir(m.propostaId, m.itens[0]);
    await prisma.proposta.update({ where: { id: m.propostaId }, data: { status: "ENVIADA" } });
    await expect(definir(m.propostaId, m.itens[0])).rejects.toThrow(/já foi enviada/);
    await expect(remover(m.propostaId, m.itens[0])).rejects.toThrow(/já foi enviada/);
    expect((await item(m.itens[0])).desenhoAnexoId).toBe(a.anexoId); // nada mudou
    expect((await anexo(a.anexoId)).deletadoEm).toBeNull();
  });

  it("item de OUTRA proposta é recusado (o itemId vindo do cliente não vale por si)", async () => {
    const a = await montar("OutraA");
    const b = await montar("OutraB");
    await expect(definir(a.propostaId, b.itens[0])).rejects.toThrow(/Item não encontrado/);
    expect((await item(b.itens[0])).desenhoAnexoId).toBeNull();
  });

  it("item excluído e proposta excluída são recusados", async () => {
    const m = await montar("Excluidos");
    await prisma.itemProposta.update({ where: { id: m.itens[0] }, data: { deletadoEm: new Date() } });
    await expect(definir(m.propostaId, m.itens[0])).rejects.toThrow(/Item não encontrado/);
    await prisma.proposta.update({ where: { id: m.propostaId }, data: { deletadoEm: new Date() } });
    await expect(definir(m.propostaId, m.itens[1])).rejects.toThrow(/Proposta não encontrada/);
  });

  it("falha na transação não deixa anexo órfão (tudo ou nada)", async () => {
    const m = await montar("TudoOuNada");
    const img = imagem();
    // A proposta some no meio: a conferência falha DEPOIS de nada ter sido gravado.
    await expect(definir("proposta-que-nao-existe", m.itens[0], img)).rejects.toThrow();
    expect(await prisma.anexo.count({ where: { caminho: img.caminho } })).toBe(0);
  });
});

describe("revisão copia a referência", () => {
  it("a revisão aponta para o MESMO anexo e o original continua vivo", async () => {
    const m = await montar("Revisao");
    const a = await definir(m.propostaId, m.itens[0]);
    await prisma.proposta.update({ where: { id: m.propostaId }, data: { status: "ENVIADA" } }); // revisão parte de proposta enviada
    const rev = await prisma.$transaction((tx) => copiarProposta(tx, { usuarioId: usuario.id, origemId: m.propostaId, modo: "REVISAO" }));
    const itensDaRevisao = await prisma.itemProposta.findMany({ where: { propostaId: rev.id, deletadoEm: null }, orderBy: { ordem: "asc" } });
    expect(itensDaRevisao.map((i) => i.desenhoAnexoId)).toEqual([a.anexoId, null]);
    expect((await anexo(a.anexoId)).deletadoEm).toBeNull();

    // Trocar o desenho na revisão NÃO mexe no item da proposta enviada e não apaga o arquivo que ela usa.
    const novo = await definir(rev.id, itensDaRevisao[0].id);
    expect((await item(m.itens[0])).desenhoAnexoId).toBe(a.anexoId);
    expect((await anexo(a.anexoId)).deletadoEm).toBeNull();
    expect((await item(itensDaRevisao[0].id)).desenhoAnexoId).toBe(novo.anexoId);
  });
});
