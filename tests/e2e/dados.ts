/** Usuário exclusivo dos testes E2E (criado no setup e removido no teardown). Nunca é o admin real. */
export const USUARIO_E2E = {
  login: "e2e-usuario",
  nome: "Usuário de Teste E2E",
  senhaProvisoria: "Provisoria-E2E-1",
  senhaNova: "Nova-Senha-E2E-2",
};

/** Segundo usuário, criado pela própria interface durante os testes de Usuários. */
export const USUARIO_E2E_NOVO = {
  login: "e2e-novo",
  nome: "Novo E2E",
  senhaDefinitiva: "Definitiva-E2E-3",
};

/** Usuários de PERFIL (Fase 7C), inseridos direto no banco pelo teste de perfis e removidos pela limpeza geral. */
export const USUARIO_E2E_ESCRITORIO = { login: "e2e-escritorio", nome: "E2E Escritório", senha: "Escritorio-E2E-4" };
export const USUARIO_E2E_CAMPO = { login: "e2e-campo", nome: "E2E Campo", senha: "Campo-E2E-5" };

/** Todos os logins que os testes podem criar (a limpeza só apaga estes). */
export const LOGINS_E2E = [USUARIO_E2E.login, USUARIO_E2E_NOVO.login, USUARIO_E2E_ESCRITORIO.login, USUARIO_E2E_CAMPO.login];

/** Cada teste usa um IP próprio (via x-forwarded-for) para o bloqueio por IP não vazar entre testes. */
export function ipFalso(sufixo: number): string {
  return `198.51.100.${sufixo}`; // faixa reservada para documentação (RFC 5737)
}
