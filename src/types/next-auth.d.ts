import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    versaoSessao?: number;
  }
  interface Session {
    user: {
      id: string;
      versaoSessao: number;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    versaoSessao?: number;
  }
}
