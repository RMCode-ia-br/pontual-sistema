import { redirect } from "next/navigation";

import { permissoesDe, podeAlterarModulo, podeVerModulo, type Modulo, type Transversal } from "@/lib/permissoes";

import { exigirSessao, type UsuarioSessao } from "./sessao";

type OpcoesModulo = {
  /** "ver" (padrão) ou "alterar" (telas de cadastro novo e edição). */
  nivel?: "ver" | "alterar";
  /** Acessos transversais que a tela também exige (ex.: toda tela de dinheiro exige "valores"). */
  exige?: readonly Transversal[];
};

/** Para onde vai quem não tem acesso. Tela simples, nunca erro técnico nem dado vazio como se fosse zero. */
export const ROTA_SEM_ACESSO = "/sem-acesso";

/**
 * Para PÁGINAS: exige sessão e acesso a TODOS os módulos pedidos (Fase 7C, camada 2). Sem acesso, vai para `/sem-acesso`.
 * Devolve a sessão, como `exigirSessao`. Server Actions e rotas não usam isto: elas usam `can(...)` e respondem erro.
 */
export async function exigirModulo(modulos: Modulo | readonly Modulo[], opcoes: OpcoesModulo = {}): Promise<UsuarioSessao> {
  const usuario = await exigirSessao();
  const permissoes = permissoesDe(usuario);
  const lista = typeof modulos === "string" ? [modulos] : modulos;
  const verificar = opcoes.nivel === "alterar" ? podeAlterarModulo : podeVerModulo;

  const moduloOk = lista.every((m) => verificar(permissoes, m));
  const transversalOk = (opcoes.exige ?? []).every((t) => (t === "valores" ? permissoes.verValores : permissoes.verCustoMargem));
  if (!moduloOk || !transversalOk) redirect(ROTA_SEM_ACESSO);
  return usuario;
}
