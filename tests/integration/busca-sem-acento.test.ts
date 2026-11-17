import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { criarClientePrisma } from "@/lib/db/criar-cliente";
import { buscarFornecedoresSemAcento, idsDeChamados, idsDeCompras, idsDeContasAPagar, idsDeContasAReceber, idsDeProjetos, idsDePropostas } from "@/modules/busca/ids-por-busca";

import { comConexao } from "./banco-teste";

/**
 * Busca sem acento nem maiúscula (Fase 7B, Bloco 8): "jose acao" acha "José Ação" em todas as listas. Dados com prefixo "Int Bsc"
 * e um termo único ("Zézinho Bsc") para a busca não encontrar registro real nem de outro teste.
 */
const PREFIXO = "Int Bsc";
const NOME = `${PREFIXO} Zézinho Ação`;
const prisma = criarClientePrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL);
let id: Record<string, string> = {};

async function limpar() {
  await comConexao(async (c) => {
    const projetos = `SELECT id FROM "Projeto" WHERE titulo LIKE '${PREFIXO}%'`;
    await c.query(`DELETE FROM "ContaReceber" WHERE "projetoId" IN (${projetos})`);
    await c.query(`DELETE FROM "ContaPagar" WHERE descricao LIKE '${PREFIXO}%'`);
    await c.query(`DELETE FROM "Chamado" WHERE descricao LIKE '${PREFIXO}%'`);
    await c.query(`DELETE FROM "Compra" WHERE "fornecedorId" IN (SELECT id FROM "Fornecedor" WHERE "razaoSocial" LIKE '${PREFIXO}%')`);
    await c.query(`DELETE FROM "Proposta" WHERE "projetoId" IN (${projetos})`);
    await c.query(`DELETE FROM "Projeto" WHERE titulo LIKE '${PREFIXO}%'`);
    await c.query(`DELETE FROM "Fornecedor" WHERE "razaoSocial" LIKE '${PREFIXO}%'`);
    await c.query(`DELETE FROM "Cliente" WHERE nome LIKE '${PREFIXO}%'`);
  });
}

beforeAll(async () => {
  await limpar();
  const cli = await prisma.cliente.create({ data: { nome: NOME, tipoPessoa: "PF" } });
  const proj = await prisma.projeto.create({ data: { codigo: `INT-BSC-${randomUUID().slice(0, 6)}`, titulo: `${PREFIXO} Obra Coração`, clienteId: cli.id, status: "APROVADO" } });
  const prop = await prisma.proposta.create({ data: { projetoId: proj.id, numero: "INT-BSC-0001", numeroSequencial: 7_600_001, ano: 2018, data: new Date("2018-03-02T00:00:00Z"), clienteNome: NOME, status: "RASCUNHO" } });
  const forn = await prisma.fornecedor.create({ data: { razaoSocial: `${PREFIXO} Vidraçaria São João`, nomeFantasia: "Cristal Çá" } });
  const compra = await prisma.compra.create({ data: { fornecedorId: forn.id, numero: 8_800_000 + Math.floor(Math.random() * 90_000), status: "RASCUNHO" } });
  const receber = await prisma.contaReceber.create({ data: { projetoId: proj.id, clienteId: cli.id, ordem: 1, descricao: `${PREFIXO} Parcela de sinal — instalação`, valorCentavos: 1000 } });
  const pagar = await prisma.contaPagar.create({ data: { descricao: `${PREFIXO} Aluguel do galpão`, favorecido: "Dona Conceição", valorCentavos: 1000, vencimento: new Date("2018-03-10T00:00:00Z"), competencia: new Date("2018-03-01T00:00:00Z") } });
  const chamado = await prisma.chamado.create({ data: { numero: 8_900_000 + Math.floor(Math.random() * 90_000), clienteId: cli.id, descricao: `${PREFIXO} Janela não fecha direito`, tipoProblema: "OUTRO", classificacaoSugerida: "EM_GARANTIA", classificacao: "EM_GARANTIA" } });
  id = { cli: cli.id, proj: proj.id, prop: prop.id, forn: forn.id, compra: compra.id, receber: receber.id, pagar: pagar.id, chamado: chamado.id };
});

afterAll(async () => {
  await limpar();
  await prisma.$disconnect();
});

describe("busca sem acento nem maiúscula", () => {
  it.each([["zezinho acao"], ["ZÉZINHO AÇÃO"], ["zezinho"], ["ação"]])("projetos e propostas acham o cliente com o texto %s", async (termo) => {
    expect(await idsDeProjetos(termo)).toContain(id.proj);
    expect(await idsDePropostas(termo)).toContain(id.prop);
  });

  it("projeto e proposta também acham pelo título da obra, sem acento", async () => {
    expect(await idsDeProjetos("obra coracao")).toContain(id.proj);
    expect(await idsDePropostas("OBRA CORACAO")).toContain(id.prop);
  });

  it("contas a receber: pela descrição e pelo cliente", async () => {
    expect(await idsDeContasAReceber("parcela de sinal instalacao".replace(" instalacao", ""))).toContain(id.receber);
    expect(await idsDeContasAReceber("INSTALAÇÃO")).toContain(id.receber);
    expect(await idsDeContasAReceber("zezinho acao")).toContain(id.receber);
  });

  it("contas a pagar: pela descrição, pelo favorecido e pelo fornecedor", async () => {
    expect(await idsDeContasAPagar("galpao")).toContain(id.pagar);
    expect(await idsDeContasAPagar("conceicao")).toContain(id.pagar);
    expect(await idsDeContasAPagar("Vidracaria Sao Joao")).not.toContain(id.pagar); // fornecedor da compra, não desta conta
  });

  it("chamados: pela descrição e pelo cliente", async () => {
    expect(await idsDeChamados("nao fecha")).toContain(id.chamado);
    expect(await idsDeChamados("zezinho")).toContain(id.chamado);
  });

  it("compras: pelo fornecedor (razão social ou nome fantasia)", async () => {
    expect(await idsDeCompras("vidracaria sao joao")).toContain(id.compra);
    expect(await idsDeCompras("cristal ca")).toContain(id.compra);
  });

  it("seletor rápido de fornecedor: acha sem acento, só ativos, no máximo o limite", async () => {
    expect((await buscarFornecedoresSemAcento("vidracaria sao")).map((f) => f.id)).toContain(id.forn);
    await prisma.fornecedor.update({ where: { id: id.forn }, data: { ativo: false } });
    expect((await buscarFornecedoresSemAcento("vidracaria sao")).map((f) => f.id)).not.toContain(id.forn);
    await prisma.fornecedor.update({ where: { id: id.forn }, data: { ativo: true } });
    expect((await buscarFornecedoresSemAcento("a", 3)).length).toBeLessThanOrEqual(3);
  });

  it("curingas do LIKE digitados valem como texto: '%' e '_' não acham tudo", async () => {
    expect(await idsDeProjetos("%")).not.toContain(id.proj);
    expect(await idsDeProjetos("_")).not.toContain(id.proj);
  });

  it("registro excluído (exclusão lógica) não aparece", async () => {
    await prisma.contaPagar.update({ where: { id: id.pagar }, data: { deletadoEm: new Date() } });
    expect(await idsDeContasAPagar("galpao")).not.toContain(id.pagar);
    await prisma.contaPagar.update({ where: { id: id.pagar }, data: { deletadoEm: null } });
  });
});
