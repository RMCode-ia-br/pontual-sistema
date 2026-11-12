import { expect, test } from "@playwright/test";

import { aguardarAvisosSumirem, capturar, entrarEEsperarPainel, semRolagemHorizontal, toast } from "./ajudantes";
import { criarCondicaoDePagamentoDeTeste, prepararUsuarioE2E, restaurarConfiguracao, tirarSnapshotConfiguracao, lerCampoConfiguracao } from "./banco";
import { ipFalso, USUARIO_E2E } from "./dados";

test.describe.configure({ mode: "serial" });
test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(92) } });

// Condições do próprio teste (o dono pode renomear ou excluir as semeadas).
const CONDICAO_COM_PARCELAS = "E2E Condição 50-25-25 da lista";
const CONDICAO_SEM_PARCELAS = "E2E Condição a combinar da lista";

test.beforeAll(async () => {
  await prepararUsuarioE2E({ senhaDefinitiva: true });
  await criarCondicaoDePagamentoDeTeste(CONDICAO_COM_PARCELAS);
  await criarCondicaoDePagamentoDeTeste(CONDICAO_SEM_PARCELAS, { textoLivre: "Forma de pagamento a combinar." });
});

test.beforeEach(async ({ page }) => {
  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
});

test("condições de pagamento: soma 100% e prévia do cronograma", async ({ page }) => {
  await page.goto("/configuracoes/condicoes-pagamento");
  await expect(page.getByText(CONDICAO_COM_PARCELAS).first()).toBeVisible();
  await expect(page.getByText(CONDICAO_SEM_PARCELAS).first()).toBeVisible();
  await semRolagemHorizontal(page);

  await page.getByRole("link", { name: "Nova condição" }).first().click();
  await page.getByLabel("Nome", { exact: true }).fill("E2E Condição de teste");
  await page.getByRole("button", { name: "Parcela", exact: true }).click();
  await page.getByLabel("Descrição da parcela 1").fill("Sinal");
  await page.getByLabel("Percentual da parcela 1").fill("60");
  await expect(page.getByText(/Elas precisam somar 100%/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Criar condição" })).toBeDisabled();

  await page.getByRole("button", { name: "Parcela", exact: true }).click();
  await page.getByLabel("Descrição da parcela 2").fill("Entrega");
  await page.getByLabel("Percentual da parcela 2").fill("40");
  await page.getByLabel("Gatilho da parcela 2").selectOption("ENTREGA_E_INSTALACAO");
  await expect(page.getByText(/R\$\s?6\.000,00 · com vencimento/)).toBeVisible();
  await expect(page.getByText(/R\$\s?4\.000,00 · aguarda a etapa/)).toBeVisible();
  await capturar(page, "condicao-previa");

  await page.getByRole("button", { name: "Criar condição" }).click();
  await expect(toast(page, "Condição criada")).toBeVisible();
  await expect(page).toHaveURL(/\/configuracoes\/condicoes-pagamento\/[a-z0-9]+$/);
  await aguardarAvisosSumirem(page);

  // Nome repetido é recusado.
  await page.goto("/configuracoes/condicoes-pagamento/nova");
  await page.getByLabel("Nome", { exact: true }).fill("e2e condição de teste");
  await page.getByLabel("Texto livre (só para condições sem parcelas, como “A combinar”)").fill("a combinar");
  await page.getByRole("button", { name: "Criar condição" }).click();
  await expect(page.getByText("Já existe uma condição de pagamento com esse nome.")).toBeVisible();
});

test("configurações: markup e acréscimo da nota fiscal são editáveis e validados", async ({ page }) => {
  const antes = await tirarSnapshotConfiguracao();
  try {
    await page.goto("/configuracoes/empresa");
    await expect(page.getByLabel(/Markup padrão sobre o custo/)).toHaveValue("80");
    await expect(page.getByLabel(/Markup de vidro temperado e guarda-corpo/)).toHaveValue("100");
    await expect(page.getByLabel(/Acréscimo quando a venda é com nota fiscal/)).toHaveValue("5");

    await page.getByLabel(/Acréscimo quando a venda é com nota fiscal/).fill("abc");
    await page.getByRole("button", { name: "Salvar configurações" }).click();
    await expect(page.locator("#acrescimoNotaPb-erro")).toContainText("Acréscimo da nota fiscal: informe um percentual");

    await page.getByLabel(/Acréscimo quando a venda é com nota fiscal/).fill("5,5");
    await page.getByLabel(/Markup padrão sobre o custo/).fill("75");
    await page.getByRole("button", { name: "Salvar configurações" }).click();
    await expect(toast(page, "Configurações salvas")).toBeVisible();
    expect(await lerCampoConfiguracao("acrescimoNotaPb")).toBe(550);
    expect(await lerCampoConfiguracao("markupPadraoPb")).toBe(7500);
  } finally {
    await restaurarConfiguracao(antes);
  }
});
