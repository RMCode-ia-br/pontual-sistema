import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { criarClientePrisma } from "@/lib/db/criar-cliente";
import { aplicarReajusteNoBanco, ErroDePrevia, montarPrevia } from "@/modules/produtos/reajuste";

import { comConexao } from "./banco-teste";

const prisma = criarClientePrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL);
const PREFIXO = "INT-RJ-";

async function limpar() {
  await comConexao(async (c) => {
    await c.query(`DELETE FROM "HistoricoPreco" WHERE "produtoId" IN (SELECT id FROM "Produto" WHERE codigo LIKE $1)`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Produto" WHERE codigo LIKE $1`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Fornecedor" WHERE "razaoSocial" LIKE 'Int Reajuste%'`);
    await c.query(`DELETE FROM "LogAuditoria" WHERE "usuarioId" = 'int-reajuste-id'`);
  });
}

let fornecedorId = "";
let outroFornecedorId = "";
const ids: Record<string, string> = {};

beforeAll(async () => {
  await limpar();
  fornecedorId = (await prisma.fornecedor.create({ data: { razaoSocial: "Int Reajuste Alfa" } })).id;
  outroFornecedorId = (await prisma.fornecedor.create({ data: { razaoSocial: "Int Reajuste Beta" } })).id;
  const base = { unidade: "UN" as const };
  const criar = async (chave: string, dados: { descricao: string; custo: number | null; fornecedor?: string; ativo?: boolean; excluido?: boolean }) => {
    ids[chave] = (
      await prisma.produto.create({
        data: {
          ...base,
          codigo: `${PREFIXO}${chave}`,
          descricao: dados.descricao,
          custoUnitarioCentavos: dados.custo,
          fornecedorPrincipalId: dados.fornecedor ?? fornecedorId,
          ativo: dados.ativo ?? true,
          deletadoEm: dados.excluido ? new Date() : null,
        },
      })
    ).id;
  };
  await criar("A", { descricao: "Perfil A", custo: 10000 });
  await criar("B", { descricao: "Perfil B", custo: 5 }); // 5 centavos: arredondamento
  await criar("SEM", { descricao: "Sem custo", custo: null });
  await criar("OFF", { descricao: "Inativo", custo: 20000, ativo: false });
  await criar("LIXO", { descricao: "Na lixeira", custo: 30000, excluido: true });
  await criar("OUTRO", { descricao: "De outro fornecedor", custo: 40000, fornecedor: outroFornecedorId });
});

afterAll(async () => {
  await limpar();
  await prisma.$disconnect();
});

const pedido = (extra: Partial<{ escopo: "FORNECEDOR" | "CATEGORIA"; alvoId: string; modo: "PERCENTUAL" | "VALOR_FIXO"; valor: string }> = {}) => ({
  escopo: "FORNECEDOR" as const,
  alvoId: fornecedorId,
  modo: "PERCENTUAL" as const,
  valor: "10",
  ...extra,
});

describe("prévia do reajuste em lote (nada é gravado)", () => {
  it("só entra produto ATIVO, não excluído, do fornecedor escolhido; o de outro fornecedor não é tocado", async () => {
    const previa = await montarPrevia(pedido());
    const codigos = previa.itens.map((i) => i.codigo).sort();
    expect(codigos).toEqual([`${PREFIXO}A`, `${PREFIXO}B`, `${PREFIXO}SEM`]);
  });

  it("calcula em centavos, meio centavo para cima, e explica quem foi ignorado", async () => {
    const previa = await montarPrevia(pedido());
    const por = Object.fromEntries(previa.itens.map((i) => [i.codigo.replace(PREFIXO, ""), i]));
    expect(por.A.custoNovoCentavos).toBe(11000); // R$ 100,00 + 10%
    expect(por.B.custoNovoCentavos).toBe(6); // 5 + 0,5 → 6 (meio para cima)
    expect(por.SEM.custoNovoCentavos).toBeNull();
    expect(por.SEM.motivoIgnorado).toBe("Produto sem custo informado.");
    expect(previa.afetados).toBe(2);
    expect(previa.ignorados).toBe(1);
    expect(previa.somaAntesCentavos).toBe(10005);
    expect(previa.somaDepoisCentavos).toBe(11006);
  });

  it("a prévia não altera nenhum custo no banco", async () => {
    await montarPrevia(pedido());
    const a = await prisma.produto.findUniqueOrThrow({ where: { id: ids.A } });
    expect(a.custoUnitarioCentavos).toBe(10000);
    expect(await prisma.historicoPreco.count({ where: { produtoId: ids.A } })).toBe(0);
  });

  it("a assinatura muda quando um custo muda, e é a mesma quando nada mudou", async () => {
    const um = await montarPrevia(pedido());
    const dois = await montarPrevia(pedido());
    expect(dois.assinatura).toBe(um.assinatura);
    await prisma.produto.update({ where: { id: ids.A }, data: { custoUnitarioCentavos: 10001 } });
    const tres = await montarPrevia(pedido());
    expect(tres.assinatura).not.toBe(um.assinatura);
    await prisma.produto.update({ where: { id: ids.A }, data: { custoUnitarioCentavos: 10000 } });
  });

  it("assinatura também depende da regra e do alvo", async () => {
    const base = await montarPrevia(pedido());
    expect((await montarPrevia(pedido({ valor: "11" }))).assinatura).not.toBe(base.assinatura);
    expect((await montarPrevia(pedido({ alvoId: outroFornecedorId }))).assinatura).not.toBe(base.assinatura);
  });

  it("valor fixo e desconto: nunca zera nem negativa, e diz por quê", async () => {
    const fixo = await montarPrevia(pedido({ modo: "VALOR_FIXO", valor: "-100,00" }));
    const a = fixo.itens.find((i) => i.codigo.endsWith("-A"));
    expect(a?.custoNovoCentavos).toBeNull();
    expect(a?.motivoIgnorado).toBe("O novo custo ficaria zerado ou negativo.");
    const desconto = await montarPrevia(pedido({ valor: "-50" }));
    expect(desconto.itens.find((i) => i.codigo.endsWith("-A"))?.custoNovoCentavos).toBe(5000);
  });

  it("recusa regra inválida, fornecedor inexistente e categoria inexistente", async () => {
    await expect(montarPrevia(pedido({ valor: "abc" }))).rejects.toBeInstanceOf(ErroDePrevia);
    await expect(montarPrevia(pedido({ valor: "0" }))).rejects.toThrow(/zero/);
    await expect(montarPrevia(pedido({ alvoId: "nao-existe" }))).rejects.toThrow(/fornecedor/i);
    await expect(montarPrevia(pedido({ escopo: "CATEGORIA", alvoId: "nao-existe" }))).rejects.toThrow(/categoria/i);
  });
});

describe("aplicar o reajuste em lote", () => {
  const usuario = { id: "int-reajuste-id", nome: "Reajuste de Integração" };

  it("assinatura velha (um custo mudou depois da prévia) é recusada e nada é gravado", async () => {
    const previa = await montarPrevia(pedido());
    await prisma.produto.update({ where: { id: ids.A }, data: { custoUnitarioCentavos: 10001 } });
    await expect(aplicarReajusteNoBanco({ usuario, pedido: pedido(), assinatura: previa.assinatura })).rejects.toThrow(/mudaram desde a prévia/);
    expect((await prisma.produto.findUniqueOrThrow({ where: { id: ids.B } })).custoUnitarioCentavos).toBe(5);
    expect(await prisma.historicoPreco.count({ where: { produtoId: { in: [ids.A, ids.B] } } })).toBe(0);
    await prisma.produto.update({ where: { id: ids.A }, data: { custoUnitarioCentavos: 10000 } });
  });

  it("aplica: custos novos, um histórico por produto (origem lote, com o fornecedor) e auditoria do lote", async () => {
    const previa = await montarPrevia(pedido());
    const r = await aplicarReajusteNoBanco({ usuario, pedido: pedido(), assinatura: previa.assinatura });
    expect(r).toMatchObject({ afetados: 2, descricaoDaRegra: "+10%" });
    const a = await prisma.produto.findUniqueOrThrow({ where: { id: ids.A } });
    const b = await prisma.produto.findUniqueOrThrow({ where: { id: ids.B } });
    const sem = await prisma.produto.findUniqueOrThrow({ where: { id: ids.SEM } });
    expect([a.custoUnitarioCentavos, b.custoUnitarioCentavos, sem.custoUnitarioCentavos]).toEqual([11000, 6, null]);
    expect(a.custoAtualizadoEm).not.toBeNull();
    const hist = await prisma.historicoPreco.findMany({ where: { produtoId: ids.A } });
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({ custoAnteriorCentavos: 10000, custoNovoCentavos: 11000, origem: "REAJUSTE_LOTE", fornecedorId, usuarioId: usuario.id });
    expect(hist[0].observacao).toContain("+10%");
    // O produto de outro fornecedor e o inativo não foram tocados.
    expect((await prisma.produto.findUniqueOrThrow({ where: { id: ids.OUTRO } })).custoUnitarioCentavos).toBe(40000);
    expect((await prisma.produto.findUniqueOrThrow({ where: { id: ids.OFF } })).custoUnitarioCentavos).toBe(20000);
    expect(await prisma.logAuditoria.count({ where: { usuarioId: usuario.id, acao: "REAJUSTE_LOTE" } })).toBe(1);
  });

  it("aplicar duas vezes com a mesma prévia: a segunda é recusada (os custos já mudaram)", async () => {
    const velha = await montarPrevia(pedido({ valor: "5" })); // prévia calculada sobre os custos atuais
    await aplicarReajusteNoBanco({ usuario, pedido: pedido({ valor: "5" }), assinatura: velha.assinatura });
    await expect(aplicarReajusteNoBanco({ usuario, pedido: pedido({ valor: "5" }), assinatura: velha.assinatura })).rejects.toThrow(/mudaram desde a prévia/);
  });
});
