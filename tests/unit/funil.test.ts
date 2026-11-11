import { describe, expect, it } from "vitest";

import { chaveContadorProjeto, anoEmSaoPaulo, formatarCodigoProjeto, lerCodigoProjeto } from "@/lib/dominio/codigo-projeto";
import { avaliarMovimento, COLUNAS_DO_FUNIL, diasParado, ehFaseAberta, estaSemRetorno, faseAposAgendarVisita, faseSugeridaAposVisitaRealizada } from "@/lib/dominio/funil";
import { chaveFollowUp, somarDiasCorridos, vencimentoAcompanharProposta, vencimentoAvisoFimGarantia, vencimentoPedidoAvaliacao } from "@/lib/dominio/followup";
import { faixasValidas, sugerirPorte } from "@/lib/dominio/porte";

describe("movimentos do funil", () => {
  it("entre as fases abertas é livre, nos dois sentidos", () => {
    expect(avaliarMovimento("NOVO_LEAD", "NEGOCIACAO")).toEqual({ ok: true, exigeMotivo: false, reabre: false });
    expect(avaliarMovimento("NEGOCIACAO", "NOVO_LEAD")).toEqual({ ok: true, exigeMotivo: false, reabre: false });
    expect(avaliarMovimento("VISITA_AGENDADA", "PROPOSTA_ENVIADA")).toMatchObject({ ok: true });
  });

  it("perder exige motivo", () => {
    expect(avaliarMovimento("PROPOSTA_ENVIADA", "PERDIDO")).toEqual({ ok: true, exigeMotivo: true, reabre: false });
  });

  it("reabrir um perdido volta para uma fase aberta e sinaliza a reabertura", () => {
    expect(avaliarMovimento("PERDIDO", "ELABORANDO_PROPOSTA")).toEqual({ ok: true, exigeMotivo: false, reabre: true });
  });

  it("APROVADO e o que vem depois nunca são concedidos pelo funil", () => {
    for (const para of ["APROVADO", "EM_EXECUCAO", "CONCLUIDO"] as const) {
      const r = avaliarMovimento("NEGOCIACAO", para);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.motivo).toMatch(/Aprovado/);
    }
    expect(avaliarMovimento("PERDIDO", "APROVADO").ok).toBe(false);
  });

  it("projetos que já saíram do funil não voltam por arrasto", () => {
    for (const de of ["APROVADO", "EM_EXECUCAO", "CONCLUIDO", "CANCELADO"] as const) {
      expect(avaliarMovimento(de, "NOVO_LEAD").ok).toBe(false);
      expect(avaliarMovimento(de, "PERDIDO").ok).toBe(false);
    }
  });

  it("mover para a mesma fase ou para CANCELADO é recusado", () => {
    expect(avaliarMovimento("NOVO_LEAD", "NOVO_LEAD").ok).toBe(false);
    expect(avaliarMovimento("PERDIDO", "PERDIDO").ok).toBe(false);
    expect(avaliarMovimento("NOVO_LEAD", "CANCELADO").ok).toBe(false);
  });

  it("o Kanban tem as 5 fases abertas, Aprovado e Perdidos, nessa ordem", () => {
    expect([...COLUNAS_DO_FUNIL]).toEqual(["NOVO_LEAD", "VISITA_AGENDADA", "ELABORANDO_PROPOSTA", "PROPOSTA_ENVIADA", "NEGOCIACAO", "APROVADO", "PERDIDO"]);
    expect(ehFaseAberta("NEGOCIACAO")).toBe(true);
    expect(ehFaseAberta("APROVADO")).toBe(false);
    expect(ehFaseAberta("PERDIDO")).toBe(false);
  });

  it("agendar visita só muda o projeto em 'Novo contato'; visita realizada apenas sugere", () => {
    expect(faseAposAgendarVisita("NOVO_LEAD")).toBe("VISITA_AGENDADA");
    expect(faseAposAgendarVisita("NEGOCIACAO")).toBeNull();
    expect(faseAposAgendarVisita("PERDIDO")).toBeNull();
    expect(faseSugeridaAposVisitaRealizada("VISITA_AGENDADA")).toBe("ELABORANDO_PROPOSTA");
    expect(faseSugeridaAposVisitaRealizada("NOVO_LEAD")).toBe("ELABORANDO_PROPOSTA");
    expect(faseSugeridaAposVisitaRealizada("PROPOSTA_ENVIADA")).toBeNull();
  });
});

