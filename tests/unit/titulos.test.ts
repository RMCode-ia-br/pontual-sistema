import { describe, expect, it } from "vitest";

import {
  aplicarEstorno,
  aplicarPagamento,
  ajustarValor,
  podeCancelar,
  saldoDoTitulo,
  situacaoDoTitulo,
  statusParaValores,
  venceEmBreve,
  type StatusDoTitulo,
} from "../../src/lib/dominio/titulos";

const HOJE = "2026-11-12";
const titulo = (status: StatusDoTitulo, vencimento: string | null, valor = 10_000, pago = 0) => ({ status, vencimento, valorCentavos: valor, valorPagoCentavos: pago });

describe("situação derivada do título (atrasado nunca é gravado)", () => {
  it("vencido ontem: atrasado há 1 dia, com o saldo inteiro", () => {
    expect(situacaoDoTitulo(titulo("ABERTA", "2026-11-11"), HOJE)).toEqual({ situacao: "ATRASADO", parcial: false, saldoCentavos: 10_000, diasEmAtraso: 1, diasParaVencer: null });
  });

  it("vence hoje: ainda não está atrasado", () => {
    const r = situacaoDoTitulo(titulo("ABERTA", HOJE), HOJE);
    expect(r.situacao).toBe("VENCE_HOJE");
    expect(r.diasParaVencer).toBe(0);
    expect(r.diasEmAtraso).toBe(0);
  });

  it("vence amanhã: a vencer, faltando 1 dia", () => {
    const r = situacaoDoTitulo(titulo("ABERTA", "2026-11-13"), HOJE);
    expect(r).toMatchObject({ situacao: "A_VENCER", diasParaVencer: 1 });
  });

  it("atraso atravessa a virada do mês e do ano", () => {
    expect(situacaoDoTitulo(titulo("ABERTA", "2026-11-30"), "2026-12-01")).toMatchObject({ situacao: "ATRASADO", diasEmAtraso: 1 });
    expect(situacaoDoTitulo(titulo("ABERTA", "2026-12-31"), "2027-01-02")).toMatchObject({ situacao: "ATRASADO", diasEmAtraso: 2 });
  });

  it("parcial atrasado: continua atrasado e mostra só o saldo que falta", () => {
    const r = situacaoDoTitulo(titulo("PARCIAL", "2026-11-01", 10_000, 4_000), HOJE);
    expect(r).toMatchObject({ situacao: "ATRASADO", parcial: true, saldoCentavos: 6_000, diasEmAtraso: 11 });
  });

  it("parcial a vencer: parcial sim, atrasado não", () => {
    expect(situacaoDoTitulo(titulo("PARCIAL", "2026-11-20", 10_000, 4_000), HOJE)).toMatchObject({ situacao: "A_VENCER", parcial: true, saldoCentavos: 6_000 });
  });

  it("pago nunca é atrasado, mesmo com vencimento no passado", () => {
    expect(situacaoDoTitulo(titulo("PAGA", "2026-01-01", 10_000, 10_000), HOJE)).toMatchObject({ situacao: "PAGO", saldoCentavos: 0, diasEmAtraso: 0 });
  });

  it("cancelado não deve nada", () => {
    expect(situacaoDoTitulo(titulo("CANCELADA", "2026-01-01"), HOJE)).toMatchObject({ situacao: "CANCELADO", saldoCentavos: 0 });
  });

  it("aguardando a etapa: sem vencimento, não está atrasado nem a vencer", () => {
    expect(situacaoDoTitulo(titulo("AGUARDANDO_GATILHO", null), HOJE)).toMatchObject({ situacao: "AGUARDANDO_ETAPA", diasEmAtraso: 0, diasParaVencer: null });
  });

  it("vence em breve usa a janela configurada (7 dias inclusive; 8 não)", () => {
    expect(venceEmBreve(situacaoDoTitulo(titulo("ABERTA", "2026-11-19"), HOJE), 7)).toBe(true);
    expect(venceEmBreve(situacaoDoTitulo(titulo("ABERTA", "2026-11-20"), HOJE), 7)).toBe(false);
    expect(venceEmBreve(situacaoDoTitulo(titulo("ABERTA", "2026-11-20"), HOJE), 10)).toBe(true);
    expect(venceEmBreve(situacaoDoTitulo(titulo("ABERTA", HOJE), HOJE), 7)).toBe(false); // vence hoje é outra faixa
  });

  it("saldo nunca fica negativo", () => {
    expect(saldoDoTitulo(100, 150)).toBe(0);
  });
});

