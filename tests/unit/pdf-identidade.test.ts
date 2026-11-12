import fs from "node:fs";
import path from "node:path";

import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

import { COR_PDF, corDaMarca } from "@/modules/propostas/pdf/comum";
import { formatoDaImagem } from "@/modules/propostas/pdf/logo";
import { ProducaoPdf } from "@/modules/propostas/pdf/producao-pdf";
import { PropostaPdf } from "@/modules/propostas/pdf/proposta-pdf";

import { conteudoDeExemplo } from "./fixtures-proposta";

type Documento = Parameters<typeof renderToBuffer>[0];
const raiz = path.resolve(__dirname, "../..");
const ler = (p: string) => fs.readFileSync(path.join(raiz, p));
const exemplo = () => conteudoDeExemplo([{ descricao: "JANELA DE CORRER COM 02 FOLHAS, AÇÃO E VIDRO", valorCentavos: 400000, grupo: "SALA" }]);

describe("identidade visual nos PDFs (Fase 3.5)", () => {
  it("proposta e folha de produção usam Geist (fonte da interface), não Helvetica", async () => {
    const proposta = (await renderToBuffer(createElement(PropostaPdf, { c: exemplo(), logo: null }) as unknown as Documento)).toString("latin1");
    const producao = (await renderToBuffer(createElement(ProducaoPdf, { c: exemplo(), opcaoId: null }) as unknown as Documento)).toString("latin1");
    for (const pdf of [proposta, producao]) {
      expect(pdf).toMatch(/Geist-Regular/);
      expect(pdf).toMatch(/Geist-SemiBold/);
      expect(pdf).not.toMatch(/Helvetica/);
    }
  });

  it("a logo da empresa entra nos dois PDFs (também a que é JPEG com extensão .png)", async () => {
    for (const arquivo of ["public/marca/logo-pontual.png", "public/logo-pontual.png"]) {
      const data = ler(arquivo);
      const format = formatoDaImagem(data);
      expect(format, arquivo).not.toBeNull();
      const logo = { data, format: format! };
      const semLogo = (await renderToBuffer(createElement(ProducaoPdf, { c: exemplo(), opcaoId: null }) as unknown as Documento)).length;
      const producao = await renderToBuffer(createElement(ProducaoPdf, { c: exemplo(), opcaoId: null, logo }) as unknown as Documento);
      const proposta = await renderToBuffer(createElement(PropostaPdf, { c: exemplo(), logo }) as unknown as Documento);
      expect(producao.length, "a imagem aumenta o PDF da folha").toBeGreaterThan(semLogo);
      expect(proposta.toString("latin1")).toContain("/Subtype /Image");
      expect(producao.toString("latin1")).toContain("/Subtype /Image");
    }
  });
});

describe("formatoDaImagem: pelos bytes, não pela extensão", () => {
  it("reconhece PNG e JPEG", () => {
    expect(formatoDaImagem(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("png");
    expect(formatoDaImagem(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpg");
  });

  it("recusa WebP, texto e vazio (o PDF fica sem logo em vez de quebrar)", () => {
    expect(formatoDaImagem(new TextEncoder().encode("RIFF....WEBPVP8 "))).toBeNull();
    expect(formatoDaImagem(new TextEncoder().encode("<svg></svg>"))).toBeNull();
    expect(formatoDaImagem(new Uint8Array())).toBeNull();
  });
});

describe("neutros do PDF", () => {
  it("COR_PDF usa os mesmos valores do globals.css (claro): uma só identidade", () => {
    const css = fs.readFileSync(path.join(raiz, "src/app/globals.css"), "utf8");
    const bloco = /(?:^|\n):root \{([^}]*)\}/.exec(css)![1];
    const t = (nome: string) => new RegExp(`--${nome}:\\s*(#[0-9a-fA-F]{6});`).exec(bloco)![1].toLowerCase();
    expect(COR_PDF.texto).toBe(t("foreground"));
    expect(COR_PDF.suave).toBe(t("muted-foreground"));
    expect(COR_PDF.borda).toBe(t("border"));
    expect(COR_PDF.fundoSuave).toBe(t("muted"));
    expect(COR_PDF.vidro).toBe(t("accent"));
    expect(COR_PDF.alerta).toBe(t("destructive"));
    expect(COR_PDF.linha).toBe(t("chart-5"));
    expect(COR_PDF.textoForte).toBe(t("chart-4"));
  });
});

describe("cor da marca no PDF", () => {
  it("cor que passa fica como digitada; vazia ou inválida usa o azul padrão", () => {
    expect(corDaMarca("#0064b5")).toBe("#0064b5");
    expect(corDaMarca(null)).toBe("#0064b5");
    expect(corDaMarca("azul")).toBe("#0064b5");
  });

  it("cor clara é escurecida: o PDF tem fundo branco e precisa de contraste", () => {
    const amarelo = corDaMarca("#f5c400");
    expect(amarelo).not.toBe("#f5c400");
    expect(amarelo).toMatch(/^#[0-9a-f]{6}$/);
  });
});
