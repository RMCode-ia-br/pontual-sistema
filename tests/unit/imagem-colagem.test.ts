import { describe, expect, it } from "vitest";

import { conferirArquivoNoNavegador, DICA_DO_DESENHO, escolherImagem, MENSAGEM_COLAGEM_SEM_IMAGEM, MENSAGEM_FORMATO_NAO_ACEITO, ORIENTACAO_DO_WORD } from "@/lib/imagem/colagem";
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


describe("textos de ajuda do desenho (português simples)", () => {
  it("a orientação cita o recorte de tela (Windows + Shift + S), o Ctrl+V e salvar como imagem PNG ou JPG", () => {
    expect(ORIENTACAO_DO_WORD).toBe(
      "No Word, se copiar o desenho direto não funcionar, use o recorte de tela (tecla Windows + Shift + S), selecione o desenho e cole aqui com Ctrl+V. Também dá para salvar o desenho como imagem (PNG ou JPG) e escolher o arquivo.",
    );
  });
  it("a dica começa pela frase de sempre", () => expect(DICA_DO_DESENHO.startsWith("Você pode copiar o desenho do Word e colar aqui com Ctrl+V.")).toBe(true));
  it("a mensagem de colagem sem imagem diz o que houve e repete a orientação", () => {
    expect(MENSAGEM_COLAGEM_SEM_IMAGEM).toBe(`Não encontrei uma imagem no que foi colado. ${ORIENTACAO_DO_WORD}`);
  });
});
