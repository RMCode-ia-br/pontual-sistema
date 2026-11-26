import { describe, expect, it } from "vitest";

import { conferirArquivoNoNavegador, escolherImagem, MENSAGEM_FORMATO_NAO_ACEITO } from "@/lib/imagem/colagem";
import { LIMITE_BYTES_IMAGEM } from "@/lib/imagem/validar";

describe("escolherImagem (colagem e arrastar)", () => {
  it("pega o primeiro PNG ou JPG, mesmo com outros arquivos antes", () => {
    expect(escolherImagem([{ type: "text/plain" }, { type: "image/png" }, { type: "image/jpeg" }])).toEqual({ tipo: "imagem", indice: 1 });
    expect(escolherImagem([{ type: "image/jpeg" }])).toEqual({ tipo: "imagem", indice: 0 });
  });
  it("imagem só de outro formato (GIF, WebP, SVG, EMF do Word) avisa o formato", () => {
    for (const type of ["image/gif", "image/webp", "image/svg+xml", "image/x-emf"]) expect(escolherImagem([{ type }])).toEqual({ tipo: "formato-nao-aceito" });
  });
  it("colagem sem imagem (só texto, ou nada) é 'sem imagem' — mensagem do Word", () => {
    expect(escolherImagem([])).toEqual({ tipo: "sem-imagem" });
    expect(escolherImagem([{ type: "text/html" }, { type: "application/pdf" }])).toEqual({ tipo: "sem-imagem" });
  });
});

describe("conferirArquivoNoNavegador", () => {
  it.each([
    [{ type: "image/png", size: 1000 }, null],
    [{ type: "image/jpeg", size: LIMITE_BYTES_IMAGEM }, null],
    [{ type: "image/jpeg", size: LIMITE_BYTES_IMAGEM + 1 }, /8 MB/],
    [{ type: "image/gif", size: 10 }, new RegExp(MENSAGEM_FORMATO_NAO_ACEITO.slice(0, 20))],
    [{ type: "application/pdf", size: 10 }, /PNG ou JPG/],
    [{ type: "", size: 10 }, /PNG ou JPG/],
    [{ type: "image/png", size: 0 }, /vazio/],
  ])("%j", (arquivo, esperado) => {
    const r = conferirArquivoNoNavegador(arquivo);
    if (esperado === null) expect(r).toBeNull();
    else expect(r).toMatch(esperado);
  });
});
