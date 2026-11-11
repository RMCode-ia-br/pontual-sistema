import { describe, expect, it } from "vitest";

import { avaliarFormula, ErroFormula, TAMANHO_MAXIMO_FORMULA, testarFormula, validarFormula } from "@/lib/dominio/formulas";

const V = { L: 2000, A: 1200, F: 2, Q: 3 };

describe("avaliarFormula", () => {
  it("perímetro em metros: (L/1000)*2 + (A/1000)*2", () => {
    expect(avaliarFormula("(L/1000)*2 + (A/1000)*2", V)).toBeCloseTo(6.4, 10);
  });

  it("respeita a precedência e os parênteses", () => {
    expect(avaliarFormula("2 + 3 * 4", V)).toBe(14);
    expect(avaliarFormula("(2 + 3) * 4", V)).toBe(20);
    expect(avaliarFormula("10 - 2 - 3", V)).toBe(5);
    expect(avaliarFormula("2 * -(1 + 1) + 6", V)).toBe(2);
  });

  it("usa as variáveis L, A, F e Q", () => {
    expect(avaliarFormula("F * Q", V)).toBe(6);
    expect(avaliarFormula("L * A / 1000000", V)).toBeCloseTo(2.4, 10);
  });

  it("aceita decimal com ponto e funções permitidas", () => {
    expect(avaliarFormula("ceil(L/1000 * 1.5)", V)).toBe(3);
    expect(avaliarFormula("max(A/1000; 1.5)", V)).toBe(1.5);
    expect(avaliarFormula("min(L, A)", V)).toBe(1200);
    expect(avaliarFormula("round(sqrt(16))", V)).toBe(4);
  });

  it("se() é preguiçoso: o ramo não escolhido não roda (sem divisão por zero)", () => {
    expect(avaliarFormula("se(F > 0; L / F; 0)", { ...V, F: 0 })).toBe(0);
    expect(avaliarFormula("se(F > 0; L / F; 0)", { ...V, F: 2 })).toBe(1000);
    expect(validarFormula("se(F > 0; L / F; 0)").ok).toBe(true);
  });

  it("condicional se(condição; então; senão)", () => {
    expect(avaliarFormula("se(F > 2; 4; 2)", V)).toBe(2);
    expect(avaliarFormula("se(F >= 2; 4; 2)", V)).toBe(4);
    expect(avaliarFormula("se(L == 2000; 1; 0)", V)).toBe(1);
  });
});

describe("fórmulas inválidas e maliciosas são rejeitadas", () => {
  const rejeitadas = [
    "",
    "   ",
    "2 +",
    "(2 + 3",
    "2 + 3)",
    "L +* A",
    "X * 2",
    "l * 2",
    "L, A",
    "1..2",
    "1.2.3",
    "eval('1')",
    "process.exit(1)",
    "constructor",
    "L.constructor",
    "this",
    "globalThis",
    "require('fs')",
    "L; A",
    "alert(1)",
    "L ** 2",
    "L ^ 2",
    "`${L}`",
    "L = 1",
    "[1,2]",
    "{L}",
    "'a' + 'b'",
    "L\n+ A",
    "toString()",
    "__proto__",
    "max(1)",
    "ceil(1; 2)",
    "se(1; 2)",
  ];
  for (const texto of rejeitadas) {
    it(`rejeita ${JSON.stringify(texto)}`, () => {
      expect(validarFormula(texto).ok).toBe(false);
      expect(() => avaliarFormula(texto, V)).toThrow(ErroFormula);
    });
  }

  it("não executa código: nada de Function/eval no resultado", () => {
    const r = testarFormula("Function('return 1')()", V);
    expect(r.ok).toBe(false);
  });

  it("recusa divisão por zero e resultado negativo", () => {
    expect(validarFormula("L / (A - A)").ok).toBe(false);
    expect(validarFormula("A - L").ok).toBe(true); // com L=A=1000 de teste dá 0; sintaxe ok
    expect(() => avaliarFormula("A - L", V)).toThrow(/negativo/);
  });

  it("limita tamanho e profundidade (evita abuso de CPU/pilha)", () => {
    expect(validarFormula("1+".repeat(TAMANHO_MAXIMO_FORMULA) + "1").ok).toBe(false);
    expect(validarFormula("(".repeat(120) + "1" + ")".repeat(120)).ok).toBe(false);
    const muitosNos = Array.from({ length: 150 }, () => "1").join("+"); // 299 caracteres, 299 nós
    expect(validarFormula(muitosNos).ok).toBe(false);
  });

  it("mensagens não vazam detalhes internos", () => {
    const r = validarFormula("foo(1)");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toMatch(/Função não permitida/);
  });
});
