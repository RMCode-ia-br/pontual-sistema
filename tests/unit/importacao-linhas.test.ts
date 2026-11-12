import { describe, expect, it } from "vitest";

import { lerCsv } from "@/lib/csv/ler";
import { sugerirMapeamento } from "@/lib/dominio/mapeamento";
import { CAMPOS_POR_TIPO } from "@/modules/importacao/campos";
import { chaveDeNome, validarCliente, validarFornecedor, validarProduto, type ContextoDeImportacao } from "@/modules/importacao/linhas";

import { CABECALHO_DE_EXEMPLO, CATEGORIAS_DE_EXEMPLO, csvDaPlanilhaDeExemplo, FORNECEDORES_DE_EXEMPLO, linhasDaPlanilhaDeExemplo, PROBLEMAS_PROPOSITAIS } from "../fixtures/planilha-de-produtos";

const contexto = (): ContextoDeImportacao => ({
  categorias: new Map([[chaveDeNome("Perfis"), "cat-perfis"], [chaveDeNome("Ferragens e acessórios"), "cat-ferragens"]]),
  linhas: new Map([[chaveDeNome("Suprema"), "lin-suprema"]]),
  acabamentos: new Map([[chaveDeNome("Anodizado preto"), "ac-preto"]]),
  fornecedores: new Map([[chaveDeNome("Alubold"), "forn-alubold"], [chaveDeNome("Duplicado"), "forn-a"]]),
  fornecedoresAmbiguos: new Set([chaveDeNome("Duplicado")]),
});

describe("validarProduto", () => {
  it("aceita o mínimo: código e descrição; unidade vira UN e o resto fica ausente", () => {
    const r = validarProduto({ codigo: "A1", descricao: "Perfil" }, contexto());
    expect(r).toEqual({ ok: true, dados: expect.objectContaining({ codigo: "A1", descricao: "Perfil", unidade: "UN" }) });
    if (r.ok) expect(r.dados.custoCentavos).toBeUndefined();
  });

  it("resolve categoria, fornecedor, linha e acabamento por nome, sem acento nem caixa", () => {
    const r = validarProduto({ codigo: "A1", descricao: "Perfil", categoria: "FERRAGENS E ACESSORIOS", fornecedor: "alubold", linha: "suprema", acabamento: "Anodizado Preto" }, contexto());
    expect(r.ok && r.dados).toMatchObject({ categoriaId: "cat-ferragens", fornecedorPrincipalId: "forn-alubold", linhaId: "lin-suprema", acabamentoId: "ac-preto" });
  });

  it("converte custo brasileiro e com ponto decimal para centavos", () => {
    for (const [texto, centavos] of [["1.234,56", 123456], ["12,5", 1250], ["12.5", 1250], ["R$ 10,00", 1000]] as const) {
      const r = validarProduto({ codigo: "A", descricao: "Produto", custo: texto }, contexto());
      expect(r.ok && r.dados.custoCentavos, texto).toBe(centavos);
    }
  });

  it("entende unidades por sigla e por extenso, inclusive 'm²' e 'M2'", () => {
    for (const [texto, esperado] of [["m²", "M2"], ["M2", "M2"], ["metro", "M"], ["Barra", "BARRA"], ["kg", "KG"], ["Conjunto", "CJ"], ["", "UN"]] as const) {
      const r = validarProduto({ codigo: "A", descricao: "Produto", unidade: texto }, contexto());
      expect(r.ok && r.dados.unidade, texto).toBe(esperado);
    }
  });

  it("barra sem comprimento usa 6.000 mm; com comprimento informado, vale o informado", () => {
    expect(validarProduto({ codigo: "A", descricao: "Perfil", unidade: "BARRA" }, contexto())).toMatchObject({ ok: true, dados: { comprimentoBarraMm: 6000 } });
    expect(validarProduto({ codigo: "A", descricao: "Perfil", unidade: "BARRA", comprimentoBarraMm: "3000" }, contexto())).toMatchObject({ ok: true, dados: { comprimentoBarraMm: 3000 } });
    const naoBarra = validarProduto({ codigo: "A", descricao: "Perfil", unidade: "UN" }, contexto());
    expect(naoBarra.ok && naoBarra.dados.comprimentoBarraMm).toBeUndefined();
  });

  it("junta TODOS os problemas da linha, em português", () => {
    const r = validarProduto({ codigo: "", descricao: "x", unidade: "CAIXA", categoria: "Inexistente", custo: "abc", fornecedor: "Duplicado" }, contexto());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const texto = r.erros.join(" | ");
      expect(texto).toMatch(/código/i);
      expect(texto).toMatch(/descrição/i);
      expect(texto).toMatch(/Unidade "CAIXA" não existe/);
      expect(texto).toMatch(/Categoria "Inexistente" não está cadastrado/);
      expect(texto).toMatch(/Custo unitário/);
      expect(texto).toMatch(/existe mais de uma vez/); // fornecedor ambíguo
    }
  });

  it("recusa custo negativo, com 3 casas e acima do limite", () => {
    for (const ruim of ["-5", "1,234", "99999999999,00"]) expect(validarProduto({ codigo: "A", descricao: "Produto", custo: ruim }, contexto()).ok, ruim).toBe(false);
  });
});

