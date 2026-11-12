import { describe, expect, it } from "vitest";

import { empresaParaFormulario, empresaSchema } from "@/modules/configuracoes/schemas/empresa";

/** Formulário mínimo válido (todos os obrigatórios). */
const base = {
  visitaDuracaoMin: "60",
  metaFaturamentoMensalCentavos: "300.000,00",
  capacidadeProducaoM2Mes: "300",
  garantiaRegulagemDias: "90",
  tipoDias: "UTEIS",
  diasFollowUpProposta: "3",
  diasSemRetornoProposta: "7",
  diasPedidoAvaliacao: "2",
  diasAlertaPrazoAmarelo: "3",
  mesesRecorrenciaAFrente: "3",
  diasAlertaVencimento: "7",
  diasLembreteCobranca: "0",
  markupPadraoPb: "80",
  markupVidroTemperadoPb: "100",
  acrescimoNotaPb: "5",
};

const erros = (entrada: Record<string, string>) => {
  const r = empresaSchema.safeParse(entrada);
  return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message]));
};

describe("configuração da empresa", () => {
  it("converte moeda para centavos inteiros e deixa o opcional vazio como null", () => {
    const r = empresaSchema.parse(base);
    expect(r.metaFaturamentoMensalCentavos).toBe(30000000);
    expect(r.custoMaoDeObraPorM2Centavos).toBeNull();
    expect(r.margemMinimaAlertaPercentual).toBeNull();
  });

  it("não lida mais com alíquota nem limite do Simples (decisão do dono): os campos antigos são ignorados", () => {
    const r = empresaSchema.parse({ ...base, aliquotaImpostoPercentual: "6,5", limiteSimplesCentavos: "4.800.000,00" });
    expect(r).not.toHaveProperty("aliquotaImpostoPercentual");
    expect(r).not.toHaveProperty("limiteSimplesCentavos");
  });

  it("parâmetros do financeiro: números inteiros dentro dos limites e categoria sugerida opcional", () => {
    const r = empresaSchema.parse({ ...base, categoriaReceitaPadraoId: "abc123" });
    expect([r.mesesRecorrenciaAFrente, r.diasAlertaVencimento, r.diasLembreteCobranca]).toEqual([3, 7, 0]);
    expect(r.categoriaReceitaPadraoId).toBe("abc123");
    expect(empresaSchema.parse(base).categoriaReceitaPadraoId).toBeNull();
    expect(erros({ ...base, mesesRecorrenciaAFrente: "0" }).mesesRecorrenciaAFrente).toBeTruthy();
    expect(erros({ ...base, mesesRecorrenciaAFrente: "25" }).mesesRecorrenciaAFrente).toBeTruthy();
    expect(erros({ ...base, diasAlertaVencimento: "91" }).diasAlertaVencimento).toBeTruthy();
    expect(erros({ ...base, diasLembreteCobranca: "-1" }).diasLembreteCobranca).toBeTruthy();
    expect(erros({ ...base, diasAlertaVencimento: "" }).diasAlertaVencimento).toBeTruthy();
  });

  it("margem mínima vazia NÃO é inventada (fica null)", () => {
    const r = empresaSchema.parse({ ...base, margemMinimaAlertaPercentual: "" });
    expect(r.margemMinimaAlertaPercentual).toBeNull();
  });

  it("aceita percentual com vírgula e guarda como texto decimal", () => {
    const r = empresaSchema.parse({ ...base, margemMinimaAlertaPercentual: "6,5" });
    expect(r.margemMinimaAlertaPercentual).toBe("6.5");
  });

  it("markup e acréscimo da nota viram pontos-base inteiros (80% = 8000; 5% = 500)", () => {
    const r = empresaSchema.parse(base);
    expect(r.markupPadraoPb).toBe(8000);
    expect(r.markupVidroTemperadoPb).toBe(10000);
    expect(r.acrescimoNotaPb).toBe(500);
    const outro = empresaSchema.parse({ ...base, markupPadraoPb: "75,5", acrescimoNotaPb: "0" });
    expect(outro.markupPadraoPb).toBe(7550);
    expect(outro.acrescimoNotaPb).toBe(0);
  });

  it("recusa markup/acréscimo vazio, negativo, com 3 casas ou acima do teto", () => {
    for (const campo of ["markupPadraoPb", "markupVidroTemperadoPb", "acrescimoNotaPb"]) {
      expect(erros({ ...base, [campo]: "" })[campo], campo).toBeTruthy();
      expect(erros({ ...base, [campo]: "-1" })[campo], campo).toBeTruthy();
      expect(erros({ ...base, [campo]: "5,555" })[campo], campo).toBeTruthy();
      expect(erros({ ...base, [campo]: "abc" })[campo], campo).toBeTruthy();
    }
    expect(erros({ ...base, markupPadraoPb: "1000,01" }).markupPadraoPb).toBeTruthy();
    expect(erros({ ...base, markupPadraoPb: "1000" })).toEqual({});
    expect(erros({ ...base, acrescimoNotaPb: "100,01" }).acrescimoNotaPb).toBeTruthy();
  });

  it("faixas de porte são opcionais (vazias = null) e o grande precisa superar o médio", () => {
    const r = empresaSchema.parse(base);
    expect(r.porteMedioMinimoCentavos).toBeNull();
    expect(r.porteGrandeMinimoCentavos).toBeNull();
    expect(erros({ ...base, porteMedioMinimoCentavos: "50.000,00", porteGrandeMinimoCentavos: "150.000,00" })).toEqual({});
    expect(erros({ ...base, porteMedioMinimoCentavos: "50.000,00", porteGrandeMinimoCentavos: "50.000,00" }).porteGrandeMinimoCentavos).toMatch(/maior/);
    expect(erros({ ...base, diasSemRetornoProposta: "0" }).diasSemRetornoProposta).toBeTruthy();
    expect(erros({ ...base, diasPedidoAvaliacao: "" }).diasPedidoAvaliacao).toBeTruthy();
  });

  it("rejeita percentual inválido", () => {
    for (const ruim of ["abc", "101", "-5", "6,555"]) {
      expect(erros({ ...base, margemMinimaAlertaPercentual: ruim }).margemMinimaAlertaPercentual, ruim).toBeTruthy();
    }
  });

  it("valida CNPJ e normaliza telefone para E.164", () => {
    const r = empresaSchema.parse({ ...base, cnpj: "37323333000161", telefone: "(22) 99958-3288" });
    expect(r.cnpj).toBe("37.323.333/0001-61");
    expect(r.telefone).toBe("+5522999583288");
    expect(erros({ ...base, cnpj: "11.111.111/1111-11" }).cnpj).toBeTruthy();
    expect(erros({ ...base, telefone: "123" }).telefone).toBeTruthy();
  });

  it("links só http(s): javascript: é rejeitado", () => {
    expect(erros({ ...base, siteUrl: "javascript:alert(1)" }).siteUrl).toBeTruthy();
    expect(erros({ ...base, linkAvaliacaoGoogle: "https://g.page/r/abc/review" })).toEqual({});
  });

  it("exige os campos numéricos obrigatórios e respeita os limites", () => {
    expect(erros({ ...base, capacidadeProducaoM2Mes: "" }).capacidadeProducaoM2Mes).toBeTruthy();
    expect(erros({ ...base, capacidadeProducaoM2Mes: "0" }).capacidadeProducaoM2Mes).toBeTruthy();
    expect(erros({ ...base, garantiaRegulagemDias: "-1" }).garantiaRegulagemDias).toBeTruthy();
    expect(erros({ ...base, metaFaturamentoMensalCentavos: "" }).metaFaturamentoMensalCentavos).toBeTruthy();
    expect(erros({ ...base, tipoDias: "QUALQUER" }).tipoDias).toBeTruthy();
  });

  it("recusa valor em reais que estoura o Int de 32 bits do banco (com mensagem no campo)", () => {
    expect(erros({ ...base, metaFaturamentoMensalCentavos: "21.474.836,47" })).toEqual({});
    expect(erros({ ...base, metaFaturamentoMensalCentavos: "21.474.836,48" }).metaFaturamentoMensalCentavos).toContain("R$ 21.474.836,47");
    expect(erros({ ...base, metaFaturamentoMensalCentavos: "50.000.000,00" }).metaFaturamentoMensalCentavos).toBeTruthy();
    expect(erros({ ...base, custoMaoDeObraPorM2Centavos: "999.999.999,00" }).custoMaoDeObraPorM2Centavos).toBeTruthy();
  });

  it("valida horário e cor", () => {
    expect(erros({ ...base, horarioSemanaInicio: "25:00" }).horarioSemanaInicio).toBeTruthy();
    expect(erros({ ...base, horarioSemanaInicio: "08:00" })).toEqual({});
    expect(erros({ ...base, corPrimaria: "azul" }).corPrimaria).toBeTruthy();
    expect(erros({ ...base, corPrimaria: "#1d4ed8" })).toEqual({});
  });

  it("caixas de seleção: ausente = falso, 'on' = verdadeiro", () => {
    expect(empresaSchema.parse(base).pdfExibirValorPorItem).toBe(false);
    expect(empresaSchema.parse({ ...base, pdfExibirValorPorItem: "on" }).pdfExibirValorPorItem).toBe(true);
  });

  it("ida e volta: banco → formulário → banco preserva os valores", () => {
    const doBanco = {
      metaFaturamentoMensalCentavos: 30000000,
      mesesRecorrenciaAFrente: 3,
      diasAlertaVencimento: 7,
      diasLembreteCobranca: 2,
      categoriaReceitaPadraoId: "cat1",
      capacidadeProducaoM2Mes: 300,
      garantiaRegulagemDias: 90,
      visitaDuracaoMin: 60,
      diasFollowUpProposta: 3,
      diasSemRetornoProposta: 7,
      diasPedidoAvaliacao: 2,
      porteMedioMinimoCentavos: 5000000,
      diasAlertaPrazoAmarelo: 3,
      tipoDias: "UTEIS",
      margemMinimaAlertaPercentual: "6.5",
      markupPadraoPb: 8000,
      markupVidroTemperadoPb: 10000,
      acrescimoNotaPb: 525,
      telefone: "+5522999583288",
    };
    const form = empresaParaFormulario(doBanco);
    expect(form.metaFaturamentoMensalCentavos).toBe("300.000,00");
    expect(form.margemMinimaAlertaPercentual).toBe("6,5");
    expect(form.telefone).toBe("(22) 99958-3288");
    expect(form.markupPadraoPb).toBe("80");
    expect(form.acrescimoNotaPb).toBe("5,25");
    const volta = empresaSchema.parse(form);
    expect(volta.metaFaturamentoMensalCentavos).toBe(30000000);
    expect([volta.mesesRecorrenciaAFrente, volta.diasAlertaVencimento, volta.diasLembreteCobranca, volta.categoriaReceitaPadraoId]).toEqual([3, 7, 2, "cat1"]);
    expect(volta.margemMinimaAlertaPercentual).toBe("6.5");
    expect(volta.porteMedioMinimoCentavos).toBe(5000000);
    expect(volta.porteGrandeMinimoCentavos).toBeNull();
    expect(volta.telefone).toBe("+5522999583288");
    expect([volta.markupPadraoPb, volta.markupVidroTemperadoPb, volta.acrescimoNotaPb]).toEqual([8000, 10000, 525]);
  });
});
