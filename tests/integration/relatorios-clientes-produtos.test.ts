import { randomUUID } from "node:crypto";

import type { QueryResultRow } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { criarClientePrisma } from "@/lib/db/criar-cliente";
import type { Periodo } from "@/lib/periodo";
import { vendidoNoPeriodo } from "@/modules/indicadores/vendas";
import { clientesParaReativar, clientesPorCidade, mixPorTipologia, precoMedioPorM2 } from "@/modules/indicadores/clientes-e-produtos";

import { comConexao } from "./banco-teste";

/**
 * Clientes (reativação, cidade) e Produtos e preços (mix, preço por m²), Fase 7B, Bloco 6. Dados com prefixo "Int Rcli", em março
 * de 2018 (sem dado real) e em 2020 para a reativação, com registros às 23h59 do último dia e à 00h01 do primeiro (horário de São
 * Paulo, UTC−3 nessas datas). A janela de reativação recebe a data de referência: nada aqui lê o relógio.
 */
const PREFIXO = "Int Rcli";
const prisma = criarClientePrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL);
const MAR: Periodo = { de: "2018-03-01", ate: "2018-03-31" };
const REFERENCIA = "2021-06-30"; // 12 meses antes: 30/06/2020
const q = async <T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> => comConexao(async (c) => (await c.query<T>(sql, params)).rows);
let seq = 0;

async function limpar() {
  await comConexao(async (c) => {
    const projetos = `SELECT id FROM "Projeto" WHERE titulo LIKE '${PREFIXO}%'`;
    const propostas = `SELECT id FROM "Proposta" WHERE "projetoId" IN (${projetos})`;
    await c.query(`DELETE FROM "ItemPropostaMedida" WHERE "itemId" IN (SELECT id FROM "ItemProposta" WHERE "propostaId" IN (${propostas}))`);
    await c.query(`DELETE FROM "ItemProposta" WHERE "propostaId" IN (${propostas})`);
    await c.query(`DELETE FROM "OpcaoProposta" WHERE "propostaId" IN (${propostas})`);
    await c.query(`DELETE FROM "Proposta" WHERE "projetoId" IN (${projetos})`);
    await c.query(`DELETE FROM "HistoricoFaseProjeto" WHERE "projetoId" IN (${projetos})`);
    await c.query(`DELETE FROM "Projeto" WHERE titulo LIKE '${PREFIXO}%'`);
    await c.query(`DELETE FROM "EnderecoCliente" WHERE "clienteId" IN (SELECT id FROM "Cliente" WHERE nome LIKE '${PREFIXO}%')`);
    await c.query(`DELETE FROM "Cliente" WHERE nome LIKE '${PREFIXO}%'`);
    await c.query(`DELETE FROM "Tipologia" WHERE nome LIKE '${PREFIXO}%'`);
  });
}

const cliente = (nome: string) => prisma.cliente.create({ data: { nome: `${PREFIXO} ${nome}`, tipoPessoa: "PF" } });
const projeto = (titulo: string, clienteId: string, enderecoObraId?: string) => prisma.projeto.create({ data: { codigo: `INT-RCLI-${++seq}-${randomUUID().slice(0, 6)}`, titulo: `${PREFIXO} ${titulo}`, clienteId, status: "APROVADO", enderecoObraId } });
const endereco = (clienteId: string, cidade: string, uf: string) => prisma.enderecoCliente.create({ data: { clienteId, tipo: "OBRA", cidade, uf } });

type OpcoesDeProposta = { status?: "APROVADA" | "ENVIADA" | "RECUSADA" | "RASCUNHO"; aceitaEm?: string | null; valor?: number };
async function proposta(projetoId: string, o: OpcoesDeProposta = {}) {
  const status = o.status ?? "APROVADA";
  return prisma.proposta.create({
    data: {
      projetoId,
      numero: `INT-RCLI-${String(++seq).padStart(4, "0")}`,
      numeroSequencial: 7_400_000 + seq,
      ano: 2018,
      data: new Date("2018-03-02T00:00:00Z"),
      clienteNome: `${PREFIXO} Cliente`,
      status,
      aceitaEm: o.aceitaEm ? new Date(o.aceitaEm) : null,
      enviadaEm: status === "ENVIADA" ? new Date("2021-06-01T15:00:00Z") : null,
      valorAprovadoCentavos: status === "APROVADA" ? (o.valor ?? 0) : null,
    },
  });
}

