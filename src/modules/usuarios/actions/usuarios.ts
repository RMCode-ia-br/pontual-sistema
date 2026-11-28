"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { ErroNegocio, executar, falha, falhaDeValidacao, formDataParaObjeto, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { registrarAuditoria } from "@/lib/auditoria";
import { extrairIp } from "@/lib/auth/autenticar";
import { gerarHashSenha, gerarSenhaTemporaria } from "@/lib/auth/senha";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { can, contarAdministradoresAtivos, ehAdministrador, permissoesEfetivas } from "@/lib/permissoes";

import { alterarPermissoesSchema, criarUsuarioSchema, editarUsuarioSchema, idSchema } from "../schemas";

export type SenhaTemporaria = { login: string; senhaTemporaria: string };

const CAMINHO = "/configuracoes/usuarios";

const camposUsuario = { id: true, nome: true, login: true, email: true, ativo: true, precisaTrocarSenha: true, papel: true, ajustesPermissao: true } as const;

/** Usuários ativos com o que importa para saber quem é administrador (lidos DENTRO da transação, depois do lock). */
async function usuariosAtivosParaAdministracao(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) {
  return tx.usuario.findMany({ where: { ativo: true, deletadoEm: null }, select: { id: true, ativo: true, papel: true, ajustesPermissao: true } });
}

/**
 * Bloqueia a linha de todos os usuários ativos até o fim da transação. Sem isso, dois
 * administradores desativando um ao outro ao mesmo tempo passariam na checagem e o
 * sistema ficaria sem nenhum usuário ativo.
 */
async function travarUsuariosAtivos(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) {
  await tx.$queryRaw`SELECT id FROM "Usuario" WHERE ativo = true AND "deletadoEm" IS NULL FOR UPDATE`;
}

export async function criarUsuario(_anterior: ResultadoAcao<SenhaTemporaria> | null, formData: FormData): Promise<ResultadoAcao<SenhaTemporaria>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "criar", "usuario")) return falha("Sem permissão.");

  const dados = criarUsuarioSchema.safeParse(formDataParaObjeto(formData));
  if (!dados.success) return falhaDeValidacao(dados.error);

  return executar(
    "usuarios.criar",
    async () => {
      const senhaTemporaria = gerarSenhaTemporaria();
      const senhaHash = await gerarHashSenha(senhaTemporaria);
      const ip = extrairIp(await headers());

      const criado = await prisma.$transaction(async (tx) => {
        const novo = await tx.usuario.create({
          data: {
            nome: dados.data.nome,
            login: dados.data.login,
            email: dados.data.email ?? null,
            senhaHash,
            papel: dados.data.papel,
            precisaTrocarSenha: true,
            criadoPorId: sessao.id,
            atualizadoPorId: sessao.id,
          },
          select: camposUsuario,
        });
        await registrarAuditoria(tx, { usuario: sessao, entidade: "Usuario", entidadeId: novo.id, acao: "CRIAR", depois: novo, ip });
        return novo;
      });

      revalidatePath(CAMINHO);
      return sucesso({ login: criado.login, senhaTemporaria });
    },
    "Já existe um usuário com esse login ou e-mail.",
  );
}

export async function editarUsuario(_anterior: ResultadoAcao | null, formData: FormData): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "usuario")) return falha("Sem permissão.");

  const dados = editarUsuarioSchema.safeParse(formDataParaObjeto(formData));
  if (!dados.success) return falhaDeValidacao(dados.error);

  return executar(
    "usuarios.editar",
    async () => {
      const ip = extrairIp(await headers());
      await prisma.$transaction(async (tx) => {
        const antes = await tx.usuario.findFirst({ where: { id: dados.data.id, deletadoEm: null }, select: camposUsuario });
        if (!antes) throw new ErroNegocio("Usuário não encontrado.");

        const depois = await tx.usuario.update({
          where: { id: antes.id },
          data: { nome: dados.data.nome, email: dados.data.email ?? null, atualizadoPorId: sessao.id },
          select: camposUsuario,
        });
        await registrarAuditoria(tx, { usuario: sessao, entidade: "Usuario", entidadeId: antes.id, acao: "ATUALIZAR", antes, depois, ip });
      });
      revalidatePath(CAMINHO);
      return sucesso(undefined, "Usuário atualizado.");
    },
    "Já existe um usuário com esse e-mail.",
  );
}

