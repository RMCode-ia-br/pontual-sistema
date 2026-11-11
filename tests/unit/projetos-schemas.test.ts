import { describe, expect, it } from "vitest";

import { idsSchema, interacaoProjetoSchema, lerProjeto, lerProjetoEditado, moverProjetoSchema } from "@/modules/projetos/schemas";

const base = { titulo: "Casa Búzios — esquadrias", clienteId: "cli-1", interesse: "INDEFINIDO" };

const erros = (entrada: Record<string, string>) => {
  const r = lerProjeto(entrada);
  return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message]));
};

describe("formulário de projeto", () => {
  it("aceita o mínimo (título, cliente e interesse) e deixa o resto vazio, sem inventar", () => {
    const r = lerProjeto(base);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data).toMatchObject({ titulo: "Casa Búzios — esquadrias", clienteId: "cli-1", interesse: "INDEFINIDO", tiposServico: [] });
    expect(r.data.porte).toBeUndefined();
    expect(r.data.temperatura).toBeUndefined();
    expect(r.data.valorEstimadoCentavos).toBeUndefined();
    expect(r.data.investimentoPrevistoCentavos).toBeUndefined();
  });

  it("exige título e cliente", () => {
    expect(erros({ ...base, titulo: "" }).titulo).toBeTruthy();
    expect(erros({ ...base, titulo: "a" }).titulo).toBeTruthy();
    expect(erros({ ...base, clienteId: "" }).clienteId).toMatch(/cliente/i);
  });

  it("junta as caixas servico_* em uma lista e ignora o que não está marcado", () => {
    const r = lerProjeto({ ...base, servico_JANELA: "on", servico_BOX: "on", servico_PORTA: "", servico_INVENTADO: "on" });
    expect(r.success && r.data.tiposServico).toEqual(["JANELA", "BOX"]);
  });

  it("converte dinheiro digitado em centavos inteiros (sem ponto flutuante)", () => {
    const r = lerProjeto({ ...base, investimentoPrevisto: "50.000,00", valorEstimado: "12.345,67" });
    expect(r.success && r.data.investimentoPrevistoCentavos).toBe(5_000_000);
    expect(r.success && r.data.valorEstimadoCentavos).toBe(1_234_567);
  });

  it("recusa valor em reais inválido ou grande demais para o banco", () => {
    expect(erros({ ...base, valorEstimado: "abc" }).valorEstimadoCentavos).toBeTruthy();
    expect(erros({ ...base, valorEstimado: "-10,00" }).valorEstimadoCentavos).toBeTruthy();
    expect(erros({ ...base, investimentoPrevisto: "99.999.999.999,00" }).investimentoPrevistoCentavos).toBeTruthy();
  });

  it("valida os selects contra as listas (porte, temperatura, fase da obra, origem, interesse)", () => {
    expect(erros({ ...base, porte: "GIGANTE" }).porte).toBeTruthy();
    expect(erros({ ...base, temperatura: "FERVENDO" }).temperatura).toBeTruthy();
    expect(erros({ ...base, faseDaObra: "x" }).faseDaObra).toBeTruthy();
    expect(erros({ ...base, origem: "TELEPATIA" }).origem).toBeTruthy();
    expect(erros({ ...base, interesse: "" }).interesse).toBeTruthy();
    expect(erros({ ...base, porte: "MEDIO", temperatura: "QUENTE", faseDaObra: "PRONTA", origem: "GOOGLE" })).toEqual({});
  });

  it("limita o tamanho dos textos livres", () => {
    expect(erros({ ...base, titulo: "x".repeat(161) }).titulo).toBeTruthy();
    expect(erros({ ...base, observacoes: "x".repeat(4001) }).observacoes).toBeTruthy();
    expect(erros({ ...base, prazoDesejado: "x".repeat(121) }).prazoDesejado).toBeTruthy();
  });

  it("a edição exige o id do projeto", () => {
    expect(lerProjetoEditado(base).success).toBe(false);
    expect(lerProjetoEditado({ ...base, id: "p-1" }).success).toBe(true);
  });
});

describe("mover projeto", () => {
  it("aceita fase conhecida e rejeita lixo", () => {
    expect(moverProjetoSchema.safeParse({ id: "p1", para: "NEGOCIACAO" }).success).toBe(true);
    expect(moverProjetoSchema.safeParse({ id: "p1", para: "PERDIDO", motivoPerdaId: "m1", concorrente: "X" }).success).toBe(true);
    expect(moverProjetoSchema.safeParse({ id: "p1", para: "GANHO" }).success).toBe(false);
    expect(moverProjetoSchema.safeParse({ id: "", para: "NOVO_LEAD" }).success).toBe(false);
    expect(moverProjetoSchema.safeParse({ para: "NOVO_LEAD" }).success).toBe(false);
    expect(moverProjetoSchema.safeParse(null).success).toBe(false);
  });

  it("campos de perda vazios viram undefined", () => {
    const r = moverProjetoSchema.parse({ id: "p1", para: "PERDIDO", motivoPerdaId: "m1", motivoPerdaDetalhe: "  ", concorrente: "" });
    expect(r.motivoPerdaDetalhe).toBeUndefined();
    expect(r.concorrente).toBeUndefined();
  });

  it("limita detalhe e concorrente", () => {
    expect(moverProjetoSchema.safeParse({ id: "p1", para: "PERDIDO", motivoPerdaId: "m", motivoPerdaDetalhe: "x".repeat(501) }).success).toBe(false);
    expect(moverProjetoSchema.safeParse({ id: "p1", para: "PERDIDO", motivoPerdaId: "m", concorrente: "x".repeat(121) }).success).toBe(false);
  });
});

describe("outros schemas do projeto", () => {
  it("lista de ids: de 1 a 200", () => {
    expect(idsSchema.safeParse([]).success).toBe(false);
    expect(idsSchema.safeParse(["a"]).success).toBe(true);
    expect(idsSchema.safeParse(Array.from({ length: 201 }, (_, i) => `id${i}`)).success).toBe(false);
  });

  it("registro na linha do tempo: tipo manual e texto com conteúdo", () => {
    expect(interacaoProjetoSchema.safeParse({ projetoId: "p1", tipo: "NOTA", texto: "Ligou pedindo desconto." }).success).toBe(true);
    expect(interacaoProjetoSchema.safeParse({ projetoId: "p1", tipo: "SISTEMA", texto: "forjado" }).success).toBe(false);
    expect(interacaoProjetoSchema.safeParse({ projetoId: "p1", tipo: "NOTA", texto: " " }).success).toBe(false);
  });
});