type Item = { tipologiaId: string | null; preco: number; medida?: { l: number; a: number; q: number } };
/** Cria uma opção (a aprovada, se `aprovar`) com os itens dados e a aponta como a opção aprovada da proposta. */
async function opcaoComItens(propostaId: string, itens: Item[], aprovar = true) {
  const opcao = await prisma.opcaoProposta.create({ data: { propostaId, nome: "Opção" } });
  for (const [i, it] of itens.entries()) {
    const criado = await prisma.itemProposta.create({ data: { propostaId, opcaoId: opcao.id, ordem: i, tipologiaId: it.tipologiaId, descricao: `${PREFIXO} item ${i}`, precoTotalCentavos: it.preco } });
    if (it.medida) await prisma.itemPropostaMedida.create({ data: { itemId: criado.id, larguraMm: it.medida.l, alturaMm: it.medida.a, quantidade: it.medida.q } });
  }
  if (aprovar) await prisma.proposta.update({ where: { id: propostaId }, data: { opcaoAprovadaId: opcao.id } });
  return opcao;
}

const tipologia = (nome: string) => prisma.tipologia.create({ data: { nome: `${PREFIXO} ${nome}`, templateDescricao: "Item de teste" } });

let idTipA = "";
let idTipB = "";

beforeAll(async () => {
  await limpar();
  const [tipA, tipB] = await Promise.all([tipologia("Tip A"), tipologia("Tip B")]);
  idTipA = tipA.id;
  idTipB = tipB.id;
  const [c1, c2, c3, c4, c5, c6, c7] = await Promise.all(["Cli 1", "Cli 2", "Cli 3", "Cli 4", "Cli 5", "Cli 6", "Cli 7"].map(cliente));
  const [e1, e2] = await Promise.all([endereco(c1.id, "Macaé", "RJ"), endereco(c2.id, "  Macaé ", "RJ")]);

  // ----- Mix, preço por m² e cidade (março/2018) -----
  const p1 = await projeto("P1", c1.id, e1.id);
  const pr1 = await proposta(p1.id, { aceitaEm: "2018-03-10T15:00:00Z", valor: 1_000_000 });
  // Itens da opção aprovada: A = 600.000 (2 × 1,0 × 2,0 m = 4 m²) e B = 300.000 (1,5 m²). Soma 900.000; o valor aprovado (1.000.000) tem 100.000 de acréscimo.
  await opcaoComItens(pr1.id, [
    { tipologiaId: idTipA, preco: 600_000, medida: { l: 1000, a: 2000, q: 2 } },
    { tipologiaId: idTipB, preco: 300_000, medida: { l: 1500, a: 1000, q: 1 } },
  ]);
  await prisma.proposta.update({ where: { id: pr1.id }, data: { snapshot: { opcoes: [{ id: (await prisma.opcaoProposta.findFirstOrThrow({ where: { propostaId: pr1.id } })).id, nome: "Opção" }] } } });
  // Uma opção NÃO aprovada da mesma proposta: não pode entrar na conta.
  await opcaoComItens(pr1.id, [{ tipologiaId: idTipA, preco: 5_000_000, medida: { l: 9000, a: 9000, q: 1 } }], false);

  const p2 = await projeto("P2", c2.id, e2.id);
  const pr2 = await proposta(p2.id, { aceitaEm: "2018-04-01T02:59:00Z", valor: 250_000 }); // 31/03 às 23h59 em SP: DENTRO. Sem conteúdo congelado: lida só pela tabela.
  await opcaoComItens(pr2.id, [
    { tipologiaId: idTipA, preco: 200_000, medida: { l: 1000, a: 1000, q: 1 } },
    { tipologiaId: null, preco: 50_000 }, // sem tipologia e sem medida
  ]);

  const p3 = await projeto("P3 sem endereco", c3.id);
  await proposta(p3.id, { aceitaEm: "2018-03-15T15:00:00Z", valor: 70_000 }); // sem itens, sem endereço de obra

  // Fora do período ou que não é venda:
  const p4 = await projeto("P4 bordas", c4.id, e1.id);
  const fora1 = await proposta(p4.id, { aceitaEm: "2018-04-01T03:01:00Z", valor: 111_100 }); // 01/04 às 00h01 em SP: fora
  await opcaoComItens(fora1.id, [{ tipologiaId: idTipB, preco: 111_100, medida: { l: 1000, a: 1000, q: 1 } }]);
  const fora2 = await proposta(p4.id, { aceitaEm: "2018-03-01T02:59:00Z", valor: 222_200 }); // 28/02 às 23h59 em SP: fora
  await opcaoComItens(fora2.id, [{ tipologiaId: idTipB, preco: 222_200, medida: { l: 1000, a: 1000, q: 1 } }]);
  const recusada = await proposta(p4.id, { status: "RECUSADA", aceitaEm: "2018-03-12T15:00:00Z", valor: 999_900 }); // recusada: não é venda
  await opcaoComItens(recusada.id, [{ tipologiaId: idTipB, preco: 999_900, medida: { l: 1000, a: 1000, q: 1 } }], false);

  // ----- Reativação (referência 30/06/2021, 12 meses → limite 30/06/2020) -----
  const a1 = await projeto("A1", c1.id);
  await proposta(a1.id, { aceitaEm: "2020-01-10T15:00:00Z", valor: 100_000 }); // última aprovação do cliente 1 (as de 2018 são anteriores)
  await proposta(a1.id, { status: "ENVIADA" }); // cliente 1 tem proposta em aberto
  const a5 = await projeto("A5 limite", c5.id);
  await proposta(a5.id, { aceitaEm: "2020-07-01T02:59:00Z", valor: 100_000 }); // 30/06 às 23h59 em SP: no limite → ENTRA
  const a6 = await projeto("A6 depois do limite", c6.id);
  await proposta(a6.id, { aceitaEm: "2020-07-01T03:01:00Z", valor: 100_000 }); // 01/07 às 00h01 em SP: depois do limite → fora
  const a7 = await projeto("A7 so rascunho", c7.id);
  await proposta(a7.id, { status: "RASCUNHO" }); // nunca aprovada: fora
});