describe("validarCliente", () => {
  it("CPF vira pessoa física e CNPJ pessoa jurídica, só com dígitos", () => {
    const pf = validarCliente({ nome: "Maria", documento: "529.982.247-25" });
    expect(pf.ok && pf.dados).toMatchObject({ tipoPessoa: "PF", cpfCnpj: "52998224725", clienteFinal: true });
    const pj = validarCliente({ nome: "Construtora X", documento: "11.222.333/0001-81" });
    expect(pj.ok && pj.dados).toMatchObject({ tipoPessoa: "PJ", cpfCnpj: "11222333000181" });
  });

  it("documento inválido ou com tamanho estranho é recusado", () => {
    expect(validarCliente({ nome: "Maria", documento: "111.111.111-11" }).ok).toBe(false);
    expect(validarCliente({ nome: "Maria", documento: "12345" }).ok).toBe(false);
    expect(validarCliente({ nome: "Maria", documento: "" }).ok).toBe(true);
  });

  it("origem por nome ou por chave; desconhecida é erro", () => {
    expect(validarCliente({ nome: "Maria", origem: "Indicação de cliente" })).toMatchObject({ ok: true, dados: { origem: "INDICACAO_CLIENTE" } });
    expect(validarCliente({ nome: "Maria", origem: "instagram" })).toMatchObject({ ok: true, dados: { origem: "INSTAGRAM" } });
    expect(validarCliente({ nome: "Maria", origem: "panfleto" }).ok).toBe(false);
  });

  it("arquiteto e construtora aceitam Sim/Não e tiram a marca de cliente final; texto estranho é erro", () => {
    const r = validarCliente({ nome: "Ana", arquiteto: "Sim", construtora: "não" });
    expect(r.ok && r.dados).toMatchObject({ arquiteto: true, construtora: false, clienteFinal: false });
    expect(validarCliente({ nome: "Ana", arquiteto: "talvez" }).ok).toBe(false);
  });

  it("telefone vira E.164 e e-mail vai para minúsculas", () => {
    const r = validarCliente({ nome: "Ana", telefone: "(22) 99958-3288", email: "ANA@Exemplo.com" });
    expect(r.ok && r.dados).toMatchObject({ telefone: "+5522999583288", email: "ana@exemplo.com" });
    expect(validarCliente({ nome: "Ana", telefone: "123" }).ok).toBe(false);
  });

  it("exige o nome", () => {
    expect(validarCliente({ nome: "" }).ok).toBe(false);
  });
});

