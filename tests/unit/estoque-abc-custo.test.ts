import { describe, expect, it } from "vitest";

import { CORTES_ABC_PADRAO, curvaAbc, lerCortesAbc, variacaoDeCusto } from "@/lib/dominio/relatorio-estoque";

const item = (id: string, valorCentavos: number) => ({ id, valorCentavos });

describe("curva ABC", () => {
  it("80/15/5: o item que atravessa os 80% fica em A; depois vêm B e C", () => {
    // Total 1000: 500 (acum. antes 0%) → A; 350 (antes 50%) → A (atravessa 80%); 100 (antes 85%) → B; 30 (antes 95%) → C; 20 (antes 98%) → C.
    const { linhas, totalCentavos } = curvaAbc([item("d", 100), item("a", 500), item("e", 20), item("b", 350), item("c", 30)], CORTES_ABC_PADRAO);
    expect(totalCentavos).toBe(1000);
    expect(linhas.map((l) => [l.id, l.classe])).toEqual([["a", "A"], ["b", "A"], ["d", "B"], ["c", "C"], ["e", "C"]]);
    expect(linhas.map((l) => l.percentual)).toEqual([50, 35, 10, 3, 2]);
    expect(linhas.map((l) => l.acumulado)).toEqual([50, 85, 95, 98, 100]);
  });

  it("os cortes são editáveis: 50/30 muda as classes", () => {
    const { linhas } = curvaAbc([item("a", 500), item("b", 350), item("c", 100), item("d", 50)], { a: 50, b: 30 });
    expect(linhas.map((l) => l.classe)).toEqual(["A", "B", "C", "C"]); // acumulado antes: 0 → A; 50 → B (50 < 80); 85 → C; 95 → C
  });

  it("um único produto é A; sem saída (ou só valor zero/negativo) não gera linha e não divide por zero", () => {
    expect(curvaAbc([item("a", 10)]).linhas.map((l) => l.classe)).toEqual(["A"]);
    expect(curvaAbc([]).linhas).toEqual([]);
    expect(curvaAbc([item("a", 0), item("b", -5)]).linhas).toEqual([]);
  });

  it("empate de valor: a ordem de entrada vale e a soma dos percentuais fecha em 100", () => {
    const { linhas } = curvaAbc([item("a", 100), item("b", 100), item("c", 100), item("d", 100)]);
    expect(linhas.at(-1)?.acumulado).toBe(100);
    expect(linhas).toHaveLength(4);
  });
});

describe("cortes da curva ABC lidos da URL", () => {
  it("valores válidos passam; lixo, vazio ou A + B acima de 99 voltam ao padrão", () => {
    expect(lerCortesAbc("70", "20")).toEqual({ a: 70, b: 20 });
    expect(lerCortesAbc(undefined, undefined)).toEqual(CORTES_ABC_PADRAO);
    expect(lerCortesAbc("abc", "10")).toEqual(CORTES_ABC_PADRAO);
    expect(lerCortesAbc("0", "10")).toEqual(CORTES_ABC_PADRAO);
    expect(lerCortesAbc("80", "30")).toEqual(CORTES_ABC_PADRAO);
    expect(lerCortesAbc("2.5", "10")).toEqual(CORTES_ABC_PADRAO);
  });
});

describe("variação de custo", () => {
  it("percentual com uma casa; sem custo anterior (ou zero) é 'sem base', nunca infinito", () => {
    expect(variacaoDeCusto(10_000, 11_000)).toBe(10);
    expect(variacaoDeCusto(10_000, 9_500)).toBe(-5);
    expect(variacaoDeCusto(3_000, 3_100)).toBe(3.3);
    expect(variacaoDeCusto(10_000, 10_000)).toBe(0);
    expect(variacaoDeCusto(null, 5_000)).toBeNull();
    expect(variacaoDeCusto(0, 5_000)).toBeNull();
  });
});