afterAll(async () => {
  await limpar();
  await prisma.$disconnect();
});

const meus = <T extends { nome: string }>(linhas: T[]) => linhas.filter((l) => l.nome.startsWith(PREFIXO));

describe("Mix por tipologia", () => {
  it("soma só os itens da opção aprovada, por tipologia, com m² e R$; o que sobra vai em 'outros e ajustes'", async () => {
    const mix = await mixPorTipologia(MAR);
    const por = Object.fromEntries(mix.linhas.map((l) => [l.nome, l]));
    expect(por[`${PREFIXO} Tip A`]).toMatchObject({ itens: 2, valorCentavos: 800_000 });
    expect(por[`${PREFIXO} Tip A`].m2).toBeCloseTo(5, 6); // 4 + 1
    expect(por[`${PREFIXO} Tip B`]).toMatchObject({ itens: 1, valorCentavos: 300_000 });
    expect(por[`${PREFIXO} Tip B`].m2).toBeCloseTo(1.5, 6);
    expect(por["Sem tipologia"]).toMatchObject({ itens: 1, valorCentavos: 50_000, m2: 0 });
    // Vendido = 1.000.000 + 250.000 + 70.000; itens = 1.150.000; sobram 170.000 (acréscimo de P1 + P3 sem itens).
    expect(mix.vendidoCentavos).toBe(1_320_000);
    expect(mix.outrosCentavos).toBe(170_000);
    expect(mix.propostas).toBe(3);
  });

  it("a soma das linhas mais 'outros e ajustes' fecha EXATAMENTE com o Vendido do relatório de vendas e com o SQL independente", async () => {
    const mix = await mixPorTipologia(MAR);
    const soma = mix.linhas.reduce((s, l) => s + l.valorCentavos, 0) + mix.outrosCentavos;
    expect(soma).toBe(mix.vendidoCentavos);
    const vendido = await vendidoNoPeriodo(MAR);
    expect(mix.vendidoCentavos).toBe(vendido.totalCentavos);
    const sql = await q<{ total: string }>(
      `SELECT COALESCE(sum(pr."valorAprovadoCentavos"), 0)::text AS total FROM "Proposta" pr JOIN "Projeto" j ON j.id = pr."projetoId"
        WHERE pr.status = 'APROVADA' AND pr."deletadoEm" IS NULL AND j."deletadoEm" IS NULL
          AND ((pr."aceitaEm" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN '2018-03-01' AND '2018-03-31'`,
    );
    expect(mix.vendidoCentavos).toBe(Number(sql[0].total));
  });

  it("conta as propostas com diferença, as lidas só pela tabela e os itens sem medida", async () => {
    const mix = await mixPorTipologia(MAR);
    expect(mix.propostasComDiferenca).toBe(2); // P1 (acréscimo) e P3 (sem itens)
    expect(mix.propostasSoPelaTabela).toBe(2); // P2 e P3 não têm conteúdo congelado da opção aprovada; P1 tem
    expect(mix.itensSemMedida).toBe(1);
  });

  it("borda do mês em horário de São Paulo: 23h59 do dia 31 entra; 00h01 do dia 1 seguinte e 23h59 do mês anterior ficam fora", async () => {
    const mix = await mixPorTipologia(MAR);
    expect(mix.linhas.find((l) => l.nome === `${PREFIXO} Tip B`)?.valorCentavos).toBe(300_000); // sem os 111.100 e 222.200 das bordas, nem os 999.900 da recusada
  });
});

