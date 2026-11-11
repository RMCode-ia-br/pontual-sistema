/** Cadastros que vão para a lixeira (exclusão lógica) e podem ser restaurados. */
export const TIPOS_DA_LIXEIRA = ["clientes", "fornecedores", "funcionarios", "produtos", "equipes"] as const;
export type TipoDaLixeira = (typeof TIPOS_DA_LIXEIRA)[number];

export const ROTULO_LIXEIRA: Record<TipoDaLixeira, string> = {
  clientes: "Clientes",
  fornecedores: "Fornecedores",
  funcionarios: "Funcionários",
  produtos: "Produtos",
  equipes: "Equipes",
};

export const ENTIDADE_AUDITORIA: Record<TipoDaLixeira, string> = {
  clientes: "Cliente",
  fornecedores: "Fornecedor",
  funcionarios: "Funcionario",
  produtos: "Produto",
  equipes: "Equipe",
};

export function lerTipoDaLixeira(valor: string | undefined): TipoDaLixeira {
  return (TIPOS_DA_LIXEIRA as readonly string[]).includes(valor ?? "") ? (valor as TipoDaLixeira) : "clientes";
}
