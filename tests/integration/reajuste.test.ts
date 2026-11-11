import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { criarClientePrisma } from "@/lib/db/criar-cliente";
import { ErroDePrevia, montarPrevia } from "@/modules/produtos/reajuste";

import { comConexao } from "./banco-teste";

const prisma = criarClientePrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL);
const PREFIXO = "INT-RJ-";

async function limpar() {
  await comConexao(async (c) => {
    await c.query(`DELETE FROM "HistoricoPreco" WHERE "produtoId" IN (SELECT id FROM "Produto" WHERE codigo LIKE $1)`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Produto" WHERE codigo LIKE $1`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Fornecedor" WHERE "razaoSocial" LIKE 'Int Reajuste%'`);
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
