import { describe, expect, it } from "vitest";

import { faixaDeVencimento, montarAging, type ItemDeAging } from "../../src/lib/dominio/aging";
import { situacaoDoTitulo } from "../../src/lib/dominio/titulos";

const HOJE = "2026-11-20";
const faixaDe = (vencimento: string) =>
  faixaDeVencimento(situacaoDoTitulo({ status: "ABERTA", vencimento, valorCentavos: 100, valorPagoCentavos: 0 }, HOJE));

describe("faixa de vencimento (derivada da data)", () => {
  it("atrasada: 1 a 30, 31 a 60, 61 a 90 e mais de 90 dias (bordas)", () => {
    expect(faixaDe("2026-11-19")).toBe("ATRASO_1_30"); // 1 dia
    expect(faixaDe("2026-10-21")).toBe("ATRASO_1_30"); // 30 dias
    expect(faixaDe("2026-10-20")).toBe("ATRASO_31_60"); // 31
    expect(faixaDe("2026-09-21")).toBe("ATRASO_31_60"); // 60
    expect(faixaDe("2026-09-20")).toBe("ATRASO_61_90"); // 61
    expect(faixaDe("2026-08-22")).toBe("ATRASO_61_90"); // 90
    expect(faixaDe("2026-08-21")).toBe("ATRASO_MAIS_90"); // 91
  });

  it("a vencer: hoje, até 7, 8 a 30 e mais de 30 dias", () => {
    expect(faixaDe(HOJE)).toBe("HOJE");
    expect(faixaDe("2026-11-21")).toBe("ATE_7");
    expect(faixaDe("2026-11-27")).toBe("ATE_7"); // 7 dias
    expect(faixaDe("2026-11-28")).toBe("DE_8_A_30"); // 8
    expect(faixaDe("2026-12-20")).toBe("DE_8_A_30"); // 30
    expect(faixaDe("2026-12-21")).toBe("MAIS_30"); // 31
  });

  it("pago, cancelado e aguardando etapa ficam fora", () => {
    const base = { vencimento: "2026-01-01", valorCentavos: 100, valorPagoCentavos: 0 };
    expect(faixaDeVencimento(situacaoDoTitulo({ ...base, status: "PAGA", valorPagoCentavos: 100 }, HOJE))).toBeNull();
    expect(faixaDeVencimento(situacaoDoTitulo({ ...base, status: "CANCELADA" }, HOJE))).toBeNull();
    expect(faixaDeVencimento(situacaoDoTitulo({ ...base, status: "AGUARDANDO_GATILHO", vencimento: null }, HOJE))).toBeNull();
  });
});

describe("aging por cliente, fornecedor ou categoria", () => {
  const itens: ItemDeAging[] = [
    { chave: "a", rotulo: "Ana", faixa: "ATRASO_1_30", saldoCentavos: 10000 },
    { chave: "a", rotulo: "Ana", faixa: "DE_8_A_30", saldoCentavos: 5000 },
    { chave: "b", rotulo: "Bruno", faixa: "ATRASO_MAIS_90", saldoCentavos: 30000 },
    { chave: "c", rotulo: "Carla", faixa: "HOJE", saldoCentavos: 2000 },
    { chave: "c", rotulo: "Carla", faixa: "HOJE", saldoCentavos: 0 }, // saldo zero não entra
  ];
  const r = montarAging(itens);

  it("soma por faixa e por pessoa, maiores saldos primeiro", () => {
    expect(r.linhas.map((l) => [l.rotulo, l.totalCentavos])).toEqual([["Bruno", 30000], ["Ana", 15000], ["Carla", 2000]]);
    expect(r.linhas[1].porFaixa).toMatchObject({ ATRASO_1_30: 10000, DE_8_A_30: 5000, HOJE: 0 });
  });

  it("o total geral e o atrasado batem com a soma dos itens", () => {
    expect(r.totalCentavos).toBe(47000);
    expect(r.atrasadoCentavos).toBe(40000);
    expect(Object.values(r.totaisPorFaixa).reduce((s, v) => s + v, 0)).toBe(r.totalCentavos);
    expect(r.linhas.reduce((s, l) => s + l.totalCentavos, 0)).toBe(r.totalCentavos);
    expect(r.linhas.find((l) => l.rotulo === "Ana")!.atrasadoCentavos).toBe(10000);
  });

  it("sem itens: tudo zero", () => {
    expect(montarAging([])).toMatchObject({ linhas: [], totalCentavos: 0, atrasadoCentavos: 0 });
  });
});
