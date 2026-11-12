import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { StatusDoTitulo } from "@/lib/dominio/titulos";

/** Quando o título quita, a tarefa "Cobrar parcela" conclui; quando volta a dever, ela reabre (nada é criado em duplicidade). */
export async function sincronizarTarefaDeCobranca(tx: Prisma.TransactionClient, contaId: string, antes: StatusDoTitulo, depois: StatusDoTitulo, agora: Date): Promise<void> {
  const chaveUnica = `cobranca:${contaId}`;
  if (antes !== "PAGA" && depois === "PAGA") {
    await tx.tarefa.updateMany({ where: { chaveUnica, status: "ABERTA", deletadoEm: null }, data: { status: "CONCLUIDA", concluidaEm: agora } });
  } else if (antes === "PAGA" && depois !== "PAGA" && depois !== "CANCELADA") {
    await tx.tarefa.updateMany({ where: { chaveUnica, status: "CONCLUIDA", deletadoEm: null }, data: { status: "ABERTA", concluidaEm: null } });
  }
}