describe("validarFornecedor", () => {
  it("resolve várias categorias separadas por vírgula, ponto e vírgula ou barra, sem repetir", () => {
    const r = validarFornecedor({ razaoSocial: "Alumínios X", categorias: "Perfis, ferragens e acessorios; Perfis" }, contexto());
    expect(r.ok && r.dados.categoriaIds).toEqual(["cat-perfis", "cat-ferragens"]);
  });

  it("categoria que não existe é erro com o nome dela", () => {
    const r = validarFornecedor({ razaoSocial: "Alumínios X", categorias: "Perfis, Mágica" }, contexto());
    expect(!r.ok && r.erros.join(" ")).toMatch(/Categoria "Mágica" não está cadastrada/);
  });

  it("valida CNPJ e prazo", () => {
    expect(validarFornecedor({ razaoSocial: "Alumínios X", cnpj: "11.111.111/1111-11" }, contexto()).ok).toBe(false);
    expect(validarFornecedor({ razaoSocial: "Alumínios X", prazoEntregaDias: "400" }, contexto()).ok).toBe(false);
    const r = validarFornecedor({ razaoSocial: "Alumínios X", cnpj: "11.222.333/0001-81", prazoEntregaDias: "7" }, contexto());
    expect(r.ok && r.dados).toMatchObject({ cnpj: "11222333000181", prazoEntregaDias: 7 });
  });
});

describe("planilha de exemplo (300 produtos fictícios)", () => {
  it("gera 300 linhas boas, todas fictícias, com códigos únicos", () => {
    const linhas = linhasDaPlanilhaDeExemplo();
    expect(linhas).toHaveLength(300);
    expect(new Set(linhas.map((l) => l[0])).size).toBe(300);
    expect(linhas.every((l) => l[0].startsWith("EX-") && l[1].startsWith("Item de exemplo"))).toBe(true);
  });

  it("o CSV gerado é lido de volta e o mapeamento automático acha todas as colunas pelo nome", () => {
    const planilha = lerCsv(csvDaPlanilhaDeExemplo({ comProblemas: true }));
    expect(planilha.cabecalho).toEqual(CABECALHO_DE_EXEMPLO);
    expect(planilha.linhas).toHaveLength(305);
    const m = sugerirMapeamento(planilha.cabecalho, CAMPOS_POR_TIPO.PRODUTOS);
    expect(m).toMatchObject({ codigo: 0, descricao: 1, unidade: 2, categoria: 3, fornecedor: 4, custo: 5, pesoKgPorMetro: 6, localizacao: 7 });
  });

  it("as 300 linhas boas passam na validação e as 4 com defeito falham pelo motivo certo", () => {
    const ctx: ContextoDeImportacao = {
      categorias: new Map(CATEGORIAS_DE_EXEMPLO.map((n) => [chaveDeNome(n), `c-${n}`])),
      linhas: new Map(),
      acabamentos: new Map(),
      fornecedores: new Map(FORNECEDORES_DE_EXEMPLO.map((n) => [chaveDeNome(n), `f-${n}`])),
      fornecedoresAmbiguos: new Set(),
    };
    const planilha = lerCsv(csvDaPlanilhaDeExemplo({ comProblemas: true }));
    const m = sugerirMapeamento(planilha.cabecalho, CAMPOS_POR_TIPO.PRODUTOS);
    const valores = (l: string[]) => Object.fromEntries(CAMPOS_POR_TIPO.PRODUTOS.map((c) => [c.chave, m[c.chave] === null ? "" : (l[m[c.chave] as number] ?? "")]));
    const resultados = planilha.linhas.map((l) => validarProduto(valores(l), ctx));
    expect(resultados.slice(0, 300).every((r) => r.ok)).toBe(true);
    const erros = resultados.slice(300).filter((r) => !r.ok).map((r) => (r.ok ? "" : r.erros.join(" ")));
    expect(erros).toHaveLength(4);
    expect(erros[0]).toContain(PROBLEMAS_PROPOSITAIS.custoInvalido);
    expect(erros[1]).toContain(PROBLEMAS_PROPOSITAIS.unidadeInexistente);
    expect(erros[2]).toMatch(/código/i);
    expect(erros[3]).toContain(PROBLEMAS_PROPOSITAIS.categoriaInexistente);
  });
});
