import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { criarClientePrisma } from "@/lib/db/criar-cliente";
import { definirAutorizacaoDePortfolio, definirPublicacaoNoInstagram, atualizarFotoDaObra } from "@/modules/obras/servico-fotos";
import { legendaDaObra, lerFiltrosDaGaleria, listarFotosDaObra, listarGaleria, type FiltrosDaGaleria, type ObraDaGaleria } from "@/modules/obras/queries-fotos";

import { comConexao, criarUsuarioDeTeste } from "./banco-teste";

/** Galeria de obras: só fotos de obra, só de obras com a autorização do cliente, legenda sem dados do cliente. */
const PREFIXO = "Int Fot";
const LOGIN = "int-fotos";
const NOME_SECRETO = "Maria Silva Secreta";
const RUA_SECRETA = "Rua Segredo 123";
const TELEFONE_SECRETO = "+5522988887777";
const prisma = criarClientePrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL);

let usuario: { id: string; nome: string };
let clienteId: string;
let obraA: string; // concluída, autorizada, com linha Suprema, em Macaé/RJ
let obraB: string; // concluída, SEM autorização do cliente
let obraC: string; // ainda lead (não é obra)
let obraSemDados: string; // obra sem endereço nem proposta

async function limpar() {
  await comConexao(async (c) => {
    const projetos = `SELECT id FROM "Projeto" WHERE titulo LIKE $1`;
    const p = [`${PREFIXO}%`];
    await c.query(`DELETE FROM "LogAuditoria" WHERE "usuarioId" IN (SELECT id FROM "Usuario" WHERE login = $1)`, [LOGIN]);
    await c.query(`DELETE FROM "Anexo" WHERE "entidadeTipo" = 'Projeto' AND "entidadeId" IN (${projetos})`, p);
    await c.query(`DELETE FROM "Interacao" WHERE "projetoId" IN (${projetos})`, p);
    await c.query(`DELETE FROM "ItemProposta" WHERE "propostaId" IN (SELECT id FROM "Proposta" WHERE "projetoId" IN (${projetos}))`, p);
    await c.query(`DELETE FROM "OpcaoProposta" WHERE "propostaId" IN (SELECT id FROM "Proposta" WHERE "projetoId" IN (${projetos}))`, p);
    await c.query(`DELETE FROM "Proposta" WHERE "projetoId" IN (${projetos})`, p);
    await c.query(`DELETE FROM "Projeto" WHERE titulo LIKE $1`, p);
    await c.query(`DELETE FROM "EnderecoCliente" WHERE "clienteId" IN (SELECT id FROM "Cliente" WHERE nome LIKE $1)`, p);
    await c.query(`DELETE FROM "Cliente" WHERE nome LIKE $1`, p);
    await c.query(`DELETE FROM "Usuario" WHERE login = $1`, [LOGIN]);
  });
}

type OpcoesFoto = { momento?: "ANTES" | "DURANTE" | "DEPOIS" | null; categoria?: string | null; usar?: boolean; mime?: string; apagada?: boolean; criadoEm?: string };

const foto = (projetoId: string, o: OpcoesFoto = {}) =>
  prisma.anexo.create({
    data: {
      entidadeTipo: "Projeto",
      entidadeId: projetoId,
      categoria: o.categoria === undefined ? "foto-obra" : o.categoria,
      nome: `foto-${randomUUID().slice(0, 6)}.jpg`,
      caminho: `Projeto/${projetoId}/${randomUUID()}.jpg`,
      mime: o.mime ?? "image/jpeg",
      tamanhoBytes: 1000,
      momento: o.momento === undefined ? "DURANTE" : o.momento,
      usarNoPortfolio: o.usar ?? true,
      deletadoEm: o.apagada ? new Date() : null,
      criadoEm: o.criadoEm ? new Date(o.criadoEm) : undefined,
    },
  });

