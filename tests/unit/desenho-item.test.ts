import { describe, expect, it } from "vitest";

import { aplicarTamanhoNaConfig, configDoDesenhoSchema, motivoDeRecusaDeExclusaoDoAnexo, lerTamanhoDoDesenho, marcaDoDesenho, marcaDoTamanho, resolverDesenhoDoItem, type ImagemDoDesenho } from "@/lib/dominio/desenho-item";

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
    expect(resolverDesenhoDoItem({ tipoDesenho: "BOX_FRONTAL", folhas: 2, desenhoImagem: imagem })).toEqual({ tipo: "imagem", imagem, tamanho: "NORMAL", origem: "ITEM" });
    expect(resolverDesenhoDoItem({ tipoDesenho: "BOX_FRONTAL", folhas: 2, desenhoImagem: imagem, tamanhoDesenho: "GRANDE" })).toEqual({ tipo: "imagem", imagem, tamanho: "GRANDE", origem: "ITEM" });
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

// ----- Fase 3.6b-3: prioridade item > tipologia > automático -----

const imagemTipologia: ImagemDoDesenho = { anexoId: "t1", caminho: "Tipologia/t1/x.png", sha256: "def", mime: "image/png", larguraPx: 1000, alturaPx: 500 };
const doItem = { desenhoImagem: imagem };
const daTipologia = { desenhoDaTipologia: { imagem: imagemTipologia } };

describe("resolverDesenhoDoItem: prioridade item > tipologia > automático (tabela)", () => {
  // [descrição, entrada, tipo, origem, imagem esperada, tamanho]
  it.each([
    ["nenhuma imagem: automático", {}, "automatico", undefined, undefined, undefined],
    ["tipologia sem imagem (null): automático", { desenhoDaTipologia: null }, "automatico", undefined, undefined, undefined],
    ["só o item tem imagem: a do item", { ...doItem }, "imagem", "ITEM", imagem, "NORMAL"],
    ["só a tipologia tem imagem: herda", { ...daTipologia }, "imagem", "TIPOLOGIA", imagemTipologia, "NORMAL"],
    ["as duas: a do item vence", { ...doItem, ...daTipologia }, "imagem", "ITEM", imagem, "NORMAL"],
    ["item com imagem e tamanho Grande, tipologia Normal: o tamanho é o do item", { ...doItem, tamanhoDesenho: "GRANDE", desenhoDaTipologia: { imagem: imagemTipologia, tamanho: "NORMAL" } }, "imagem", "ITEM", imagem, "GRANDE"],
    ["herdada com tamanho Grande da tipologia: o tamanho é o da tipologia", { desenhoDaTipologia: { imagem: imagemTipologia, tamanho: "GRANDE" } }, "imagem", "TIPOLOGIA", imagemTipologia, "GRANDE"],
    ["herdada: o tamanho do item NÃO conta (o item não tem tamanho próprio sem imagem própria)", { tamanhoDesenho: "GRANDE", ...daTipologia }, "imagem", "TIPOLOGIA", imagemTipologia, "NORMAL"],
    ["item sem imagem com tamanho Grande e tipologia sem imagem: automático", { tamanhoDesenho: "GRANDE" }, "automatico", undefined, undefined, undefined],
    ["imagem removida da tipologia (volta a null) e item sem imagem: automático", { desenhoDaTipologia: null, desenhoImagem: null }, "automatico", undefined, undefined, undefined],
    ["imagem removida do item, tipologia com imagem: volta ao desenho da tipologia", { desenhoImagem: null, ...daTipologia }, "imagem", "TIPOLOGIA", imagemTipologia, "NORMAL"],
  ] as const)("%s", (_nome, entrada, tipo, origem, img, tamanho) => {
    const r = resolverDesenhoDoItem({ tipoDesenho: "PORTA_GIRO", folhas: 1, ...(entrada as object) });
    expect(r.tipo).toBe(tipo);
    if (r.tipo === "imagem") {
      expect(r.origem).toBe(origem);
      expect(r.imagem).toEqual(img);
      expect(r.tamanho).toBe(tamanho);
    } else {
      expect(r).toEqual({ tipo: "automatico", tipoDesenho: "PORTA_GIRO", folhas: 1 });
    }
  });

  it("tipologia arquivada ou excluída: a decisão é de quem lê; a regra só vê a imagem que recebe (arquivada continua valendo)", () => {
    // Arquivar (ativo=false) não tira a imagem: o leitor continua passando a imagem e ela resolve igual.
    expect(resolverDesenhoDoItem({ tipoDesenho: "GENERICO", folhas: null, ...daTipologia }).tipo).toBe("imagem");
    // Excluir/ficar sem imagem: o leitor passa null e o desenho volta ao automático.
    expect(resolverDesenhoDoItem({ tipoDesenho: "GENERICO", folhas: null, desenhoDaTipologia: null }).tipo).toBe("automatico");
  });

  it("proposta enviada: o snapshot já traz a imagem resolvida em desenhoImagem e nada mais é lido da tipologia", () => {
    const r = resolverDesenhoDoItem({ tipoDesenho: "GENERICO", folhas: null, desenhoImagem: imagemTipologia, tamanhoDesenho: "GRANDE" });
    expect(r).toEqual({ tipo: "imagem", imagem: imagemTipologia, tamanho: "GRANDE", origem: "ITEM" });
  });
});

