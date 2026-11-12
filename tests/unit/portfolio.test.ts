import { describe, expect, it } from "vitest";

import { MODELOS_TEXTO } from "../../prisma/seed-dados";
import { listaEmTexto, MODELO_PADRAO_DA_LEGENDA, montarLegenda, nomeNoKit, selecionarParaPostagem } from "../../src/lib/dominio/portfolio";

const dados = { tipoServico: "Janelas e guarda-corpo", linha: "Suprema", cidade: "Macaé", regiao: "RJ" };

describe("legenda sugerida da postagem", () => {
  it("preenche tipo de serviço, linha, cidade e UF", () => {
    const { texto, faltando } = montarLegenda(MODELO_PADRAO_DA_LEGENDA, dados);
    expect(texto).toBe("Janelas e guarda-corpo em alumínio linha Suprema, entregues em Macaé/RJ. Pontualidade, qualidade e entrega em cada obra.");
    expect(faltando).toEqual([]);
  });

  it("o modelo da seed e o padrão do código são o mesmo texto", () => {
    const daSeed = MODELOS_TEXTO.find((m) => m.chave === "portfolio.legenda")!;
    expect(daSeed.conteudo).toBe(MODELO_PADRAO_DA_LEGENDA);
  });

  it("dado que falta NÃO é apagado em silêncio: fica visível e listado para o gestor completar", () => {
    const { texto, faltando } = montarLegenda(MODELO_PADRAO_DA_LEGENDA, { ...dados, linha: null, cidade: "  " });
    expect(texto).toContain("{{linha}}");
    expect(texto).toContain("{{cidade}}");
    expect(faltando).toEqual(["linha", "cidade"]);
  });

  it("nunca leva dados do cliente: mesmo com {{cliente}}, {{telefone}} e {{endereco}} no modelo, eles ficam pendentes", () => {
    const modelo = "{{tipoServico}} para {{cliente}} ({{telefone}}), {{endereco}}, em {{cidade}}/{{regiao}}.";
    const { texto, faltando } = montarLegenda(modelo, dados);
    expect(texto).toBe("Janelas e guarda-corpo para {{cliente}} ({{telefone}}), {{endereco}}, em Macaé/RJ.");
    expect(faltando).toEqual(["cliente", "telefone", "endereco"]);
  });

  it("os valores de entrada não contêm nada além do que a legenda pode usar", () => {
    // A função só aceita estes quatro campos: não há como passar nome, telefone ou endereço por ela.
    expect(Object.keys(dados).sort()).toEqual(["cidade", "linha", "regiao", "tipoServico"]);
  });
});

describe("lista em texto", () => {
  it("junta com vírgula e 'e', em minúsculas depois do primeiro", () => {
    expect(listaEmTexto(["Janelas"])).toBe("Janelas");
    expect(listaEmTexto(["Janelas", "Guarda-corpo"])).toBe("Janelas e guarda-corpo");
    expect(listaEmTexto(["Janelas", "Guarda-corpo", "Box de banheiro"])).toBe("Janelas, guarda-corpo e box de banheiro");
    expect(listaEmTexto([])).toBe("");
    // Linhas de alumínio são nomes próprios: não perdem a maiúscula.
    expect(listaEmTexto(["Gold", "Suprema"], { nomesProprios: true })).toBe("Gold e Suprema");
    expect(listaEmTexto(["Gold", "Suprema", "Linha 25"], { nomesProprios: true })).toBe("Gold, Suprema e Linha 25");
    expect(listaEmTexto(["  ", "Portas"])).toBe("Portas");
  });
});

describe("seleção sugerida para a postagem", () => {
  const f = (id: string, momento: "ANTES" | "DURANTE" | "DEPOIS" | null, criadoEm: string) => ({ id, momento, criadoEm });

  it("com par antes/depois, sugere a foto mais recente de cada", () => {
    const fotos = [f("a1", "ANTES", "2026-06-01"), f("a2", "ANTES", "2026-06-03"), f("d1", "DEPOIS", "2026-06-20"), f("d2", "DEPOIS", "2026-06-25"), f("x", "DURANTE", "2026-06-10")];
    expect(selecionarParaPostagem(fotos)).toEqual(["a2", "d2"]);
  });

  it("sem 'antes', sugere até 4 fotos 'depois', as mais recentes", () => {
    const fotos = ["1", "2", "3", "4", "5"].map((n) => f(`d${n}`, "DEPOIS", `2026-06-0${n}`));
    expect(selecionarParaPostagem([...fotos, f("x", "DURANTE", "2026-07-01")])).toEqual(["d5", "d4", "d3", "d2"]);
  });

  it("sem 'depois', cai para as mais recentes de qualquer momento", () => {
    expect(selecionarParaPostagem([f("a", "ANTES", "2026-06-01"), f("b", "DURANTE", "2026-06-02")])).toEqual(["b", "a"]);
    expect(selecionarParaPostagem([])).toEqual([]);
  });
});

describe("nome dos arquivos no kit", () => {
  it("numera, usa o momento e a extensão do tipo (sem o nome original, que pode ter dado do cliente)", () => {
    expect(nomeNoKit(1, "ANTES", "image/jpeg")).toBe("01-antes.jpg");
    expect(nomeNoKit(12, "DEPOIS", "image/png")).toBe("12-depois.png");
    expect(nomeNoKit(3, null, "image/webp")).toBe("03-foto.webp");
    expect(nomeNoKit(4, "DURANTE", "application/pdf")).toBe("04-durante.jpg");
  });
});
