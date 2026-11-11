import { expect, test, type Page } from "@playwright/test";

import { aguardarAvisosSumirem, entrarEEsperarPainel, semRolagemHorizontal, toast } from "./ajudantes";
import { buscarAuditoriaFeitaPeloE2E, prepararUsuarioE2E } from "./banco";
import { ipFalso, USUARIO_E2E } from "./dados";

test.describe.configure({ mode: "serial" });
test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(86) } });

test.beforeAll(async () => {
  await prepararUsuarioE2E({ senhaDefinitiva: true });
});

test.beforeEach(async ({ page }) => {
  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
});

const CLIENTE = "E2E João Conceição";
const PRODUTO = { codigo: "E2E-BUSCA-1", descricao: "E2E Ferragem Fecho Ângulo" };

let idCliente = "";
let idProduto = "";

async function buscar(page: Page, termo: string) {
  await page.getByRole("button", { name: /Buscar/ }).click();
  await page.getByPlaceholder(/Buscar páginas/).fill(termo);
}

async function criarProduto(page: Page, codigo: string, descricao: string): Promise<string> {
  await page.goto("/produtos/novo");
  await page.getByLabel("Código").fill(codigo);
  await page.getByLabel("Descrição").fill(descricao);
  await page.getByRole("button", { name: "Cadastrar produto" }).click();
  await expect(toast(page, "Produto cadastrado.")).toBeVisible();
  await expect(page).toHaveURL(/\/produtos\/(?!novo)[a-z0-9]+$/);
  return page.url().split("/").pop() ?? "";
}

test("cadastra um cliente e um produto para a busca", async ({ page }) => {
  await page.goto("/clientes/novo");
  await page.getByLabel("Nome completo").fill(CLIENTE);
  await page.getByLabel("Telefone").fill("22999583288");
  await page.getByRole("button", { name: "Cadastrar cliente" }).click();
  await expect(page).toHaveURL(/\/clientes\/(?!novo)[a-z0-9]+$/);
  idCliente = page.url().split("/").pop() ?? "";
  idProduto = await criarProduto(page, PRODUTO.codigo, PRODUTO.descricao);
});

test("a busca global ignora acentos e maiúsculas e agrupa clientes, produtos e outros", async ({ page }) => {
  await page.goto("/");
  for (const termo of ["joao conceicao", "JOÃO CONCEIÇÃO", "João"]) {
    await buscar(page, termo);
    await expect(page.getByRole("group", { name: "Clientes" }).getByRole("option", { name: new RegExp(CLIENTE) }), termo).toBeVisible();
    await page.keyboard.press("Escape");
  }
  await buscar(page, "angulo");
  await expect(page.getByRole("group", { name: "Produtos" }).getByRole("option", { name: new RegExp(PRODUTO.descricao) })).toBeVisible();
  await page.keyboard.press("Escape");
});

test("a busca acha por pedaço do telefone e do código, e abre a ficha", async ({ page }) => {
  await page.goto("/");
  await buscar(page, "99958");
  await page.getByRole("option", { name: new RegExp(CLIENTE) }).click();
  await expect(page).toHaveURL(new RegExp(`/clientes/${idCliente}$`));
  await buscar(page, "busca-1");
  await page.getByRole("option", { name: new RegExp(PRODUTO.descricao) }).click();
  await expect(page).toHaveURL(new RegExp(`/produtos/${idProduto}$`));
});

test("o que está na lixeira some da busca global", async ({ page }) => {
  await page.goto(`/clientes/${idCliente}`);
  await page.getByRole("button", { name: "Enviar à lixeira" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Enviar à lixeira" }).click();
  await expect(toast(page, "1 cliente enviado para a lixeira.")).toBeVisible();
  await aguardarAvisosSumirem(page);
  await buscar(page, "joao conceicao");
  await expect(page.getByRole("option", { name: new RegExp(CLIENTE) })).toHaveCount(0);
});

test("a lixeira lista o cliente removido, com quem removeu, e restaura", async ({ page }) => {
  await page.goto("/lixeira");
  await semRolagemHorizontal(page);
  const item = page.locator("li").filter({ hasText: CLIENTE });
  await expect(item).toContainText(`por ${USUARIO_E2E.nome}`);
  await item.getByRole("button", { name: `Restaurar ${CLIENTE}` }).click();
  await expect(toast(page, "1 item restaurado.")).toBeVisible();
  await expect(page.locator("li").filter({ hasText: CLIENTE })).toHaveCount(0);
  await page.goto(`/clientes/${idCliente}`);
  await expect(page.getByRole("heading", { name: CLIENTE })).toBeVisible();
  const logs = await buscarAuditoriaFeitaPeloE2E("Cliente", "RESTAURAR");
  expect(logs.length).toBeGreaterThanOrEqual(1);
});

test("restaurar produto cujo código foi reutilizado fica bloqueado, com o motivo", async ({ page }) => {
  await page.goto(`/produtos/${idProduto}`);
  await page.getByRole("button", { name: "Enviar à lixeira" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Enviar à lixeira" }).click();
  await expect(toast(page, "1 produto enviado para a lixeira.")).toBeVisible();
  await criarProduto(page, PRODUTO.codigo, "E2E Outro produto com o mesmo código");
  await aguardarAvisosSumirem(page);

  await page.goto("/lixeira?tipo=produtos");
  await page.getByRole("button", { name: `Restaurar ${PRODUTO.descricao}` }).click();
  await expect(toast(page, /o código já foi usado por outro produto/)).toBeVisible();
  await expect(page.locator("li").filter({ hasText: PRODUTO.descricao })).toHaveCount(1); // continua na lixeira
});

test("as abas da lixeira abrem sem erro e cabem no celular", async ({ page }) => {
  for (const tipo of ["clientes", "fornecedores", "funcionarios", "produtos", "equipes"]) {
    await page.goto(`/lixeira?tipo=${tipo}`);
    await expect(page.getByRole("heading", { name: "Lixeira", exact: true })).toBeVisible();
    await semRolagemHorizontal(page);
  }
});
