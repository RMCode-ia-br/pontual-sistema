import { describe, expect, it } from "vitest";

import { marcaDoDesenho, resolverDesenhoDoItem, type ImagemDoDesenho } from "@/lib/dominio/desenho-item";

const imagem: ImagemDoDesenho = { anexoId: "a1", caminho: "ItemProposta/i1/x.png", sha256: "abc", mime: "image/png", larguraPx: 800, alturaPx: 600 };

describe("resolverDesenhoDoItem", () => {
  it("sem imagem: desenho automático do tipo, com as folhas do item", () => {
    expect(resolverDesenhoDoItem({ tipoDesenho: "JANELA_CORRER", folhas: 3 })).toEqual({ tipo: "automatico", tipoDesenho: "JANELA_CORRER", folhas: 3 });
    expect(resolverDesenhoDoItem({ tipoDesenho: "GENERICO", folhas: null, desenhoImagem: null })).toEqual({ tipo: "automatico", tipoDesenho: "GENERICO", folhas: null });
  });
  it("com imagem: a imagem do item vence", () => {
    expect(resolverDesenhoDoItem({ tipoDesenho: "BOX_FRONTAL", folhas: 2, desenhoImagem: imagem })).toEqual({ tipo: "imagem", imagem });
  });
});

describe("marcaDoDesenho", () => {
  it("automático ou personalizado com o hash", () => {
    expect(marcaDoDesenho({})).toBe("automatico");
    expect(marcaDoDesenho({ desenhoImagem: null })).toBe("automatico");
    expect(marcaDoDesenho({ desenhoImagem: imagem })).toBe("personalizado:abc");
  });
});