describe("Preço médio por m²", () => {
  it("por tipologia: valor ÷ área por mês; item sem medida fica fora e é contado", async () => {
    const r = await precoMedioPorM2(MAR, "tipologia");
    const minhas = r.linhas.filter((l) => l.nome.startsWith(PREFIXO));
    const por = Object.fromEntries(minhas.map((l) => [l.nome, l]));
    expect(por[`${PREFIXO} Tip A`]).toMatchObject({ mes: "2018-03", valorCentavos: 800_000, precoPorM2Centavos: 160_000 });
    expect(por[`${PREFIXO} Tip B`]).toMatchObject({ mes: "2018-03", valorCentavos: 300_000, precoPorM2Centavos: 200_000 });
    expect(r.linhas.some((l) => l.nome === "Não informado")).toBe(false); // o item sem medida e sem tipologia não vira linha
    expect(r.itensSemMedida).toBe(1);
    expect(r.itensSemDimensao).toBe(1);
  });

  it("por linha de alumínio (nenhum item tem linha): tudo em 'Não informado', com o total dos itens medidos", async () => {
    const r = await precoMedioPorM2(MAR, "linha");
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0]).toMatchObject({ nome: "Não informado", valorCentavos: 1_100_000 });
    expect(Math.abs((r.linhas[0].precoPorM2Centavos ?? 0) - Math.round(1_100_000 / 6.5))).toBeLessThanOrEqual(1);
    expect(r.itensSemDimensao).toBe(4);
  });

  it("período sem venda: nenhuma linha e nenhum erro", async () => {
    const r = await precoMedioPorM2({ de: "2018-06-01", ate: "2018-06-30" }, "tipologia");
    expect(r).toMatchObject({ linhas: [], porMes: [], itensSemMedida: 0 });
  });
});