export async function alternarAtivoUsuario(idBruto: string, ativo: boolean): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, ativo ? "ativar" : "desativar", "usuario")) return falha("Sem permissão.");

  const id = idSchema.safeParse(idBruto);
  if (!id.success) return falha("Usuário inválido.");

  return executar("usuarios.alternarAtivo", async () => {
    if (!ativo && id.data === sessao.id) {
      throw new ErroNegocio("Você não pode desativar o seu próprio usuário. Peça a outra pessoa da gestão.");
    }
    const ip = extrairIp(await headers());

    await prisma.$transaction(async (tx) => {
      await travarUsuariosAtivos(tx);

      const antes = await tx.usuario.findFirst({ where: { id: id.data, deletadoEm: null }, select: camposUsuario });
      if (!antes) throw new ErroNegocio("Usuário não encontrado.");
      if (antes.ativo === ativo) return;

      if (!ativo) {
        const outrosAtivos = await tx.usuario.count({ where: { ativo: true, deletadoEm: null, id: { not: antes.id } } });
        if (outrosAtivos === 0) throw new ErroNegocio("Não é possível desativar o último usuário ativo.");
        // Nunca ficar sem administrador ativo (decisão 179).
        const eraAdministrador = ehAdministrador(permissoesEfetivas(antes.papel, antes.ajustesPermissao));
        if (eraAdministrador && contarAdministradoresAtivos(await usuariosAtivosParaAdministracao(tx), { id: antes.id, ativo: false }) === 0) {
          throw new ErroNegocio("Não é possível desativar o último administrador ativo. Dê o perfil de administrador a outra pessoa antes.");
        }
      }

      const depois = await tx.usuario.update({
        where: { id: antes.id },
        data: {
          ativo,
          // Desativar derruba as sessões abertas de forma definitiva (reativar não as ressuscita).
          ...(ativo ? {} : { versaoSessao: { increment: 1 } }),
          atualizadoPorId: sessao.id,
        },
        select: camposUsuario,
      });
      await registrarAuditoria(tx, {
        usuario: sessao,
        entidade: "Usuario",
        entidadeId: antes.id,
        acao: ativo ? "ATIVAR" : "DESATIVAR",
        antes,
        depois,
        ip,
      });
    });

    revalidatePath(CAMINHO);
    return sucesso(undefined, ativo ? "Usuário ativado." : "Usuário desativado.");
  });
}

/**
 * Troca o perfil e os ajustes por módulo de um usuário. Tudo ou nada, sob o lock dos usuários ativos: não deixa o sistema sem
 * administrador (nem a própria pessoa se rebaixar sendo a última), derruba as sessões da pessoa (`versaoSessao` + 1, vale na
 * hora) e grava no `LogAuditoria` o perfil e o ajuste de antes e de depois.
 */
export async function alterarPermissoesUsuario(entrada: unknown): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "usuario")) return falha("Sem permissão.");

  const dados = alterarPermissoesSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error);
  const { id, papel, ajustes } = dados.data;

  return executar("usuarios.alterarPermissoes", async () => {
    const ip = extrairIp(await headers());
    await prisma.$transaction(async (tx) => {
      await travarUsuariosAtivos(tx);

      const antes = await tx.usuario.findFirst({ where: { id, deletadoEm: null }, select: camposUsuario });
      if (!antes) throw new ErroNegocio("Usuário não encontrado.");

      if (antes.ativo) {
        const eraAdministrador = ehAdministrador(permissoesEfetivas(antes.papel, antes.ajustesPermissao));
        const seraAdministrador = ehAdministrador(permissoesEfetivas(papel, ajustes));
        if (eraAdministrador && !seraAdministrador && contarAdministradoresAtivos(await usuariosAtivosParaAdministracao(tx), { id, papel, ajustesPermissao: ajustes }) === 0) {
          throw new ErroNegocio(
            id === sessao.id
              ? "Você é o último administrador: não pode tirar o próprio acesso a Configurações. Dê o perfil de administrador a outra pessoa antes."
              : "Esta pessoa é o último administrador: não dá para tirar o acesso dela a Configurações. Dê o perfil de administrador a outra pessoa antes.",
          );
        }
      }

      const depois = await tx.usuario.update({
        where: { id },
        data: {
          papel,
          ajustesPermissao: ajustes === null ? Prisma.JsonNull : ajustes,
          // Vale na hora: a sessão aberta da pessoa cai e ela entra de novo já com o acesso novo.
          versaoSessao: { increment: 1 },
          atualizadoPorId: sessao.id,
        },
        select: camposUsuario,
      });
      await registrarAuditoria(tx, { usuario: sessao, entidade: "Usuario", entidadeId: id, acao: "ALTERAR_PERMISSOES", antes, depois, ip });
    });

    revalidatePath(CAMINHO);
    return sucesso(undefined, "Permissões atualizadas. A pessoa precisa entrar de novo.");
  });
}

export async function redefinirSenhaUsuario(idBruto: string): Promise<ResultadoAcao<SenhaTemporaria>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "redefinir-senha", "usuario")) return falha("Sem permissão.");

  const id = idSchema.safeParse(idBruto);
  if (!id.success) return falha("Usuário inválido.");

  return executar("usuarios.redefinirSenha", async () => {
    if (id.data === sessao.id) {
      throw new ErroNegocio("Para trocar a sua própria senha, use a opção “Trocar senha” no menu do seu perfil.");
    }
    const senhaTemporaria = gerarSenhaTemporaria();
    const senhaHash = await gerarHashSenha(senhaTemporaria);
    const ip = extrairIp(await headers());

    const login = await prisma.$transaction(async (tx) => {
      const alvo = await tx.usuario.findFirst({ where: { id: id.data, deletadoEm: null }, select: { id: true, login: true } });
      if (!alvo) throw new ErroNegocio("Usuário não encontrado.");

      await tx.usuario.update({
        where: { id: alvo.id },
        data: { senhaHash, precisaTrocarSenha: true, versaoSessao: { increment: 1 }, atualizadoPorId: sessao.id },
      });
      // O hash nunca vai para a auditoria (sanitizado), mas nem é passado aqui.
      await registrarAuditoria(tx, {
        usuario: sessao,
        entidade: "Usuario",
        entidadeId: alvo.id,
        acao: "REDEFINIR_SENHA",
        depois: { precisaTrocarSenha: true },
        ip,
      });
      return alvo.login;
    });

    revalidatePath(CAMINHO);
    return sucesso({ login, senhaTemporaria });
  });
}
