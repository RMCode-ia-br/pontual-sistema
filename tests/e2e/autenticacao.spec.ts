import { expect, test, type Page } from "@playwright/test";

import { buscarAuditoriaDoUsuarioE2E, definirUsuarioAtivo, prepararUsuarioE2E } from "./banco";
import { ipFalso, USUARIO_E2E } from "./dados";

async function entrar(page: Page, login: string, senha: string) {
  await page.goto("/login");
  await page.getByLabel("Usuário").fill(login);
  await page.getByLabel("Senha", { exact: true }).fill(senha);
  await page.getByRole("button", { name: "Entrar" }).click();
}

/** Mensagem de erro do formulário (o Next também tem um role="alert" próprio para anunciar rotas). */
function erroDoFormulario(page: Page) {
  return page.locator("form").getByRole("alert");
}

async function semRolagemHorizontal(page: Page) {
  const largura = await page.evaluate(() => ({ conteudo: document.documentElement.scrollWidth, janela: window.innerWidth }));
  expect(largura.conteudo, "a página não pode rolar na horizontal").toBeLessThanOrEqual(largura.janela);
}

test("a verificação de saúde responde ok sem expor dados", async ({ request }) => {
  const resposta = await request.get("/api/health");
  expect(resposta.status()).toBe(200);
  expect(await resposta.json()).toEqual({ status: "ok" });
});

test.describe("fluxo de acesso", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(10) } });

  test.beforeAll(async () => {
    await prepararUsuarioE2E();
  });

  test("rotas protegidas redirecionam ao login quando não há sessão", async ({ page }) => {
    for (const rota of ["/", "/trocar-senha"]) {
      await page.goto(rota);
      await expect(page).toHaveURL(/\/login/);
    }
    await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
    await semRolagemHorizontal(page);
  });

  test("login com senha errada mostra erro genérico e não entra", async ({ page }) => {
    await entrar(page, USUARIO_E2E.login, "senha-errada-123");
    await expect(erroDoFormulario(page)).toHaveText("Usuário ou senha inválidos.");
    await expect(page).toHaveURL(/\/login/);
  });

  test("login com usuário inexistente dá a mesma mensagem (não revela se o login existe)", async ({ page }) => {
    await entrar(page, "usuario-que-nao-existe", "qualquer-senha-123");
    await expect(erroDoFormulario(page)).toHaveText("Usuário ou senha inválidos.");
  });

  test("primeiro acesso obriga a trocar a senha antes de usar o sistema", async ({ page }) => {
    await entrar(page, USUARIO_E2E.login.toUpperCase(), USUARIO_E2E.senhaProvisoria); // login sem diferenciar maiúsculas
    await expect(page).toHaveURL(/\/trocar-senha/);
    await expect(page.getByRole("heading", { name: "Defina sua senha" })).toBeVisible();

    // Tentar ir para outra tela volta para a troca de senha.
    await page.goto("/");
    await expect(page).toHaveURL(/\/trocar-senha/);
    await semRolagemHorizontal(page);
  });

  test("a troca de senha rejeita senha fraca, igual à inicial e confirmação diferente", async ({ page }) => {
    await entrar(page, USUARIO_E2E.login, USUARIO_E2E.senhaProvisoria);
    await expect(page).toHaveURL(/\/trocar-senha/);

    const tentar = async (nova: string, confirmacao: string) => {
      await page.getByLabel("Senha atual", { exact: true }).fill(USUARIO_E2E.senhaProvisoria);
      await page.getByLabel("Nova senha", { exact: true }).fill(nova);
      await page.getByLabel("Repita a nova senha", { exact: true }).fill(confirmacao);
      await page.getByRole("button", { name: "Salvar nova senha" }).click();
    };

    await tentar("curta", "curta");
    await expect(erroDoFormulario(page)).toContainText("pelo menos 8 caracteres");

    await tentar("admin   ", "admin   ");
    await expect(erroDoFormulario(page)).toContainText("diferente da senha inicial");

    await tentar("Outra-Senha-123", "Outra-Senha-999");
    await expect(erroDoFormulario(page)).toContainText("não confere");

    await expect(page).toHaveURL(/\/trocar-senha/);
  });

  test("trocar a senha encerra a sessão; a senha antiga deixa de valer e a nova funciona", async ({ page }) => {
    await entrar(page, USUARIO_E2E.login, USUARIO_E2E.senhaProvisoria);
    await expect(page).toHaveURL(/\/trocar-senha/);

    await page.getByLabel("Senha atual", { exact: true }).fill(USUARIO_E2E.senhaProvisoria);
    await page.getByLabel("Nova senha", { exact: true }).fill(USUARIO_E2E.senhaNova);
    await page.getByLabel("Repita a nova senha", { exact: true }).fill(USUARIO_E2E.senhaNova);
    await page.getByRole("button", { name: "Salvar nova senha" }).click();

    await expect(page).toHaveURL(/\/login\?senha=alterada/);
    await expect(page.getByRole("status")).toContainText("Senha alterada");

    await entrar(page, USUARIO_E2E.login, USUARIO_E2E.senhaProvisoria);
    await expect(erroDoFormulario(page)).toHaveText("Usuário ou senha inválidos.");

    await entrar(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: `Olá, ${USUARIO_E2E.nome}` })).toBeVisible();
    await semRolagemHorizontal(page);
  });

  test("a auditoria registrou a troca de senha sem guardar nenhum hash", async () => {
    const logs = await buscarAuditoriaDoUsuarioE2E("TROCAR_SENHA");
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0].usuarioNome).toBe(USUARIO_E2E.nome);
    // Nenhum hash bcrypt ($2a$, $2b$ ou $2y$) pode aparecer no log.
    expect(JSON.stringify(logs)).not.toMatch(/\$2[aby]\$/);
  });

  test("desativar o usuário derruba a sessão que já estava aberta", async ({ page }) => {
    await entrar(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
    await expect(page).toHaveURL(/\/$/);

    try {
      await definirUsuarioAtivo(false);
      await page.reload();
      await expect(page).toHaveURL(/\/login/);
    } finally {
      await definirUsuarioAtivo(true);
    }
  });

  test("sair encerra a sessão", async ({ page }) => {
    await entrar(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
    await expect(page).toHaveURL(/\/$/);
    await page.getByRole("button", { name: /^Menu de / }).click();
    await page.getByRole("menuitem", { name: "Sair" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("bloqueio por tentativas", () => {
  test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(20) } });

  test.beforeAll(async () => {
    await prepararUsuarioE2E();
  });

  test("5 senhas erradas travam o login, mesmo com a senha certa", async ({ page }) => {
    for (let i = 1; i <= 5; i++) {
      await entrar(page, USUARIO_E2E.login, `errada-${i}-xyz`);
      await expect(erroDoFormulario(page)).toHaveText("Usuário ou senha inválidos.");
    }

    await entrar(page, USUARIO_E2E.login, "errada-6-xyz");
    await expect(erroDoFormulario(page)).toContainText("Muitas tentativas");

    // Com a senha CERTA continua bloqueado.
    await entrar(page, USUARIO_E2E.login, USUARIO_E2E.senhaProvisoria);
    await expect(erroDoFormulario(page)).toContainText("Muitas tentativas");
    await expect(page).toHaveURL(/\/login/);
  });
});
