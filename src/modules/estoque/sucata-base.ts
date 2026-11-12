import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { saldoDeSucata, type MovimentoDeSucata } from "@/lib/dominio/retalhos";

type Tx = Prisma.TransactionClient;

const milesimosDe = (d: { toString(): string } | null): number | null => (d === null ? null : Math.round(Number(d.toString()) * 1000));

/** Serializa as escritas de sucata (o saldo é uma soma: duas vendas simultâneas não podem passar do que existe). */
export async function travarSucata(tx: Tx) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('sucata'))`;
}

/** Saldo de sucata: kg (geração soma, venda subtrai) e, à parte, o comprimento sem peso por metro. */
export async function saldoDaSucata(db: Pick<Tx, "movimentoSucata">) {
  const movimentos = await db.movimentoSucata.findMany({ where: { deletadoEm: null }, select: { tipo: true, pesoKg: true, comprimentoMm: true } });
  const lista: MovimentoDeSucata[] = movimentos.map((m) => ({ tipo: m.tipo, pesoMilesimosKg: milesimosDe(m.pesoKg), comprimentoMm: m.comprimentoMm }));
  return saldoDeSucata(lista);
}
