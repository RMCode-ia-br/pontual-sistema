import "server-only";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import type { Prisma } from "@/generated/prisma/client";
import { executar, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { extrairIp } from "@/lib/auth/autenticar";
import { prisma } from "@/lib/db";

type Tx = Prisma.TransactionClient;

/** Telas que mostram estoque, compras ou custo de obra: depois de qualquer mutação todas se atualizam. */
export function revalidarEstoque() {
  revalidatePath("/produtos", "layout");
  revalidatePath("/estoque", "layout");
  revalidatePath("/compras", "layout");
  revalidatePath("/obras", "layout");
  revalidatePath("/");
}

/** Roda a mutação numa transação (regra + auditoria juntas) e traduz erros de negócio em mensagem. */
export async function rodarEstoque<T>(
  nome: string,
  fn: (tx: Tx, ip: string | null) => Promise<{ dados?: T; mensagem: string }>,
  mensagemUnicidade?: string,
): Promise<ResultadoAcao<T>> {
  return executar(
    nome,
    async () => {
      const ip = extrairIp(await headers());
      const r = await prisma.$transaction((tx) => fn(tx, ip), {
        timeout: 30_000,
      });
      revalidarEstoque();
      return sucesso(r.dados, r.mensagem);
    },
    mensagemUnicidade,
  );
}
