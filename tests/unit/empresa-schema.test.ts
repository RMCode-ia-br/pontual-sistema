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
  diasAlertaPrazoAmarelo: "3",
  limiteSimplesCentavos: "4.800.000,00",
};

const erros = (entrada: Record<string, string>) => {
  const r = empresaSchema.safeParse(entrada);
  return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message]));
};

describe("configuração da empresa", () => {
  it("converte moeda para centavos inteiros e deixa o opcional vazio como null", () => {
    const r = empresaSchema.parse(base);
    expect(r.metaFaturamentoMensalCentavos).toBe(30000000);
    expect(r.limiteSimplesCentavos).toBe(480000000);
    expect(r.custoMaoDeObraPorM2Centavos).toBeNull();
    expect(r.aliquotaImpostoPercentual).toBeNull();
    expect(r.margemPadraoPercentual).toBeNull();
  });

  it("alíquota e margem vazias NÃO são inventadas (ficam null)", () => {
    const r = empresaSchema.parse({ ...base, aliquotaImpostoPercentual: "", margemPadraoPercentual: "" });
    expect(r.aliquotaImpostoPercentual).toBeNull();
    expect(r.margemPadraoPercentual).toBeNull();
  });

  it("aceita percentual com vírgula e guarda como texto decimal", () => {
    const r = empresaSchema.parse({ ...base, aliquotaImpostoPercentual: "6,5", margemPadraoPercentual: "30" });
    expect(r.aliquotaImpostoPercentual).toBe("6.5");
    expect(r.margemPadraoPercentual).toBe("30");
  });

  it("bloqueia imposto + margem ≥ 100% (divisor do preço)", () => {
    expect(erros({ ...base, aliquotaImpostoPercentual: "40", margemPadraoPercentual: "60" }).margemPadraoPercentual).toMatch(/100%/);
    expect(erros({ ...base, aliquotaImpostoPercentual: "40", margemPadraoPercentual: "59,99" })).toEqual({});
    expect(erros({ ...base, margemPadraoPercentual: "100" }).margemPadraoPercentual).toMatch(/100%/);
  });

  it("rejeita percentual inválido", () => {
    for (const ruim of ["abc", "101", "-5", "6,555"]) {
      expect(erros({ ...base, aliquotaImpostoPercentual: ruim }).aliquotaImpostoPercentual, ruim).toBeTruthy();
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
    expect(erros({ ...base, limiteSimplesCentavos: "21.474.836,47" })).toEqual({});
    expect(erros({ ...base, limiteSimplesCentavos: "21.474.836,48" }).limiteSimplesCentavos).toContain("R$ 21.474.836,47");
    expect(erros({ ...base, limiteSimplesCentavos: "50.000.000,00" }).limiteSimplesCentavos).toBeTruthy();
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
      limiteSimplesCentavos: 480000000,
      capacidadeProducaoM2Mes: 300,
      garantiaRegulagemDias: 90,
      visitaDuracaoMin: 60,
      diasFollowUpProposta: 3,
      diasAlertaPrazoAmarelo: 3,
      tipoDias: "UTEIS",
      aliquotaImpostoPercentual: "6.5",
      telefone: "+5522999583288",
    };
    const form = empresaParaFormulario(doBanco);
    expect(form.metaFaturamentoMensalCentavos).toBe("300.000,00");
    expect(form.aliquotaImpostoPercentual).toBe("6,5");
    expect(form.telefone).toBe("(22) 99958-3288");
    const volta = empresaSchema.parse(form);
    expect(volta.metaFaturamentoMensalCentavos).toBe(30000000);
    expect(volta.limiteSimplesCentavos).toBe(480000000);
    expect(volta.aliquotaImpostoPercentual).toBe("6.5");
    expect(volta.telefone).toBe("+5522999583288");
  });
});