beforeAll(async () => {
  await limpar();
  await criarUsuarioDeTeste(LOGIN, "senha-de-teste-123");
  usuario = await prisma.usuario.findUniqueOrThrow({ where: { login: LOGIN }, select: { id: true, nome: true } });
  clienteId = (await prisma.cliente.create({ data: { nome: `${PREFIXO} ${NOME_SECRETO}`, tipoPessoa: "PF", telefone: TELEFONE_SECRETO } })).id;
  const endereco = await prisma.enderecoCliente.create({ data: { clienteId, tipo: "OBRA", logradouro: RUA_SECRETA, cidade: "Macaé", uf: "RJ" } });

  const novo = (nome: string, extra: object) =>
    prisma.projeto.create({ data: { codigo: `P-0000-${randomUUID().slice(0, 8)}`, titulo: `${PREFIXO} ${nome}`, clienteId, ...extra } }).then((p) => p.id);
  obraA = await novo("Obra A", { status: "CONCLUIDO", enderecoObraId: endereco.id, tiposServico: ["JANELA", "GUARDA_CORPO"] });
  obraB = await novo("Obra B", { status: "CONCLUIDO", enderecoObraId: endereco.id, tiposServico: ["BOX"], autorizaPortfolio: false });
  obraC = await novo("Obra C", { status: "NOVO_LEAD", enderecoObraId: endereco.id, tiposServico: ["JANELA"] });
  obraSemDados = await novo("Obra sem dados", { status: "EM_EXECUCAO" });

  // A obra A tem uma proposta aprovada com itens na linha Suprema.
  const linha = await prisma.linhaAluminio.findFirstOrThrow({ where: { nome: "Suprema" } });
  const proposta = await prisma.proposta.create({
    data: { projetoId: obraA, numero: `INT-${randomUUID().slice(0, 8)}`, numeroSequencial: 1, ano: 2026, data: new Date("2026-05-20T00:00:00Z"), clienteNome: NOME_SECRETO, status: "APROVADA", opcoes: { create: [{ nome: "Opção 1" }] } },
    include: { opcoes: true },
  });
  await prisma.proposta.update({ where: { id: proposta.id }, data: { opcaoAprovadaId: proposta.opcoes[0].id } });
  await prisma.itemProposta.create({ data: { propostaId: proposta.id, opcaoId: proposta.opcoes[0].id, linhaId: linha.id, descricao: "JANELA", modoPreco: "MANUAL", valorManualCentavos: 1000, precoTotalCentavos: 1000 } });
});

afterAll(async () => {
  await limpar();
  await prisma.$disconnect();
});

const nossas = (obras: ObraDaGaleria[]) => obras.filter((o) => o.titulo.startsWith(PREFIXO));
const galeria = async (f: FiltrosDaGaleria = {}) => nossas((await listarGaleria(f)).obras);

describe("o que entra na galeria de obras", () => {
  let fotoAntes: string;
  let fotoDepois: string;

  beforeAll(async () => {
    fotoAntes = (await foto(obraA, { momento: "ANTES", criadoEm: "2026-05-02T12:00:00Z" })).id;
    fotoDepois = (await foto(obraA, { momento: "DEPOIS", criadoEm: "2026-06-18T12:00:00Z" })).id;
    await foto(obraA, { momento: "DURANTE", usar: false }); // desmarcada do portfólio
    await foto(obraA, { momento: "DURANTE", apagada: true }); // excluída
    await foto(obraA, { categoria: null, momento: null }); // imagem qualquer do projeto (não é foto de obra)
    await foto(obraA, { mime: "application/pdf", momento: "DEPOIS" }); // não é imagem
    await foto(obraB, { momento: "DEPOIS" }); // o cliente NÃO autoriza
    await foto(obraC, { momento: "DEPOIS" }); // ainda não é obra
  });

  it("só fotos de obra marcadas para o portfólio, de obras em andamento ou concluídas cujo cliente autoriza", async () => {
    const obras = await galeria();
    expect(obras.map((o) => o.titulo)).toEqual([`${PREFIXO} Obra A`]);
    expect(obras[0].fotos.map((f) => f.id).sort()).toEqual([fotoAntes, fotoDepois].sort());
    expect(obras[0].fotos.every((f) => f.momento !== null && f.usarNoPortfolio)).toBe(true);
  });

  it("sugere o par antes/depois para a postagem", async () => {
    const [a] = await galeria();
    expect(a.sugeridas.sort()).toEqual([fotoAntes, fotoDepois].sort());
  });

  it("a legenda sugerida usa tipo de serviço, linha, cidade e UF, e NADA do cliente", async () => {
    const [a] = await galeria();
    expect(a.legenda.texto).toBe("Janelas e guarda-corpo em alumínio linha Suprema, entregues em Macaé/RJ. Pontualidade, qualidade e entrega em cada obra.");
    expect(a.legenda.faltando).toEqual([]);
    for (const segredo of [NOME_SECRETO, "Maria", RUA_SECRETA, "Segredo", TELEFONE_SECRETO, "988887777"]) {
      expect(a.legenda.texto, segredo).not.toContain(segredo);
    }
  });

  it("legenda de obra sem endereço nem proposta deixa o que falta visível, para o gestor completar", async () => {
    const l = (await legendaDaObra(obraSemDados))!;
    expect(l.faltando.sort()).toEqual(["cidade", "linha", "regiao", "tipoServico"]);
    expect(l.texto).toContain("{{cidade}}");
    expect(await legendaDaObra("nao-existe")).toBeNull();
  });

  it("filtra por tipo de serviço, cidade (sem diferenciar maiúsculas), ano da foto e publicação", async () => {
    expect(await galeria({ tipo: "BOX" })).toEqual([]); // a obra de box é a B (sem autorização)
    expect((await galeria({ tipo: "GUARDA_CORPO" })).map((o) => o.id)).toEqual([obraA]);
    expect((await galeria({ cidade: "macaé" })).map((o) => o.id)).toEqual([obraA]);
    expect(await galeria({ cidade: "Cabo Frio" })).toEqual([]);
    expect((await galeria({ publicada: "nao" })).map((o) => o.id)).toEqual([obraA]);
    expect(await galeria({ publicada: "sim" })).toEqual([]);

    // O ano filtra as FOTOS: as duas de A são de 2026.
    expect((await galeria({ ano: 2026 }))[0].fotos).toHaveLength(2);
    expect(await galeria({ ano: 2025 })).toEqual([]);
  });

  it("as opções dos filtros mostram o que existe (cidades e anos), independente do filtro aplicado", async () => {
    const { opcoes } = await listarGaleria({ tipo: "BOX" });
    expect(opcoes.cidades).toContain("Macaé");
    expect(opcoes.anos).toContain(2026);
  });

  it("as fotos de uma obra (aba Fotos) trazem só as fotos de obra, inclusive as fora do portfólio", async () => {
    const fotos = await listarFotosDaObra(obraA);
    expect(fotos).toHaveLength(3); // antes, depois e a desmarcada (a excluída, a sem categoria e o PDF ficam de fora)
    expect(fotos.filter((f) => !f.usarNoPortfolio)).toHaveLength(1);
    expect(fotos[0].criadoEm >= fotos[1].criadoEm).toBe(true); // da mais recente para a mais antiga
  });
});

