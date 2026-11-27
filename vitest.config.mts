import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    // Hash de senha (argon2) e geração de PDF são pesados: na rodada completa, com todos os arquivos em paralelo, o limite
    // padrão de 5 s estourava (os testes passam isolados). Teste que trava de verdade ainda falha em 30 s.
    testTimeout: 30_000,
  },
});
