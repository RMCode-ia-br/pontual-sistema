import { describe, expect, it } from "vitest";

import { formatarMoeda } from "@/lib/formatadores";
import { ocultarValoresDoTexto, semValoresNaLinhaDoTempo, VALOR_OCULTO } from "@/lib/dominio/texto-sem-valores";

describe("ocultarValoresDoTexto", () => {
  it("troca o valor no formato do sistema (inclusive com espaço inseparável)", () => {
    for (const centavos of [0, 5, 100, 123456, 1500000, 99999999]) {
      const texto = `Recebido ${formatarMoeda(centavos)}. Restam ${formatarMoeda(centavos)}.`;
      const r = ocultarValoresDoTexto(texto);
      expect(r).toBe(`Recebido ${VALOR_OCULTO}. Restam ${VALOR_OCULTO}.`);
      expect(r).not.toMatch(/\d{2}/);
    }
  });

  it("troca valor digitado à mão", () => {
    expect(ocultarValoresDoTexto("pagou R$ 500 e depois R$500,5")).toBe(`pagou ${VALOR_OCULTO} e depois ${VALOR_OCULTO}`);
    expect(ocultarValoresDoTexto("estorno de R$ -1.234,56")).toBe(`estorno de ${VALOR_OCULTO}`);
  });

  it("não mexe em texto sem dinheiro (datas, quantidades, porcentagens, números de proposta)", () => {
    const t = "Proposta 2000-26 aprovada em 12/03/2026, 4 janelas, ajuste de 5%.";
    expect(ocultarValoresDoTexto(t)).toBe(t);
  });

  it("a linha do tempo só é mascarada sem 'ver valores' e o resto do item fica intacto", () => {
    const itens = [{ id: "1", tipo: "SISTEMA", texto: `Aprovada por ${formatarMoeda(1200000)}`, autor: "Ana" }];
    expect(semValoresNaLinhaDoTempo(itens, true)[0]!.texto).toContain("12.000");
    const oculto = semValoresNaLinhaDoTempo(itens, false)[0]!;
    expect(oculto).toEqual({ id: "1", tipo: "SISTEMA", texto: `Aprovada por ${VALOR_OCULTO}`, autor: "Ana" });
    expect(itens[0]!.texto).toContain("12.000"); // o original não é alterado
  });
});
