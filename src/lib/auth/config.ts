import type { NextAuthConfig } from "next-auth";

/**
 * Parte da configuração do Auth.js compatível com Edge (usada pelo proxy.ts).
 * NÃO importar Prisma, bcrypt ou qualquer código de Node aqui.
 * O provedor Credentials (que usa o banco) fica em ./index.ts.
 */

/** Caminhos acessíveis sem sessão. */
export const ROTAS_PUBLICAS = ["/login", "/api/auth", "/api/health", "/api/public", "/api/cron", "/api/v1"];

export function rotaEhPublica(caminho: string): boolean {
  return ROTAS_PUBLICAS.some((p) => caminho === p || caminho.startsWith(`${p}/`));
}

export const SESSAO_MAX_IDADE_SEGUNDOS = 8 * 60 * 60;

export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: SESSAO_MAX_IDADE_SEGUNDOS },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const caminho = request.nextUrl.pathname;
      if (rotaEhPublica(caminho)) return true;
      // Retornar false redireciona para pages.signIn. A checagem de "usuário ativo" e de
      // versaoSessao é feita no servidor (exigirSessao), pois o Edge não acessa o banco.
      return !!auth?.user;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.versaoSessao = user.versaoSessao;
        // Identifica ESTE login (aparelho). "Sair" grava o sid em SessaoRevogada. O Web Crypto existe no Edge.
        token.sid = crypto.randomUUID();
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.versaoSessao = token.versaoSessao as number;
        session.user.sid = token.sid as string | undefined;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
