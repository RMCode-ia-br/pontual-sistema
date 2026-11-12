import { describe, expect, it } from "vitest";

import { dataBrasileira, montarCobranca } from "../../src/lib/dominio/cobranca";

const MODELO =
  "Olá, {{cliente}}! Aqui é da {{nomeFantasia}}. Identificamos a parcela de {{valorParcela}} com vencimento em {{vencimento}} referente à obra {{obra}}. Pode nos confirmar a previsão de pagamento?";

const base = { clienteNome: "Maria da Silva", nomeFantasia: "Pontual", saldoCentavos: 123_456, vencimento: "2026-11-30", obra: "Casa Buzios", telefone: "(22) 99958-3288" };

describe("cobrança por WhatsApp", () => {
  it("preenche o modelo com o saldo devedor, a data brasileira e o primeiro nome", () => {
    const r = montarCobranca(MODELO, base);
    expect(r.faltando).toEqual([]);
    expect(r.texto).toContain("Olá, Maria!");
    expect(r.texto).toContain("30/11/2026");
    expect(r.texto).toMatch(/R\$\s?1\.234,56/);
    expect(r.texto).toContain("obra Casa Buzios");
    expect(r.link).toMatch(/^https:\/\/wa\.me\/5522999583288\?text=/);
  });

  it("cobra o SALDO: com pagamento parcial o valor da mensagem é o que falta", () => {
    expect(montarCobranca(MODELO, { ...base, saldoCentavos: 25_000 }).texto).toMatch(/R\$\s?250,00/);
  });

  it("sem telefone não gera link e avisa o que falta", () => {
    const r = montarCobranca(MODELO, { ...base, telefone: null });
    expect(r.link).toBeNull();
    expect(r.faltando).toContain("telefone do cliente");
  });

  it("variável sem valor não é apagada em silêncio (sem vencimento ou sem obra)", () => {
    const r = montarCobranca(MODELO, { ...base, vencimento: null, obra: null });
    expect(r.faltando).toEqual(expect.arrayContaining(["vencimento", "obra"]));
    expect(r.texto).toContain("{{vencimento}}");
    expect(r.link).toBeNull();
  });

  it("saldo zero não vira 'R$ 0,00' na mensagem: avisa", () => {
    expect(montarCobranca(MODELO, { ...base, saldoCentavos: 0 }).faltando).toContain("valorParcela");
  });

  it("formata a data", () => {
    expect(dataBrasileira("2026-01-05")).toBe("05/01/2026");
  });
});
