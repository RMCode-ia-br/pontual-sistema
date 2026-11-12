import { describe, expect, it } from "vitest";

import { resumirPosicao, totalizarPorFornecedor, valorDaLinha } from "@/lib/dominio/relatorio-estoque";

describe("valorDaLinha", () => {
  it("saldo em milésimos × custo unitário, arredondado em centavos", () => {
    expect(valorDaLinha(10_000, 2_550)).toBe(25_500); // 10 × R$ 25,50
    expect(valorDaLinha(500, 333)).toBe(167); // 0,5 × R$ 3,33 = 1,665 → 167
    expect(valorDaLinha(1_234, 100)).toBe(123);
  });
});

describe("resumirPosicao", () => {
  it("produto sem custo fica fora do valor (nunca como zero) e é contado à parte", () => {
    const r = resumirPosicao([
      { saldoMilesimos: 10_000, custoUnitarioCentavos: 1_000, estoqueMinimoMilesimos: null },
      { saldoMilesimos: 4_000, custoUnitarioCentavos: null, estoqueMinimoMilesimos: null },
    ]);
    expect(r.valorCentavos).toBe(10_000);
    expect(r.semCusto).toBe(1);
    expect(r.comSaldo).toBe(2);
  });

  it("abaixo do mínimo só conta quem TEM mínimo definido; campo vazio = sem alerta", () => {
    const r = resumirPosicao([
      { saldoMilesimos: 0, custoUnitarioCentavos: null, estoqueMinimoMilesimos: null },
      { saldoMilesimos: 2_000, custoUnitarioCentavos: 100, estoqueMinimoMilesimos: 5_000 },
      { saldoMilesimos: 5_000, custoUnitarioCentavos: 100, estoqueMinimoMilesimos: 5_000 }, // igual ao mínimo: não está abaixo
      { saldoMilesimos: 0, custoUnitarioCentavos: null, estoqueMinimoMilesimos: 1_000 }, // zerado com mínimo: está abaixo
    ]);
    expect(r.abaixoDoMinimo).toBe(2);
  });

  it("saldo negativo não reduz o valor nem conta como produto com saldo", () => {
    const r = resumirPosicao([
      { saldoMilesimos: -3_000, custoUnitarioCentavos: 500, estoqueMinimoMilesimos: null },
      { saldoMilesimos: 1_000, custoUnitarioCentavos: 500, estoqueMinimoMilesimos: null },
    ]);
    expect(r.valorCentavos).toBe(500);
    expect(r.saldoNegativo).toBe(1);
    expect(r.comSaldo).toBe(1);
  });

  it("estoque vazio: tudo zero (e nada inventado)", () => {
    expect(resumirPosicao([])).toEqual({ valorCentavos: 0, semCusto: 0, comSaldo: 0, saldoNegativo: 0, abaixoDoMinimo: 0 });
  });
});

describe("totalizarPorFornecedor", () => {
  it("soma por fornecedor, item sem valor conta à parte e o maior valor vem primeiro", () => {
    const t = totalizarPorFornecedor([
      { fornecedorId: "b", valorCentavos: 1_000 },
      { fornecedorId: "a", valorCentavos: 5_000 },
      { fornecedorId: "b", valorCentavos: null },
      { fornecedorId: "a", valorCentavos: 2_500 },
    ]);
    expect(t).toEqual([
      { fornecedorId: "a", valorCentavos: 7_500, itens: 2, semValor: 0 },
      { fornecedorId: "b", valorCentavos: 1_000, itens: 2, semValor: 1 },
    ]);
  });

  it("sem recebimentos, lista vazia", () => {
    expect(totalizarPorFornecedor([])).toEqual([]);
  });
});
