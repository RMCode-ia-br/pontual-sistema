import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

import { ProducaoPdf } from "@/modules/propostas/pdf/producao-pdf";
import { PropostaPdf } from "@/modules/propostas/pdf/proposta-pdf";

import { conteudoDeExemplo } from "./fixtures-proposta";

type Documento = Parameters<typeof renderToBuffer>[0];
/**
 * `pdftotext` (poppler) lê o texto do PDF. Procura no PATH e, no Windows, no que vem com o Git for Windows (a máquina de
 * desenvolvimento não o põe no PATH do PowerShell). Sem ele, só os testes que o usam são pulados (o resto roda).
 * O poppler sai com código 99 em `-v`: só "não achei o programa" (ENOENT) importa.
 */
const pdftotext = ["pdftotext", "C:/Program Files/Git/ucrt64/bin/pdftotext.exe"].find((c) => spawnSync(c, ["-v"], { stdio: "ignore" }).error === undefined);
const temPdftotext = pdftotext !== undefined;

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

  describe.skipIf(!temPdftotext)("dados para pagamento em várias linhas (peso normal, texto extraído igual ao digitado)", () => {
    // O bloco usa peso NORMAL de propósito: no negrito (Geist SemiBold) o "c" minúsculo some do texto copiado do PDF quando a
    // primeira geração do processo não usou esse "c" em negrito (ver PENDENCIAS e docs/APRENDIZADOS.md). Aqui as comparações
    // são EXATAS: nenhuma letra pode faltar, e é isso que o teste das 30 gerações protege.

    /** Texto do PDF na ordem de leitura, como `pdftotext` o extrai (uma linha do papel por linha de saída). */
    async function textoDoPdf(dadosPagamento: string): Promise<string[]> {
      const c = conteudoDeExemplo([{ descricao: "PORTA", valorCentavos: 100000 }]);
      c.pagamento.dadosPagamento = dadosPagamento;
      const pdf = await renderToBuffer(createElement(PropostaPdf, { c, logo: null }) as unknown as Documento);
      const dir = mkdtempSync(join(tmpdir(), "pdf-pagamento-"));
      try {
        const arquivo = join(dir, "proposta.pdf");
        writeFileSync(arquivo, pdf);
        return execFileSync(pdftotext!, ["-raw", "-enc", "UTF-8", arquivo, "-"], { encoding: "utf8" })
          .split("\n")
          .map((l) => l.trim());
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }

    it("cada linha digitada sai em uma linha do papel, na mesma ordem, sem perder nenhuma letra", async () => {
      const digitado = ["Favorecido: Pontual Soluções", "Banco: Exemplo S.A.", "Agência: 0001", "Conta: 12345-6", "Chave Pix: exemplo@pontual.com.br"];
      const linhas = await textoDoPdf(digitado.join("\n"));
      const i = linhas.findIndex((l) => l === digitado[0]);
      expect(i).toBeGreaterThan(-1);
      expect(linhas.slice(i, i + 5)).toEqual(digitado);
    });

    it("30 gerações seguidas (a 1ª sem nenhum \"c\" no bloco, como o texto da fixture): o texto extraído confere com o digitado em TODAS", async () => {
      const digitado = ["Favorecido: Pontual Soluções", "Banco: Exemplo S.A.", "Agência: 0001", "Conta: 12345-6", "Chave Pix: exemplo@pontual.com.br"];
      const defeitos: string[] = [];
      for (let g = 1; g <= 30; g++) {
        // A 1ª geração é a que "envenenava" o negrito: o bloco dela não tem "c" (como "PIX: dados de teste" da fixture).
        const linhas = await textoDoPdf(g === 1 ? "PIX: dados de teste" : digitado.join("\n"));
        const esperado = g === 1 ? ["PIX: dados de teste"] : digitado;
        const i = linhas.findIndex((l) => l === esperado[0]);
        if (i < 0 || JSON.stringify(linhas.slice(i, i + esperado.length)) !== JSON.stringify(esperado)) {
          defeitos.push(`geração ${g}: ${JSON.stringify(linhas.filter((l) => /Ban|Chave|Ag.ncia|PIX/.test(l)))}`);
        }
      }
      expect(defeitos, "gerações cujo texto extraído não confere com o digitado").toEqual([]);
    }, 120_000);

    it("fim de linha do navegador (CRLF) não deixa lixo nem junta as linhas", async () => {
      const linhas = await textoDoPdf("Banco: A\r\nConta: B");
      const i = linhas.findIndex((l) => l === "Banco: A");
      expect(i).toBeGreaterThan(-1);
      expect(linhas[i + 1]).toBe("Conta: B");
    });

    it("linha muito longa quebra sem cortar nenhum caractere", async () => {
      const longa = "Chave Pix: " + "abcdefghij0123456789".repeat(8); // uma palavra de 160 caracteres sem espaço
      const linhas = await textoDoPdf(`Banco: Exemplo\n${longa}\nConta: 1`);
      const de = linhas.findIndex((l) => l === "Banco: Exemplo");
      const ate = linhas.findIndex((l) => l === "Conta: 1");
      expect(de).toBeGreaterThan(-1);
      expect(ate).toBeGreaterThan(de);
      const doMeio = linhas.slice(de + 1, ate);
      expect(doMeio.length).toBeGreaterThan(1); // ocupou mais de uma linha do papel
      // Nada se perdeu: sem os espaços e sem o hífen que marca a quebra, é o texto digitado.
      expect(doMeio.join("").replace(/[\s-]/g, "")).toBe(longa.replace(/\s/g, ""));
    });
  });

  it("a folha de produção também gera (sem valores)", async () => {
    const c = conteudoDeExemplo([{ descricao: "JANELA", valorCentavos: 123456 }]);
    const pdf = await renderToBuffer(createElement(ProducaoPdf, { c, opcaoId: null }) as unknown as Documento);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
