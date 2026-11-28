import { cache } from "react";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";

import { permissoesEfetivas, type Papel, type PermissoesEfetivas } from "@/lib/dominio/permissoes";
import { auth } from "./index";

export type UsuarioSessao = {
  id: string;
  nome: string;
  login: string;
  email: string | null;
  papel: Papel;
  /** Permissões efetivas (perfil + ajustes), calculadas a cada requisição. Quem monta uma sessão à mão (teste) pode omitir: `can` calcula pelo papel. */
  permissoes?: PermissoesEfetivas;
  precisaTrocarSenha: boolean;
};

/**
 * Lê a sessão (JWT) e CONFIRMA NO BANCO que o usuário existe, está ativo e que a
 * versaoSessao do token confere. Assim, desativar o usuário ou trocar/redefinir a senha
 * invalida as sessões antigas imediatamente. Uma consulta por requisição (cache do React).
 */
export const obterUsuarioAtual = cache(async (): Promise<UsuarioSessao | null> => {
  const sessao = await auth();
  const id = sessao?.user?.id;
  if (!id) return null;

  const sid = sessao.user.sid;
  const usuario = await prisma.usuario.findUnique({
    where: { id },
    select: {
      id: true,
      nome: true,
      login: true,
      email: true,
      papel: true,
      ajustesPermissao: true,
      ativo: true,
      deletadoEm: true,
      versaoSessao: true,
      precisaTrocarSenha: true,
      // Mesma ida ao banco: o token deste aparelho foi revogado por "Sair"? (token antigo, sem sid, não é revogável)
      sessoesRevogadas: sid ? { where: { sid }, select: { sid: true }, take: 1 } : false,
    },
  });

  if (!usuario || !usuario.ativo || usuario.deletadoEm) return null;
  if (usuario.versaoSessao !== sessao.user.versaoSessao) return null;
  if (usuario.sessoesRevogadas && usuario.sessoesRevogadas.length > 0) return null;

  const permissoes = permissoesEfetivas(usuario.papel, usuario.ajustesPermissao);
  if (permissoes.ajustesInvalidos) {
    // Ajuste guardado fora do formato (edição manual no banco): falha fechada. Só o id vai para o log, nunca o conteúdo.
    console.error(`[permissoes] ajustesPermissao inválido para o usuário ${usuario.id} (papel ${usuario.papel}): ${usuario.papel === "ADMIN" ? "perfil puro aplicado" : "acesso fechado"}`);
  }

  return {
    id: usuario.id,
    nome: usuario.nome,
    login: usuario.login,
    email: usuario.email,
    papel: usuario.papel,
    permissoes,
    precisaTrocarSenha: usuario.precisaTrocarSenha,
  };
});

type OpcoesSessao = {
  /** Só a tela de troca de senha deve permitir o usuário com troca pendente. */
  permitirTrocaPendente?: boolean;
};

/**
 * Para páginas e Server Actions: exige sessão válida (senão vai ao login) e, por padrão,
 * obriga a troca de senha pendente. Deve ser chamada em TODA ação, não só no proxy.
 */
export async function exigirSessao(opcoes: OpcoesSessao = {}): Promise<UsuarioSessao> {
  const usuario = await obterUsuarioAtual();
  if (!usuario) redirect("/login");
  if (usuario.precisaTrocarSenha && !opcoes.permitirTrocaPendente) redirect("/trocar-senha");
  return usuario;
}

/** Para Route Handlers: devolve null (o handler responde 401) em vez de redirecionar. */
export async function sessaoParaApi(): Promise<UsuarioSessao | null> {
  const usuario = await obterUsuarioAtual();
  if (!usuario || usuario.precisaTrocarSenha) return null;
  return usuario;
}
