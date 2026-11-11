import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

import { ProducaoPdf } from "@/modules/propostas/pdf/producao-pdf";
import { PropostaPdf } from "@/modules/propostas/pdf/proposta-pdf";

import { conteudoDeExemplo } from "./fixtures-proposta";

type Documento = Parameters<typeof renderToBuffer>[0];
const paginas = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type \/Page[^s]/g) ?? []).length;

describe("PDF da proposta (react-pdf)", () => {
  it("1157-26 (Parte 02): gera um PDF válido (até 2 páginas) com o total R$ 19.830,00 calculado", async () => {
    const c = conteudoDeExemplo([
      { descricao: "BOX FRONTAL EM VIDROS TEMPERADOS INCOLOR DE 8MM", valorCentavos: 413000, tipoDesenho: "BOX_FRONTAL", grupo: "BOX" },
      { descricao: "BOX FRONTAL EM VIDROS TEMPERADOS FUMÊ DE 8MM", valorCentavos: 905000, tipoDesenho: "BOX_FRONTAL", grupo: "BOX" },
      { descricao: "GUARDA CORPO EM VIDROS TEMPERADOS INCOLOR DE 10MM", valorCentavos: 270000, tipoDesenho: "GUARDA_CORPO", grupo: "GUARDA CORPO" },
      { descricao: "GUARDA CORPO DA ESCADA VIA MOLDE", valorCentavos: 395000, tipoDesenho: "GUARDA_CORPO", grupo: "GUARDA CORPO" },
    ]);
    expect(c.opcoes[0].totais.totalCentavos).toBe(1983000);
    const pdf = await renderToBuffer(createElement(PropostaPdf, { c, logo: null }) as unknown as Documento);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(4000);
    expect(paginas(pdf)).toBeLessThanOrEqual(2);
  });

  it("22 itens quebram em várias páginas sem erro (itens não se partem entre páginas)", async () => {
    const itens = Array.from({ length: 22 }, (_, i) => ({ descricao: `JANELA DE CORRER COM 02 FOLHAS EM ALUMÍNIO LINHA SUPREMA, COM VIDRO TEMPERADO INCOLOR DE 8MM, COMPLETA E INSTALADA ${i + 1}`, valorCentavos: 400000 + i * 100, grupo: i < 11 ? "PARTE SUPERIOR" : "ESCADA" }));
    const pdf = await renderToBuffer(createElement(PropostaPdf, { c: conteudoDeExemplo(itens), logo: null }) as unknown as Documento);
    expect(paginas(pdf)).toBeGreaterThanOrEqual(3);
  });

  it("duas opções, com nota fiscal e desconto, geram sem erro", async () => {
    const c = conteudoDeExemplo([{ descricao: "PORTA", valorCentavos: 100000 }], [{ nome: "Linha Suprema" }, { nome: "Linha Gold", descontoCentavos: 5000 }], { comNotaFiscal: true });
    expect(c.opcoes[0].totais.acrescimoNotaCentavos).toBe(5000);
    expect(c.opcoes[1].totais.totalCentavos).toBe(99750);
    const pdf = await renderToBuffer(createElement(PropostaPdf, { c, logo: null }) as unknown as Documento);
    expect(pdf.length).toBeGreaterThan(4000);
  });

  it("a folha de produção também gera (sem valores)", async () => {
    const c = conteudoDeExemplo([{ descricao: "JANELA", valorCentavos: 123456 }]);
    const pdf = await renderToBuffer(createElement(ProducaoPdf, { c, opcaoId: null }) as unknown as Documento);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
