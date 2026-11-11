import { prisma } from "@/lib/db";

import { avaliarBloqueio, JANELA_MS, type StatusBloqueio } from "./bloqueio";
import { conferirSenha, conferirSenhaFalsa } from "./senha";

export type UsuarioAutenticado = {
  id: string;
  nome: string;
  login: string;
  email: string | null;
  versaoSessao: number;
};

export type ResultadoAutenticacao =
  | { ok: true; usuario: UsuarioAutenticado }
  | { ok: false; motivo: "invalido" }
  | { ok: false; motivo: "bloqueado"; minutosRestantes: number };

/** Login e e-mail não diferenciam maiúsculas. */
export function normalizarIdentificador(valor: string): string {
  return valor.trim().toLowerCase().slice(0, 254);
}

type ChaveTentativa = { identificador: string } | { ip: string };

async function falhasRecentes(chave: ChaveTentativa, agora: Date): Promise<Date[]> {
  const inicioJanela = new Date(agora.getTime() - JANELA_MS);

  // Falhas anteriores a um login bem-sucedido não contam.
  const ultimoSucesso = await prisma.tentativaLogin.findFirst({
    where: { ...chave, sucesso: true, criadoEm: { gt: inicioJanela } },
    orderBy: { criadoEm: "desc" },
    select: { criadoEm: true },
  });

  const desde = ultimoSucesso && ultimoSucesso.criadoEm > inicioJanela ? ultimoSucesso.criadoEm : inicioJanela;

  const falhas = await prisma.tentativaLogin.findMany({
    where: { ...chave, sucesso: false, criadoEm: { gt: desde } },
    select: { criadoEm: true },
    orderBy: { criadoEm: "desc" },
    take: 50,
  });
  return falhas.map((f) => f.criadoEm);
}

/** Bloqueio por login/e-mail OU por IP: vale o que terminar mais tarde. */
export async function statusBloqueioLogin(
  identificador: string,
  ip: string,
  agora: Date = new Date(),
): Promise<StatusBloqueio> {
  const [porIdentificador, porIp] = await Promise.all([
    falhasRecentes({ identificador }, agora).then((f) => avaliarBloqueio(f, agora)),
    falhasRecentes({ ip }, agora).then((f) => avaliarBloqueio(f, agora)),
  ]);

  if (porIdentificador.bloqueado && porIp.bloqueado) {
    return porIdentificador.ate >= porIp.ate ? porIdentificador : porIp;
  }
  return porIdentificador.bloqueado ? porIdentificador : porIp;
}

/**
 * Valida usuário e senha aplicando o bloqueio por tentativas (5 falhas em 15 min).
 * Todas as falhas devolvem o mesmo motivo "invalido" (não revela se o login existe) e
 * o tempo de resposta é igualado quando o usuário não existe.
 */
export async function autenticar(
  identificadorBruto: string,
  senha: string,
  ip: string,
): Promise<ResultadoAutenticacao> {
  const identificador = normalizarIdentificador(identificadorBruto);
  if (!identificador || !senha) return { ok: false, motivo: "invalido" };

  const bloqueio = await statusBloqueioLogin(identificador, ip);
  if (bloqueio.bloqueado) {
    return { ok: false, motivo: "bloqueado", minutosRestantes: bloqueio.minutosRestantes };
  }

  const usuario = await prisma.usuario.findFirst({
    where: { OR: [{ login: identificador }, { email: identificador }], deletadoEm: null },
    select: { id: true, nome: true, login: true, email: true, senhaHash: true, ativo: true, versaoSessao: true },
  });

  const senhaConfere = usuario ? await conferirSenha(senha, usuario.senhaHash) : await conferirSenhaFalsa(senha);

  if (!usuario || !usuario.ativo || !senhaConfere) {
    await prisma.tentativaLogin.create({ data: { identificador, ip, sucesso: false } });
    return { ok: false, motivo: "invalido" };
  }

  await prisma.$transaction([
    prisma.tentativaLogin.create({ data: { identificador, ip, sucesso: true } }),
    prisma.usuario.update({ where: { id: usuario.id }, data: { ultimoLoginEm: new Date() } }),
  ]);

  return {
    ok: true,
    usuario: {
      id: usuario.id,
      nome: usuario.nome,
      login: usuario.login,
      email: usuario.email,
      versaoSessao: usuario.versaoSessao,
    },
  };
}

/** Extrai o IP do cliente dos cabeçalhos de proxy (Vercel preenche x-forwarded-for). */
export function extrairIp(cabecalhos: Headers | { get(nome: string): string | null }): string {
  const encaminhado = cabecalhos.get("x-forwarded-for");
  const primeiro = encaminhado?.split(",")[0]?.trim();
  return (primeiro || cabecalhos.get("x-real-ip") || "desconhecido").slice(0, 64);
}
