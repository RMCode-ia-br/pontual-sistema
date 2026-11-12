import { expect, test } from "@playwright/test";

import { entrarEEsperarPainel, semRolagemHorizontal } from "./ajudantes";
import { criarProdutoDeTeste, definirSaldoEMinimoDeTeste, prepararUsuarioE2E } from "./banco";
import { ipFalso, USUARIO_E2E } from "./dados";

/**
 * Painel "Estoque e compras" e relatório de estoque (Fase 6, Bloco 7B): cada número leva à lista filtrada; o produto abaixo do
 * mínimo aparece no filtro; produto sem custo fica fora do valor e é apontado; nada inventado.
 */
test.describe.configure({ mode: "serial" });
test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(110) } });

const ABAIXO = "E2E-PNL-1";
const SEM_CUSTO = "E2E-PNL-2";

test.beforeAll(async () => {
  await prepararUsuarioE2E({ senhaDefinitiva: true });
  await criarProdutoDeTeste(ABAIXO, "E2E Painel abaixo do mínimo", 2_500);
  await criarProdutoDeTeste(SEM_CUSTO, "E2E Painel sem custo", null);
  await definirSaldoEMinimoDeTeste(ABAIXO, "3", "10");
  await definirSaldoEMinimoDeTeste(SEM_CUSTO, "4", null);
});

test.beforeEach(async ({ page }) => {
  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
});

test("o painel mostra a seção Estoque e compras e 'Abaixo do mínimo' leva à lista filtrada", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Estoque e compras" })).toBeVisible();
  for (const nome of ["Compras em aberto", "Retalhos disponíveis", "Sucata para vender", "Abaixo do mínimo", "Perfis sem custo"]) {
    await expect(page.getByRole("link", { name: new RegExp(nome) })).toBeVisible();
  }
  await page.getByRole("link", { name: /Abaixo do mínimo/ }).click();
  await expect(page).toHaveURL(/\/produtos\?estoque=abaixo/);
  await expect(page.getByRole("heading", { name: "Produtos" }).first()).toBeVisible();
  // Tabela (desktop) e cartões (celular) coexistem no HTML: só um fica visível.
  await expect(page.locator("a:visible", { hasText: "E2E Painel abaixo do mínimo" }).first()).toBeVisible();
  // Produto sem mínimo definido nunca gera alerta.
  await expect(page.getByText("E2E Painel sem custo")).toHaveCount(0);
  await semRolagemHorizontal(page);
});

test("o relatório de estoque valoriza o que tem custo e aponta o que está sem custo", async ({ page }) => {
  await page.goto("/relatorios");
  await page.getByRole("link", { name: /Posição do estoque e compras por fornecedor/ }).click();
  await expect(page.getByRole("heading", { name: "Estoque e compras" }).first()).toBeVisible();
  const linhaAbaixo = page.getByRole("listitem").filter({ hasText: "E2E Painel abaixo do mínimo" });
  await expect(linhaAbaixo).toContainText("Abaixo do mínimo");
  await expect(linhaAbaixo).toContainText("R$ 75,00"); // 3 × R$ 25,00
  const linhaSemCusto = page.getByRole("listitem").filter({ hasText: "E2E Painel sem custo" });
  await expect(linhaSemCusto).toContainText("Sem custo"); // nunca R$ 0,00
  await expect(linhaSemCusto).not.toContainText("R$ 0,00");
  await expect(page.getByRole("heading", { name: "Compras recebidas por fornecedor" })).toBeVisible();
  await semRolagemHorizontal(page);
});

test("o CSV da posição de estoque sai com 'Sem custo' (nunca zero)", async ({ page }) => {
  const resposta = await page.request.get("/api/exportar/relatorios/estoque");
  expect(resposta.status()).toBe(200);
  const csv = await resposta.text();
  expect(csv).toContain("E2E Painel abaixo do mínimo");
  const linha = csv.split("\n").find((l) => l.includes("E2E Painel sem custo")) ?? "";
  expect(linha).toContain("Sem custo");
});
