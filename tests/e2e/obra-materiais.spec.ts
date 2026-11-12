import { expect, test } from "@playwright/test";

import { entrarEEsperarPainel, semRolagemHorizontal } from "./ajudantes";
import { criarObraDeTeste, criarProdutoDeTeste, prepararUsuarioE2E } from "./banco";
import { ipFalso, USUARIO_E2E } from "./dados";

/**
 * Aba "Materiais e compras" da obra (Fase 6, Bloco 6). A lista com números pela composição é coberta no teste de integração
 * (precisa de proposta aprovada com composição); aqui: a aba abre com orientação quando não há proposta aprovada, e os links
 * da aba pré-carregam o formulário de compra (o que falta, vidro com o vão só como referência).
 */
test.describe.configure({ mode: "serial" });
test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(108) } });

let obraId: string;
let produtoId: string;

test.beforeAll(async () => {
  await prepararUsuarioE2E({ senhaDefinitiva: true });
  obraId = await criarObraDeTeste("Materiais");
  produtoId = await criarProdutoDeTeste("E2E-MAT-1", "E2E Perfil que falta", 1000);
});

test.beforeEach(async ({ page }) => {
  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
});

test("a aba abre e orienta quando a obra ainda não tem proposta aprovada", async ({ page }) => {
  await page.goto(`/obras/${obraId}?aba=materiais`);
  await expect(page.getByRole("navigation", { name: "Seções da obra" }).getByRole("link", { name: "Materiais e compras" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Lista de materiais" })).toBeVisible();
  await expect(page.getByText(/ainda não tem proposta aprovada/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pedido de vidro" })).toBeVisible();
  await expect(page.getByText(/Nenhum item aprovado tem tipo de vidro/)).toBeVisible();
  await expect(page.getByText(/Nenhuma compra com destino a esta obra/)).toBeVisible();
  await semRolagemHorizontal(page);
});

test("o link 'montar compra' pré-carrega o formulário com o produto e a quantidade que faltam", async ({ page }) => {
  await page.goto(`/compras/nova?obra=${obraId}&itens=${produtoId}:2.5`);
  const item = page.getByRole("listitem", { name: "Item 1", exact: true });
  await expect(item.getByText("E2E-MAT-1 · E2E Perfil que falta")).toBeVisible();
  await expect(item.getByLabel("Quantidade")).toHaveValue("2,5");
  await expect(page.getByLabel("Destino")).toHaveValue("ESTOQUE");
  await expect(page.getByLabel("Observação (opcional)")).toHaveValue(/Materiais que faltam para a obra/);
  await semRolagemHorizontal(page);
  // Parâmetros malformados ou de produto que não existe são ignorados (nunca quebram a página).
  await page.goto("/compras/nova?itens=nao-existe:1,lixo,:::,id:abc");
  await expect(page.getByRole("heading", { name: "Nova compra", level: 1 })).toBeVisible();
});

test("o pedido de vidro nasce com destino à obra e sem medida de vidro presumida", async ({ page }) => {
  await page.goto(`/compras/nova?tipo=VIDRO&obra=${obraId}&vidros=inexistente1`);
  await expect(page.locator("#cmp-tipo")).toHaveValue("VIDRO");
  await expect(page.locator("#cmp-destino")).toHaveValue("OBRA");
  await expect(page.locator("#cmp-obra")).toContainText("E2E Obra Materiais");
  const item = page.getByRole("listitem", { name: "Item 1", exact: true });
  await expect(item.getByLabel("Largura (mm)")).toHaveValue("");
  await expect(item.getByLabel("Altura (mm)")).toHaveValue("");
});
