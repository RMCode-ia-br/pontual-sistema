import { describe, expect, it } from "vitest";

import { parseMoedaParaCentavos } from "@/lib/formatadores";
import { apagarMoedaZerada, centavosParaCampo, colarMoeda, mascararMoeda } from "@/lib/formatadores/mascaras";
import { lerNumeroBr } from "@/lib/validadores/numero-br";
import { contaFinanceiraSchema } from "@/modules/financeiro/schemas";

/**
 * Zero informado é um valor válido e é DIFERENTE de campo vazio ("saldo não informado"). Defeito de teste real: a máscara de
 * dinheiro apagava os zeros à esquerda e "0" virava texto vazio, então o zero nem podia ser digitado.
 */

/** Digita tecla a tecla como o componente faz: a cada tecla o texto do campo passa pela máscara (Backspace tira o último caractere). */
function digitar(teclas: string[], inicial = ""): string[] {
  const passos: string[] = [];
  let campo = inicial;
  for (const t of teclas) {
    const bruto = t === "Backspace" ? (apagarMoedaZerada(campo) ?? campo.slice(0, -1)) : campo + t;
    campo = t === "Backspace" && apagarMoedaZerada(campo) !== null ? "" : mascararMoeda(bruto);
    passos.push(campo);
  }
  return passos;
}

describe("leitores de dinheiro: zero é valor; vazio e espaço não são", () => {
  it.each(["0", "0,00", "R$ 0,00", "0.00", "00"])("%s → zero", (texto) => {
    expect(lerNumeroBr(texto, { casas: 2, moeda: true })).toMatchObject({ ok: true, escalado: 0 });
    expect(parseMoedaParaCentavos(texto)).toBe(0);
  });
  it.each(["", " ", "   "])("%j → não é número (nunca zero)", (texto) => {
    expect(lerNumeroBr(texto, { casas: 2, moeda: true }).ok).toBe(false);
    expect(parseMoedaParaCentavos(texto)).toBeNull();
  });
});

describe("máscara de dinheiro: o zero pode ser digitado", () => {
  it("só zeros viram \"0,00\"; vazio continua vazio", () => {
    for (const t of ["0", "0,", "0,0", "0,00", "00", "000", "R$ 0,00", "0,00,0"]) expect(mascararMoeda(t)).toBe("0,00");
    expect(mascararMoeda("")).toBe("");
    expect(mascararMoeda("abc")).toBe("");
    expect(mascararMoeda(" ")).toBe("");
  });

  it("tecla a tecla, de campo vazio: 0 , 0 0 → 0,00 em todos os passos (nunca vazio)", () => {
    expect(digitar(["0", ",", "0", "0"])).toEqual(["0,00", "0,00", "0,00", "0,00"]);
    expect(digitar(["0"])).toEqual(["0,00"]);
  });

  it("o comportamento de maquininha continua: 5 depois 0 → 0,05 → 0,50; e 1 2 3 4 5 6 → 1.234,56", () => {
    expect(digitar(["5", "0"])).toEqual(["0,05", "0,50"]);
    expect(digitar(["1", "2", "3", "4", "5", "6"]).at(-1)).toBe("1.234,56");
    expect(mascararMoeda("00012")).toBe("0,12");
  });

  it("depois do zero, digitar um número continua do zero: 0,00 + 5 → 0,05", () => {
    expect(digitar(["5"], "0,00")).toEqual(["0,05"]);
  });

  it("Backspace: em 0,00 esvazia o campo; em outro valor tira o último dígito (maquininha)", () => {
    expect(apagarMoedaZerada("0,00")).toBe("");
    expect(apagarMoedaZerada("0,05")).toBeNull();
    expect(apagarMoedaZerada("")).toBeNull();
    expect(digitar(["Backspace"], "0,00")).toEqual([""]);
    expect(digitar(["Backspace"], "1,23")).toEqual(["0,12"]);
    expect(digitar(["Backspace", "Backspace"], "0,05")).toEqual(["0,00", ""]);
  });

  it("valor guardado zero aparece como 0,00 (não como campo vazio); nulo continua vazio", () => {
    expect(centavosParaCampo(0)).toBe("0,00");
    expect(centavosParaCampo(null)).toBe("");
    expect(centavosParaCampo(undefined)).toBe("");
    expect(centavosParaCampo(150050)).toBe("1.500,50");
  });

  it("colar 0, 0,00 ou R$ 0,00 dá 0,00; colar texto que não é número não muda o campo", () => {
    for (const t of ["0", "0,00", "R$ 0,00"]) expect(colarMoeda(t)).toBe("0,00");
    expect(colarMoeda("abc")).toBeNull();
  });
});

describe("validação do saldo inicial da conta (com a caixa marcada)", () => {
  const conta = (extra: Record<string, string>) => contaFinanceiraSchema.safeParse({ nome: "Caixa", tipo: "CAIXA", saldoInformado: "on", dataSaldoInicial: "2026-11-01", ...extra });

  it.each(["0", "0,00", "R$ 0,00", "0.00", "-0,00"])("saldo %s é informado como ZERO, com a data", (saldo) => {
    const r = conta({ saldoInicial: saldo });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toMatchObject({ saldoInformado: true, saldoInicialCentavos: 0, dataSaldoInicial: "2026-11-01" });
      expect(Object.is(r.data.saldoInicialCentavos, 0)).toBe(true); // nunca -0
    }
  });

  it.each(["", " ", "   "])("saldo %j com a caixa marcada pede o saldo (vazio NÃO é zero)", (saldo) => {
    const r = conta({ saldoInicial: saldo });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/Informe o saldo/);
  });

  it("caixa desmarcada: 'saldo não informado' (sem valor, sem data), mesmo que o campo tenha 0", () => {
    const r = contaFinanceiraSchema.safeParse({ nome: "Caixa", tipo: "CAIXA", saldoInicial: "0,00", dataSaldoInicial: "2026-11-01" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toMatchObject({ saldoInformado: false, saldoInicialCentavos: 0, dataSaldoInicial: null });
  });

  it("negativo e positivo continuam valendo", () => {
    expect(conta({ saldoInicial: "-1.500,50" })).toMatchObject({ success: true, data: { saldoInicialCentavos: -150050 } });
    expect(conta({ saldoInicial: "10,00" })).toMatchObject({ success: true, data: { saldoInicialCentavos: 1000 } });
  });
});
