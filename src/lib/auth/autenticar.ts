import { prisma } from "@/lib/db";

import type { Prisma, PrismaClient } from "../../generated/prisma/client";

import { JANELA_MS, statusBloqueioDasTentativas, type StatusBloqueio, type Tentativa } from "./bloqueio";
import { conferirSenha, conferirSenhaFalsa } from "./senha";

type Db = PrismaClient | Prisma.TransactionClient;

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

/**
 * Chave do contador de tentativas: o login canônico do usuário (se o texto digitado for o login OU o
 * e-mail dele) ou, se não existir, o próprio texto normalizado. Assim login e e-mail compartilham um contador.
 */
export async function resolverConta(identificadorBruto: string): Promise<string> {
  const identificador = normalizarIdentificador(identificadorBruto);
  if (!identificador) return identificador;
  const usuario = await prisma.usuario.findFirst({
    where: { OR: [{ login: identificador }, { email: identificador }], deletadoEm: null },
    select: { login: true },
  });
  return usuario?.login ?? identificador;
}

/** Tentativas recentes da conta OU do IP, em UMA consulta (cada ida ao banco custa ~150 ms: o banco fica nos EUA). */
async function tentativasRecentes(db: Db, conta: string, ip: string, agora: Date): Promise<Tentativa[]> {
  const inicioJanela = new Date(agora.getTime() - JANELA_MS);
  return db.tentativaLogin.findMany({
    where: { criadoEm: { gt: inicioJanela }, OR: [{ identificador: conta }, { ip }] },
    select: { identificador: true, ip: true, sucesso: true, criadoEm: true },
    orderBy: { criadoEm: "desc" },
    take: 500,
  });
}

/** Bloqueio por login/e-mail OU por IP: vale o que terminar mais tarde. */
export async function statusBloqueioLogin(
  identificador: string,
  ip: string,
  agora: Date = new Date(),
  db: Db = prisma,
): Promise<StatusBloqueio> {
  return statusBloqueioDasTentativas(await tentativasRecentes(db, identificador, ip, agora), identificador, ip, agora);
}

/** Prazos da transação de reserva: sob rajada de tentativas elas entram em fila (uma por vez, por conta). */
const OPCOES_RESERVA = { maxWait: 25_000, timeout: 25_000 } as const;

type Reserva = { bloqueado: false; tentativaId: string } | { bloqueado: true; minutosRestantes: number };

/**
 * Decide e registra a tentativa de forma ATÔMICA, ANTES de conferir a senha.
 *
 * Sem isso, N requisições simultâneas leriam "0 falhas" e passariam todas pela checagem (o bcrypt leva
 * ~250 ms e a falha só seria gravada depois). Aqui, travas de consultoria do PostgreSQL serializam as
 * tentativas da mesma conta e do mesmo IP: cada uma vê as reservas das anteriores, então no máximo
 * MAX_FALHAS passam por janela. A reserva entra como "falha provisória"; se o login der certo ela é
 * trocada por um sucesso.
 *
 * Caminho rápido: se a conta/IP já está bloqueada, responde sem abrir transação (o caso comum durante
 * um ataque em andamento). As travas são sempre adquiridas na mesma ordem (conta e depois IP): sem deadlock.
 */
async function reservarTentativa(conta: string, ip: string): Promise<Reserva> {
  const previa = await statusBloqueioLogin(conta, ip);
  if (previa.bloqueado) return { bloqueado: true, minutosRestantes: previa.minutosRestantes };

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`login:${conta}`}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ip:${ip}`}))`;

    // Relê DENTRO das travas: as tentativas que estavam na fila já deixaram suas reservas.
    const bloqueio = await statusBloqueioLogin(conta, ip, new Date(), tx);
    if (bloqueio.bloqueado) return { bloqueado: true, minutosRestantes: bloqueio.minutosRestantes } as const;

    const tentativa = await tx.tentativaLogin.create({
      data: { identificador: conta, ip, sucesso: false },
      select: { id: true },
    });
    return { bloqueado: false, tentativaId: tentativa.id } as const;
  }, OPCOES_RESERVA);
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

  const usuario = await prisma.usuario.findFirst({
    where: { OR: [{ login: identificador }, { email: identificador }], deletadoEm: null },
    select: { id: true, nome: true, login: true, email: true, senhaHash: true, ativo: true, versaoSessao: true },
  });

  // Login e e-mail do mesmo usuário compartilham UM contador (senão seriam 2x as tentativas permitidas).
  const conta = usuario?.login ?? identificador;

  const reserva = await reservarTentativa(conta, ip);
  if (reserva.bloqueado) {
    return { ok: false, motivo: "bloqueado", minutosRestantes: reserva.minutosRestantes };
  }

  const senhaConfere = usuario ? await conferirSenha(senha, usuario.senhaHash) : await conferirSenhaFalsa(senha);

  // A falha já está registrada pela reserva: não há mais nada a gravar.
  if (!usuario || !usuario.ativo || !senhaConfere) return { ok: false, motivo: "invalido" };

  await prisma.$transaction([
    // Troca a falha provisória por um sucesso (que também zera as falhas anteriores).
    prisma.tentativaLogin.delete({ where: { id: reserva.tentativaId } }),
    prisma.tentativaLogin.create({ data: { identificador: conta, ip, sucesso: true } }),
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
