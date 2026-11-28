/** Cadastros que vão para a lixeira (exclusão lógica) e podem ser restaurados. */
export const TIPOS_DA_LIXEIRA = ["clientes", "fornecedores", "funcionarios", "produtos", "equipes", "projetos"] as const;
export type TipoDaLixeira = (typeof TIPOS_DA_LIXEIRA)[number];

export const ROTULO_LIXEIRA: Record<TipoDaLixeira, string> = {
  clientes: "Clientes",
  fornecedores: "Fornecedores",
  funcionarios: "Funcionários",
  produtos: "Produtos",
  equipes: "Equipes",
  projetos: "Projetos",
};

export const ENTIDADE_AUDITORIA: Record<TipoDaLixeira, string> = {
  clientes: "Cliente",
  fornecedores: "Fornecedor",
  funcionarios: "Funcionario",
  produtos: "Produto",
  equipes: "Equipe",
  projetos: "Projeto",
};

export function lerTipoDaLixeira(valor: string | undefined): TipoDaLixeira {
  return (TIPOS_DA_LIXEIRA as readonly string[]).includes(valor ?? "") ? (valor as TipoDaLixeira) : "clientes";
}

/** Recurso de permissão de cada tipo (`src/lib/dominio/permissoes.ts`): restaurar exige poder alterar o módulo dele. */
export const RECURSO_DA_LIXEIRA: Record<TipoDaLixeira, string> = {
  clientes: "cliente",
  fornecedores: "fornecedor",
  funcionarios: "funcionario",
  produtos: "produto",
  equipes: "equipe",
  projetos: "projeto",
};
