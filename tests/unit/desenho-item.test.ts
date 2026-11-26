import { describe, expect, it } from "vitest";

import { aplicarTamanhoNaConfig, lerTamanhoDoDesenho, marcaDoDesenho, marcaDoTamanho, resolverDesenhoDoItem, type ImagemDoDesenho } from "@/lib/dominio/desenho-item";

const imagem: ImagemDoDesenho = { anexoId: "a1", caminho: "ItemProposta/i1/x.png", sha256: "abc", mime: "image/png", larguraPx: 800, alturaPx: 600 };

describe("resolverDesenhoDoItem", () => {
  it("sem imagem: desenho automático do tipo, com as folhas do item", () => {
    expect(resolverDesenhoDoItem({ tipoDesenho: "JANELA_CORRER", folhas: 3 })).toEqual({ tipo: "automatico", tipoDesenho: "JANELA_CORRER", folhas: 3 });
    expect(resolverDesenhoDoItem({ tipoDesenho: "GENERICO", folhas: null, desenhoImagem: null })).toEqual({ tipo: "automatico", tipoDesenho: "GENERICO", folhas: null });
  });
  it("sem imagem o tamanho não conta: continua automático", () => {
    expect(resolverDesenhoDoItem({ tipoDesenho: "BOX_FRONTAL", folhas: 2, tamanhoDesenho: "GRANDE" }).tipo).toBe("automatico");
  });
  it("com imagem: a imagem do item vence, no tamanho Normal quando nada diz o contrário", () => {
    expect(resolverDesenhoDoItem({ tipoDesenho: "BOX_FRONTAL", folhas: 2, desenhoImagem: imagem })).toEqual({ tipo: "imagem", imagem, tamanho: "NORMAL" });
    expect(resolverDesenhoDoItem({ tipoDesenho: "BOX_FRONTAL", folhas: 2, desenhoImagem: imagem, tamanhoDesenho: "GRANDE" })).toEqual({ tipo: "imagem", imagem, tamanho: "GRANDE" });
  });
});

describe("marcaDoDesenho e marcaDoTamanho", () => {
  it("automático ou personalizado com o hash", () => {
    expect(marcaDoDesenho({})).toBe("automatico");
    expect(marcaDoDesenho({ desenhoImagem: null })).toBe("automatico");
    expect(marcaDoDesenho({ desenhoImagem: imagem })).toBe("personalizado:abc");
  });
  it("o tamanho é Normal sem o campo (snapshots antigos) e Grande só quando está escrito", () => {
    expect(marcaDoTamanho({})).toBe("NORMAL");
    expect(marcaDoTamanho({ tamanhoDesenho: null })).toBe("NORMAL");
    expect(marcaDoTamanho({ tamanhoDesenho: "NORMAL" })).toBe("NORMAL");
    expect(marcaDoTamanho({ tamanhoDesenho: "GRANDE" })).toBe("GRANDE");
  });
});

describe("tamanho dentro de desenhoConfig (JSON)", () => {
  it.each([[null], [undefined], [{}], [[]], ["texto"], [42], [{ tamanhoDesenho: "ENORME" }], [{ outra: "coisa" }]])("lê %j como Normal", (config) => {
    expect(lerTamanhoDoDesenho(config)).toBe("NORMAL");
  });
  it("lê Grande", () => expect(lerTamanhoDoDesenho({ tamanhoDesenho: "GRANDE" })).toBe("GRANDE"));

  it("Grande grava a chave e preserva as outras; Normal tira a chave", () => {
    expect(aplicarTamanhoNaConfig(null, "GRANDE")).toEqual({ tamanhoDesenho: "GRANDE" });
    expect(aplicarTamanhoNaConfig({ sentido: "esquerda" }, "GRANDE")).toEqual({ sentido: "esquerda", tamanhoDesenho: "GRANDE" });
    expect(aplicarTamanhoNaConfig({ sentido: "esquerda", tamanhoDesenho: "GRANDE" }, "NORMAL")).toEqual({ sentido: "esquerda" });
  });
  it("Normal sem mais nada vira null (o item nunca mexeu na configuração fica com nulo)", () => {
    expect(aplicarTamanhoNaConfig({ tamanhoDesenho: "GRANDE" }, "NORMAL")).toBeNull();
    expect(aplicarTamanhoNaConfig(null, "NORMAL")).toBeNull();
    expect(aplicarTamanhoNaConfig(null, undefined)).toBeNull();
  });
  it("undefined não mexe em nada; lixo no lugar da configuração é ignorado", () => {
    expect(aplicarTamanhoNaConfig({ sentido: "direita" }, undefined)).toEqual({ sentido: "direita" });
    expect(aplicarTamanhoNaConfig("lixo", "GRANDE")).toEqual({ tamanhoDesenho: "GRANDE" });
    expect(aplicarTamanhoNaConfig([1, 2], "GRANDE")).toEqual({ tamanhoDesenho: "GRANDE" });
  });
  it("não altera o objeto recebido", () => {
    const original = { sentido: "esquerda" };
    aplicarTamanhoNaConfig(original, "GRANDE");
    expect(original).toEqual({ sentido: "esquerda" });
  });
});
