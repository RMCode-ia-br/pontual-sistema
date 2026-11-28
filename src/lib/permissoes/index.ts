import { decidir, permissoesEfetivas, type PermissoesEfetivas } from "@/lib/dominio/permissoes";

export * from "@/lib/dominio/permissoes";

/**
 * Ponto ÚNICO de checagem de permissão (Fase 7C; a regra em si é pura e fica em `src/lib/dominio/permissoes.ts`).
 *
 * Quem chama passa a sessão (ou qualquer ator com `papel`). `permissoes` já calculadas (sessão) são usadas como estão;
 * sem elas, calcula-se a partir de `papel` + `ajustesPermissao`. Ponto de extensão da Parte A (chave de API com escopo):
 * um ator de API entra aqui trazendo `permissoes` próprias, sem passar por papel.
 */
export type UsuarioParaPermissao = {
  id: string;
  papel: string;
  ajustesPermissao?: unknown;
  permissoes?: PermissoesEfetivas;
};

/** Permissões efetivas de um ator (as da sessão, ou calculadas na hora). */
export function permissoesDe(usuario: UsuarioParaPermissao): PermissoesEfetivas {
  return usuario.permissoes ?? permissoesEfetivas(usuario.papel, usuario.ajustesPermissao);
}

/**
 * Ações destrutivas mais graves: desfazem trabalho já feito (parcelas, etapas, tarefas, valor vendido). O nível "destrutivo"
 * vem do verbo (`NIVEL_DO_VERBO` em `src/lib/dominio/permissoes.ts`); esta lista documenta os casos graves para a interface.
 */
export const ACOES_DESTRUTIVAS: readonly { acao: string; recurso: string; descricao: string }[] = [
  { acao: "desfazer", recurso: "aprovacao", descricao: "Desfazer ou trocar a aprovação de uma proposta (cancela parcelas, etapas e tarefas geradas e tira a venda do mês)." },
];

export function can(usuario: UsuarioParaPermissao, acao: string, recurso?: string): boolean {
  return decidir(permissoesDe(usuario), acao, recurso);
}
