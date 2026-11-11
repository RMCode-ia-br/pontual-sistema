import { expect, test, type Page } from "@playwright/test";

import { alertaDeFormulario, entrarComo, entrarEEsperarPainel, semRolagemHorizontal, toast } from "./ajudantes";
import { buscarAuditoriaFeitaPeloE2E, prepararUsuarioE2E } from "./banco";
import { ipFalso, USUARIO_E2E, USUARIO_E2E_NOVO } from "./dados";

test.describe.configure({ mode: "serial" });
test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(51) } });

test.beforeAll(async () => {
  await prepararUsuarioE2E({ senhaDefinitiva: true });
});

const linha = (page: Page, nome: string) => page.locator("li").filter({ hasText: nome }).filter({ hasText: /Último acesso|Nunca acessou/ });

async function abrirAcoes(page: Page, nome: string) {
  await page.getByRole("button", { name: `Ações de ${nome}` }).click();
}

let senhaTemporaria = "";

test("criar usuário mostra a senha temporária uma única vez", async ({ page }) => {
  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
  await page.goto("/configuracoes/usuarios");
  await semRolagemHorizontal(page);

  await page.getByRole("button", { name: "Novo usuário" }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("Nome").fill(USUARIO_E2E_NOVO.nome);
  await dialogo.getByLabel("Usuário (login)").fill("E2E-Novo"); // maiúsculas viram minúsculas
  await dialogo.getByRole("button", { name: "Criar usuário" }).click();

  const senha = page.getByTestId("senha-temporaria");
  await expect(senha).toBeVisible();
  senhaTemporaria = (await senha.textContent())?.trim() ?? "";
  expect(senhaTemporaria).toHaveLength(10);
  await expect(page.getByRole("dialog")).toContainText("não será mostrada de novo");
  await page.getByRole("button", { name: "Já anotei" }).click();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(linha(page, USUARIO_E2E_NOVO.nome)).toContainText("Troca de senha pendente");
  await expect(linha(page, USUARIO_E2E_NOVO.nome)).toContainText(USUARIO_E2E_NOVO.login);
  // A senha nunca fica na página depois de fechar o diálogo.
  await expect(page.locator("body")).not.toContainText(senhaTemporaria);
});

test("a auditoria registra a criação sem a senha", async () => {
  const logs = await buscarAuditoriaFeitaPeloE2E("Usuario", "CRIAR");
  expect(logs.length).toBeGreaterThanOrEqual(1);
  const texto = JSON.stringify(logs);
  expect(texto).toContain(USUARIO_E2E_NOVO.login);
  expect(texto).not.toContain(senhaTemporaria);
  expect(texto).not.toMatch(/\$2[aby]\$/);
});

test("login duplicado é recusado com mensagem clara", async ({ page }) => {
  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
  await page.goto("/configuracoes/usuarios");
  await page.getByRole("button", { name: "Novo usuário" }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("Nome").fill("Outro Nome");
  await dialogo.getByLabel("Usuário (login)").fill(USUARIO_E2E_NOVO.login);
  await dialogo.getByRole("button", { name: "Criar usuário" }).click();
  await expect(alertaDeFormulario(page)).toContainText("Já existe um usuário com esse login ou e-mail.");
});

test("login inválido é validado no formulário", async ({ page }) => {
  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
  await page.goto("/configuracoes/usuarios");
  await page.getByRole("button", { name: "Novo usuário" }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("Nome").fill("Fulano");
  await dialogo.getByLabel("Usuário (login)").fill("a b");
  await dialogo.getByRole("button", { name: "Criar usuário" }).click();
  await expect(dialogo).toContainText("Use de 3 a 40 caracteres");
});

test("o novo usuário troca a senha no primeiro acesso e entra", async ({ browser }, testInfo) => {
  const contexto = await browser.newContext({ ...testInfo.project.use, extraHTTPHeaders: { "x-forwarded-for": ipFalso(52) } });
  const page = await contexto.newPage();
  await entrarComo(page, USUARIO_E2E_NOVO.login, senhaTemporaria);
  await expect(page).toHaveURL(/\/trocar-senha/);
  await page.getByLabel("Senha atual", { exact: true }).fill(senhaTemporaria);
  await page.getByLabel("Nova senha", { exact: true }).fill(USUARIO_E2E_NOVO.senhaDefinitiva);
  await page.getByLabel("Repita a nova senha", { exact: true }).fill(USUARIO_E2E_NOVO.senhaDefinitiva);
  await page.getByRole("button", { name: "Salvar nova senha" }).click();
  await expect(page).toHaveURL(/\/login\?senha=alterada/);
  await entrarEEsperarPainel(page, USUARIO_E2E_NOVO.login, USUARIO_E2E_NOVO.senhaDefinitiva);
  await expect(page.getByRole("heading", { name: `Olá, ${USUARIO_E2E_NOVO.nome}` })).toBeVisible();
  await contexto.close();
});

test("desativar derruba a sessão aberta e reativar NÃO a ressuscita", async ({ browser, page }, testInfo) => {
  // B (novo usuário) fica logado em outro navegador.
  const contextoB = await browser.newContext({ ...testInfo.project.use, extraHTTPHeaders: { "x-forwarded-for": ipFalso(53) } });
  const b = await contextoB.newPage();
  await entrarEEsperarPainel(b, USUARIO_E2E_NOVO.login, USUARIO_E2E_NOVO.senhaDefinitiva);

  // A desativa B.
  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
  await page.goto("/configuracoes/usuarios");
  await abrirAcoes(page, USUARIO_E2E_NOVO.nome);
  await page.getByRole("menuitem", { name: "Desativar" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("sessões abertas são encerradas");
  await page.getByRole("alertdialog").getByRole("button", { name: "Desativar" }).click();
  await expect(linha(page, USUARIO_E2E_NOVO.nome)).toContainText("Inativo");

  await b.reload();
  await expect(b).toHaveURL(/\/login/);

  // Reativar não devolve a sessão antiga: o token está invalidado de vez.
  await abrirAcoes(page, USUARIO_E2E_NOVO.nome);
  await page.getByRole("menuitem", { name: "Ativar" }).click();
  await expect(linha(page, USUARIO_E2E_NOVO.nome)).not.toContainText("Inativo");
  await b.goto("/");
  await expect(b).toHaveURL(/\/login/);

  // Mas B consegue entrar de novo normalmente.
  await entrarEEsperarPainel(b, USUARIO_E2E_NOVO.login, USUARIO_E2E_NOVO.senhaDefinitiva);
  await contextoB.close();
});

test("o próprio usuário não vê desativar nem redefinir a própria senha", async ({ page }) => {
  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
  await page.goto("/configuracoes/usuarios");
  await expect(linha(page, USUARIO_E2E.nome)).toContainText("Você");
  await abrirAcoes(page, USUARIO_E2E.nome);
  await expect(page.getByRole("menuitem", { name: "Editar" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Desativar" })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Redefinir senha" })).toHaveCount(0);
});

test("redefinir a senha gera outra temporária, derruba a sessão e exige nova troca", async ({ browser, page }, testInfo) => {
  const contextoB = await browser.newContext({ ...testInfo.project.use, extraHTTPHeaders: { "x-forwarded-for": ipFalso(54) } });
  const b = await contextoB.newPage();
  await entrarEEsperarPainel(b, USUARIO_E2E_NOVO.login, USUARIO_E2E_NOVO.senhaDefinitiva);

  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
  await page.goto("/configuracoes/usuarios");
  await abrirAcoes(page, USUARIO_E2E_NOVO.nome);
  await page.getByRole("menuitem", { name: "Redefinir senha" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Redefinir senha" }).click();
  const nova = ((await page.getByTestId("senha-temporaria").textContent()) ?? "").trim();
  expect(nova).toHaveLength(10);
  expect(nova).not.toBe(senhaTemporaria);
  await page.getByRole("button", { name: "Já anotei" }).click();

  // A sessão aberta de B caiu e a senha antiga não vale mais.
  await b.reload();
  await expect(b).toHaveURL(/\/login/);
  await entrarComo(b, USUARIO_E2E_NOVO.login, USUARIO_E2E_NOVO.senhaDefinitiva);
  await expect(alertaDeFormulario(b)).toHaveText("Usuário ou senha inválidos.");

  // Com a temporária, cai direto na troca obrigatória.
  await entrarComo(b, USUARIO_E2E_NOVO.login, nova);
  await expect(b).toHaveURL(/\/trocar-senha/);
  await contextoB.close();
});

test("editar usuário atualiza nome e e-mail", async ({ page }) => {
  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
  await page.goto("/configuracoes/usuarios");
  await abrirAcoes(page, USUARIO_E2E_NOVO.nome);
  await page.getByRole("menuitem", { name: "Editar" }).click();
  const dialogo = page.getByRole("dialog");
  await expect(dialogo.getByLabel("Usuário (login)")).toBeDisabled();
  await dialogo.getByLabel("E-mail (opcional)").fill("E2E.Novo@Exemplo.com");
  await dialogo.getByRole("button", { name: "Salvar" }).click();
  await expect(toast(page, "Usuário atualizado")).toBeVisible();
  // E-mail é guardado em minúsculas.
  await expect(linha(page, USUARIO_E2E_NOVO.nome)).toContainText("e2e.novo@exemplo.com");

  // E-mail inválido é recusado pelo servidor (o campo type=email já barra texto sem @ no navegador).
  await abrirAcoes(page, USUARIO_E2E_NOVO.nome);
  await page.getByRole("menuitem", { name: "Editar" }).click();
  await page.getByRole("dialog").getByLabel("E-mail (opcional)").fill("a@b"); // o HTML aceita; o servidor exige domínio completo
  await page.getByRole("dialog").getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByRole("dialog")).toContainText("E-mail inválido.");
});
