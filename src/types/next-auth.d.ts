import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    versaoSessao?: number;
  }
  interface Session {
    user: {
      id: string;
      versaoSessao: number;
      /** Id do login (aparelho); ausente em tokens emitidos antes do Bloco 0 da Fase 4. */
      sid?: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    versaoSessao?: number;
    sid?: string;
  }
}
