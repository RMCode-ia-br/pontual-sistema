import { describe, expect, it } from "vitest";

import { linhasDePagamento, linhasDePrazo, notasNumeradas, textoDasMedidas, textoDoRodape } from "@/lib/dominio/texto-proposta";

const p = (percentualPb: number, gatilho: string, descricao: string, resto: Record<string, unknown> = {}) => ({ descricao, percentualPb, gatilho, forma: null, diasApos: null, dataFixa: null, parcelasCartao: null, ...resto });

describe("linhasDePagamento", () => {
  const cronograma = [p(5000, "CONFIRMACAO", "Sinal na confirmação do pedido", { forma: "PIX" }), p(2500, "ENTREGA_MATERIAL", "Entrega do material"), p(2500, "ENTREGA_E_INSTALACAO", "Entrega dos vidros e instalação")];
  it("50/25/25 de R$ 89.725,00: valores batem e somam o total (última absorve)", () => {
    const l = linhasDePagamento(8972500, cronograma, null).map((x) => x.replace(/ /g, " "));
    expect(l).toHaveLength(3);
    expect(l[0]).toContain("50% (R$");
    expect(l[0]).toMatch(/44\.862,50/);
    expect(l[0]).toContain("PIX");
    // A descrição já diz o gatilho: nada de repetir "na entrega do material".
    expect(l[1]).toBe("25% (R$ 22.431,25) — Entrega do material");
    expect(l[1]).toMatch(/22\.431,25/);
    expect(l[2]).toMatch(/22\.431,25/);
  });
  it("texto livre quando não há parcelas", () => {
    expect(linhasDePagamento(1000, [], "A combinar")).toEqual(["A combinar"]);
    expect(linhasDePagamento(1000, [], null)).toEqual([]);
  });
  it("data fixa, dias após a aprovação e cartão em até 12x", () => {
    const l = linhasDePagamento(120000, [p(5000, "DATA_FIXA", "Parcela", { dataFixa: "2027-01-15" }), p(5000, "DIAS_APOS_APROVACAO", "Parcela", { diasApos: 30, forma: "CARTAO_CREDITO", parcelasCartao: 12 })], null);
    expect(l[0]).toContain("em 15/01/2027");
    expect(l[1]).toContain("30 dias após a aprovação");
    expect(l[1]).toContain("até 12x");
  });
  it("com nota fiscal o total já vem com o acréscimo: as parcelas dividem esse total", () => {
    const l = linhasDePagamento(105000, [p(5000, "CONFIRMACAO", "Sinal"), p(5000, "ENTREGA_E_INSTALACAO", "Final")], null);
    expect(l[0]).toMatch(/525,00/);
    expect(l[1]).toMatch(/525,00/);
  });
});

describe("linhasDePrazo", () => {
  const base = { totalMinDias: null, totalMaxDias: null, materialDias: null, execucaoDias: null, vidrosDias: null };
  it("por etapa (obra grande)", () => {
    expect(linhasDePrazo({ ...base, modo: "POR_ETAPA", materialDias: 30, execucaoDias: 40, vidrosDias: 20 })).toEqual(["Material: 30 dias úteis", "Execução: 40 dias úteis", "Vidros e finalização: 20 dias úteis"]);
  });
  it("total simples: usa o intervalo e prevalece o máximo como prometido", () => {
    expect(linhasDePrazo({ ...base, modo: "TOTAL", totalMinDias: 20, totalMaxDias: 35 })).toEqual(["Prazo total de 20 a 35 dias úteis"]);
    expect(linhasDePrazo({ ...base, modo: "TOTAL", totalMaxDias: 1 })).toEqual(["Prazo total de 1 dia útil"]);
    expect(linhasDePrazo({ ...base, modo: "TOTAL", totalMaxDias: 30, tipoDias: "CORRIDOS" })).toEqual(["Prazo total de 30 dias corridos"]);
  });
  it("sem prazo: nada", () => expect(linhasDePrazo({ ...base, modo: "NENHUM" })).toEqual([]));
});

describe("demais textos", () => {
  it("notas numeradas ignoram linhas vazias", () => expect(notasNumeradas(["A", " ", "B"])).toEqual(["1. A", "2. B"]));
  it("medidas separadas por ' / '", () => expect(textoDasMedidas([{ larguraMm: 2000, alturaMm: 3600 }, { larguraMm: 2000, alturaMm: 2600 }])).toBe("2000 X 3600 / 2000 X 2600"));
  it("rodapé omite o que está vazio", () => {
    expect(textoDoRodape({ endereco: "Rua A", cidade: "Macaé", uf: "RJ", cep: "27940-050", cnpj: "37.323.333/0001-61", telefone: "(22) 99958-3288", email: null })).toBe("Rua A, Macaé-RJ, 27940-050 — CNPJ 37.323.333/0001-61 — Tel: (22) 99958-3288");
  });
});
