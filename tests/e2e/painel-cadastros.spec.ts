import { expect, test } from "@playwright/test";

import { entrarEEsperarPainel, semRolagemHorizontal, toast } from "./ajudantes";
import { prepararUsuarioE2E } from "./banco";
import { ipFalso, USUARIO_E2E } from "./dados";

test.describe.configure({ mode: "serial" });
test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(87) } });

test.beforeAll(async () => {
  await prepararUsuarioE2E({ senhaDefinitiva: true });
});

test.beforeEach(async ({ page }) => {
  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
});

test("o painel mostra os números dos cadastros com a definição de cada um, e cada número leva à lista filtrada", async ({ page }) => {
  await page.goto("/produtos/novo");
  await page.getByLabel("Código").fill("E2E-PAINEL-1");
  await page.getByLabel("Descrição").fill("E2E Produto sem custo para o painel");
  await page.getByRole("button", { name: "Cadastrar produto" }).click();
  await expect(toast(page, "Produto cadastrado.")).toBeVisible();

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Cadastros" })).toBeVisible();
  const cartao = page.getByRole("link", { name: /Produtos sem custo/ });
  await expect(cartao).toContainText("o sistema nunca inventa preço");
  const valor = Number((await cartao.locator("p").nth(1).innerText()).trim());
  expect(valor).toBeGreaterThanOrEqual(1);
  await cartao.click();
  await expect(page).toHaveURL(/\/produtos\?custo=sem/);
  await expect(page.getByRole("link", { name: "E2E Produto sem custo para o painel", exact: true })).toBeVisible();
});

test("os outros cartões levam a listas que abrem sem erro e sem rolagem horizontal", async ({ page }) => {
  await page.goto("/");
  await semRolagemHorizontal(page);
  for (const [titulo, url] of [
    [/Clientes ativos/, /\/clientes$/],
    [/Parceiros/, /\/parceiros$/],
    [/Sem contato há 12 meses/, /\/clientes\?parado=1/],
    [/Custos desatualizados/, /\/produtos\?custo=antigo/],
  ] as const) {
    await page.goto("/");
    await page.getByRole("link", { name: titulo }).first().click();
    await expect(page).toHaveURL(url);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await semRolagemHorizontal(page);
  }
});

test("Primeiros passos inclui os passos de cadastros e marca os concluídos", async ({ page }) => {
  await page.goto("/primeiros-passos");
  await expect(page.getByText("Cadastrar ou importar os produtos e os custos")).toBeVisible();
  await expect(page.getByText("Completar os dados dos fornecedores")).toBeVisible();
  await expect(page.getByText("Cadastrar os funcionários e as equipes de instalação")).toBeVisible();
  await expect(page.getByText("Cadastrar os clientes", { exact: true })).toBeVisible();
});
