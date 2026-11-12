import { describe, expect, it } from "vitest";

import { custoDaComposicao } from "../../src/lib/dominio/composicao";
import { calcularCustoDaObra, custoEstimadoDeMaterialDaOpcao, type EntradaDoCustoDaObra } from "../../src/lib/dominio/custo-obra";
import { agruparMateriais, equivalenciasDoPerfil, faltaNoEstoque, quantidadesDaComposicao } from "../../src/lib/dominio/lista-materiais";

// Perímetro em metros: 2 × (L/1000) + 2 × (A/1000), a fórmula-exemplo da especificação.
const PERIMETRO = "(L/1000)*2 + (A/1000)*2";

describe("lista de materiais pela composição", () => {
  const insumos = [
    { produtoId: "perfil-a", descricao: "Perfil A", unidade: "M", formulaQuantidade: PERIMETRO, perdaPb: 500, custoUnitarioCentavos: 2500 },
    { produtoId: "roldana", descricao: "Roldana", unidade: "UN", formulaQuantidade: "F * 2", perdaPb: 0, custoUnitarioCentavos: null },
  ];

  it("soma as medidas com a perda de corte: 2 peças de 1,2 × 1,0 m a 5% = (2,4 + 2,0) × 2 × 1,05 = 9,24 m", () => {
    const r = quantidadesDaComposicao(insumos, [{ larguraMm: 1200, alturaMm: 1000, quantidade: 2 }], { folhas: 2 });
    expect(r).toEqual({
      ok: true,
      linhas: [
        { produtoId: "perfil-a", descricao: "Perfil A", unidade: "M", quantidade: 9.24 },
        { produtoId: "roldana", descricao: "Roldana", unidade: "UN", quantidade: 8 }, // F × 2 = 4 por peça × 2 peças
      ],
    });
  });

  it("vários vãos somam; insumo sem custo continua na lista (a lista não depende de preço)", () => {
    const r = quantidadesDaComposicao(
      insumos,
      [
        { larguraMm: 1200, alturaMm: 1000, quantidade: 1 },
        { larguraMm: 600, alturaMm: 600, quantidade: 1 },
      ],
      { folhas: 2 },
    );
    expect(r.ok && r.linhas[0].quantidade).toBe(Math.round((4.4 * 1.05 + 2.4 * 1.05) * 1000) / 1000); // 7,14
    expect(r.ok && r.linhas[1].quantidade).toBe(8);
  });

  it("sem composição não inventa quantidade; fórmula inválida e sem medida são recusadas com o motivo", () => {
    expect(quantidadesDaComposicao([], [{ larguraMm: 1000, alturaMm: 1000, quantidade: 1 }], { folhas: 2 })).toMatchObject({ ok: false, semComposicao: true });
    expect(quantidadesDaComposicao(insumos, [], { folhas: 2 })).toMatchObject({ ok: false, semComposicao: false });
    const ruim = quantidadesDaComposicao([{ descricao: "Ruim", formulaQuantidade: "L +", perdaPb: 0, custoUnitarioCentavos: 1 }], [{ larguraMm: 1000, alturaMm: 1000, quantidade: 1 }], { folhas: 1 });
    expect(ruim.ok).toBe(false);
    expect(!ruim.ok && ruim.erro).toMatch(/Ruim/);
  });

  it("usa a MESMA conta do custo: quantidade × custo unitário = materiais do custoDaComposicao", () => {
    const medidas = [{ larguraMm: 1200, alturaMm: 1000, quantidade: 2 }];
    const lista = quantidadesDaComposicao([insumos[0]], medidas, { folhas: 2 });
    const custo = custoDaComposicao([insumos[0]], [], medidas, { folhas: 2 });
    expect(lista.ok && custo.ok && Math.round(lista.linhas[0].quantidade * 2500)).toBe(custo.ok ? custo.materiaisCentavos : -1); // 9,24 × R$ 25,00 = R$ 231,00
  });

  it("agrupa o mesmo produto e unidade entre itens; insumo só texto agrupa por descrição", () => {
    const g = agruparMateriais([
      { produtoId: "perfil-a", descricao: "Perfil A", unidade: "M", quantidade: 9.24 },
      { produtoId: "perfil-a", descricao: "Perfil A", unidade: "M", quantidade: 1.76 },
      { produtoId: null, descricao: "Silicone", unidade: "UN", quantidade: 1 },
      { produtoId: null, descricao: " silicone ", unidade: "UN", quantidade: 2 },
      { produtoId: "perfil-a", descricao: "Perfil A", unidade: "BARRA", quantidade: 1 },
    ]);
    expect(g).toEqual([
      { produtoId: "perfil-a", descricao: "Perfil A", unidade: "M", quantidade: 11 },
      { produtoId: null, descricao: "Silicone", unidade: "UN", quantidade: 3 },
      { produtoId: "perfil-a", descricao: "Perfil A", unidade: "BARRA", quantidade: 1 },
    ]);
  });

  it("equivalências do perfil: 9,24 m em barras de 6 m = 2 barras (para cima) e 4,62 kg a 0,5 kg/m", () => {
    const d = { comprimentoBarraMm: 6000, pesoMilesimosKgPorMetro: 500 };
    expect(equivalenciasDoPerfil(9.24, "M", d)).toEqual({ metros: 9.24, barras: 2, kg: 4.62 });
    expect(equivalenciasDoPerfil(12, "M", d).barras).toBe(2); // 12 m = exatas 2 barras
    expect(equivalenciasDoPerfil(12.001, "M", d).barras).toBe(3);
    expect(equivalenciasDoPerfil(3, "BARRA", d)).toEqual({ metros: 18, barras: 3, kg: 9 });
    expect(equivalenciasDoPerfil(30, "KG", d)).toEqual({ metros: 60, barras: 10, kg: 30 });
  });

  it("dado vazio não é estimado: sem comprimento ou peso as equivalências ficam null", () => {
    expect(equivalenciasDoPerfil(9.24, "M", { comprimentoBarraMm: null, pesoMilesimosKgPorMetro: 500 })).toEqual({ metros: 9.24, barras: null, kg: 4.62 });
    expect(equivalenciasDoPerfil(9.24, "M", { comprimentoBarraMm: 6000, pesoMilesimosKgPorMetro: null })).toEqual({ metros: 9.24, barras: 2, kg: null });
    expect(equivalenciasDoPerfil(5, "UN", { comprimentoBarraMm: 6000, pesoMilesimosKgPorMetro: 500 })).toEqual({ metros: null, barras: null, kg: null });
  });

  it("falta no estoque nunca é negativa", () => {
    expect(faltaNoEstoque(9.24, 4)).toBe(5.24);
    expect(faltaNoEstoque(9.24, 20)).toBe(0);
  });
});

