import { describe, expect, it } from "vitest";

import { contaFinanceiraSchema, lancamentoSchema, transferenciaSchema } from "../../src/modules/financeiro/schemas";

const erros = (r: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  r.success ? {} : Object.fromEntries((r.error?.issues ?? []).map((i) => [String(i.path[0]), i.message]));

describe("conta financeira", () => {
  it("sem saldo informado: saldo zero e sem data (nada inventado), mesmo que haja texto nos campos", () => {
    const r = contaFinanceiraSchema.parse({ nome: "Banco", tipo: "BANCO", saldoInicial: "99,00", dataSaldoInicial: "2026-01-01" });
    expect(r).toMatchObject({ saldoInformado: false, saldoInicialCentavos: 0, dataSaldoInicial: null });
  });

  it("saldo informado: valor em centavos (aceita zero e negativo) e data obrigatórias", () => {
    expect(contaFinanceiraSchema.parse({ nome: "Banco", tipo: "BANCO", saldoInformado: "on", saldoInicial: "1.234,56", dataSaldoInicial: "2026-11-01" })).toMatchObject({
      saldoInicialCentavos: 123456,
      dataSaldoInicial: "2026-11-01",
    });
    expect(contaFinanceiraSchema.parse({ nome: "Banco", tipo: "BANCO", saldoInformado: "on", saldoInicial: "0", dataSaldoInicial: "2026-11-01" }).saldoInicialCentavos).toBe(0);
    expect(contaFinanceiraSchema.parse({ nome: "Banco", tipo: "BANCO", saldoInformado: "on", saldoInicial: "-50,00", dataSaldoInicial: "2026-11-01" }).saldoInicialCentavos).toBe(-5000);
  });

  it("saldo informado sem valor ou sem data é recusado com mensagem no campo", () => {
    const base = { nome: "Banco", tipo: "BANCO", saldoInformado: "on" };
    expect(erros(contaFinanceiraSchema.safeParse({ ...base, saldoInicial: "", dataSaldoInicial: "2026-11-01" })).saldoInicial).toMatch(/Informe o saldo/);
    expect(erros(contaFinanceiraSchema.safeParse({ ...base, saldoInicial: "10,00", dataSaldoInicial: "" })).dataSaldoInicial).toMatch(/data/);
    expect(erros(contaFinanceiraSchema.safeParse({ ...base, saldoInicial: "10,00", dataSaldoInicial: "2026-02-30" })).dataSaldoInicial).toBeTruthy();
    expect(erros(contaFinanceiraSchema.safeParse({ ...base, saldoInicial: "abc", dataSaldoInicial: "2026-11-01" })).saldoInicial).toBeTruthy();
  });

  it("nome e tipo obrigatórios", () => {
    expect(erros(contaFinanceiraSchema.safeParse({ nome: "B", tipo: "BANCO" })).nome).toBeTruthy();
    expect(erros(contaFinanceiraSchema.safeParse({ nome: "Banco", tipo: "POUPANCA" })).tipo).toBeTruthy();
  });
});

describe("lançamento", () => {
  const base = { tipo: "ENTRADA", data: "2026-11-10", valor: "100,00", contaFinanceiraId: "c1", categoriaId: "k1", descricao: "Venda de sucata" };

  it("converte o valor para centavos e as opções vazias para null", () => {
    const r = lancamentoSchema.parse(base);
    expect(r).toMatchObject({ valor: 10000, forma: null, fornecedorId: null, observacao: null, comNotaFiscal: false });
    expect(lancamentoSchema.parse({ ...base, comNotaFiscal: "on", forma: "PIX" })).toMatchObject({ comNotaFiscal: true, forma: "PIX" });
  });

  it("recusa valor zero, negativo, absurdo e forma fora da lista", () => {
    expect(erros(lancamentoSchema.safeParse({ ...base, valor: "0,00" })).valor).toMatch(/maior que zero/);
    expect(erros(lancamentoSchema.safeParse({ ...base, valor: "-5,00" })).valor).toBeTruthy();
    expect(erros(lancamentoSchema.safeParse({ ...base, valor: "21.474.836,48" })).valor).toMatch(/máximo/);
    expect(erros(lancamentoSchema.safeParse({ ...base, forma: "CHEQUE" })).forma).toBeTruthy();
  });

  it("exige conta, categoria, descrição e uma data que exista", () => {
    expect(erros(lancamentoSchema.safeParse({ ...base, contaFinanceiraId: "" })).contaFinanceiraId).toBeTruthy();
    expect(erros(lancamentoSchema.safeParse({ ...base, categoriaId: "" })).categoriaId).toBeTruthy();
    expect(erros(lancamentoSchema.safeParse({ ...base, descricao: "a" })).descricao).toBeTruthy();
    expect(erros(lancamentoSchema.safeParse({ ...base, data: "2026-13-01" })).data).toBeTruthy();
    expect(erros(lancamentoSchema.safeParse({ ...base, tipo: "OUTRO" })).tipo).toBeTruthy();
  });
});

describe("transferência", () => {
  it("origem e destino diferentes", () => {
    const base = { contaOrigemId: "a", contaDestinoId: "b", data: "2026-11-10", valor: "10,00" };
    expect(transferenciaSchema.parse(base)).toMatchObject({ valor: 1000, descricao: null });
    expect(erros(transferenciaSchema.safeParse({ ...base, contaDestinoId: "a" })).contaDestinoId).toMatch(/diferentes/);
  });
});
