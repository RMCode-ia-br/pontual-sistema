import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../../generated/prisma/client";

/**
 * Cria um PrismaClient usando o driver adapter do PostgreSQL (Prisma 7).
 *
 * - Usa a connection string recebida (no app: DATABASE_URL, Transaction pooler).
 * - Remove o parâmetro `pgbouncer`, que é do Prisma antigo e não faz sentido para o driver `pg`.
 * - O Supabase exige TLS; sem a CA instalada, a verificação do certificado é relaxada
 *   (ver docs/DECISOES.md).
 *
 * Importa o cliente gerado por caminho relativo para funcionar também no `tsx` (seed).
 */
export function criarClientePrisma(connectionString: string | undefined): PrismaClient {
  if (!connectionString) {
    throw new Error("DATABASE_URL não configurada.");
  }

  const url = new URL(connectionString);
  url.searchParams.delete("pgbouncer");

  const adapter = new PrismaPg({
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: false },
    max: 5,
  });

  return new PrismaClient({ adapter });
}
