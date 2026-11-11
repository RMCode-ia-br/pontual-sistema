import { describe, expect, it } from "vitest";

import { chavesDeDuplicidade, duplicadasNoArquivo, normalizarDocumento } from "@/lib/dominio/duplicidade";
import { camposObrigatoriosSemColuna, normalizarCabecalho, sugerirMapeamento, type CampoImportavel } from "@/lib/dominio/mapeamento";
import { textoParaBooleano, textoParaDecimal, textoParaInteiro, valorParaCentavos } from "@/lib/dominio/numeros";
import { calcularPaginacao, hrefDaLista, lerParametrosLista, montarConsulta, padraoLike, termoDeBusca } from "@/lib/listas/parametros";

describe("valorParaCentavos", () => {
  it("lê o formato brasileiro", () => {
    expect(valorParaCentavos("1.234,56")).toBe(123456);
    expect(valorParaCentavos("R$ 12,50")).toBe(1250);
    expect(valorParaCentavos("12")).toBe(1200);
    expect(valorParaCentavos("0,05")).toBe(5);
  });

  it("lê ponto decimal de planilhas em inglês", () => {
    expect(valorParaCentavos("12.5")).toBe(1250);
    expect(valorParaCentavos("1234.56")).toBe(123456);
    expect(valorParaCentavos("0.99")).toBe(99);
  });

  it("'1.500' é mil e quinhentos reais (português vence a ambiguidade)", () => {
    expect(valorParaCentavos("1.500")).toBe(150000);
  });

  it("recusa lixo, negativo e mais de 2 casas", () => {
    for (const ruim of ["", "abc", "-5", "12,345", "12.345.6", "1,2,3", "R$", "1e5"]) expect(valorParaCentavos(ruim), ruim).toBeNull();
  });
});

describe("textoParaDecimal", () => {
  it("com vírgula vale o formato brasileiro; sem vírgula o ponto é decimal", () => {
    expect(textoParaDecimal("1,25")).toBe(1.25);
    expect(textoParaDecimal("1.250,5")).toBe(1250.5);
    expect(textoParaDecimal("1.25")).toBe(1.25);
    expect(textoParaDecimal("6000")).toBe(6000);
  });

  it("respeita o máximo de casas e recusa inválidos", () => {
    expect(textoParaDecimal("1,2345", 3)).toBeNull();
    expect(textoParaDecimal("1,234", 3)).toBe(1.234);
    for (const ruim of ["", "x", "-1", "1,2,3"]) expect(textoParaDecimal(ruim), ruim).toBeNull();
  });
});

describe("textoParaInteiro e textoParaBooleano", () => {
  it("inteiro aceita milhar com ponto", () => {
    expect(textoParaInteiro("6000")).toBe(6000);
    expect(textoParaInteiro("6.000")).toBe(6000);
    expect(textoParaInteiro("1.234.567")).toBe(1234567);
    expect(textoParaInteiro("12,5")).toBeNull();
    expect(textoParaInteiro("-3")).toBeNull();
  });

  it("booleano entende sim/não e variações", () => {
    expect(textoParaBooleano("Sim")).toBe(true);
    expect(textoParaBooleano("NÃO")).toBe(false);
    expect(textoParaBooleano("x")).toBe(true);
    expect(textoParaBooleano("talvez")).toBeUndefined();
    expect(textoParaBooleano("")).toBeUndefined();
  });
});

describe("duplicidade", () => {
  it("normaliza CPF/CNPJ só quando tem 11 ou 14 dígitos", () => {
    expect(normalizarDocumento("529.982.247-25")).toBe("52998224725");
    expect(normalizarDocumento("11.222.333/0001-81")).toBe("11222333000181");
    expect(normalizarDocumento("123")).toBeNull();
    expect(normalizarDocumento("")).toBeNull();
    expect(normalizarDocumento(null)).toBeNull();
  });

  it("telefone e WhatsApp iguais viram uma chave só, com ou sem máscara e com ou sem 55", () => {
    const k = chavesDeDuplicidade({ telefone: "(22) 99958-3288", whatsapp: "+55 22 99958-3288", cpfCnpj: "529.982.247-25" });
    expect(k.telefones).toEqual(["+5522999583288"]);
    expect(k.documento).toBe("52998224725");
  });

  it("telefone inválido não vira chave", () => {
    expect(chavesDeDuplicidade({ telefone: "123" }).telefones).toEqual([]);
  });

  it("acha repetidas dentro do arquivo: a primeira vale, as seguintes são marcadas", () => {
    const r = duplicadasNoArquivo([
      [{ chave: "d:1", rotulo: "CPF/CNPJ" }],
      [{ chave: "d:2", rotulo: "CPF/CNPJ" }],
      [{ chave: "d:1", rotulo: "CPF/CNPJ" }],
      [{ chave: "t:9", rotulo: "telefone" }, { chave: "d:2", rotulo: "CPF/CNPJ" }],
    ]);
    expect(r).toEqual([
      { indice: 2, duplicadaDe: 0, motivo: "CPF/CNPJ" },
      { indice: 3, duplicadaDe: 1, motivo: "CPF/CNPJ" },
    ]);
  });
});

