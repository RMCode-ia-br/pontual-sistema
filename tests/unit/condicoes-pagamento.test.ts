import { describe, expect, it } from "vitest";

import { lerParcelasDaCondicao, type EntradaCondicao } from "@/modules/condicoes-pagamento/schemas";

const base = (parcelas: EntradaCondicao["parcelas"], extra: Partial<EntradaCondicao> = {}): EntradaCondicao => ({ nome: "Teste", parcelas, ...extra });
const p = (percentual: string, gatilho: EntradaCondicao["parcelas"][number]["gatilho"] = "CONFIRMACAO", resto: Partial<EntradaCondicao["parcelas"][number]> = {}) => ({
  descricao: "Parcela",
  percentual,
  gatilho,
  ...resto,
});

describe("lerParcelasDaCondicao", () => {
  it("50% + 25% + 25% fecha 100% e vira pontos-base", () => {
    const r = lerParcelasDaCondicao(base([p("50"), p("25", "ENTREGA_MATERIAL"), p("25", "ENTREGA_E_INSTALACAO")]));
    expect("erro" in r).toBe(false);
    if (!("erro" in r)) expect(r.parcelas.map((x) => x.percentualPb)).toEqual([5000, 2500, 2500]);
  });

  it("aceita 33,33 + 33,33 + 33,34", () => {
    expect("erro" in lerParcelasDaCondicao(base([p("33,33"), p("33,33"), p("33,34")]))).toBe(false);
  });

  it("recusa soma diferente de 100%", () => {
    const r = lerParcelasDaCondicao(base([p("50"), p("40")]));
    expect("erro" in r && r.erro).toMatch(/somam 90%/);
  });

  it("recusa percentual inválido, zero e acima de 100", () => {
    for (const ruim of ["", "0", "abc", "100,01", "-5", "10,555"]) {
      expect("erro" in lerParcelasDaCondicao(base([p(ruim)])), ruim).toBe(true);
    }
  });

  it("dias após a aprovação exige o número de dias", () => {
    expect("erro" in lerParcelasDaCondicao(base([p("100", "DIAS_APOS_APROVACAO")]))).toBe(true);
    expect("erro" in lerParcelasDaCondicao(base([p("100", "DIAS_APOS_APROVACAO", { diasApos: "30" })]))).toBe(false);
  });

  it("cartão: até 12 parcelas e só na forma cartão", () => {
    expect("erro" in lerParcelasDaCondicao(base([p("100", "CONFIRMACAO", { forma: "CARTAO_CREDITO", parcelasCartao: "12" })]))).toBe(false);
    expect("erro" in lerParcelasDaCondicao(base([p("100", "CONFIRMACAO", { forma: "CARTAO_CREDITO", parcelasCartao: "13" })]))).toBe(true);
    expect("erro" in lerParcelasDaCondicao(base([p("100", "CONFIRMACAO", { forma: "PIX", parcelasCartao: "3" })]))).toBe(true);
  });

  it("texto livre não tem parcelas; com parcelas e texto livre juntos é recusado", () => {
    expect(lerParcelasDaCondicao(base([], { textoLivre: "A combinar" }))).toEqual({ parcelas: [] });
    expect("erro" in lerParcelasDaCondicao(base([p("100")], { textoLivre: "A combinar" }))).toBe(true);
  });

  it("sem parcelas e sem texto livre é recusado", () => {
    expect("erro" in lerParcelasDaCondicao(base([]))).toBe(true);
  });
});
