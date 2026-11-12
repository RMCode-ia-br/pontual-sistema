import NextAuth from "next-auth";

import { authConfig } from "@/lib/auth/config";

// Proxy (antigo middleware, Next 16). Usa só a configuração compatível com Edge:
// redireciona ao /login quem não tem sessão. A validação completa (usuário ativo,
// versaoSessao, troca de senha pendente) acontece no servidor, em exigirSessao().
const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  // Ignora arquivos estáticos, imagens do Next e arquivos públicos do PWA e do navegador (favicon, ícones).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|manifest.webmanifest|icons/|sw.js).*)"],
};
