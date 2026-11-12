import { describe, expect, it } from "vitest";

import { sugerirCustoPorM2 } from "../../src/lib/dominio/mao-de-obra";

describe("sugestão de mão de obra por m²", () => {
  it("salários ÷ capacidade: R$ 3.000 + R$ 4.500 + R$ 2.500 = R$ 10.000 ÷ 300 m² = R$ 33,33 por m²", () => {
    expect(sugerirCustoPorM2([300_000, 450_000, 250_000], 300)).toEqual({ ok: true, centavosPorM2: 3333, somaCentavos: 1_000_000, funcionarios: 3, capacidadeM2Mes: 300 });
  });
  it("ignora salário vazio ou inválido (não inventa)", () => {
    expect(sugerirCustoPorM2([300_000, null, 0, -5], 300)).toMatchObject({ ok: true, funcionarios: 1, somaCentavos: 300_000, centavosPorM2: 1000 });
  });
  it("sem salário ou sem capacidade válida, não sugere nada", () => {
    expect(sugerirCustoPorM2([], 300)).toMatchObject({ ok: false });
    expect(sugerirCustoPorM2([null], 300)).toMatchObject({ ok: false });
    expect(sugerirCustoPorM2([100_000], null)).toMatchObject({ ok: false });
    expect(sugerirCustoPorM2([100_000], 0)).toMatchObject({ ok: false });
  });
});
