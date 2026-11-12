import { expect, test, type Page } from "@playwright/test";

import { aguardarAvisosSumirem, entrarEEsperarPainel, semRolagemHorizontal, toast } from "./ajudantes";
import { criarAcabamentoDeTeste, criarPerfilPorKgDeTeste, prepararUsuarioE2E } from "./banco";
import { ipFalso, USUARIO_E2E } from "./dados";

/**
 * Preço do kg do alumínio (Fase 6, Bloco 2): o preço do kg do acabamento calcula o custo dos perfis (kg × peso/m × barra);
 * sem peso por metro o custo continua vazio (nunca inventado). Usa um acabamento "E2E" para NUNCA tocar nos preços reais, e
 * só confere a PRÉVIA do reajuste (aplicar mexeria em todos os preços do kg).
 */
test.describe.configure({ mode: "serial" });
test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(105) } });

const ACABAMENTO = "E2E Acabamento Kg";
let perfilId: string;
let semPesoId: string;

test.beforeAll(async () => {
  await prepararUsuarioE2E({ senhaDefinitiva: true });
  const acabamentoId = await criarAcabamentoDeTeste(ACABAMENTO);
  perfilId = await criarPerfilPorKgDeTeste("E2E-KG-1", "E2E Perfil com peso", acabamentoId, "0.500");
  semPesoId = await criarPerfilPorKgDeTeste("E2E-KG-2", "E2E Perfil sem peso", acabamentoId, null);
});

test.beforeEach(async ({ page }) => {
  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
});

const cartao = (page: Page) => page.getByRole("form", { name: `Preço do kg: ${ACABAMENTO}` });

test("o acabamento começa sem preço do kg e avisa que os perfis estão sem custo", async ({ page }) => {
  await page.goto("/estoque/preco-do-kg");
  await expect(page.getByRole("heading", { name: "Preço do kg do alumínio", level: 1 })).toBeVisible();
  await expect(cartao(page).getByText("Sem preço do kg")).toBeVisible();
  await expect(cartao(page).getByText(/2 perfis ainda sem custo; 1 sem peso por metro/)).toBeVisible();
  await semRolagemHorizontal(page);
});

test("salvar o preço do kg calcula o custo do perfil (R$ 50/kg × 0,5 kg/m × 6 m = R$ 150,00); sem peso, continua sem custo", async ({ page }) => {
  await page.goto("/estoque/preco-do-kg");
  await cartao(page).getByLabel("Preço do kg (qualquer linha)").fill("5000");
  await cartao(page).getByRole("button", { name: "Salvar preços" }).click();
  await expect(toast(page, /Preço do kg salvo\. O custo de 1 perfil foi recalculado/)).toBeVisible();
  await aguardarAvisosSumirem(page);

  await page.goto(`/produtos/${perfilId}`);
  await expect(page.getByText(/R\$\s?150,00 por barra/)).toBeVisible();
  await page.goto(`/produtos/${perfilId}?aba=historico`);
  // Só no conteúdo: o item do menu lateral tem texto parecido e no celular fica escondido.
  await expect(page.locator("main").getByText(/Preço do kg · Recalculado pelo preço do kg/)).toBeVisible();
  await expect(page.locator("main").getByText(/sem custo/).first()).toBeVisible();

  await page.goto(`/produtos/${semPesoId}`);
  await expect(page.getByText("Sem custo informado")).toBeVisible();
});

test("o formulário do produto desliga o campo de custo nos perfis por kg e explica de onde vem", async ({ page }) => {
  await page.goto(`/produtos/${perfilId}`);
  await expect(page.getByLabel(/Perfil de alumínio comprado por kg/)).toBeChecked();
  await expect(page.getByLabel("Custo unitário (R$)")).toBeDisabled();
  await expect(page.getByText(/Calculado pelo preço do kg/)).toBeVisible();
  await semRolagemHorizontal(page);
});

test("a prévia do reajuste mostra antes e depois sem gravar nada; percentual inválido é recusado", async ({ page }) => {
  await page.goto("/estoque/preco-do-kg");
  await page.getByLabel("Percentual").fill("abc");
  await page.getByRole("button", { name: "Ver prévia" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /Percentual inválido/ })).toBeVisible();

  await page.getByLabel("Percentual").fill("10");
  await page.getByRole("button", { name: "Ver prévia" }).click();
  await expect(page.getByText(new RegExp(`${ACABAMENTO}.*`)).first()).toBeVisible();
  await expect(page.getByText(/R\$\s?50,00 → R\$\s?55,00/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Aplicar o reajuste" })).toBeVisible();
  // NÃO aplica: aplicar mexeria em todos os preços do kg do banco.
  await page.goto(`/produtos/${perfilId}`);
  await expect(page.getByText(/R\$\s?150,00 por barra/)).toBeVisible();
  await semRolagemHorizontal(page);
});