describe("dias parado e 'sem retorno'", () => {
  it("conta dias de calendário no fuso de São Paulo", () => {
    // 10/11 23:00 em São Paulo (= 11/11 02:00Z) até 13/11 07:00 em São Paulo.
    expect(diasParado(new Date("2026-11-11T02:00:00Z"), new Date("2026-11-13T10:00:00Z"))).toBe(3);
    // 12/11 23:30 → 13/11 00:30 (locais): virou o dia, conta 1 mesmo com 1 hora de diferença.
    expect(diasParado(new Date("2026-11-13T02:30:00Z"), new Date("2026-11-13T03:30:00Z"))).toBe(1);
    expect(diasParado(new Date("2026-11-13T15:00:00Z"), new Date("2026-11-13T20:00:00Z"))).toBe(0);
  });

  it("nunca devolve negativo (relógio adiantado)", () => {
    expect(diasParado(new Date("2026-11-20T12:00:00Z"), new Date("2026-11-13T12:00:00Z"))).toBe(0);
  });

  it("'sem retorno': só proposta enviada/negociação, parada há MAIS de N dias", () => {
    const agora = new Date("2026-11-20T15:00:00Z");
    expect(estaSemRetorno("PROPOSTA_ENVIADA", new Date("2026-11-12T15:00:00Z"), 7, agora)).toBe(true); // 8 dias
    expect(estaSemRetorno("PROPOSTA_ENVIADA", new Date("2026-11-13T15:00:00Z"), 7, agora)).toBe(false); // 7 dias
    expect(estaSemRetorno("NEGOCIACAO", new Date("2026-10-01T15:00:00Z"), 7, agora)).toBe(true);
    expect(estaSemRetorno("NOVO_LEAD", new Date("2026-01-01T15:00:00Z"), 7, agora)).toBe(false);
    expect(estaSemRetorno("PERDIDO", new Date("2026-01-01T15:00:00Z"), 7, agora)).toBe(false);
  });
});

describe("follow-ups (R11)", () => {
  it("'Acompanhar proposta' vence D+N a partir do DIA LOCAL do envio", () => {
    // 13/11 01:00Z = 12/11 22:00 em São Paulo → o envio foi no dia 12.
    expect(vencimentoAcompanharProposta(new Date("2026-11-13T01:00:00Z"), 3).toISOString()).toBe("2026-11-15T00:00:00.000Z");
  });

  it("pedido de avaliação e aviso de fim de garantia", () => {
    expect(vencimentoPedidoAvaliacao(new Date("2026-11-13T15:00:00Z"), 2).toISOString()).toBe("2026-11-15T00:00:00.000Z");
    // Conclusão 13/11/2026 + 90 dias de garantia − 7 de antecedência = 83 dias depois.
    expect(vencimentoAvisoFimGarantia(new Date("2026-11-13T15:00:00Z"), 90).toISOString()).toBe("2027-02-04T00:00:00.000Z");
  });

  it("soma dias corridos atravessando ano bissexto e recusa fração", () => {
    expect(somarDiasCorridos(new Date("2028-02-28T00:00:00Z"), 1).toISOString()).toBe("2028-02-29T00:00:00.000Z");
    expect(() => somarDiasCorridos(new Date("2026-01-01T00:00:00Z"), 1.5)).toThrow();
  });

  it("a chave de idempotência distingue projeto, tipo e fato de origem", () => {
    expect(chaveFollowUp("acompanhar-proposta", "p1", "m1")).toBe("followup:acompanhar-proposta:p1:m1");
    expect(chaveFollowUp("acompanhar-proposta", "p1", "m2")).not.toBe(chaveFollowUp("acompanhar-proposta", "p1", "m1"));
    expect(chaveFollowUp("pedir-avaliacao", "p1", "m1")).not.toBe(chaveFollowUp("acompanhar-proposta", "p1", "m1"));
  });
});

