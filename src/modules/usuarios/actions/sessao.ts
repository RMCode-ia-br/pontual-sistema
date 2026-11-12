"use server";

import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { registrarAuditoria } from "@/lib/auditoria";
import { extrairIp, resolverConta, statusBloqueioLogin } from "@/lib/auth/autenticar";
import { auth, signIn, signOut } from "@/lib/auth";
import { SESSAO_MAX_IDADE_SEGUNDOS } from "@/lib/auth/config";
import { destinoSeguro } from "@/lib/auth/destino";
import { conferirSenha, gerarHashSenha, validarPoliticaSenha } from "@/lib/auth/senha";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";

export type EstadoFormulario = { erro?: string; campos?: Record<string, string> };

const loginSchema = z.object({
  login: z.string().trim().min(1, "Informe o usuário.").max(254),
  senha: z.string().min(1, "Informe a senha.").max(200),
  destino: z.string().max(500).optional(),
});

export async function entrar(_anterior: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const dados = loginSchema.safeParse(Object.fromEntries(formData));
  if (!dados.success) {
    return { erro: dados.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const { login, senha, destino } = dados.data;
  const ip = extrairIp(await headers());

  // O mesmo bloqueio também é aplicado dentro do authorize(); aqui só serve para dar a mensagem certa.
  const bloqueio = await statusBloqueioLogin(await resolverConta(login), ip);
  if (bloqueio.bloqueado) {
    return {
      erro: `Muitas tentativas. Tente novamente em ${bloqueio.minutosRestantes} minuto${bloqueio.minutosRestantes > 1 ? "s" : ""}.`,
      campos: { login },
    };
  }

  try {
    await signIn("credentials", { login, senha, redirect: false });
  } catch (erro) {
    if (erro instanceof AuthError) {
      // Só "credencial inválida" vira esse aviso; falha de infraestrutura (ex.: banco fora do ar) não pode
      // fingir que a senha está errada, senão a pessoa insiste sem saber que o problema é do sistema.
      if (erro.type === "CredentialsSignin") return { erro: "Usuário ou senha inválidos.", campos: { login } };
      console.error(JSON.stringify({ evento: "auth.indisponivel", tipo: erro.type }));
      return { erro: "Não foi possível entrar agora. Tente novamente em instantes.", campos: { login } };
    }
    throw erro;
  }

  redirect(destinoSeguro(destino));
}

/**
 * Apagar o cookie não basta: o proxy renova o cookie em toda requisição, e uma resposta que termina
 * depois do logout o devolve ao navegador. Por isso o `sid` deste login é revogado no servidor
 * (só este aparelho; os outros continuam). A falha em revogar não impede de sair.
 */
export async function sair(): Promise<void> {
  try {
    const sessao = await auth();
    const sid = sessao?.user?.sid;
    const usuarioId = sessao?.user?.id;
    if (sid && usuarioId) {
      // O token vale no máximo SESSAO_MAX_IDADE_SEGUNDOS a partir da última renovação: depois disso a linha é inútil.
      const expiraEm = new Date(Date.now() + SESSAO_MAX_IDADE_SEGUNDOS * 1000);
      await prisma.sessaoRevogada.upsert({ where: { sid }, create: { sid, usuarioId, expiraEm }, update: {} });
    }
  } catch (erro) {
    console.error(JSON.stringify({ evento: "auth.sair_sem_revogar", tipo: erro instanceof Error ? erro.name : "desconhecido" }));
  }
  await signOut({ redirectTo: "/login" });
}

const trocaSchema = z
  .object({
    senhaAtual: z.string().min(1, "Informe a senha atual.").max(200),
    novaSenha: z.string().max(200),
    confirmacao: z.string().max(200),
  })
  .refine((d) => d.novaSenha === d.confirmacao, { message: "A confirmação não confere com a nova senha.", path: ["confirmacao"] });

export async function trocarSenha(_anterior: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  // Única ação que aceita usuário com troca de senha pendente.
  const usuario = await exigirSessao({ permitirTrocaPendente: true });

  const dados = trocaSchema.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { erro: dados.error.issues[0]?.message ?? "Dados inválidos." };
  const { senhaAtual, novaSenha } = dados.data;

  const ip = extrairIp(await headers());

  // Quem erra a senha atual repetidamente entra no mesmo bloqueio do login.
  const bloqueio = await statusBloqueioLogin(usuario.login, ip);
  if (bloqueio.bloqueado) {
    return { erro: `Muitas tentativas. Tente novamente em ${bloqueio.minutosRestantes} minuto(s).` };
  }

  const registro = await prisma.usuario.findUnique({ where: { id: usuario.id }, select: { senhaHash: true } });
  if (!registro || !(await conferirSenha(senhaAtual, registro.senhaHash))) {
    await prisma.tentativaLogin.create({ data: { identificador: usuario.login, ip, sucesso: false } });
    return { erro: "A senha atual está incorreta." };
  }

  const politica = validarPoliticaSenha(novaSenha);
  if (!politica.valida) return { erro: politica.motivo };

  if (novaSenha === senhaAtual) return { erro: "A nova senha deve ser diferente da atual." };

  const senhaHash = await gerarHashSenha(novaSenha);

  await prisma.$transaction(async (tx) => {
    await tx.usuario.update({
      where: { id: usuario.id },
      data: {
        senhaHash,
        precisaTrocarSenha: false,
        // Invalida todas as sessões abertas (inclusive esta): será preciso entrar de novo.
        versaoSessao: { increment: 1 },
        atualizadoPorId: usuario.id,
      },
    });
    await registrarAuditoria(tx, {
      usuario,
      entidade: "Usuario",
      entidadeId: usuario.id,
      acao: "TROCAR_SENHA",
      depois: { precisaTrocarSenha: false },
      ip,
    });
  });

  await signOut({ redirectTo: "/login?senha=alterada" });
  return {};
}