describe("atualizar uma foto da obra", () => {
  it("muda momento, portfólio e descrição, com auditoria; tirar do portfólio a retira da galeria", async () => {
    const f = await foto(obraA, { momento: "DURANTE", criadoEm: "2026-06-19T12:00:00Z" });
    const antes = (await galeria())[0].fotos.length;
    expect((await galeria())[0].fotos.some((x) => x.id === f.id)).toBe(true);

    await prisma.$transaction((tx) => atualizarFotoDaObra(tx, { anexoId: f.id, momento: "DEPOIS", descricao: "  Sacada pronta  ", usuario }));
    expect(await prisma.anexo.findUniqueOrThrow({ where: { id: f.id } })).toMatchObject({ momento: "DEPOIS", descricao: "Sacada pronta", usarNoPortfolio: true });

    await prisma.$transaction((tx) => atualizarFotoDaObra(tx, { anexoId: f.id, usarNoPortfolio: false, usuario }));
    expect((await galeria())[0].fotos).toHaveLength(antes - 1);
    expect((await prisma.anexo.findUniqueOrThrow({ where: { id: f.id } })).descricao).toBe("Sacada pronta"); // não mexeu no que não foi pedido

    await prisma.$transaction((tx) => atualizarFotoDaObra(tx, { anexoId: f.id, descricao: null, usuario }));
    expect((await prisma.anexo.findUniqueOrThrow({ where: { id: f.id } })).descricao).toBeNull();
    expect(await prisma.logAuditoria.count({ where: { entidade: "Anexo", entidadeId: f.id, acao: "ATUALIZAR" } })).toBe(3);
  });

  it("recusa o que não é foto de obra, foto excluída e descrição longa", async () => {
    const comum = await foto(obraA, { categoria: null, momento: null });
    await expect(prisma.$transaction((tx) => atualizarFotoDaObra(tx, { anexoId: comum.id, momento: "ANTES", usuario }))).rejects.toThrow(/Foto não encontrada/);
    const apagada = await foto(obraA, { apagada: true });
    await expect(prisma.$transaction((tx) => atualizarFotoDaObra(tx, { anexoId: apagada.id, momento: "ANTES", usuario }))).rejects.toThrow(/Foto não encontrada/);
    const valida = await foto(obraA);
    await expect(prisma.$transaction((tx) => atualizarFotoDaObra(tx, { anexoId: valida.id, descricao: "x".repeat(301), usuario }))).rejects.toThrow(/300 caracteres/);
    await expect(prisma.$transaction((tx) => atualizarFotoDaObra(tx, { anexoId: "nao-existe", usuario }))).rejects.toThrow(/Foto não encontrada/);
  });
});

