import { expect, test } from "@playwright/test";

import { aguardarAvisosSumirem, ehCelular, entrarEEsperarPainel, semRolagemHorizontal, toast } from "./ajudantes";
import { prepararUsuarioE2E } from "./banco";
import { ipFalso, USUARIO_E2E } from "./dados";

test.describe("financeiro: contas e lançamentos", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(99) } });

  test.beforeAll(async () => {
    await prepararUsuarioE2E({ senhaDefinitiva: true });
  });

  test.beforeEach(async ({ page }) => {
    await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
  });

  test("o menu leva a Contas e lançamentos e a tela abre sem rolagem lateral", async ({ page }) => {
    await page.goto("/financeiro/contas");
    await expect(page.getByRole("heading", { name: "Contas e lançamentos" })).toBeVisible();
    await semRolagemHorizontal(page);
  });

  test("cadastra uma conta sem saldo: fica 'não informado' e o sistema avisa", async ({ page }) => {
    await page.goto("/financeiro/contas");
    await page.getByRole("button", { name: /Nova conta|Cadastrar a primeira conta/ }).first().click();
    await page.getByLabel("Nome").fill("E2E Banco");
    // Sem marcar "Informar o saldo agora", o diálogo explica o que acontece.
    await expect(page.getByText("Sem saldo informado, a conta mostra")).toBeVisible();
    await page.getByRole("button", { name: "Cadastrar conta" }).click();
    await expect(toast(page, "Conta cadastrada.")).toBeVisible();
    await expect(page.getByRole("link", { name: /E2E Banco/ })).toContainText("Saldo não informado");
    await expect(page.getByRole("status").filter({ hasText: "Saldo não informado" })).toContainText("E2E Banco");
    await aguardarAvisosSumirem(page);
  });

  test("lança entrada e saída: o extrato e o saldo conferem", async ({ page }) => {
    await page.goto("/financeiro/contas");
    await page.getByRole("link", { name: /E2E Banco/ }).click();
    await expect(page.getByRole("heading", { name: "E2E Banco" })).toBeVisible();

    await page.getByRole("button", { name: "Novo lançamento" }).click();
    await page.getByLabel("Valor").fill("15000");
    await expect(page.getByLabel("Valor")).toHaveValue("150,00");
    await page.getByLabel("Categoria").selectOption({ label: "Venda de sucata" });
    await page.getByLabel("Descrição").fill("E2E Sucata do mês");
    await page.getByRole("button", { name: "Registrar" }).click();
    await expect(toast(page, "Entrada registrada.")).toBeVisible();
    await aguardarAvisosSumirem(page);

    await page.getByRole("button", { name: "Novo lançamento" }).click();
    await page.getByLabel("Tipo").selectOption("SAIDA");
    await page.getByLabel("Valor").fill("4050");
    await page.getByLabel("Categoria").selectOption({ label: "Tarifas bancárias e maquininha" });
    await page.getByLabel("Descrição").fill("E2E Tarifa");
    await page.getByRole("button", { name: "Registrar" }).click();
    await expect(toast(page, "Saída registrada.")).toBeVisible();

    // Conta sem saldo informado: o saldo é só o movimento (150,00 − 40,50 = 109,50).
    await expect(page.getByText("Saldo hoje").locator("..")).toContainText("109,50");
    // O extrato existe em duas versões (tabela no desktop, cartões no celular): só a visível tem papel acessível.
    await expect(page.getByRole("link", { name: "E2E Sucata do mês" })).toBeVisible();
    await expect(page.getByRole("link", { name: "E2E Tarifa" })).toBeVisible();
    await semRolagemHorizontal(page);
  });

  test("informar o saldo depois não apaga nada e o lançamento antigo vira 'já incluído'", async ({ page }) => {
    await page.goto("/financeiro/contas");
    await page.getByRole("link", { name: /E2E Banco/ }).click();
    await page.getByRole("button", { name: "Editar conta" }).click();
    await page.getByLabel("Informar o saldo agora").check();
    await page.getByLabel("Saldo nessa data").fill("100000");
    await page.getByLabel("Data do saldo").fill(new Date().toISOString().slice(0, 10));
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(toast(page, "Conta atualizada.")).toBeVisible();
    await expect(page.getByText("Saldo não informado")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "E2E Sucata do mês" })).toBeVisible();
  });

  test("estorna um lançamento: ele fica riscado, com motivo, e o saldo volta", async ({ page }) => {
    await page.goto("/financeiro/contas");
    await page.getByRole("link", { name: /E2E Banco/ }).click();
    await page.getByRole("link", { name: "E2E Tarifa" }).click();
    await expect(page.getByRole("heading", { name: "E2E Tarifa" })).toBeVisible();
    await page.getByRole("button", { name: "Estornar" }).click();
    await page.getByLabel("Motivo").fill("Lançado por engano");
    await page.getByRole("button", { name: "Estornar", exact: true }).last().click();
    await expect(toast(page, "Lançamento estornado.")).toBeVisible();
    await expect(page.getByText("Estornado em")).toBeVisible();
    await expect(page.getByText("Lançado por engano").first()).toBeVisible();
    if (ehCelular(page)) await semRolagemHorizontal(page);
  });

  test("o extrato exporta em CSV com sessão (e recusa sem sessão)", async ({ page, request, baseURL }) => {
    await page.goto("/financeiro/contas");
    const href = await page.getByRole("link", { name: /E2E Banco/ }).getAttribute("href");
    const id = href!.split("/").pop()!;
    const resposta = await page.request.get(`/api/exportar/financeiro/extrato/${id}`);
    expect(resposta.status()).toBe(200);
    expect(resposta.headers()["content-type"]).toContain("text/csv");
    const texto = await resposta.text();
    expect(texto).toContain("E2E Sucata do mês");
    // O contexto `request` não tem o cookie da sessão: o proxy redireciona ao login (ou a rota responde 401), nunca o CSV.
    const semSessao = await request.get(`${baseURL}/api/exportar/financeiro/extrato/${id}`, { maxRedirects: 0 });
    expect([307, 401]).toContain(semSessao.status());
    expect(semSessao.headers()["content-type"] ?? "").not.toContain("text/csv");
  });
});
