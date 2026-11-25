import { describe, expect, it } from "vitest";
import { ajusteEfetivoPb, calcularAlternativa, parcelasDoCartao, type EntradaAlternativa } from "@/lib/dominio/alternativas-pagamento";
import { calcularTotais } from "@/lib/dominio/preco";
import { gerarParcelas, type ParcelaPlanejada } from "@/lib/dominio/parcelas";

const sem = { comNotaFiscal: false, acrescimoNotaPb: 500 };
const ok = (e: EntradaAlternativa) => {
  const r = calcularAlternativa(e);
  if (!r.ok) throw new Error(r.erro);
  return r;
};

describe("calcularAlternativa: percentual", () => {
  const casos: { nome: string; ref: number; pb: number; base: number }[] = [
    { nome: "zero é válido (sem ajuste)", ref: 1_000_000, pb: 0, base: 1_000_000 },
    { nome: "desconto de 5%", ref: 1_000_000, pb: -500, base: 950_000 },
    { nome: "acréscimo de 2,5%", ref: 1_000_000, pb: 250, base: 1_025_000 },
    { nome: "um centavo, +0,01%", ref: 1, pb: 1, base: 1 },
    { nome: "meio centavo sobe", ref: 50, pb: 100, base: 51 }, // 50,5 → 51
    { nome: "−50% no limite", ref: 10_000, pb: -5000, base: 5_000 },
    { nome: "+50% no limite com meio centavo (333.333 × 1,5 = 499.999,5 sobe)", ref: 333_333, pb: 5000, base: 500_000 },
    { nome: "dízima (+33,33% de 100,00)", ref: 10_000, pb: 3333, base: 13_333 },
    { nome: "valor grande", ref: 1_900_000_000, pb: 100, base: 1_919_000_000 },
  ];
  for (const c of casos) {
    it(c.nome, () => {
      const r = calcularAlternativa({ referenciaCentavos: c.ref, modo: "PERCENTUAL", ajustePb: c.pb, ...sem });
      expect(r).toMatchObject({ ok: true, baseAjustadaCentavos: c.base, totalCentavos: c.base, ajusteCentavos: c.base - c.ref });
    });
  }

  it("recusa ajuste fora de ±50% e não inteiro", () => {
    expect(calcularAlternativa({ referenciaCentavos: 1000, modo: "PERCENTUAL", ajustePb: 5001, ...sem }).ok).toBe(false);
    expect(calcularAlternativa({ referenciaCentavos: 1000, modo: "PERCENTUAL", ajustePb: -5001, ...sem }).ok).toBe(false);
    expect(calcularAlternativa({ referenciaCentavos: 1000, modo: "PERCENTUAL", ajustePb: 1.5, ...sem }).ok).toBe(false);
  });

  it("recusa referência zero e estouro do banco", () => {
    expect(calcularAlternativa({ referenciaCentavos: 0, modo: "PERCENTUAL", ajustePb: 0, ...sem }).ok).toBe(false);
    expect(calcularAlternativa({ referenciaCentavos: 2_147_483_647, modo: "PERCENTUAL", ajustePb: 100, ...sem }).ok).toBe(false);
  });

  it("a referência com ajuste zero e nota é igual ao total da opção de hoje (zero regressão)", () => {
    const [t] = calcularTotais([{ opcaoId: "o", precoTotalCentavos: 1_234_567, medidas: [] }], [{ id: "o", descontoCentavos: 34_567 }], true, 500);
    const r = ok({ referenciaCentavos: t.baseCentavos, modo: "PERCENTUAL", ajustePb: 0, comNotaFiscal: true, acrescimoNotaPb: 500 });
    expect(r.totalCentavos).toBe(t.totalCentavos);
    expect(r.acrescimoNotaCentavos).toBe(t.acrescimoNotaCentavos);
  });
});

describe("calcularAlternativa: nota fiscal por último", () => {
  it("ajuste primeiro, nota depois, sobre a base ajustada", () => {
    const r = ok({ referenciaCentavos: 1_000_000, modo: "PERCENTUAL", ajustePb: -500, comNotaFiscal: true, acrescimoNotaPb: 500 });
    expect(r.baseAjustadaCentavos).toBe(950_000);
    expect(r.acrescimoNotaCentavos).toBe(47_500); // 5% de 9.500,00
    expect(r.totalCentavos).toBe(997_500);
  });
  it("sem nota não há acréscimo", () => {
    expect(ok({ referenciaCentavos: 1_000_000, modo: "PERCENTUAL", ajustePb: 700, ...sem }).acrescimoNotaCentavos).toBe(0);
  });
  it("total digitado vale antes da nota", () => {
    const r = ok({ referenciaCentavos: 1_536_000, modo: "TOTAL_DIGITADO", totalDigitadoCentavos: 1_620_000, comNotaFiscal: true, acrescimoNotaPb: 500 });
    expect(r.baseAjustadaCentavos).toBe(1_620_000);
    expect(r.acrescimoNotaCentavos).toBe(81_000);
    expect(r.totalCentavos).toBe(1_701_000);
  });
});

