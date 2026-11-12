import "server-only";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import type { Prisma } from "@/generated/prisma/client";
import { executar, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { extrairIp } from "@/lib/auth/autenticar";
import { prisma } from "@/lib/db";

type Tx = Prisma.TransactionClient;

/** Telas que mostram dinheiro: depois de qualquer mutação financeira todas se atualizam. */
export function revalidarFinanceiro() {
  revalidatePath("/financeiro", "layout");
  revalidatePath("/obras", "layout");
  revalidatePath("/projetos", "layout");
  revalidatePath("/clientes", "layout");
  revalidatePath("/tarefas");
  revalidatePath("/");
}

/** Roda a mutação numa transação (regra + auditoria juntas) e traduz erros de negócio em mensagem. */
export async function rodarFinanceiro<T>(
  nome: string,
  fn: (tx: Tx, ip: string | null) => Promise<{ dados?: T; mensagem: string }>,
  mensagemUnicidade?: string,
): Promise<ResultadoAcao<T>> {
  return executar(
    nome,
    async () => {
      const ip = extrairIp(await headers());
      const r = await prisma.$transaction((tx) => fn(tx, ip), { timeout: 30_000 });
      revalidarFinanceiro();
      return sucesso(r.dados, r.mensagem);
    },
    mensagemUnicidade,
  );
}
