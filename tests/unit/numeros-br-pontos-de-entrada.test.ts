import { describe, expect, it } from "vitest";

import { celulaParaTexto } from "@/lib/csv/arquivo";
import { valorParaCentavos } from "@/lib/dominio/numeros";
import { lerQuantidade } from "@/lib/dominio/estoque";
import { compraSchema, lerCompra } from "@/modules/compras/schemas";

/**
 * Pontos de ENTRADA de número que não passam direto pelos leitores (Fase 7, Bloco 0c): célula numérica de XLSX e as
 * medidas em mm da compra. O resultado nunca pode ser um valor errado em silêncio.
 */

describe("célula numérica do XLSX", () => {
  it("número fracionário sai com vírgula, como o Excel brasileiro o mostra", () => {
    expect(celulaParaTexto(0.125)).toBe("0,125");
    expect(celulaParaTexto(12.345)).toBe("12,345");
    expect(celulaParaTexto(12.5)).toBe("12,5");
    expect(celulaParaTexto(1234)).toBe("1234");
    expect(celulaParaTexto(0.1 + 0.2)).toBe("0,3"); // sem o ruído de ponto flutuante
    expect(celulaParaTexto(null)).toBe("");
    expect(celulaParaTexto(Number.NaN)).toBe("");
  });

  it("custo com 3 casas é RECUSADO em vez de virar R$ 125,00 (o bug do ponto lido como milhar)", () => {
    expect(valorParaCentavos(celulaParaTexto(0.125))).toBeNull();
    expect(valorParaCentavos(celulaParaTexto(12.345))).toBeNull();
    expect(valorParaCentavos(celulaParaTexto(12.5))).toBe(1250);
    expect(valorParaCentavos(celulaParaTexto(1234.56))).toBe(123456);
  });

  it("quantidade e peso com 3 casas continuam exatos", () => {
    expect(lerQuantidade(celulaParaTexto(0.125))).toBe(125);
    expect(lerQuantidade(celulaParaTexto(1.25))).toBe(1250);
  });
});

describe("medidas em mm da compra", () => {
  const item = (extra: Record<string, string>) => ({
    unidadeCompra: "UN",
    quantidade: "1",
    preco: "10,00",
    descricao: "Vidro",
    ...extra,
  });
  const compra = (extra: Record<string, string>) =>
    compraSchema.parse({ fornecedorId: "f1", tipo: "VIDRO", destino: "ESTOQUE", itens: [item(extra)] });

  it("lê inteiros, com ou sem ponto de milhar, e vazio é 'sem medida'", () => {
    const r = lerCompra(compra({ larguraMm: "1.200", alturaMm: "2100", espessuraMm: "" }));
    expect(r.ok && r.entrada.itens[0]).toMatchObject({ larguraMm: 1200, alturaMm: 2100, espessuraMm: null });
  });

  it("medida que não se lê vira ERRO por campo, nunca 'sem medida' em silêncio", () => {
    const r = lerCompra(compra({ larguraMm: "1,5", alturaMm: "abc", espessuraMm: "0" }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(Object.keys(r.campos).sort()).toEqual(["item:0:alturaMm", "item:0:espessuraMm", "item:0:larguraMm"]);
      expect(r.campos["item:0:larguraMm"]).toMatch(/inteiros/);
    }
  });
});
