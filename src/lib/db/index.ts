import { criarClientePrisma } from "./criar-cliente";

import type { PrismaClient } from "../../generated/prisma/client";

// Reaproveita a instância entre recarregamentos do modo de desenvolvimento.
const globalParaPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalParaPrisma.prisma ?? criarClientePrisma(process.env.DATABASE_URL);

if (process.env.NODE_ENV !== "production") {
  globalParaPrisma.prisma = prisma;
}

export type { PrismaClient };
