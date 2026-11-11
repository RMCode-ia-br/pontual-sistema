import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// A CLI do Prisma não carrega .env.local sozinha.
config({ path: ".env.local", quiet: true });
config({ quiet: true });

/**
 * `prisma generate` (rodado no `postinstall` e no `build`, inclusive na Vercel e no CI) NÃO acessa o
 * banco e não pode exigir variáveis de conexão. Só os comandos abaixo precisam de DIRECT_URL.
 */
const COMANDOS_QUE_USAM_O_BANCO = new Set(["migrate", "db", "studio"]);
const precisaDoBanco = process.argv.slice(2).some((argumento) => COMANDOS_QUE_USAM_O_BANCO.has(argumento));

const urlDireta = process.env.DIRECT_URL?.trim();

if (precisaDoBanco && !urlDireta) {
  throw new Error(
    "DIRECT_URL não configurada. Migrações e o Prisma Studio usam a conexão direta (Session pooler, porta 5432): " +
      "defina DIRECT_URL no .env.local ou nas variáveis de ambiente.",
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  // Migrações usam a conexão direta (Session pooler, porta 5432).
  // O app usa DATABASE_URL (Transaction pooler) via driver adapter em src/lib/db.
  // Sem URL (ex.: só gerando o cliente), o datasource fica sem URL.
  ...(urlDireta ? { datasource: { url: urlDireta } } : {}),
});