describe("custo real e margem por obra (R15)", () => {
  // Exemplo da decisão do dono (opção B): R$ 10.500 fechados, dos quais R$ 500 são acréscimo de nota; custos de R$ 6.000.
  const base: EntradaDoCustoDaObra = {
    receitaFechadaCentavos: 1_050_000,
    acrescimoNotaCentavos: 50_000,
    comprasDaObra: [{ id: "c1", descricao: "Vidro temperado", origem: "Compra C-0001", valorCentavos: 300_000 }],
    movimentosDeEstoque: [
      { id: "m1", produto: "Perfil A", origem: "Saída de 10 un", quantidadeMilesimos: -10_000, custoUnitarioCentavos: 5_000 }, // R$ 500
      { id: "m2", produto: "Perfil A", origem: "Devolução de 2 un", quantidadeMilesimos: 2_000, custoUnitarioCentavos: 5_000 }, // −R$ 100
    ],
    retalhosUsados: [{ id: "r1", descricao: "Retalho de 1.800 mm", origem: "Retalho da obra P-0001" }],
    outrasDespesas: [{ id: "d1", descricao: "Frete", origem: "Conta a pagar sem compra", valorCentavos: 100_000 }],
    maoDeObra: { areaM2: 10, custoPorM2Centavos: 16_000 }, // R$ 1.600
    estimadoCentavos: 330_000,
  };

  it("opção B: margem = (fechado − acréscimo de nota) − custos = R$ 10.000 − R$ 6.000 = R$ 4.000 (40%)", () => {
    const r = calcularCustoDaObra(base);
    expect(r.custoConhecidoCentavos).toBe(300_000 + 40_000 + 100_000 + 160_000);
    expect(r.receitaDaMargemCentavos).toBe(1_000_000);
    expect(r.repasseDeImpostoCentavos).toBe(50_000);
    expect(r).toMatchObject({ incompleto: false, margemCentavos: 400_000, margemPb: 4000, faltando: [] });
    // O estimado é só material: compara com compras da obra + saídas do estoque (R$ 3.400), não com o custo total.
    expect(r.diferencaParaEstimadoCentavos).toBe(340_000 - 330_000);
  });

  it("saída e devolução da mesma quantidade se anulam, mesmo com meio centavo (arredondamento simétrico)", () => {
    // 1,5 un a R$ 3,33 = R$ 4,995: a saída e a devolução arredondam igual, sem resíduo de R$ 0,01 na obra.
    const r = calcularCustoDaObra({
      ...base,
      comprasDaObra: [],
      outrasDespesas: [],
      maoDeObra: { areaM2: 0, custoPorM2Centavos: 0 },
      movimentosDeEstoque: [
        { id: "a", produto: "P", origem: "Saída", quantidadeMilesimos: -1_500, custoUnitarioCentavos: 333 },
        { id: "b", produto: "P", origem: "Devolução", quantidadeMilesimos: 1_500, custoUnitarioCentavos: 333 },
      ],
    });
    expect(r.custoConhecidoCentavos).toBe(0);
  });

  it("cada linha traz a origem e o retalho usado é só informativo (R$ 0, não soma)", () => {
    const r = calcularCustoDaObra(base);
    expect(r.linhas.map((l) => [l.grupo, l.valorCentavos])).toEqual([
      ["COMPRAS_DA_OBRA", 300_000],
      ["ESTOQUE", 50_000],
      ["ESTOQUE", -10_000],
      ["RETALHOS", 0],
      ["OUTRAS_DESPESAS", 100_000],
      ["MAO_DE_OBRA", 160_000],
    ]);
    expect(r.linhas.every((l) => l.origem.length > 0)).toBe(true);
    expect(r.linhas.find((l) => l.grupo === "RETALHOS")?.informativo).toBe(true);
  });

  it("obra sem nota: o acréscimo é zero e a margem usa o valor fechado inteiro", () => {
    const r = calcularCustoDaObra({ ...base, receitaFechadaCentavos: 1_000_000, acrescimoNotaCentavos: 0 });
    expect(r).toMatchObject({ receitaDaMargemCentavos: 1_000_000, repasseDeImpostoCentavos: 0, margemCentavos: 400_000 });
  });

  it("compra recebida sem preço deixa a margem INCOMPLETA (null), nunca zero, e diz o que falta", () => {
    const r = calcularCustoDaObra({ ...base, comprasDaObra: [{ id: "c1", descricao: "Vidro temperado", origem: "Compra C-0001", valorCentavos: null }] });
    expect(r.incompleto).toBe(true);
    expect(r.margemCentavos).toBeNull();
    expect(r.margemPb).toBeNull();
    expect(r.faltando).toEqual(['preço de "Vidro temperado" (Compra C-0001)']);
    expect(r.margemComOQueSeSabeCentavos).toBe(1_000_000 - 300_000); // só referência, com o custo que se conhece
    expect(r.diferencaParaEstimadoCentavos).toBeNull();
  });

  it("saída de produto sem custo e mão de obra por m² vazia também deixam incompleta", () => {
    const r = calcularCustoDaObra({
      ...base,
      movimentosDeEstoque: [{ id: "m1", produto: "Roldana", origem: "Saída de 4 un", quantidadeMilesimos: -4_000, custoUnitarioCentavos: null }],
      maoDeObra: { areaM2: 10, custoPorM2Centavos: null },
    });
    expect(r.incompleto).toBe(true);
    expect(r.margemCentavos).toBeNull();
    expect(r.faltando).toHaveLength(2);
    expect(r.linhas.find((l) => l.grupo === "MAO_DE_OBRA")?.valorCentavos).toBeNull();
  });

  it("sem proposta aprovada ou sem m², não há margem (incompleta)", () => {
    expect(calcularCustoDaObra({ ...base, receitaFechadaCentavos: null })).toMatchObject({ incompleto: true, margemCentavos: null, receitaDaMargemCentavos: null });
    const semM2 = calcularCustoDaObra({ ...base, maoDeObra: { areaM2: null, custoPorM2Centavos: 16_000 } });
    expect(semM2.incompleto).toBe(true);
    expect(semM2.faltando.join(" ")).toMatch(/m² da obra/);
  });

  it("margem negativa continua sendo número (prejuízo), com a % negativa", () => {
    const r = calcularCustoDaObra({ ...base, receitaFechadaCentavos: 500_000, acrescimoNotaCentavos: 0 });
    expect(r.margemCentavos).toBe(500_000 - 600_000);
    expect(r.margemPb).toBe(-2000);
  });

  it("o mesmo custo não entra duas vezes: a conta a pagar da compra NÃO é linha (o chamador só passa despesas sem compra)", () => {
    // Compra de R$ 3.000 para a obra + a conta a pagar dela (que NÃO vem em outrasDespesas): o custo é R$ 3.000, não R$ 6.000.
    const r = calcularCustoDaObra({ ...base, movimentosDeEstoque: [], retalhosUsados: [], outrasDespesas: [], maoDeObra: { areaM2: 0, custoPorM2Centavos: 0 }, receitaFechadaCentavos: 1_000_000, acrescimoNotaCentavos: 0 });
    expect(r.linhas.filter((l) => l.grupo === "COMPRAS_DA_OBRA")).toHaveLength(1);
  });
});