describe("configDoDesenhoSchema (estrito)", () => {
  it.each([[null], [{ tamanhoDesenho: "GRANDE" }]])("aceita %j", (c) => expect(configDoDesenhoSchema.safeParse(c).success).toBe(true));
  it.each([[{}], [{ tamanhoDesenho: "grande" }], [{ tamanhoDesenho: "NORMAL" }], [{ tamanhoDesenho: "ENORME" }], [{ tamanhoDesenho: "GRANDE", outra: 1 }], [{ outra: "GRANDE" }], [[]], ["GRANDE"], [42], [undefined]])("recusa %j", (c) =>
    expect(configDoDesenhoSchema.safeParse(c).success).toBe(false),
  );
});

describe("motivoDeRecusaDeExclusaoDoAnexo (a exclusão genérica nunca apaga o desenho do item nem o da tipologia)", () => {
  it.each([
    [{ categoria: "desenho-item", entidadeTipo: "ItemProposta" }, "Este desenho pertence a um item da proposta. Remova-o pelo próprio item."],
    [{ categoria: "desenho-item", entidadeTipo: "Qualquer" }, "Este desenho pertence a um item da proposta. Remova-o pelo próprio item."],
    [{ categoria: "outra", entidadeTipo: "ItemProposta" }, "Este desenho pertence a um item da proposta. Remova-o pelo próprio item."],
    [{ categoria: "desenho-tipologia", entidadeTipo: "Tipologia" }, "Este desenho pertence a uma tipologia. Remova-o pelo cadastro da tipologia."],
    [{ categoria: "desenho-tipologia", entidadeTipo: "Qualquer" }, "Este desenho pertence a uma tipologia. Remova-o pelo cadastro da tipologia."],
    [{ categoria: null, entidadeTipo: "Tipologia" }, "Este desenho pertence a uma tipologia. Remova-o pelo cadastro da tipologia."],
  ])("recusa %j", (anexo, mensagem) => expect(motivoDeRecusaDeExclusaoDoAnexo(anexo)).toBe(mensagem));
  it.each([
    [{ categoria: "foto-obra", entidadeTipo: "Projeto" }],
    [{ categoria: "documento", entidadeTipo: "Cliente" }],
    [{ categoria: null, entidadeTipo: null }],
    [{}],
  ])("deixa excluir %j", (anexo) => expect(motivoDeRecusaDeExclusaoDoAnexo(anexo)).toBeNull());
});
