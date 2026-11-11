import path from "node:path";

import { defineConfig } from "vitest/config";

/**
 * Testes de integração: falam com o banco REAL configurado no .env.local (rodam à parte dos unitários;
 * `npm run test:integracao`). Criam apenas dados de teste (logins "int-*", IPs 198.51.100.2xx) e removem
 * tudo no fim. Não rodam no CI (não há banco lá).
 */
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["tests/integration/preparar-ambiente.ts"],
    testTimeout: 90_000,
    hookTimeout: 90_000,
    // Compartilham o mesmo banco: um arquivo de cada vez.
    fileParallelism: false,
  },
});
