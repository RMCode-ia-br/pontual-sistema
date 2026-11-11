import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

// A CLI do Prisma não carrega .env.local sozinha.
config({ path: ".env.local", quiet: true });
config({ quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Migrações usam a conexão direta (Session pooler, porta 5432).
    // O app usa DATABASE_URL (Transaction pooler) via driver adapter em src/lib/db.
    url: env("DIRECT_URL"),
  },
});
