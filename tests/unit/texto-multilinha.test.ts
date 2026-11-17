import { describe, expect, it } from "vitest";

import { linhasDoTexto, normalizarQuebrasDeLinha } from "../../src/lib/validadores/texto-multilinha";

describe("texto de várias linhas", () => {
  it("troca CRLF e CR por LF (o navegador manda CRLF no formulário)", () => {
    expect(normalizarQuebrasDeLinha("a\r\nb\rc\nd")).toBe("a\nb\nc\nd");
  });

  it("tira o espaço do fim de cada linha, mas não o do meio", () => {
    expect(normalizarQuebrasDeLinha("Banco: Itaú   \nConta: 1 234 \t\nPix: x")).toBe("Banco: Itaú\nConta: 1 234\nPix: x");
  });

  it("limita as linhas em branco seguidas a uma", () => {
    expect(normalizarQuebrasDeLinha("a\n\n\n\nb")).toBe("a\n\nb");
  });

  it("preserva as quebras do meio, os acentos e os caracteres especiais", () => {
    const t = "Favorecido: Pontual Soluções\nAgência: 0001\nChave Pix: a1b2-c3d4";
    expect(normalizarQuebrasDeLinha(t)).toBe(t);
    expect(linhasDoTexto(t)).toEqual(["Favorecido: Pontual Soluções", "Agência: 0001", "Chave Pix: a1b2-c3d4"]);
  });

  it("uma linha só (o texto antigo) continua uma linha só", () => {
    expect(linhasDoTexto("PIX: dados de teste")).toEqual(["PIX: dados de teste"]);
  });
});
