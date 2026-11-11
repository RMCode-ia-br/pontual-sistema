import { expect, test } from "@playwright/test";

import { ehCelular, entrarEEsperarPainel, semRolagemHorizontal } from "./ajudantes";
import { prepararUsuarioE2E } from "./banco";
import { ipFalso, USUARIO_E2E } from "./dados";

test.describe("sem sessão: PWA, cabeçalhos e rotina diária", () => {
  test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(41) } });

  test("manifesto e ícones do PWA são servidos sem login", async ({ request }) => {
    const manifesto = await request.get("/manifest.webmanifest");
    expect(manifesto.status()).toBe(200);
    const json = await manifesto.json();
    expect(json).toMatchObject({ name: "Pontual Gestão", display: "standalone", lang: "pt-BR", start_url: "/" });
    expect(json.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(json.icons.some((i: { purpose: string }) => i.purpose === "maskable")).toBe(true);

    for (const arquivo of ["icone-192.png", "icone-512.png", "icone-maskable-512.png", "apple-touch-icon.png"]) {
      const r = await request.get(`/icons/${arquivo}`);
      expect(r.status(), arquivo).toBe(200);
      expect(r.headers()["content-type"], arquivo).toContain("image/png");
    }
    expect((await request.get("/icons/inexistente.png")).status()).toBe(404);
  });

  test("a tela de login traz os cabeçalhos de segurança", async ({ request }) => {
    const h = (await request.get("/login")).headers();
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["content-security-policy"]).toContain("object-src 'none'");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["permissions-policy"]).toContain("camera=(self)");
    expect(h["x-powered-by"]).toBeUndefined();
    expect(h["strict-transport-security"]).toContain("max-age=");
  });

  test("a rotina diária recusa chamadas sem o segredo e aceita com ele", async ({ request }) => {
    expect((await request.get("/api/cron/diario")).status()).toBe(401);
    expect((await request.get("/api/cron/diario", { headers: { authorization: "Bearer segredo-errado" } })).status()).toBe(401);

    const segredo = process.env.CRON_SECRET;
    expect(segredo, "CRON_SECRET precisa estar no .env.local").toBeTruthy();
    const ok = await request.get("/api/cron/diario", { headers: { authorization: `Bearer ${segredo}` } });
    expect(ok.status()).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true });
    // Idempotente: rodar de novo não quebra nada.
    expect((await request.get("/api/cron/diario", { headers: { authorization: `Bearer ${segredo}` } })).status()).toBe(200);
  });

  test("a exportação de auditoria e as telas internas não abrem sem sessão", async ({ request }) => {
    for (const rota of ["/api/exportar/auditoria", "/configuracoes/usuarios", "/tarefas", "/configuracoes/auditoria"]) {
      const r = await request.get(rota, { maxRedirects: 0 });
      expect([301, 302, 303, 307, 308], rota).toContain(r.status());
      expect(r.headers().location, rota).toContain("/login");
    }
  });

});