describe("autorização do cliente (R18)", () => {
  it("sem a autorização a obra sai da galeria; com ela volta; repetir o mesmo valor não faz nada", async () => {
    const f = await foto(obraC, { momento: "DEPOIS" });
    expect(f.id).toBeTruthy();
    expect((await galeria()).map((o) => o.id)).toContain(obraA);

    expect(await prisma.$transaction((tx) => definirAutorizacaoDePortfolio(tx, { projetoId: obraA, autoriza: false, usuario }))).toBe(true);
    expect((await galeria()).map((o) => o.id)).not.toContain(obraA);
    expect(await prisma.$transaction((tx) => definirAutorizacaoDePortfolio(tx, { projetoId: obraA, autoriza: false, usuario }))).toBe(false);

    expect(await prisma.$transaction((tx) => definirAutorizacaoDePortfolio(tx, { projetoId: obraA, autoriza: true, usuario }))).toBe(true);
    expect((await galeria()).map((o) => o.id)).toContain(obraA);
    expect(await prisma.interacao.count({ where: { projetoId: obraA, texto: { contains: "portfólio" } } })).toBe(2);
    await expect(prisma.$transaction((tx) => definirAutorizacaoDePortfolio(tx, { projetoId: "nao-existe", autoriza: true, usuario }))).rejects.toThrow(/Obra não encontrada/);
  });
});

describe("publicada no Instagram", () => {
  const AGORA = new Date("2026-06-20T15:00:00Z");

  it("marca com a data, tira do filtro 'ainda não publicadas' e pode ser desmarcada", async () => {
    await prisma.$transaction((tx) => definirPublicacaoNoInstagram(tx, { projetoId: obraA, publicada: true, data: "2026-06-19", usuario, agora: AGORA }));
    expect((await prisma.projeto.findUniqueOrThrow({ where: { id: obraA } })).publicadoInstagramEm?.toISOString().slice(0, 10)).toBe("2026-06-19");
    expect((await galeria({ publicada: "sim" }))[0].publicadoInstagramEm).toBe("2026-06-19");
    expect(await galeria({ publicada: "nao" })).toEqual([]);

    await prisma.$transaction((tx) => definirPublicacaoNoInstagram(tx, { projetoId: obraA, publicada: false, usuario, agora: AGORA }));
    expect((await prisma.projeto.findUniqueOrThrow({ where: { id: obraA } })).publicadoInstagramEm).toBeNull();
    expect((await galeria({ publicada: "nao" })).map((o) => o.id)).toEqual([obraA]);
  });

  it("sem data usa hoje; recusa data futura ou inválida, obra sem autorização e projeto que não é obra", async () => {
    await prisma.$transaction((tx) => definirPublicacaoNoInstagram(tx, { projetoId: obraA, publicada: true, usuario, agora: AGORA }));
    expect((await prisma.projeto.findUniqueOrThrow({ where: { id: obraA } })).publicadoInstagramEm?.toISOString().slice(0, 10)).toBe("2026-06-20");

    await expect(prisma.$transaction((tx) => definirPublicacaoNoInstagram(tx, { projetoId: obraA, publicada: true, data: "2026-06-21", usuario, agora: AGORA }))).rejects.toThrow(/futuro/);
    await expect(prisma.$transaction((tx) => definirPublicacaoNoInstagram(tx, { projetoId: obraA, publicada: true, data: "2026-13-40", usuario, agora: AGORA }))).rejects.toThrow(/data válida/);
    await expect(prisma.$transaction((tx) => definirPublicacaoNoInstagram(tx, { projetoId: obraB, publicada: true, usuario, agora: AGORA }))).rejects.toThrow(/não autorizou/);
    await expect(prisma.$transaction((tx) => definirPublicacaoNoInstagram(tx, { projetoId: obraC, publicada: true, usuario, agora: AGORA }))).rejects.toThrow(/Obra não encontrada/);
  });
});

describe("filtros da galeria vindos da URL", () => {
  it("valores inválidos são ignorados e os válidos passam", () => {
    expect(lerFiltrosDaGaleria({ tipo: "INVENTADO", cidade: "  ", ano: "abc", publicada: "talvez" })).toEqual({ tipo: undefined, cidade: undefined, ano: undefined, publicada: undefined });
    expect(lerFiltrosDaGaleria({ tipo: "BOX", cidade: " Macaé ", ano: "2026", publicada: "nao" })).toEqual({ tipo: "BOX", cidade: "Macaé", ano: 2026, publicada: "nao" });
    expect(lerFiltrosDaGaleria({ ano: "1900" }).ano).toBeUndefined();
  });
});
