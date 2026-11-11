import { describe, expect, it } from "vitest";

import { aplicarReajusteSchema, editarProdutoSchema, lerRegraDeReajuste, produtoSchema, reajusteSchema } from "@/modules/produtos/schemas";

const ok = { codigo: "PF-001", descricao: "Perfil fixo 6 m", unidade: "BARRA" };

describe("produtoSchema", () => {
  it("aceita código, descrição e unidade; o resto é opcional e o custo fica ausente", () => {
    const r = produtoSchema.safeParse(ok);
    expect(r.success).toBe(true);
    expect(r.success && r.data.custo).toBeUndefined();
  });

  it("converte o custo de reais para centavos inteiros", () => {
    const r = produtoSchema.safeParse({ ...ok, custo: "1.234,56" });
    expect(r.success && r.data.custo).toBe(123456);
  });

  it("recusa custo inválido, negativo e acima do limite do campo", () => {
    for (const ruim of ["abc", "-1", "12,345", "99999999999,00"]) expect(produtoSchema.safeParse({ ...ok, custo: ruim }).success, ruim).toBe(false);
  });

  it("recusa unidade fora da lista, código vazio e descrição curta", () => {
    expect(produtoSchema.safeParse({ ...ok, unidade: "CAIXA" }).success).toBe(false);
    expect(produtoSchema.safeParse({ ...ok, codigo: "  " }).success).toBe(false);
    expect(produtoSchema.safeParse({ ...ok, descricao: "x" }).success).toBe(false);
  });

  it("medidas: inteiros em mm e decimais com no máximo 3 casas", () => {
    const r = produtoSchema.safeParse({ ...ok, comprimentoBarraMm: "6000", pesoKgPorMetro: "1,255", estoqueMinimo: "10", larguraMm: "1200", alturaMm: "2100" });
    expect(r.success && r.data).toMatchObject({ comprimentoBarraMm: 6000, pesoKgPorMetro: 1.255, estoqueMinimo: 10, larguraMm: 1200, alturaMm: 2100 });
    expect(produtoSchema.safeParse({ ...ok, pesoKgPorMetro: "1,2555" }).success).toBe(false);
    expect(produtoSchema.safeParse({ ...ok, comprimentoBarraMm: "-5" }).success).toBe(false);
    expect(produtoSchema.safeParse({ ...ok, comprimentoBarraMm: "99999" }).success).toBe(false);
  });

  it("estoque mínimo vazio significa SEM alerta (fica ausente, não zero)", () => {
    const r = produtoSchema.safeParse({ ...ok, estoqueMinimo: "" });
    expect(r.success && r.data.estoqueMinimo).toBeUndefined();
  });

  it("a edição exige o id", () => {
    expect(editarProdutoSchema.safeParse(ok).success).toBe(false);
    expect(editarProdutoSchema.safeParse({ ...ok, id: "p1" }).success).toBe(true);
  });
});

describe("lerRegraDeReajuste", () => {
  it("percentual: aceita sinal, vírgula, % no fim e até duas casas", () => {
    expect(lerRegraDeReajuste("PERCENTUAL", "5")).toEqual({ regra: { modo: "PERCENTUAL", percentual: 5 } });
    expect(lerRegraDeReajuste("PERCENTUAL", "+5,25%")).toEqual({ regra: { modo: "PERCENTUAL", percentual: 5.25 } });
    expect(lerRegraDeReajuste("PERCENTUAL", "-3,5")).toEqual({ regra: { modo: "PERCENTUAL", percentual: -3.5 } });
    expect(lerRegraDeReajuste("PERCENTUAL", " 10 ")).toEqual({ regra: { modo: "PERCENTUAL", percentual: 10 } });
  });

  it("percentual: recusa texto, mais de duas casas e vazio", () => {
    for (const ruim of ["abc", "1,234", "", "5%%", "--5"]) expect("erro" in lerRegraDeReajuste("PERCENTUAL", ruim), ruim).toBe(true);
  });

  it("valor fixo: converte reais para centavos, com sinal", () => {
    expect(lerRegraDeReajuste("VALOR_FIXO", "2,50")).toEqual({ regra: { modo: "VALOR_FIXO", valorCentavos: 250 } });
    expect(lerRegraDeReajuste("VALOR_FIXO", "-10,00")).toEqual({ regra: { modo: "VALOR_FIXO", valorCentavos: -1000 } });
    expect(lerRegraDeReajuste("VALOR_FIXO", "+1.234,56")).toEqual({ regra: { modo: "VALOR_FIXO", valorCentavos: 123456 } });
  });

  it("valor fixo: recusa lixo e mais de duas casas", () => {
    for (const ruim of ["abc", "1,234", "R$", ""]) expect("erro" in lerRegraDeReajuste("VALOR_FIXO", ruim), ruim).toBe(true);
  });
});

describe("pedido de reajuste", () => {
  const pedido = { escopo: "FORNECEDOR", alvoId: "f1", modo: "PERCENTUAL", valor: "5" };

  it("aceita fornecedor ou categoria e exige o alvo", () => {
    expect(reajusteSchema.safeParse(pedido).success).toBe(true);
    expect(reajusteSchema.safeParse({ ...pedido, escopo: "CATEGORIA" }).success).toBe(true);
    expect(reajusteSchema.safeParse({ ...pedido, escopo: "TUDO" }).success).toBe(false);
    expect(reajusteSchema.safeParse({ ...pedido, alvoId: "" }).success).toBe(false);
    expect(reajusteSchema.safeParse({ ...pedido, modo: "DOBRAR" }).success).toBe(false);
  });

  it("a confirmação exige a assinatura da prévia", () => {
    expect(aplicarReajusteSchema.safeParse(pedido).success).toBe(false);
    expect(aplicarReajusteSchema.safeParse({ ...pedido, assinatura: "x" }).success).toBe(false);
    expect(aplicarReajusteSchema.safeParse({ ...pedido, assinatura: "a".repeat(64) }).success).toBe(true);
  });
});