test.describe("área logada", () => {
  test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(42) } });

  test.beforeAll(async () => {
    await prepararUsuarioE2E({ senhaDefinitiva: true });
  });

  test.beforeEach(async ({ page }) => {
    await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
  });

  test("o menu mostra as seções e deixa as telas futuras desabilitadas", async ({ page }) => {
    if (ehCelular(page)) {
      await page.getByRole("button", { name: "Mais" }).click();
    }
    const menu = page.getByRole("navigation", { name: "Menu principal" });
    await expect(menu).toBeVisible();

    await menu.getByRole("button", { name: "Comercial" }).click();
    await expect(menu.getByRole("link", { name: "Tarefas" })).toBeVisible();
    const funil = menu.getByText("Funil");
    await expect(funil).toBeVisible();
    await expect(funil.locator("xpath=ancestor-or-self::*[@aria-disabled='true'][1]")).toHaveCount(1);

    await menu.getByRole("button", { name: "Configurações" }).click();
    await expect(menu.getByRole("link", { name: "Usuários" })).toBeVisible();
    await menu.getByRole("link", { name: "Usuários" }).click();
    await expect(page).toHaveURL(/\/configuracoes\/usuarios/);
  });

  test("a busca global encontra páginas e navega até elas", async ({ page }) => {
    await page.getByRole("button", { name: /Buscar/ }).click();
    const caixa = page.getByPlaceholder(/Buscar páginas/);
    await expect(caixa).toBeVisible();
    // Sem acento: "usuarios" acha "Usuários".
    await caixa.fill("usuarios");
    await page.getByRole("option", { name: /Usuários/ }).first().click();
    await expect(page).toHaveURL(/\/configuracoes\/usuarios/);
  });

  test("Ctrl+K abre a busca (computador)", async ({ page }) => {
    test.skip(ehCelular(page), "atalho de teclado só no computador");
    await page.keyboard.press("Control+k");
    await expect(page.getByPlaceholder(/Buscar páginas/)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByPlaceholder(/Buscar páginas/)).toBeHidden();
  });

  test("o sino mostra o estado vazio com orientação", async ({ page }) => {
    await page.getByRole("button", { name: /Notificações/ }).click();
    await expect(page.getByText(/Nenhuma notificação por enquanto/)).toBeVisible();
  });

  test("uma página inexistente mostra o aviso amigável (só logado; sem sessão vai ao login)", async ({ page }) => {
    await page.goto("/rota-que-nao-existe");
    await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
  });

  test("o tema escuro pode ser escolhido e persiste ao recarregar", async ({ page }) => {
    await page.getByRole("button", { name: "Escolher tema" }).click();
    await page.getByRole("menuitemradio", { name: "Escuro" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);
    // Volta ao padrão para não afetar os outros testes.
    await page.getByRole("button", { name: "Escolher tema" }).click();
    await page.getByRole("menuitemradio", { name: "Claro" }).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });

  test("Primeiros passos mostra o progresso real e o que falta", async ({ page }) => {
    await page.goto("/primeiros-passos");
    await expect(page.getByRole("heading", { name: "Primeiros passos" })).toBeVisible();
    await expect(page.getByRole("status")).toContainText(/\d+ de \d+/);
    await expect(page.getByText("Definir a alíquota do Simples e a margem")).toBeVisible();
    await expect(page.getByText("Cadastrar a primeira tipologia e a tabela de preços")).toBeVisible();
    // Só dentro do conteúdo: no celular o menu lateral existe, mas está escondido.
    await expect(page.locator("main").getByText("Em breve").first()).toBeVisible();
  });

  test("Backup e saúde mostra o uso do plano com medidores acessíveis", async ({ page }) => {
    await page.goto("/configuracoes/backup");
    await expect(page.getByRole("progressbar", { name: /Banco de dados/ })).toBeVisible();
    await expect(page.getByRole("progressbar", { name: /Arquivos enviados/ })).toBeVisible();
    await expect(page.getByText(/não faz backup automático/)).toBeVisible();
  });

  const TELAS = [
    ["painel", "/"],
    ["tarefas", "/tarefas"],
    ["nova-tarefa", "/tarefas/nova"],
    ["empresa", "/configuracoes/empresa"],
    ["usuarios", "/configuracoes/usuarios"],
    ["catalogos", "/configuracoes/catalogos"],
    ["feriados", "/configuracoes/feriados"],
    ["modelos-texto", "/configuracoes/modelos-texto"],
    ["auditoria", "/configuracoes/auditoria"],
    ["backup", "/configuracoes/backup"],
    ["primeiros-passos", "/primeiros-passos"],
  ] as const;

  for (const [nome, rota] of TELAS) {
    test(`a tela ${nome} abre sem erro e sem rolagem horizontal`, async ({ page }, testInfo) => {
      const resposta = await page.goto(rota);
      expect(resposta?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      await expect(page.getByText("Algo deu errado")).toHaveCount(0);
      await semRolagemHorizontal(page);
      // Capturas para revisão visual (ficam em test-results/, fora do Git).
      await page.screenshot({ path: `test-results/telas/${testInfo.project.name}-${nome}.png`, fullPage: true });
    });
  }
});