describe("registrar pagamento", () => {
  it("parcial e depois quitação (R$ 25,00 + R$ 75,00 de R$ 100,00)", () => {
    const um = aplicarPagamento({ status: "ABERTA", valorCentavos: 10_000, valorPagoCentavos: 0 }, 2_500);
    expect(um).toEqual({ ok: true, valorPagoCentavos: 2_500, status: "PARCIAL" });
    const dois = aplicarPagamento({ status: "PARCIAL", valorCentavos: 10_000, valorPagoCentavos: 2_500 }, 7_500);
    expect(dois).toEqual({ ok: true, valorPagoCentavos: 10_000, status: "PAGA" });
  });

  it("recusa valor acima do saldo (sem juros, sem troco) com o saldo na mensagem", () => {
    const r = aplicarPagamento({ status: "PARCIAL", valorCentavos: 10_000, valorPagoCentavos: 2_500 }, 7_501);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("75,00");
  });

  it("recusa zero, negativo e fração de centavo", () => {
    const base = { status: "ABERTA" as const, valorCentavos: 10_000, valorPagoCentavos: 0 };
    expect(aplicarPagamento(base, 0).ok).toBe(false);
    expect(aplicarPagamento(base, -100).ok).toBe(false);
    expect(aplicarPagamento(base, 12.5).ok).toBe(false);
  });

  it("recusa título cancelado, já pago ou aguardando a etapa", () => {
    expect(aplicarPagamento({ status: "CANCELADA", valorCentavos: 100, valorPagoCentavos: 0 }, 100).ok).toBe(false);
    expect(aplicarPagamento({ status: "PAGA", valorCentavos: 100, valorPagoCentavos: 100 }, 1).ok).toBe(false);
    const aguardando = aplicarPagamento({ status: "AGUARDANDO_GATILHO", valorCentavos: 100, valorPagoCentavos: 0 }, 100);
    expect(aguardando.ok).toBe(false);
    if (!aguardando.ok) expect(aguardando.erro).toContain("etapa");
  });
});

describe("estorno", () => {
  it("estornar tudo reabre; estornar parte deixa parcial", () => {
    expect(aplicarEstorno({ status: "PAGA", valorCentavos: 10_000, valorPagoCentavos: 10_000 }, 10_000)).toEqual({ ok: true, valorPagoCentavos: 0, status: "ABERTA" });
    expect(aplicarEstorno({ status: "PAGA", valorCentavos: 10_000, valorPagoCentavos: 10_000 }, 2_500)).toEqual({ ok: true, valorPagoCentavos: 7_500, status: "PARCIAL" });
  });

  it("não estorna mais do que foi pago nem título cancelado", () => {
    expect(aplicarEstorno({ status: "PARCIAL", valorCentavos: 10_000, valorPagoCentavos: 2_500 }, 2_501).ok).toBe(false);
    expect(aplicarEstorno({ status: "CANCELADA", valorCentavos: 10_000, valorPagoCentavos: 0 }, 1).ok).toBe(false);
  });
});

describe("ajustar valor (desconto) e cancelar", () => {
  it("ajustar para o valor já pago quita o título", () => {
    expect(ajustarValor({ status: "PARCIAL", valorCentavos: 10_000, valorPagoCentavos: 4_000 }, 4_000)).toEqual({ ok: true, valorPagoCentavos: 4_000, status: "PAGA" });
  });

  it("não deixa o valor abaixo do que já foi pago", () => {
    const r = ajustarValor({ status: "PARCIAL", valorCentavos: 10_000, valorPagoCentavos: 4_000 }, 3_999);
    expect(r.ok).toBe(false);
  });

  it("aumentar o valor de um título pago o reabre como parcial", () => {
    expect(ajustarValor({ status: "PAGA", valorCentavos: 10_000, valorPagoCentavos: 10_000 }, 12_000)).toEqual({ ok: true, valorPagoCentavos: 10_000, status: "PARCIAL" });
  });

  it("título aguardando a etapa continua aguardando depois do ajuste", () => {
    expect(ajustarValor({ status: "AGUARDANDO_GATILHO", valorCentavos: 10_000, valorPagoCentavos: 0 }, 9_000)).toEqual({ ok: true, valorPagoCentavos: 0, status: "AGUARDANDO_GATILHO" });
  });

  it("só cancela quando não há pagamento", () => {
    expect(podeCancelar({ status: "ABERTA", valorCentavos: 100, valorPagoCentavos: 0 })).toEqual({ ok: true });
    expect(podeCancelar({ status: "PARCIAL", valorCentavos: 100, valorPagoCentavos: 10 }).ok).toBe(false);
    expect(podeCancelar({ status: "CANCELADA", valorCentavos: 100, valorPagoCentavos: 0 }).ok).toBe(false);
  });

  it("status para valores: quitado, parcial, aberto, cancelado preservado", () => {
    expect(statusParaValores(100, 100, "ABERTA")).toBe("PAGA");
    expect(statusParaValores(100, 1, "ABERTA")).toBe("PARCIAL");
    expect(statusParaValores(100, 0, "PARCIAL")).toBe("ABERTA");
    expect(statusParaValores(100, 0, "CANCELADA")).toBe("CANCELADA");
  });
});
