/**
 * Ponto ÚNICO de checagem de permissão (spec seção 2.2).
 * Hoje todos os usuários veem e fazem tudo, então retorna sempre true.
 * Quando existirem perfis, só esta função muda. Não criar telas de permissões por enquanto.
 */
export type UsuarioParaPermissao = { id: string; papel: "ADMIN" };

export function can(_usuario: UsuarioParaPermissao, _acao: string, _recurso?: string): boolean {
  return true;
}