describe("Clientes por cidade: caixa, acento e espaços", () => {
  it("'Macaé', 'macae' e 'MACAÉ ' viram UMA cidade, com o nome mais frequente e a UF em maiúsculas", async () => {
    const MAIO: Periodo = { de: "2018-05-01", ate: "2018-05-31" };
    for (const [i, [cidade, uf]] of ([["Macaé", "RJ"], ["Macaé", "RJ"], ["macae", "rj"], ["MACAÉ ", " Rj"]] as const).entries()) {
      const c = await cliente(`Cid ${i}`);
      const e = await endereco(c.id, cidade, uf);
      const p = await projeto(`Cid ${i}`, c.id, e.id);
      await proposta(p.id, { aceitaEm: "2018-05-10T15:00:00Z", valor: 10_000 });
    }
    const linhas = await clientesPorCidade(MAIO);
    expect(linhas).toEqual([{ cidade: "Macaé", uf: "RJ", clientes: 4, obras: 4, vendidoCentavos: 40_000 }]);
  });
});

describe("Clientes por cidade", () => {
  it("agrupa pela cidade da OBRA (espaços e maiúsculas do cadastro à parte), com 'Não informada' para obra sem endereço", async () => {
    const linhas = await clientesPorCidade(MAR);
    const macae = linhas.find((l) => l.cidade === "Macaé");
    expect(macae).toEqual({ cidade: "Macaé", uf: "RJ", clientes: 2, obras: 2, vendidoCentavos: 1_250_000 });
    const semCidade = linhas.find((l) => l.cidade === null);
    expect(semCidade).toMatchObject({ clientes: 1, obras: 1, vendidoCentavos: 70_000 });
    expect(linhas.reduce((s, l) => s + l.vendidoCentavos, 0)).toBe(1_320_000);
  });
});

describe("Clientes para reativar (data de referência recebida por parâmetro)", () => {
  it("entra quem tem a ÚLTIMA aprovação no limite ou antes; a borda é a data local de São Paulo", async () => {
    const r = await clientesParaReativar(REFERENCIA, 12);
    expect(r.limite).toBe("2020-06-30");
    const nomes = meus(r.linhas.map((l) => ({ ...l, nome: l.nome }))).map((l) => l.nome);
    expect(nomes).toContain(`${PREFIXO} Cli 1`); // última aprovação 10/01/2020
    expect(nomes).toContain(`${PREFIXO} Cli 5`); // 30/06/2020 às 23h59: no limite
    expect(nomes).not.toContain(`${PREFIXO} Cli 6`); // 01/07/2020 às 00h01: depois do limite
    expect(nomes).not.toContain(`${PREFIXO} Cli 7`); // só rascunho: nunca aprovou
  });

  it("marca quem já tem proposta enviada em aberto e traz a última aprovação e o total", async () => {
    const r = await clientesParaReativar(REFERENCIA, 12);
    const c1 = r.linhas.find((l) => l.nome === `${PREFIXO} Cli 1`);
    expect(c1?.temPropostaEmAberto).toBe(true);
    expect(c1?.obras).toBe(2); // projeto P1 (março/2018) e A1 (2020)
    expect(c1?.ultimaAprovacaoEm.toISOString()).toBe("2020-01-10T15:00:00.000Z");
    expect(r.linhas.find((l) => l.nome === `${PREFIXO} Cli 5`)?.temPropostaEmAberto).toBe(false);
  });

  it("mais meses empurram o limite para trás; o resultado só depende da referência recebida", async () => {
    const curto = await clientesParaReativar(REFERENCIA, 6); // limite 31/12/2020: Cli 5 e Cli 6 entram também
    const nomes = curto.linhas.map((l) => l.nome);
    expect(nomes).toContain(`${PREFIXO} Cli 6`);
    const longo = await clientesParaReativar(REFERENCIA, 24); // limite 30/06/2019: Cli 1 (2020) sai
    expect(longo.linhas.map((l) => l.nome)).not.toContain(`${PREFIXO} Cli 1`);
    expect(longo.total).toBeLessThanOrEqual(curto.total);
  });
});
