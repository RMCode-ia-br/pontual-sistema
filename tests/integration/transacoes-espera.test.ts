import { afterAll, describe, expect, it } from "vitest";

import { criarClientePrisma, DURACAO_MAXIMA_DE_TRANSACAO_MS, ESPERA_MAXIMA_DE_TRANSACAO_MS } from "@/lib/db/criar-cliente";

/**
 * Tempos das transações interativas (Fase 7B). Um cliente com UMA conexão só reproduz o pool cheio: a 2ª transação precisa
 * ESPERAR a vaga em vez de falhar com "Unable to start a transaction in the given time" (2 s, o padrão do Prisma).
 * Só lê (pg_sleep); não grava nada.
 */
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const clientes: ReturnType<typeof criarClientePrisma>[] = [];
const novo = (max: number) => {
  const c = criarClientePrisma(url, { maximoDeConexoes: max });
  clientes.push(c);
  return c;
};

afterAll(async () => {
  await Promise.all(clientes.map((c) => c.$disconnect()));
});

describe("tempos das transações interativas", () => {
  it("os tempos padrão do app são 10 s de espera e 30 s de duração (não os 2 s e 5 s do Prisma)", () => {
    expect(ESPERA_MAXIMA_DE_TRANSACAO_MS).toBe(10_000);
    expect(DURACAO_MAXIMA_DE_TRANSACAO_MS).toBe(30_000);
  });

  it("pool cheio: a transação que chega com a conexão ocupada por 3 s ESPERA e termina (antes falhava aos 2 s)", async () => {
    const prisma = novo(1);
    const ocupada = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_sleep(3)::text`;
      return "primeira";
    });
    await new Promise((r) => setTimeout(r, 300)); // a primeira já está com a única conexão
    const inicio = Date.now();
    const segunda = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1`;
      return "segunda";
    });
    expect(segunda).toBe("segunda");
    expect(Date.now() - inicio).toBeGreaterThan(2_000); // esperou mais que o padrão antigo de 2 s e não falhou
    expect(await ocupada).toBe("primeira");
  }, 60_000);

  it("uma transação mais longa que 5 s (o padrão antigo) termina; quem passa a própria duração continua valendo", async () => {
    const prisma = novo(2);
    expect(await prisma.$transaction(async (tx) => (await tx.$queryRaw<{ ok: number }[]>`SELECT pg_sleep(6)::text AS dormiu, 1 AS ok`)[0].ok)).toBe(1);
    // A duração explícita ganha do padrão: 1 s não basta para 3 s de trabalho.
    await expect(
      prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT pg_sleep(3)::text`;
        },
        { timeout: 1_000 },
      ),
    ).rejects.toThrow();
  }, 60_000);
});
