import { defineConfig, devices } from "@playwright/test";

const porta = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  // Os testes compartilham o mesmo banco; rodar em série evita interferência.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${porta}`,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // Celular (~390 px de largura), exigido pela especificação.
    { name: "celular", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    // Usa a build de produção (rode `npm run build` antes). Porta própria para não colidir com o `dev`.
    command: `npx next start -p ${porta}`,
    url: `http://localhost:${porta}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // NODE_ENV=production é necessário: com NODE_ENV=test (padrão do Playwright) o Next NÃO carrega o .env.local.
    env: { NODE_ENV: "production", AUTH_URL: `http://localhost:${porta}`, NEXT_PUBLIC_APP_URL: `http://localhost:${porta}` },
  },
});
