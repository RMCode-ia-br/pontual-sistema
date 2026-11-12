import { describe, expect, it } from "vitest";

import { PRECO_KG_MAXIMO_CENTAVOS, lerPercentualEmPb, barrasDoPeso, barrasInteirasSugeridas, custoDoPerfil, custoUnitarioDoPerfil, pesoDasBarras, precoKgDoPerfil, reajustarPrecoKg, valorDaEntrega } from "../../src/lib/dominio/perfil-kg";

// Valores só de TESTE (o sistema nunca traz preço do kg nem peso por metro de fábrica).
const PERFIL = { custoKgCentavos: 5000, pesoMilesimosKgPorMetro: 500, comprimentoBarraMm: 6000 }; // R$ 50,00/kg, 0,5 kg/m, barra de 6 m

describe("custo do perfil por kg", () => {
  it("deriva custo por metro e por barra: R$ 50/kg × 0,5 kg/m = R$ 25/m; barra de 6 m = R$ 150", () => {
    expect(custoDoPerfil(PERFIL)).toEqual({ porKgCentavos: 5000, porMetroCentavos: 2500, porBarraCentavos: 15000, faltando: [] });
  });

  it("arredonda UMA vez (não acumula o erro do metro na barra): 0,627 kg/m a R$ 50/kg", () => {
    const c = custoDoPerfil({ ...PERFIL, pesoMilesimosKgPorMetro: 627 });
    expect(c.porMetroCentavos).toBe(3135); // 5000 × 0,627
    expect(c.porBarraCentavos).toBe(18810); // 5000 × 0,627 × 6 (e não 3135 × 6 arredondado de outro jeito)
  });

  it("dado vazio nunca vira zero: devolve null e diz o que falta", () => {
    expect(custoDoPerfil({ ...PERFIL, custoKgCentavos: null })).toEqual({ porKgCentavos: null, porMetroCentavos: null, porBarraCentavos: null, faltando: ["preço do kg"] });
    const semPeso = custoDoPerfil({ ...PERFIL, pesoMilesimosKgPorMetro: null });
    expect(semPeso).toMatchObject({ porKgCentavos: 5000, porMetroCentavos: null, porBarraCentavos: null, faltando: ["peso por metro"] });
    const semBarra = custoDoPerfil({ ...PERFIL, comprimentoBarraMm: null });
    expect(semBarra).toMatchObject({ porMetroCentavos: 2500, porBarraCentavos: null, faltando: ["comprimento da barra"] });
    expect(custoDoPerfil({ custoKgCentavos: null, pesoMilesimosKgPorMetro: null, comprimentoBarraMm: null }).faltando).toHaveLength(3);
  });

  it("o custo unitário segue a unidade do produto (barra, metro, kg); outras unidades não têm custo por kg", () => {
    expect(custoUnitarioDoPerfil("BARRA", PERFIL)).toBe(15000);
    expect(custoUnitarioDoPerfil("M", PERFIL)).toBe(2500);
    expect(custoUnitarioDoPerfil("KG", PERFIL)).toBe(5000);
    expect(custoUnitarioDoPerfil("UN", PERFIL)).toBeNull();
    expect(custoUnitarioDoPerfil("BARRA", { ...PERFIL, pesoMilesimosKgPorMetro: null })).toBeNull();
  });
});

describe("preço do kg por acabamento e linha", () => {
  const tabela = [
    { acabamentoId: "natural", linhaId: null, custoKgCentavos: 4800 },
    { acabamentoId: "natural", linhaId: "suprema", custoKgCentavos: 5200 },
    { acabamentoId: "preto", linhaId: null, custoKgCentavos: null },
  ];
  it("a linha específica vence a genérica; sem linha específica vale a genérica", () => {
    expect(precoKgDoPerfil("natural", "suprema", tabela)).toBe(5200);
    expect(precoKgDoPerfil("natural", "gold", tabela)).toBe(4800);
    expect(precoKgDoPerfil("natural", null, tabela)).toBe(4800);
  });
  it("acabamento sem preço, sem linha na tabela ou sem acabamento: null (sem preço do kg)", () => {
    expect(precoKgDoPerfil("preto", "suprema", tabela)).toBeNull();
    expect(precoKgDoPerfil("branco", null, tabela)).toBeNull();
    expect(precoKgDoPerfil(null, "suprema", tabela)).toBeNull();
  });
});

