import "server-only";

import { prisma } from "@/lib/db";

export type UsuarioLista = {
  id: string;
  nome: string;
  login: string;
  email: string | null;
  ativo: boolean;
  precisaTrocarSenha: boolean;
  ultimoLoginEm: string | null;
};

export async function listarUsuarios(): Promise<UsuarioLista[]> {
  const usuarios = await prisma.usuario.findMany({
    where: { deletadoEm: null },
    orderBy: [{ ativo: "desc" }, { nome: "asc" }],
    select: { id: true, nome: true, login: true, email: true, ativo: true, precisaTrocarSenha: true, ultimoLoginEm: true },
  });
  return usuarios.map((u) => ({ ...u, ultimoLoginEm: u.ultimoLoginEm?.toISOString() ?? null }));
}
