import { describe, expect, it } from "vitest";

import { variacaoEntre } from "@/lib/periodo/variacao";

describe("variacaoEntre", () => {
  it("sobe, cai e fica igual", () => {
    expect(variacaoEntre(150, 100)).toEqual({ tipo: "subiu", percentual: 50, diferenca: 50 });
    expect(variacaoEntre(75, 100)).toEqual({ tipo: "caiu", percentual: 25, diferenca: 25 });
    expect(variacaoEntre(100, 100)).toEqual({ tipo: "igual" });
  });

  it("arredonda o percentual para inteiro", () => {
    expect(variacaoEntre(1456, 1000)).toEqual({ tipo: "subiu", percentual: 46, diferenca: 456 });
  });

  it("nunca inventa percentual sem base: vazio ou base zero", () => {
    expect(variacaoEntre(100, 0)).toEqual({ tipo: "sem-base" });
    expect(variacaoEntre(100, null)).toEqual({ tipo: "sem-base" });
    expect(variacaoEntre(null, 100)).toEqual({ tipo: "sem-base" });
    expect(variacaoEntre(undefined, undefined)).toEqual({ tipo: "sem-base" });
    expect(variacaoEntre(0, 0)).toEqual({ tipo: "igual" });
  });

  it("zero atual contra base positiva é queda de 100%", () => {
    expect(variacaoEntre(0, 200)).toEqual({ tipo: "caiu", percentual: 100, diferenca: 200 });
  });
});
