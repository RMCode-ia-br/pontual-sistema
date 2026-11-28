import "server-only";

import { prisma } from "@/lib/db";
import { ajustesPermissaoSchema, PAPEIS, permissoesEfetivas, type AjustesPermissao, type Papel, type PermissoesEfetivas } from "@/lib/dominio/permissoes";

export type UsuarioLista = {
  id: string;
  nome: string;
  login: string;
  email: string | null;
  ativo: boolean;
  precisaTrocarSenha: boolean;
  ultimoLoginEm: string | null;
  papel: Papel;
  /** Ajuste guardado já validado (null = perfil puro). */
  ajustes: AjustesPermissao | null;
  /** Permissões efetivas (perfil + ajuste), dados simples para a tela; `ajustesInvalidos` avisa ajuste fora do formato. */
  permissoes: PermissoesEfetivas;
};

export async function listarUsuarios(): Promise<UsuarioLista[]> {
  const usuarios = await prisma.usuario.findMany({
    where: { deletadoEm: null },
    orderBy: [{ ativo: "desc" }, { nome: "asc" }],
    select: { id: true, nome: true, login: true, email: true, ativo: true, precisaTrocarSenha: true, ultimoLoginEm: true, papel: true, ajustesPermissao: true },
  });
  return usuarios.map(({ ajustesPermissao, papel, ultimoLoginEm, ...u }) => {
    const lido = ajustesPermissao === null ? null : ajustesPermissaoSchema.safeParse(ajustesPermissao);
    return {
      ...u,
      ultimoLoginEm: ultimoLoginEm?.toISOString() ?? null,
      papel: (PAPEIS as readonly string[]).includes(papel) ? (papel as Papel) : "CAMPO",
      ajustes: lido && lido.success ? lido.data : null,
      permissoes: permissoesEfetivas(papel, ajustesPermissao),
    };
  });
}
