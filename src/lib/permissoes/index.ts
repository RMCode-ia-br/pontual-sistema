/**
 * Ponto ÚNICO de checagem de permissão (spec seção 2.2).
 * Hoje todos os usuários veem e fazem tudo, então retorna sempre true.
 * Quando existirem perfis, só esta função muda. Não criar telas de permissões por enquanto.
 */
export type UsuarioParaPermissao = { id: string; papel: "ADMIN" | "ESCRITORIO" | "CAMPO" };

/**
 * Ações destrutivas: desfazem trabalho já feito (parcelas, etapas, tarefas, valor vendido). Hoje `can` libera tudo;
 * a Fase 7C decide quem pode. Ficam listadas aqui para a 7C encontrar sem caçar no código.
 */
export const ACOES_DESTRUTIVAS: readonly { acao: string; recurso: string; descricao: string }[] = [
  { acao: "desfazer", recurso: "aprovacao", descricao: "Desfazer ou trocar a aprovação de uma proposta (cancela parcelas, etapas e tarefas geradas e tira a venda do mês)." },
];

export function can(usuario: UsuarioParaPermissao, _acao: string, _recurso?: string): boolean {
  // Provisório até o Bloco 2 da Fase 7C: só o perfil ADMIN (Dono/Gestão) tem acesso; os outros perfis nascem fechados.
  return usuario.papel === "ADMIN";
}
