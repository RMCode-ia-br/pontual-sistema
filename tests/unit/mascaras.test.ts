import { describe, expect, it } from "vitest";

import { mascararCep, mascararCnpj, mascararCpf, mascararMoeda, mascararTelefone } from "@/lib/formatadores/mascaras";

describe("máscaras de digitação", () => {
  it("telefone: celular, fixo, parcial e com 55", () => {
    expect(mascararTelefone("22999583288")).toBe("(22) 99958-3288");
    expect(mascararTelefone("2227621234")).toBe("(22) 2762-1234");
    expect(mascararTelefone("229")).toBe("(22) 9");
    expect(mascararTelefone("2")).toBe("(2");
    expect(mascararTelefone("")).toBe("");
    expect(mascararTelefone("+55 22 99958-3288")).toBe("(22) 99958-3288");
    expect(mascararTelefone("2299958328899999")).toBe("(22) 99958-3288");
  });

  it("CPF e CNPJ, inclusive parciais e com letras no meio", () => {
    expect(mascararCpf("52998224725")).toBe("529.982.247-25");
    expect(mascararCpf("5299")).toBe("529.9");
    expect(mascararCpf("abc529x")).toBe("529");
    expect(mascararCnpj("11222333000181")).toBe("11.222.333/0001-81");
    expect(mascararCnpj("112223")).toBe("11.222.3");
    expect(mascararCnpj("1122233300018199")).toBe("11.222.333/0001-81");
  });

  it("CEP", () => {
    expect(mascararCep("27940050")).toBe("27940-050");
    expect(mascararCep("27940")).toBe("27940");
    expect(mascararCep("279400501")).toBe("27940-050");
  });

  it("moeda: centavos à direita, separador de milhar e sem zeros à esquerda", () => {
    expect(mascararMoeda("1")).toBe("0,01");
    expect(mascararMoeda("123")).toBe("1,23");
    expect(mascararMoeda("123456")).toBe("1.234,56");
    expect(mascararMoeda("00012")).toBe("0,12");
    expect(mascararMoeda("")).toBe("");
    expect(mascararMoeda("abc")).toBe("");
  });
});

describe("centavosParaCampo", () => {
  it("mostra centavos como o campo de valor espera e deixa vazio quando não há valor", async () => {
    const { centavosParaCampo } = await import("@/lib/formatadores/mascaras");
    expect(centavosParaCampo(123456)).toBe("1.234,56");
    expect(centavosParaCampo(5)).toBe("0,05");
    expect(centavosParaCampo(0)).toBe("");
    expect(centavosParaCampo(null)).toBe("");
    expect(centavosParaCampo(undefined)).toBe("");
  });
});
