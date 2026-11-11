import type { Prisma, PrismaClient } from "../../generated/prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/** Campos que nunca podem ir para o log de auditoria. */
const CAMPOS_SENSIVEIS = new Set(["senhaHash", "senha", "novaSenha", "token", "secret", "chaveHash"]);

type Registro = Record<string, unknown>;

/** Converte para JSON puro (Date, Decimal e BigInt viram texto) e remove campos sensíveis. */
export function sanitizarParaAuditoria(valor: unknown): Prisma.InputJsonValue | null {
  if (valor === null || valor === undefined) return null;
  const json = JSON.parse(JSON.stringify(valor, (_chave, v) => (typeof v === "bigint" ? v.toString() : v)));
  return removerSensiveis(json) as Prisma.InputJsonValue;
}

function removerSensiveis(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(removerSensiveis);
  if (valor && typeof valor === "object") {
    return Object.fromEntries(
      Object.entries(valor as Registro)
        .filter(([chave]) => !CAMPOS_SENSIVEIS.has(chave))
        .map(([chave, v]) => [chave, removerSensiveis(v)]),
    );
  }
  return valor;
}

/** Guarda só os campos que mudaram (antes/depois), para o log não crescer à toa. */
export function calcularDiff(
  antes: Registro | null | undefined,
  depois: Registro | null | undefined,
): { antes: Prisma.InputJsonValue | null; depois: Prisma.InputJsonValue | null } {
  const a = (sanitizarParaAuditoria(antes) ?? {}) as Registro;
  const d = (sanitizarParaAuditoria(depois) ?? {}) as Registro;

  // Criação ou exclusão: guarda o registro inteiro do lado que existe.
  if (!antes || !depois) {
    return { antes: antes ? (a as Prisma.InputJsonValue) : null, depois: depois ? (d as Prisma.InputJsonValue) : null };
  }

  const chaves = new Set([...Object.keys(a), ...Object.keys(d)]);
  const mudouAntes: Registro = {};
  const mudouDepois: Registro = {};
  for (const chave of chaves) {
    if (chave === "atualizadoEm" || chave === "atualizadoPorId") continue;
    if (JSON.stringify(a[chave]) !== JSON.stringify(d[chave])) {
      mudouAntes[chave] = a[chave];
      mudouDepois[chave] = d[chave];
    }
  }
  return { antes: mudouAntes as Prisma.InputJsonValue, depois: mudouDepois as Prisma.InputJsonValue };
}

export type EntradaAuditoria = {
  usuario: { id: string; nome: string } | null;
  entidade: string;
  entidadeId: string;
  /** CRIAR, ATUALIZAR, EXCLUIR, RESTAURAR, REDEFINIR_SENHA, LOGIN, etc. */
  acao: string;
  antes?: Registro | null;
  depois?: Registro | null;
  ip?: string | null;
};

/**
 * Wrapper central do log de auditoria. Toda mutação chama esta função, preferencialmente
 * dentro da mesma transação da escrita (passe o `tx`), para que log e dado nunca divirjam.
 */
export async function registrarAuditoria(db: Db, entrada: EntradaAuditoria): Promise<void> {
  const diff = calcularDiff(entrada.antes, entrada.depois);
  await db.logAuditoria.create({
    data: {
      usuarioId: entrada.usuario?.id ?? null,
      usuarioNome: entrada.usuario?.nome ?? null,
      entidade: entrada.entidade,
      entidadeId: entrada.entidadeId,
      acao: entrada.acao,
      antes: diff.antes ?? undefined,
      depois: diff.depois ?? undefined,
      ip: entrada.ip ?? null,
    },
  });
}
