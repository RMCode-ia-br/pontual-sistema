/**
 * Planilha de PRODUTOS DE EXEMPLO para testar a importação (critério de aceite da Fase 1: "importar 300
 * produtos de exemplo com validação"). Tudo é claramente fictício: códigos "EX-...", descrições
 * "Item de exemplo ..." e custos gerados por fórmula, nunca preços reais da Pontual.
 *
 * Os nomes de categoria e de fornecedor NÃO dependem do cadastro real: o teste que grava no banco cria os
 * próprios (com prefixo de teste) e os passa em `categorias` e `fornecedores`. Assim, se o dono excluir ou
 * renomear um fornecedor semeado, nenhum teste quebra. Os padrões abaixo servem só aos testes unitários, que
 * não tocam no banco. Algumas linhas trazem problemas de propósito (ver `PROBLEMAS_PROPOSITAIS`), para a
 * validação ter o que apontar.
 */

export const CATEGORIAS_DE_EXEMPLO = ["Categoria de exemplo 1", "Categoria de exemplo 2", "Categoria de exemplo 3", "Categoria de exemplo 4"] as const;
export const FORNECEDORES_DE_EXEMPLO = ["Fornecedor de exemplo A", "Fornecedor de exemplo B", "Fornecedor de exemplo C", "Fornecedor de exemplo D"] as const;
export const UNIDADES_DE_EXEMPLO = ["BARRA", "UN", "M", "KG"] as const;

export const CABECALHO_DE_EXEMPLO = ["Código", "Descrição", "Unidade", "Categoria", "Fornecedor", "Custo unitário (R$)", "Peso por metro (kg/m)", "Localização"];

export type OpcoesDaPlanilha = {
  /** Quantas linhas BOAS gerar (padrão 300). */
  quantidade?: number;
  /** Prefixo dos códigos (os testes usam um prefixo próprio para limpar depois). */
  prefixo?: string;
  /** Acrescenta as linhas com problema e a repetida no arquivo. */
  comProblemas?: boolean;
  /** Nomes das categorias (já cadastradas pelo teste), usados em rodízio. Padrão: `CATEGORIAS_DE_EXEMPLO`. */
  categorias?: readonly string[];
  /** Nomes dos fornecedores (já cadastrados pelo teste), usados em rodízio. Padrão: `FORNECEDORES_DE_EXEMPLO`. */
  fornecedores?: readonly string[];
};

/** Os problemas que `comProblemas` acrescenta, e o que a validação deve dizer de cada um. */
export const PROBLEMAS_PROPOSITAIS = {
  custoInvalido: "Custo unitário",
  unidadeInexistente: "Unidade",
  codigoVazio: "Código",
  categoriaInexistente: "Categoria",
  repetidaNoArquivo: "Repetida no arquivo",
} as const;

export function linhasDaPlanilhaDeExemplo({
  quantidade = 300,
  prefixo = "EX-",
  comProblemas = false,
  categorias = CATEGORIAS_DE_EXEMPLO,
  fornecedores = FORNECEDORES_DE_EXEMPLO,
}: OpcoesDaPlanilha = {}): string[][] {
  const linhas: string[][] = [];
  for (let i = 1; i <= quantidade; i++) {
    const n = String(i).padStart(4, "0");
    const unidade = UNIDADES_DE_EXEMPLO[i % UNIDADES_DE_EXEMPLO.length];
    // Custo por fórmula, com vírgula e ponto de milhar quando passa de mil: exercita o formato brasileiro.
    const centavos = 1000 + ((i * 937) % 250000);
    const custo = `${Math.floor(centavos / 100).toLocaleString("pt-BR")},${String(centavos % 100).padStart(2, "0")}`;
    linhas.push([
      `${prefixo}${n}`,
      `Item de exemplo ${n}`,
      unidade,
      categorias[i % categorias.length],
      fornecedores[i % fornecedores.length],
      // Um a cada 25 itens fica SEM custo (permitido: o sistema nunca inventa preço).
      i % 25 === 0 ? "" : custo,
      unidade === "BARRA" ? "1,250" : "",
      i % 10 === 0 ? `Prateleira ${String.fromCharCode(65 + (i % 5))}${(i % 7) + 1}` : "",
    ]);
  }
  if (comProblemas) {
    const categoria = categorias[0];
    const fornecedor = fornecedores[0];
    linhas.push(
      [`${prefixo}E001`, "Custo com texto", "UN", categoria, fornecedor, "abc", "", ""],
      [`${prefixo}E002`, "Unidade que não existe", "CAIXA", categoria, fornecedor, "10,00", "", ""],
      ["", "Sem código", "UN", categoria, fornecedor, "10,00", "", ""],
      [`${prefixo}E003`, "Categoria inexistente", "UN", "Categoria que não existe", fornecedor, "10,00", "", ""],
      // Mesma chave da primeira linha boa: a primeira vale, esta é ignorada como repetida no arquivo.
      [`${prefixo}0001`, "Repetida no arquivo", "UN", categoria, fornecedor, "99,00", "", ""],
    );
  }
  return linhas;
}

/** A mesma planilha como texto CSV brasileiro (separador ";", com BOM), como o Excel salvaria. */
export function csvDaPlanilhaDeExemplo(opcoes: OpcoesDaPlanilha = {}): string {
  const celula = (v: string) => (/[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return "﻿" + [CABECALHO_DE_EXEMPLO, ...linhasDaPlanilhaDeExemplo(opcoes)].map((l) => l.map(celula).join(";")).join("\r\n") + "\r\n";
}