describe("porte sugerido (R10)", () => {
  // Faixas de TESTE; nenhum valor real da Pontual vive no código.
  const faixas = { medioMinimoCentavos: 5_000_000, grandeMinimoCentavos: 15_000_000 };

  it("respeita os limites das faixas", () => {
    expect(sugerirPorte(4_999_999, faixas)).toBe("PEQUENO");
    expect(sugerirPorte(5_000_000, faixas)).toBe("MEDIO");
    expect(sugerirPorte(14_999_999, faixas)).toBe("MEDIO");
    expect(sugerirPorte(15_000_000, faixas)).toBe("GRANDE");
  });

  it("sem faixas, sem valor ou com faixas incoerentes não sugere nada", () => {
    expect(sugerirPorte(9_000_000, { medioMinimoCentavos: null, grandeMinimoCentavos: null })).toBeNull();
    expect(sugerirPorte(null, faixas)).toBeNull();
    expect(sugerirPorte(-1, faixas)).toBeNull();
    expect(sugerirPorte(9_000_000, { medioMinimoCentavos: 10, grandeMinimoCentavos: 10 })).toBeNull();
    expect(faixasValidas({ medioMinimoCentavos: 10, grandeMinimoCentavos: 5 })).toBe(false);
    expect(faixasValidas({ medioMinimoCentavos: null, grandeMinimoCentavos: 5 })).toBe(true);
  });

  it("com uma faixa só, sugere apenas o que tem certeza", () => {
    expect(sugerirPorte(100, { medioMinimoCentavos: 500, grandeMinimoCentavos: null })).toBe("PEQUENO");
    expect(sugerirPorte(500, { medioMinimoCentavos: 500, grandeMinimoCentavos: null })).toBe("MEDIO");
    expect(sugerirPorte(100, { medioMinimoCentavos: null, grandeMinimoCentavos: 500 })).toBeNull();
    expect(sugerirPorte(500, { medioMinimoCentavos: null, grandeMinimoCentavos: 500 })).toBe("GRANDE");
  });
});

describe("código do projeto", () => {
  it("formata com 4 dígitos e cresce depois de 9999", () => {
    expect(formatarCodigoProjeto(2026, 7)).toBe("P-2026-0007");
    expect(formatarCodigoProjeto(2026, 9999)).toBe("P-2026-9999");
    expect(formatarCodigoProjeto(2026, 12345)).toBe("P-2026-12345");
  });

  it("recusa ano e sequência inválidos", () => {
    expect(() => formatarCodigoProjeto(26, 1)).toThrow();
    expect(() => formatarCodigoProjeto(2026, 0)).toThrow();
    expect(() => formatarCodigoProjeto(2026, 1.5)).toThrow();
  });

  it("lê o código de volta (ignorando maiúsculas) e rejeita formatos errados", () => {
    expect(lerCodigoProjeto("p-2026-0007")).toEqual({ ano: 2026, sequencia: 7 });
    expect(lerCodigoProjeto("P-2026-007")).toBeNull();
    expect(lerCodigoProjeto("P-2026-0000")).toBeNull();
    expect(lerCodigoProjeto("X-2026-0007")).toBeNull();
  });

  it("o ano vira à meia-noite de São Paulo, não à UTC", () => {
    expect(anoEmSaoPaulo(new Date("2027-01-01T01:00:00Z"))).toBe(2026); // 31/12 22:00 local
    expect(anoEmSaoPaulo(new Date("2027-01-01T03:00:00Z"))).toBe(2027);
    expect(chaveContadorProjeto(2026)).toBe("projeto:2026");
  });
});