describe("calcularAlternativa: total digitado", () => {
  it("mostra o percentual derivado", () => {
    const r = ok({ referenciaCentavos: 1_536_000, modo: "TOTAL_DIGITADO", totalDigitadoCentavos: 1_735_000, ...sem });
    expect(r.ajusteCentavos).toBe(199_000);
    expect(r.ajusteEfetivoPb).toBe(1296); // +12,96%
  });
  it("desconto à vista aparece negativo", () => {
    expect(ajusteEfetivoPb(6_450_000, 6_170_000)).toBe(-434);
  });
  it("recusa zero, vazio e mais de 50% de diferença", () => {
    const base = { referenciaCentavos: 100_000, modo: "TOTAL_DIGITADO" as const, ...sem };
    expect(calcularAlternativa({ ...base, totalDigitadoCentavos: 0 }).ok).toBe(false);
    expect(calcularAlternativa({ ...base }).ok).toBe(false);
    expect(calcularAlternativa({ ...base, totalDigitadoCentavos: 150_001 }).ok).toBe(false);
    expect(calcularAlternativa({ ...base, totalDigitadoCentavos: 49_999 }).ok).toBe(false);
    expect(calcularAlternativa({ ...base, totalDigitadoCentavos: 150_000 }).ok).toBe(true);
    expect(calcularAlternativa({ ...base, totalDigitadoCentavos: 50_000 }).ok).toBe(true);
  });
  it("ajusteEfetivoPb com referência inválida devolve zero", () => {
    expect(ajusteEfetivoPb(0, 100)).toBe(0);
  });
});

describe("parcelasDoCartao", () => {
  it("divide igual quando exato", () => {
    expect(parcelasDoCartao(1_620_000, 3)).toEqual([540_000, 540_000, 540_000]);
  });
  it("a última absorve a diferença, sem perder centavo (dízima)", () => {
    const p = parcelasDoCartao(10_000, 3); // 100,00 ÷ 3
    expect(p).toEqual([3333, 3333, 3334]);
    expect(p.reduce((a, b) => a + b, 0)).toBe(10_000);
  });
  it("1 centavo em 12 parcelas", () => {
    const p = parcelasDoCartao(1, 12);
    expect(p.slice(0, 11).every((v) => v === 0)).toBe(true);
    expect(p[11]).toBe(1);
  });
  it("soma sempre fecha (varredura)", () => {
    for (const total of [1, 7, 99, 100, 1_001, 123_457, 2_147_483_647]) {
      for (let n = 1; n <= 12; n++) expect(parcelasDoCartao(total, n).reduce((a, b) => a + b, 0)).toBe(total);
    }
  });
  it("recusa 0 e 13 parcelas", () => {
    expect(() => parcelasDoCartao(1000, 0)).toThrow();
    expect(() => parcelasDoCartao(1000, 13)).toThrow();
  });
});

// Casos reais do Marcelo (PDFs das propostas 1260-26 e 1261-26): a soma dos itens é o valor à vista;
// "VALOR TOTAL" e os cartões são totais próprios digitados por ele.
const AVISTA_50_50: ParcelaPlanejada[] = [
  { descricao: "Sinal na confirmação", percentualPb: 5000, gatilho: "CONFIRMACAO", forma: null },
  { descricao: "Restante na entrega e instalação", percentualPb: 5000, gatilho: "ENTREGA_E_INSTALACAO", forma: null },
];

describe("casos reais: 1260-26 e 1261-26", () => {
  const casos = [
    {
      nome: "1260-26 (R$ 16.200 em 3x; 6x 2.775; 10x 1.735; à vista 15.360)",
      itens: [12 * 98_000, 255_000, 105_000], // 11.760 + 2.550 + 1.050
      cartoes: [
        { n: 3, total: 1_620_000, parcela: 540_000 },
        { n: 6, total: 1_665_000, parcela: 277_500 },
        { n: 10, total: 1_735_000, parcela: 173_500 },
      ],
      avista: 1_536_000,
      sinal: 768_000,
    },
    {
      nome: "1261-26 (R$ 10.620 em 3x; 6x 1.815; 10x 1.135; à vista 10.050)",
      itens: [465_000, 430_000, 110_000],
      cartoes: [
        { n: 3, total: 1_062_000, parcela: 354_000 },
        { n: 6, total: 1_089_000, parcela: 181_500 },
        { n: 10, total: 1_135_000, parcela: 113_500 },
      ],
      avista: 1_005_000,
      sinal: 502_500,
    },
  ];
  for (const c of casos) {
    it(c.nome, () => {
      const itens = c.itens.map((preco) => ({ opcaoId: "o", precoTotalCentavos: preco, medidas: [] }));
      const [t] = calcularTotais(itens, [{ id: "o" }], false, 500);
      expect(t.baseCentavos).toBe(c.avista); // itens somam o valor à vista

      // Forma principal = à vista (referência, ajuste zero), 50% + 50%.
      const principal = ok({ referenciaCentavos: t.baseCentavos, modo: "PERCENTUAL", ajustePb: 0, ...sem });
      expect(principal.totalCentavos).toBe(c.avista);
      const partes = gerarParcelas(principal.totalCentavos, AVISTA_50_50, "2026-11-24");
      expect(partes.map((p) => p.valorCentavos)).toEqual([c.sinal, c.avista - c.sinal]);
      expect(partes.reduce((s, p) => s + p.valorCentavos, 0)).toBe(c.avista);

      // Cartões: total digitado; Nx igual ao PDF, sem diferença de centavo.
      for (const k of c.cartoes) {
        const r = ok({ referenciaCentavos: t.baseCentavos, modo: "TOTAL_DIGITADO", totalDigitadoCentavos: k.total, ...sem });
        expect(r.totalCentavos).toBe(k.total);
        const p = parcelasDoCartao(r.totalCentavos, k.n);
        expect(p).toHaveLength(k.n);
        expect(new Set(p)).toEqual(new Set([k.parcela]));
        expect(p.reduce((s, v) => s + v, 0)).toBe(k.total);
      }
    });
  }
});