describe("conversão entre kg e barras pelo peso nominal", () => {
  it("30 kg ÷ (0,5 kg/m × 6 m) = 10 barras; e 10 barras pesam 30 kg", () => {
    expect(barrasDoPeso(30_000, PERFIL)).toBe(10_000);
    expect(pesoDasBarras(10_000, PERFIL)).toBe(30_000);
  });
  it("sugere barras inteiras: 31,2 kg → 10,4 barras → sugere 10 (o gestor confirma)", () => {
    expect(barrasDoPeso(31_200, PERFIL)).toBe(10_400);
    expect(barrasInteirasSugeridas(31_200, PERFIL)).toBe(10);
    expect(barrasInteirasSugeridas(33_000, PERFIL)).toBe(11);
  });
  it("sem peso por metro ou comprimento, não converte (nada de estimar)", () => {
    expect(barrasDoPeso(30_000, { pesoMilesimosKgPorMetro: null, comprimentoBarraMm: 6000 })).toBeNull();
    expect(pesoDasBarras(10_000, { pesoMilesimosKgPorMetro: 500, comprimentoBarraMm: null })).toBeNull();
    expect(barrasInteirasSugeridas(30_000, { pesoMilesimosKgPorMetro: 0, comprimentoBarraMm: 6000 })).toBeNull();
  });
});

describe("valor da entrega", () => {
  it("30 kg a R$ 50,00 = R$ 1.500,00; 10 barras a R$ 150,00 = R$ 1.500,00", () => {
    expect(valorDaEntrega(30_000, 5000)).toBe(150_000);
    expect(valorDaEntrega(10_000, 15_000)).toBe(150_000);
  });
  it("sem preço, o valor é null (sem custo), nunca zero", () => {
    expect(valorDaEntrega(30_000, null)).toBeNull();
  });
  it("quantidade fracionada arredonda em centavos", () => {
    expect(valorDaEntrega(333, 1000)).toBe(333); // 0,333 × R$ 10,00 = R$ 3,33
    expect(valorDaEntrega(1_500, 333)).toBe(500); // 1,5 × R$ 3,33 = R$ 4,995 → R$ 5,00
  });
});

describe("reajuste do preço do kg", () => {
  it("+5% de R$ 50,00 = R$ 52,50; −10% = R$ 45,00; arredonda em centavos", () => {
    expect(reajustarPrecoKg(5000, 500)).toBe(5250);
    expect(reajustarPrecoKg(5000, -1000)).toBe(4500);
    expect(reajustarPrecoKg(4999, 333)).toBe(5165); // 4999 × 1,0333 = 5165,45
    expect(reajustarPrecoKg(5000, 0)).toBe(5000);
  });
  it("preço vazio não é reajustado; resultado zero, negativo ou acima do teto é recusado", () => {
    expect(reajustarPrecoKg(null, 500)).toBeNull();
    expect(reajustarPrecoKg(5000, -10_000)).toBeNull(); // −100% daria zero
    expect(reajustarPrecoKg(5000, -20_000)).toBeNull();
    expect(reajustarPrecoKg(PRECO_KG_MAXIMO_CENTAVOS, 100)).toBeNull();
    expect(reajustarPrecoKg(5000, 1.5)).toBeNull();
  });
});

describe("percentual digitado do reajuste", () => {
  it("lê 5, +5, 5%, -3,5 e 1.5 em pontos-base", () => {
    expect(lerPercentualEmPb("5")).toBe(500);
    expect(lerPercentualEmPb("+5")).toBe(500);
    expect(lerPercentualEmPb("5%")).toBe(500);
    expect(lerPercentualEmPb("-3,5")).toBe(-350);
    expect(lerPercentualEmPb(" 12,25 % ")).toBe(1225);
  });
  it("recusa vazio, zero, texto e percentual absurdo", () => {
    for (const ruim of ["", "0", "abc", "5,555", "1001", "-1001", "--5"]) expect(lerPercentualEmPb(ruim)).toBeNull();
  });
});