describe("mapeamento de colunas", () => {
  const campos: CampoImportavel[] = [
    { chave: "codigo", rotulo: "Código", sinonimos: ["cod", "sku"], obrigatorio: true },
    { chave: "descricao", rotulo: "Descrição", sinonimos: ["produto", "nome"], obrigatorio: true },
    { chave: "custo", rotulo: "Custo unitário", sinonimos: ["preço de custo", "custo"] },
  ];

  it("normaliza cabeçalhos sem acento, caixa ou pontuação", () => {
    expect(normalizarCabecalho("  Preço de Custo (R$) ")).toBe("precodecustor");
  });

  it("sugere por nome exato e por sinônimo", () => {
    const m = sugerirMapeamento(["CÓDIGO", "Produto", "Preço de custo", "Outra"], campos);
    expect(m).toEqual({ codigo: 0, descricao: 1, custo: 2 });
  });

  it("deixa nulo o que não encontra e nunca usa a mesma coluna duas vezes", () => {
    const m = sugerirMapeamento(["Nome", "Nome"], campos);
    expect(m.descricao).toBe(0);
    expect(m.codigo).toBeNull();
    expect(m.custo).toBeNull();
    expect(camposObrigatoriosSemColuna(campos, m).map((c) => c.chave)).toEqual(["codigo"]);
  });
});

describe("parâmetros de lista", () => {
  const config = { ordenaveis: ["nome", "criadoEm"], ordemPadrao: "nome" } as const;

  it("usa padrões quando a URL vem vazia", () => {
    expect(lerParametrosLista({}, config)).toEqual({ pagina: 1, tamanho: 25, busca: "", ordem: "nome", direcao: "asc" });
  });

  it("aceita valores válidos e descarta inválidos (nunca confia na URL)", () => {
    const p = lerParametrosLista({ pagina: "3", tamanho: "50", busca: "  João ", ordem: "criadoEm", direcao: "desc" }, config);
    expect(p).toEqual({ pagina: 3, tamanho: 50, busca: "João", ordem: "criadoEm", direcao: "desc" });
    const ruim = lerParametrosLista({ pagina: "-4", tamanho: "99999", ordem: "senhaHash; DROP TABLE", direcao: "up" }, config);
    expect(ruim).toEqual({ pagina: 1, tamanho: 25, busca: "", ordem: "nome", direcao: "asc" });
  });

  it("corta a busca em 80 caracteres e usa o primeiro valor de parâmetros repetidos", () => {
    expect(termoDeBusca("x".repeat(200))).toHaveLength(80);
    expect(lerParametrosLista({ busca: ["a", "b"] }, config).busca).toBe("a");
  });

  it("pagina: ajusta página além do fim e calcula 'de/até'", () => {
    expect(calcularPaginacao(0, 1, 25)).toMatchObject({ pagina: 1, paginas: 1, de: 0, ate: 0, skip: 0 });
    expect(calcularPaginacao(60, 2, 25)).toMatchObject({ pagina: 2, paginas: 3, de: 26, ate: 50, skip: 25 });
    expect(calcularPaginacao(60, 99, 25)).toMatchObject({ pagina: 3, de: 51, ate: 60, skip: 50 });
    expect(calcularPaginacao(60, 0, 25).pagina).toBe(1);
  });

  it("monta consultas sem campos vazios e com mudanças pontuais", () => {
    expect(montarConsulta({ busca: "ana", pagina: undefined, ativo: false, marcado: true, vazio: "" })).toBe("?busca=ana&marcado=1");
    expect(montarConsulta({})).toBe("");
    expect(hrefDaLista("/clientes", { busca: "ana", pagina: 3 }, { pagina: 1, ordem: "nome" })).toBe("/clientes?busca=ana&pagina=1&ordem=nome");
  });

  it("escapa curingas do LIKE", () => {
    expect(padraoLike("50%_off\\")).toBe("%50\\%\\_off\\\\%");
  });
});
