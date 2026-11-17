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
 *
 * `logDeConsultas` liga o evento "query" (só para testes e para medir desempenho): cada consulta SQL vira um evento
 * `cliente.$on("query", ...)`. Nunca ligado no app.
 */
/**
 * Tempos das transações interativas (valem para TODAS, salvo quem passar os seus). O padrão do Prisma é esperar 2 s por uma
 * vaga no pool e dar 5 s à transação: com o pool de 5 conexões e transações presas em trava, 2 s é pouco e vira erro para
 * a pessoa ("Unable to start a transaction in the given time"). 10 s de espera ainda é um problema real que deve aparecer
 * como erro claro; 30 s de duração é o que as ações financeiras já usavam.
 * Na Vercel, o limite que vale na prática é o MENOR entre este e o `maxDuration` da função (ver `src/app/(app)/layout.tsx`).
 */
export const ESPERA_MAXIMA_DE_TRANSACAO_MS = 10_000;
export const DURACAO_MAXIMA_DE_TRANSACAO_MS = 30_000;
/** Espera máxima por uma conexão livre do pool (sem isso, a espera era infinita). */
export const ESPERA_MAXIMA_POR_CONEXAO_MS = 15_000;

export function criarClientePrisma(connectionString: string | undefined, opcoes: { logDeConsultas?: boolean; maximoDeConexoes?: number } = {}): PrismaClient {
  if (!connectionString) {
    throw new Error("DATABASE_URL não configurada.");
  }

  const url = new URL(connectionString);
  url.searchParams.delete("pgbouncer");

  const adapter = new PrismaPg({
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: false },
    max: opcoes.maximoDeConexoes ?? 5,
    connectionTimeoutMillis: ESPERA_MAXIMA_POR_CONEXAO_MS,
  });

  return new PrismaClient({ adapter, transactionOptions: { maxWait: ESPERA_MAXIMA_DE_TRANSACAO_MS, timeout: DURACAO_MAXIMA_DE_TRANSACAO_MS }, ...(opcoes.logDeConsultas ? { log: [{ emit: "event" as const, level: "query" as const }] } : {}) });
}
