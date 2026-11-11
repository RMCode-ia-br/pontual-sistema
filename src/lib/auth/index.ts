import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import { autenticar, extrairIp } from "./autenticar";
import { authConfig } from "./config";

const credenciaisSchema = z.object({
  login: z.string().min(1).max(254),
  senha: z.string().min(1).max(200),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  logger: {
    // Senha errada é esperada: uma linha curta, sem stack trace. Nunca registra credenciais.
    error(erro) {
      const tipo = (erro as { type?: string }).type ?? erro.name;
      if (tipo === "CredentialsSignin") {
        console.warn(JSON.stringify({ evento: "auth.login_falhou" }));
        return;
      }
      console.error(JSON.stringify({ evento: "auth.erro", tipo }));
    },
  },
  providers: [
    Credentials({
      credentials: {
        login: { label: "Usuário" },
        senha: { label: "Senha", type: "password" },
      },
      async authorize(credenciais, request) {
        const dados = credenciaisSchema.safeParse(credenciais);
        if (!dados.success) return null;

        const resultado = await autenticar(dados.data.login, dados.data.senha, extrairIp(request.headers));
        if (!resultado.ok) return null;

        const { usuario } = resultado;
        return {
          id: usuario.id,
          name: usuario.nome,
          email: usuario.email,
          versaoSessao: usuario.versaoSessao,
        };
      },
    }),
  ],
});
