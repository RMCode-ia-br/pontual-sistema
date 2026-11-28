import { can, type UsuarioParaPermissao } from "@/lib/permissoes";

/**
 * Ações em lote de uma lista (Inativar, Reativar, Enviar à lixeira) que a pessoa PODE usar (Fase 7C). Botão que sempre
 * responderia "Sem permissão" não aparece. O servidor continua conferindo `can` em cada ação.
 */
export type PermissoesDaLista = { inativar: boolean; reativar: boolean; excluir: boolean; exportar: boolean };

/** Permissões da lista de um cadastro (recurso do mapeamento: cliente, fornecedor, funcionario, produto, projeto...). */
export function permissoesDaLista(usuario: UsuarioParaPermissao, recurso: string): PermissoesDaLista {
  // O CSV de clientes traz CPF/CNPJ e e-mail: só sai para quem EDITA Clientes (quem só consulta não exporta).
  const exportar = recurso === "cliente" ? can(usuario, "editar", recurso) : can(usuario, "ver", recurso);
  return { inativar: can(usuario, "inativar", recurso), reativar: can(usuario, "reativar", recurso), excluir: can(usuario, "excluir", recurso), exportar };
}

const ROTULO_DA_ACAO: Record<string, "inativar" | "reativar" | "excluir"> = { Inativar: "inativar", Reativar: "reativar", "Enviar à lixeira": "excluir" };

/** Tira da lista as ações em lote que a pessoa não pode usar; ação de rótulo desconhecido some (falha fechada). */
export function acoesPermitidas<T extends { rotulo: string }>(acoes: readonly T[], permitidas: PermissoesDaLista): T[] {
  return acoes.filter((a) => {
    const chave = ROTULO_DA_ACAO[a.rotulo];
    return chave ? permitidas[chave] : false;
  });
}
