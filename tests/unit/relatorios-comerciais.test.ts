import { describe, expect, it } from "vitest";

import { valorParaCentavos } from "@/lib/dominio/numeros";
import { dividirEmFaixas, faixasPorCortes, fecharMixComOutros, indiceDaFaixa, lerCortesDeFaixa, MINIMO_DE_CASOS_PARA_FAIXAS, precoPorM2, quartis, ticketDoGrupo } from "@/lib/dominio/relatorios-comerciais";

const reais = (c: number) => `R$ ${(c / 100).toLocaleString("pt-BR")}`;

describe("quartis", () => {
  it("posto mais próximo: sempre um valor que existe", () => {
    expect(quartis([1, 2, 3, 4, 5, 6, 7, 8])).toEqual([2, 4, 6]);
    expect(quartis([10, 20, 30, 40])).toEqual([10, 20, 30]);
  });
  it("não depende da ordem de entrada e não altera a lista", () => {
    const l = [8, 1, 6, 3, 7, 2, 5, 4];
    expect(quartis(l)).toEqual([2, 4, 6]);
    expect(l[0]).toBe(8);
  });
  it("menos de 4 valores: sem quartis", () => {
    expect(quartis([])).toBeNull();
    expect(quartis([1, 2, 3])).toBeNull();
  });
});

describe("faixas por cortes", () => {
  it("monta 'até', 'de a' e 'acima de' sem buraco nem sobreposição (centavos inclusivos)", () => {
    const f = faixasPorCortes([100, 200, 300], reais);
    expect(f.map((x) => [x.deCentavos, x.ateCentavos])).toEqual([[null, 100], [101, 200], [201, 300], [301, null]]);
    expect(f[0].rotulo).toBe("Até R$ 1");
    expect(f[3].rotulo).toBe("Acima de R$ 3");
  });
  it("o valor no corte fica na faixa de baixo; um centavo acima vai para a de cima", () => {
    expect(indiceDaFaixa(100, [100, 200, 300])).toBe(0);
    expect(indiceDaFaixa(101, [100, 200, 300])).toBe(1);
    expect(indiceDaFaixa(300, [100, 200, 300])).toBe(2);
    expect(indiceDaFaixa(301, [100, 200, 300])).toBe(3);
    expect(indiceDaFaixa(0, [100, 200, 300])).toBe(0);
  });
});

describe("cortes digitados no filtro", () => {
  it("lê reais separados por ponto e vírgula", () => {
    expect(lerCortesDeFaixa("30.000; 60.000;120.000", valorParaCentavos)).toEqual([3_000_000, 6_000_000, 12_000_000]);
    expect(lerCortesDeFaixa("5000,50", valorParaCentavos)).toEqual([500_050]);
  });
  it("recusa vazio, ilegível, não crescente, repetido, zero e mais de 5 cortes (volta ao padrão)", () => {
    for (const t of ["", "  ", "abc", "100;50", "100;100", "0;10", "1;2;3;4;5;6", null, undefined]) expect(lerCortesDeFaixa(t as string, valorParaCentavos)).toBeNull();
  });
});

describe("ganhas × perdidas por faixa", () => {
  const casos = (valores: number[], ganha: (i: number) => boolean) => valores.map((v, i) => ({ valorCentavos: v, ganha: ganha(i) }));

  it("com menos de 12 casos: tabela única e aviso (nada de faixas inventadas)", () => {
    const r = dividirEmFaixas(casos([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], (i) => i % 2 === 0), null, reais);
    expect(MINIMO_DE_CASOS_PARA_FAIXAS).toBe(12);
    expect(r).toMatchObject({ tipo: "unica", casos: 11, ganhas: 6, perdidas: 5, motivo: "poucos-dados" });
  });

  it("com 12 casos: quartis dos casos (ganhas e perdidas juntas); cada caso cai em UMA faixa e as faixas fecham o total", () => {
    const r = dividirEmFaixas(casos([100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200], (i) => i >= 6), null, reais);
    if (r.tipo !== "faixas") throw new Error("devia dividir");
    expect(r.origemDosCortes).toBe("quartis");
    expect(r.cortes).toEqual([300, 600, 900]);
    expect(r.linhas.map((l) => [l.ganhas, l.perdidas])).toEqual([[0, 3], [0, 3], [3, 0], [3, 0]]);
    expect(r.linhas.reduce((s, l) => s + l.ganhas + l.perdidas, 0)).toBe(12);
    expect(r.linhas.map((l) => l.taxaDeGanhoPercentual)).toEqual([0, 0, 100, 100]);
  });

  it("cortes digitados valem sempre, até com poucos casos", () => {
    const r = dividirEmFaixas(casos([100, 250, 900], () => true), [200, 500], reais);
    if (r.tipo !== "faixas") throw new Error("devia dividir");
    expect(r.origemDosCortes).toBe("digitados");
    expect(r.linhas.map((l) => l.ganhas)).toEqual([1, 1, 1]);
  });

  it("faixa sem caso não tem taxa (null, não 0%)", () => {
    const r = dividirEmFaixas(casos([100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 1000], () => true), [500, 600], reais);
    if (r.tipo !== "faixas") throw new Error("devia dividir");
    expect(r.linhas[1].taxaDeGanhoPercentual).toBeNull();
  });

  it("quartis repetidos (todos com o mesmo valor) não formam faixas: tabela única", () => {
    const r = dividirEmFaixas(casos(Array(20).fill(5000), (i) => i < 5), null, reais);
    expect(r.tipo).toBe("unica");
  });
});

describe("mix: fecha com o vendido", () => {
  it("a diferença entre o vendido e a soma dos itens vira 'outros e ajustes' (pode ser negativa)", () => {
    const linhas = [{ chave: "a", nome: "A", valorCentavos: 700, m2: 2 }, { chave: "b", nome: "B", valorCentavos: 300, m2: 1 }];
    expect(fecharMixComOutros(linhas, 1_050).outrosCentavos).toBe(50); // acréscimo da nota
    expect(fecharMixComOutros(linhas, 900).outrosCentavos).toBe(-100); // desconto da opção
    expect(fecharMixComOutros(linhas, 1_000).outrosCentavos).toBe(0);
    const f = fecharMixComOutros(linhas, 1_050);
    expect(f.linhas.reduce((s, l) => s + l.valorCentavos, 0) + f.outrosCentavos).toBe(1_050);
  });
});

describe("preço por m² e ticket", () => {
  it("sem m² ou sem projeto, não há conta (null)", () => {
    expect(precoPorM2(100_000, 0)).toBeNull();
    expect(precoPorM2(100_000, 4)).toBe(25_000);
    expect(ticketDoGrupo(1_000, 0)).toBeNull();
    expect(ticketDoGrupo(1_000, 3)).toBe(333);
  });
});