describe("custo estimado de material da opção (margem estimada interna)", () => {
  it("o total informado à mão (do programa) vale como o custo de material da opção", () => {
    expect(custoEstimadoDeMaterialDaOpcao(1_234_00, [{ custoInformadoCentavos: null, custoCalculadoCentavos: null }])).toEqual({ custoCentavos: 123_400, origem: "TOTAL_INFORMADO", itensSemCusto: 0 });
  });
  it("sem total, soma os itens: o informado no item vence o calculado", () => {
    expect(
      custoEstimadoDeMaterialDaOpcao(null, [
        { custoInformadoCentavos: 50_000, custoCalculadoCentavos: 40_000 },
        { custoInformadoCentavos: null, custoCalculadoCentavos: 30_000 },
      ]),
    ).toEqual({ custoCentavos: 80_000, origem: "ITENS", itensSemCusto: 0 });
  });
  it("item sem nenhum custo deixa a estimativa incompleta (null), nunca soma parcial", () => {
    expect(custoEstimadoDeMaterialDaOpcao(null, [{ custoInformadoCentavos: 50_000, custoCalculadoCentavos: null }, { custoInformadoCentavos: null, custoCalculadoCentavos: null }])).toEqual({ custoCentavos: null, origem: "INCOMPLETO", itensSemCusto: 1 });
    expect(custoEstimadoDeMaterialDaOpcao(null, [])).toMatchObject({ custoCentavos: null, origem: "INCOMPLETO" });
  });
});
