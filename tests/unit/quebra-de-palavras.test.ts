import { describe, expect, it } from "vitest";

import { MAXIMO_DE_PALAVRA_INTEIRA, quebrasDaPalavra } from "../../src/lib/pdf/quebra-de-palavras";

describe("quebra de palavra longa no PDF", () => {
  it("palavra comum fica inteira (nunca TEM-PERADO)", () => {
    expect(quebrasDaPalavra("TEMPERADO")).toEqual(["TEMPERADO"]);
    expect(quebrasDaPalavra("exemplo@pontual.com.br")).toEqual(["exemplo@pontual.com.br"]);
  });

  it("uma chave Pix aleatória (36 caracteres) fica inteira", () => {
    const pix = "123e4567-e89b-12d3-a456-426614174000";
    expect(pix).toHaveLength(36);
    expect(quebrasDaPalavra(pix)).toEqual([pix]);
  });

  it("palavra no limite exato fica inteira; um caractere a mais é repartido", () => {
    expect(quebrasDaPalavra("a".repeat(MAXIMO_DE_PALAVRA_INTEIRA))).toHaveLength(1);
    expect(quebrasDaPalavra("a".repeat(MAXIMO_DE_PALAVRA_INTEIRA + 1))).toEqual(["a".repeat(MAXIMO_DE_PALAVRA_INTEIRA), "a"]);
  });

  it("os pedaços, juntos, devolvem a palavra original (nenhum caractere se perde)", () => {
    const longa = "abcdefghij0123456789".repeat(8);
    const pedacos = quebrasDaPalavra(longa);
    expect(pedacos.join("")).toBe(longa);
    expect(pedacos.every((p) => p.length <= MAXIMO_DE_PALAVRA_INTEIRA)).toBe(true);
  });

  it("palavra vazia não quebra", () => {
    expect(quebrasDaPalavra("")).toEqual([""]);
  });
});
