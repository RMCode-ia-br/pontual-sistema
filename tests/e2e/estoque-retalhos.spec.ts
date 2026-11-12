import { expect, test, type Page } from "@playwright/test";

import { aguardarAvisosSumirem, entrarEEsperarPainel, semRolagemHorizontal, toast } from "./ajudantes";
import { criarObraDeTeste, criarPerfilBarraDeTeste, definirRetalhoMinimo, estoqueDoProdutoDeTeste, lerCampoConfiguracao, prepararUsuarioE2E, retalhosDoProdutoDeTeste } from "./banco";
import { ipFalso, USUARIO_E2E } from "./dados";

/**
 * Retalhos e sucata (Fase 6, Bloco 4): baixa por corte de barra → sobra ≥ retalho mínimo vira retalho; menor vira sucata;
 * sem retalho mínimo o sistema pergunta. O retalho mínimo de Configurações é trocado e RESTAURADO. Venda e ajuste de sucata
 * ficam nos testes de integração (não deixam resíduo: a limpeza do E2E só conhece produtos e obras "E2E").
 */
test.describe.configure({ mode: "serial" });
test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(106) } });

const CODIGO = "E2E-RET-1";
let produtoId: string;
let minimoOriginal: number | null;
const dialogo = (page: Page) => page.getByRole("dialog");
const urlDoProduto = () => `/produtos/${produtoId}?aba=estoque`;

test.beforeAll(async () => {
  await prepararUsuarioE2E({ senhaDefinitiva: true });
  minimoOriginal = (await lerCampoConfiguracao("retalhoMinimoMm")) as number | null;
  await definirRetalhoMinimo(1000);
  await criarObraDeTeste("Retalho");
  produtoId = await criarPerfilBarraDeTeste(CODIGO, "E2E Perfil para corte", 10);
});

test.afterAll(async () => {
  await definirRetalhoMinimo(minimoOriginal);
});

test.beforeEach(async ({ page }) => {
  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
});

async function escolherObra(page: Page) {
  await dialogo(page).getByLabel("Obra", { exact: false }).first().fill("E2E Obra Retalho");
  await dialogo(page).getByRole("option", { name: /E2E Obra Retalho/ }).first().click();
}

test("corte com sobra de 1.800 mm (≥ mínimo): guarda como retalho, baixa UMA barra e mostra o destino antes de salvar", async ({ page }) => {
  await page.goto(urlDoProduto());
  await page.getByRole("button", { name: "Baixar perfil para a obra" }).click();
  await escolherObra(page);
  await dialogo(page).getByLabel("Comprimento usado da barra (mm)").fill("4200");
  await expect(dialogo(page).getByText(/fica guardada como/)).toBeVisible();
  await dialogo(page).getByLabel(/Onde o retalho fica guardado/).fill("Prateleira 2");
  await dialogo(page).getByRole("button", { name: "Registrar baixa" }).click();
  await expect(toast(page, /Sobra de 1800 mm guardada como retalho/)).toBeVisible();
  await aguardarAvisosSumirem(page);

  expect(await retalhosDoProdutoDeTeste(CODIGO)).toEqual([{ comprimentoMm: 1800, status: "DISPONIVEL", local: "Prateleira 2" }]);
  expect(await estoqueDoProdutoDeTeste(CODIGO)).toMatchObject({ saldoCache: 9, somaDosMovimentos: 9 });
  await expect(page.getByText("Saldo em estoque").locator("..")).toContainText("9 barra");
});

test("corte com sobra de 600 mm (< mínimo): vai para a sucata em kg e não cria retalho", async ({ page }) => {
  await page.goto(urlDoProduto());
  await page.getByRole("button", { name: "Baixar perfil para a obra" }).click();
  await escolherObra(page);
  await dialogo(page).getByLabel("Comprimento usado da barra (mm)").fill("5400");
  await expect(dialogo(page).getByText(/vai para a/)).toBeVisible();
  await expect(dialogo(page).getByText(/0,3 kg/)).toBeVisible();
  await dialogo(page).getByRole("button", { name: "Registrar baixa" }).click();
  await expect(toast(page, /Sobra de 600 mm foi para a sucata/)).toBeVisible();
  await aguardarAvisosSumirem(page);
  expect(await retalhosDoProdutoDeTeste(CODIGO)).toHaveLength(1);
  expect((await estoqueDoProdutoDeTeste(CODIGO)).saldoCache).toBe(8);
});

test("a tela de retalhos lista o retalho, mostra a sucata e deixa usar numa obra", async ({ page }) => {
  await page.goto("/estoque/retalhos?busca=E2E-RET");
  await expect(page.getByRole("heading", { name: "Retalhos e sucata", level: 1 })).toBeVisible();
  await expect(page.getByText(/Retalho mínimo aproveitável: 1\.000 mm/)).toBeVisible();
  // A sucata também cita o produto: o item do retalho é o que tem o botão "Usar em obra".
  const item = page.getByRole("listitem").filter({ has: page.getByRole("button", { name: "Usar em obra" }) });
  await expect(item).toContainText("E2E Perfil para corte");
  await expect(item).toContainText("1.800 mm");
  await expect(item).toContainText("Prateleira 2");
  await expect(page.getByText("Entrada de sucata").first()).toBeVisible();
  await semRolagemHorizontal(page);

  await item.getByRole("button", { name: "Usar em obra" }).click();
  await escolherObra(page);
  await dialogo(page).getByRole("button", { name: "Usar na obra" }).click();
  await expect(toast(page, /Retalho usado na obra/)).toBeVisible();
  await aguardarAvisosSumirem(page);
  expect(await retalhosDoProdutoDeTeste(CODIGO)).toEqual([{ comprimentoMm: 1800, status: "CONSUMIDO", local: "Prateleira 2" }]);
  await expect(page.getByRole("button", { name: "Usar em obra" })).toHaveCount(0);
});

test("sem retalho mínimo em Configurações o sistema NÃO decide: avisa e pede a escolha (retalho ou sucata)", async ({ page }) => {
  await definirRetalhoMinimo(null);
  try {
    await page.goto("/estoque/retalhos");
    await expect(page.getByText(/não está definido/)).toBeVisible();

    await page.goto(urlDoProduto());
    await page.getByRole("button", { name: "Baixar perfil para a obra" }).click();
    await escolherObra(page);
    await dialogo(page).getByLabel("Comprimento usado da barra (mm)").fill("4000");
    await expect(dialogo(page).getByText(/retalho mínimo aproveitável não está definido/)).toBeVisible();
    // Sem escolher, o servidor recusa e nada é gravado.
    await dialogo(page).getByRole("button", { name: "Registrar baixa" }).click();
    await expect(dialogo(page).getByText(/Escolha: retalho ou sucata|retalho mínimo/).first()).toBeVisible();
    expect((await estoqueDoProdutoDeTeste(CODIGO)).saldoCache).toBe(8);

    await dialogo(page).getByLabel("A sobra é").selectOption("RETALHO");
    await dialogo(page).getByRole("button", { name: "Registrar baixa" }).click();
    await expect(toast(page, /Sobra de 2000 mm guardada como retalho/)).toBeVisible();
    await aguardarAvisosSumirem(page);
    expect((await estoqueDoProdutoDeTeste(CODIGO)).saldoCache).toBe(7);
  } finally {
    await definirRetalhoMinimo(1000);
  }
});
