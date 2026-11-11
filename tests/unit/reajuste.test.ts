import { describe, expect, it } from "vitest";

import { calcularReajuste, CUSTO_MAXIMO_CENTAVOS, descreverRegra, validarRegra } from "@/lib/dominio/reajuste";

describe("calcularReajuste (percentual)", () => {
  it("aplica +10% sobre R$ 100,00 → R$ 110,00", () => {
    expect(calcularReajuste(10000, { modo: "PERCENTUAL", percentual: 10 })).toEqual({ ok: true, novoCentavos: 11000 });
  });

  it("arredonda meio centavo para cima: R$ 0,05 × 10% = 0,5 centavo → sobe", () => {
    // 5 centavos + 10% = 5,5 → variação 0,5 → arredonda para 1 → 6
    expect(calcularReajuste(5, { modo: "PERCENTUAL", percentual: 10 })).toEqual({ ok: true, novoCentavos: 6 });
  });

  it("arredondamento é por variação: 1 centavo + 4% (0,04) não muda e é recusado", () => {
    const r = calcularReajuste(1, { modo: "PERCENTUAL", percentual: 4 });
    expect(r.ok).toBe(false);
  });

  it("aceita duas casas no percentual: R$ 80,00 × 5,25% = R$ 4,20", () => {
    expect(calcularReajuste(8000, { modo: "PERCENTUAL", percentual: 5.25 })).toEqual({ ok: true, novoCentavos: 8420 });
  });

  it("desconto: R$ 100,00 − 3,5% = R$ 96,50", () => {
    expect(calcularReajuste(10000, { modo: "PERCENTUAL", percentual: -3.5 })).toEqual({ ok: true, novoCentavos: 9650 });
  });

  it("desconto arredonda a variação do mesmo jeito (meio para cima no módulo)", () => {
    // 15 centavos − 10% = variação 1,5 → 2 → 13
    expect(calcularReajuste(15, { modo: "PERCENTUAL", percentual: -10 })).toEqual({ ok: true, novoCentavos: 13 });
  });

  it("recusa quando o desconto zeraria o custo", () => {
    const r = calcularReajuste(10000, { modo: "PERCENTUAL", percentual: -100 });
    expect(r).toEqual({ ok: false, motivo: "O novo custo ficaria zerado ou negativo." });
  });

  it("recusa estourar o limite do campo", () => {
    const r = calcularReajuste(CUSTO_MAXIMO_CENTAVOS, { modo: "PERCENTUAL", percentual: 10 });
    expect(r.ok).toBe(false);
  });

  it("não usa ponto flutuante em valores grandes: R$ 9.999.999,99 + 10%", () => {
    // 999.999.999 × 1000 pontos-base = 999.999.999.000 → /10000 = 99.999.999,9 → meio p/ cima = 100.000.000
    expect(calcularReajuste(999_999_999, { modo: "PERCENTUAL", percentual: 10 })).toEqual({
      ok: true,
      novoCentavos: 999_999_999 + 100_000_000,
    });
  });
});

describe("calcularReajuste (valor fixo)", () => {
  it("soma e subtrai em centavos", () => {
    expect(calcularReajuste(1000, { modo: "VALOR_FIXO", valorCentavos: 250 })).toEqual({ ok: true, novoCentavos: 1250 });
    expect(calcularReajuste(1000, { modo: "VALOR_FIXO", valorCentavos: -250 })).toEqual({ ok: true, novoCentavos: 750 });
  });

  it("recusa resultado zero ou negativo", () => {
    expect(calcularReajuste(1000, { modo: "VALOR_FIXO", valorCentavos: -1000 }).ok).toBe(false);
    expect(calcularReajuste(1000, { modo: "VALOR_FIXO", valorCentavos: -5000 }).ok).toBe(false);
  });
});

describe("calcularReajuste (casos de borda)", () => {
  it("produto sem custo é ignorado, nunca recebe preço inventado", () => {
    expect(calcularReajuste(null, { modo: "PERCENTUAL", percentual: 10 })).toEqual({ ok: false, motivo: "Produto sem custo informado." });
  });

  it("custo inválido é recusado", () => {
    expect(calcularReajuste(-5, { modo: "PERCENTUAL", percentual: 10 }).ok).toBe(false);
    expect(calcularReajuste(10.5, { modo: "PERCENTUAL", percentual: 10 }).ok).toBe(false);
  });
});

describe("validarRegra", () => {
  it("aceita regras razoáveis", () => {
    expect(validarRegra({ modo: "PERCENTUAL", percentual: 5 })).toBeNull();
    expect(validarRegra({ modo: "PERCENTUAL", percentual: -12.34 })).toBeNull();
    expect(validarRegra({ modo: "VALOR_FIXO", valorCentavos: -100 })).toBeNull();
  });

  it("recusa zero, NaN, infinito, excesso e mais de 2 casas", () => {
    expect(validarRegra({ modo: "PERCENTUAL", percentual: 0 })).toMatch(/zero/);
    expect(validarRegra({ modo: "PERCENTUAL", percentual: Number.NaN })).toMatch(/percentual/);
    expect(validarRegra({ modo: "PERCENTUAL", percentual: Number.POSITIVE_INFINITY })).toMatch(/percentual/);
    expect(validarRegra({ modo: "PERCENTUAL", percentual: 1001 })).toMatch(/1\.000/);
    expect(validarRegra({ modo: "PERCENTUAL", percentual: 1.234 })).toMatch(/2 casas/);
    expect(validarRegra({ modo: "VALOR_FIXO", valorCentavos: 0 })).toMatch(/zero/);
    expect(validarRegra({ modo: "VALOR_FIXO", valorCentavos: 1.5 })).toMatch(/centavos/);
    expect(validarRegra({ modo: "VALOR_FIXO", valorCentavos: CUSTO_MAXIMO_CENTAVOS + 1 })).toMatch(/grande/);
  });
});

describe("descreverRegra", () => {
  it("escreve a regra para o histórico", () => {
    expect(descreverRegra({ modo: "PERCENTUAL", percentual: 5 })).toBe("+5%");
    expect(descreverRegra({ modo: "PERCENTUAL", percentual: -3.5 })).toBe("-3,5%");
    expect(descreverRegra({ modo: "VALOR_FIXO", valorCentavos: 250 })).toBe("+R$ 2,50");
    expect(descreverRegra({ modo: "VALOR_FIXO", valorCentavos: -1234567 })).toBe("-R$ 12.345,67");
  });
});
