import { expect, test, type Page } from "@playwright/test";

import { aguardarAvisosSumirem, capturar, entrarEEsperarPainel, semRolagemHorizontal, toast } from "./ajudantes";
import { contaDaObra, criarObraDeTeste, prepararUsuarioE2E, recebidoDaObra } from "./banco";
import { ipFalso, USUARIO_E2E } from "./dados";

/**
 * Critério de aceite da Fase 5: o ciclo fecha e o fluxo/DRE batem com os lançamentos.
 * Os lançamentos do teste usam janeiro de 2020, um período onde só existem os dados do teste, para o DRE poder ser
 * conferido com números exatos mesmo com dados reais no banco.
 */
test.describe.configure({ mode: "serial" });
test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(102) } });

const CONTA = "E2E Conta do ciclo";
const dialogo = (page: Page) => page.getByRole("dialog");
let obraId: string;

test.beforeAll(async () => {
  await prepararUsuarioE2E({ senhaDefinitiva: true });
  obraId = await criarObraDeTeste("Aceite");
});

test.beforeEach(async ({ page }) => {
  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
});

test("cria a conta e recebe o sinal e a parcela liberada, pagando uma conta no mesmo período", async ({ page }) => {
  test.setTimeout(150_000);
  // Conta sem saldo informado.
  await page.goto("/financeiro/contas");
  await page.getByRole("button", { name: /Nova conta|Cadastrar a primeira conta/ }).first().click();
  await page.getByLabel("Nome").fill(CONTA);
  await page.getByRole("button", { name: "Cadastrar conta" }).click();
  await expect(toast(page, "Conta cadastrada.")).toBeVisible();
  await aguardarAvisosSumirem(page);

  // Sinal: R$ 5.000,00 recebidos em 10/01/2020.
  await page.goto("/financeiro/receber?busca=E2E%20Obra%20Aceite");
  await page.getByRole("link", { name: "Sinal" }).click();
  await page.getByRole("button", { name: "Registrar recebimento" }).click();
  await dialogo(page).getByLabel("Data do recebimento").fill("2020-01-10");
  await dialogo(page).getByRole("button", { name: /Receber o saldo todo/ }).click();
  await dialogo(page).getByLabel("Conta onde entrou").selectOption({ label: CONTA });
  await dialogo(page).getByRole("button", { name: "Registrar recebimento" }).click();
  await expect(toast(page, "parcela quitada")).toBeVisible();
  await aguardarAvisosSumirem(page);

  // A parcela do material aguarda a etapa: libera-se antes (o cliente vai pagar adiantado) e recebe-se em 20/01/2020.
  await page.goto("/financeiro/receber?aba=aguardando&busca=E2E%20Obra%20Aceite");
  await page.getByRole("link", { name: "Entrega do material" }).click();
  await page.getByRole("button", { name: "Liberar antes da etapa" }).click();
  await dialogo(page).getByRole("button", { name: "Liberar" }).click();
  await expect(toast(page, "Parcela liberada para cobrança.")).toBeVisible();
  await aguardarAvisosSumirem(page);
  await page.getByRole("button", { name: "Registrar recebimento" }).click();
  await dialogo(page).getByLabel("Data do recebimento").fill("2020-01-20");
  await dialogo(page).getByRole("button", { name: /Receber o saldo todo/ }).click();
  await dialogo(page).getByLabel("Conta onde entrou").selectOption({ label: CONTA });
  await dialogo(page).getByRole("button", { name: "Registrar recebimento" }).click();
  await expect(toast(page, "parcela quitada")).toBeVisible();
  await aguardarAvisosSumirem(page);
  expect(await contaDaObra(obraId, 2)).toMatchObject({ status: "PAGA", valorPagoCentavos: 250000 });
  expect(await recebidoDaObra(obraId)).toBe(750000);

  // Conta a pagar: aluguel de R$ 1.000,00, paga em 25/01/2020.
  await page.goto("/financeiro/pagar");
  await page.getByRole("button", { name: "Nova conta a pagar" }).first().click();
  await dialogo(page).getByLabel("Descrição").fill("E2E Aluguel do ciclo");
  await dialogo(page).getByLabel(/^Valor/).fill("100000");
  await dialogo(page).getByLabel("Categoria").selectOption({ label: "Aluguel" });
  await dialogo(page).getByRole("button", { name: "Criar" }).click();
  await expect(toast(page, "Conta a pagar criada.")).toBeVisible();
  await aguardarAvisosSumirem(page);
  await page.goto("/financeiro/pagar?busca=E2E%20Aluguel%20do%20ciclo");
  await page.getByRole("link", { name: "E2E Aluguel do ciclo" }).click();
  await page.getByRole("button", { name: "Registrar pagamento" }).click();
  await dialogo(page).getByLabel("Data do pagamento").fill("2020-01-25");
  await dialogo(page).getByRole("button", { name: /Pagar o saldo todo/ }).click();
  await dialogo(page).getByLabel("Conta de onde saiu").selectOption({ label: CONTA });
  await dialogo(page).getByRole("button", { name: "Registrar pagamento" }).click();
  await expect(toast(page, "conta quitada")).toBeVisible();
});

test("o DRE de janeiro de 2020 bate com os lançamentos: receitas 7.500, aluguel 1.000, resultado 6.500", async ({ page }) => {
  await page.goto("/financeiro/dre?de=2020-01&ate=2020-01&regime=caixa");
  await expect(page.getByRole("heading", { name: "DRE gerencial", level: 1 })).toBeVisible();
  const linha = (nome: string) => page.getByRole("row").filter({ has: page.getByRole("rowheader", { name: nome }) });
  await expect(linha("Receitas operacionais")).toContainText("7.500,00");
  await expect(linha("Despesas fixas")).toContainText("1.000,00");
  await expect(linha("Resultado")).toContainText("6.500,00");
  await semRolagemHorizontal(page);
  await capturar(page, "financeiro-dre");

  // O CSV traz os mesmos números.
  const csv = await page.request.get("/api/exportar/financeiro/dre?de=2020-01&ate=2020-01&regime=caixa");
  expect(csv.status()).toBe(200);
  const texto = await csv.text();
  expect(texto).toContain("Resultado");
  expect(texto).toContain("6.500,00");
});

test("a conta mostra o saldo do movimento e a visão geral lista a conta; o extrato bate", async ({ page }) => {
  await page.goto("/financeiro/contas");
  await expect(page.getByRole("link", { name: new RegExp(CONTA) })).toContainText("6.500,00");
  await expect(page.getByRole("link", { name: new RegExp(CONTA) })).toContainText("Saldo não informado");

  await page.getByRole("link", { name: new RegExp(CONTA) }).click();
  await page.getByLabel("De", { exact: true }).fill("2020-01-01");
  await page.getByLabel("Até", { exact: true }).fill("2020-01-31");
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page.getByText("Entradas no período").locator("..")).toContainText("7.500,00");
  await expect(page.getByText("Saídas no período").locator("..")).toContainText("1.000,00");
  await expect(page.getByText(/Saldo no fim do período/)).toContainText("6.500,00");

  await page.goto("/financeiro");
  await expect(page.getByRole("heading", { name: "Visão geral e fluxo de caixa", level: 1 })).toBeVisible();
  await expect(page.getByRole("img", { name: /Entradas, saídas e saldo projetado/ })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Saldo não informado" })).toContainText(CONTA);
  await expect(page.getByRole("link", { name: new RegExp(CONTA) }).last()).toContainText("6.500,00");
  await semRolagemHorizontal(page);
  await capturar(page, "financeiro-visao-geral");
  await page.goto("/financeiro?visao=dias");
  await expect(page.getByRole("img", { name: /30, 60 e 90 dias/ })).toBeVisible();
  await semRolagemHorizontal(page);
});

test("o painel mostra a seção Financeiro com a definição de cada número e sem rolagem lateral", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Financeiro", level: 2 })).toBeVisible();
  await expect(page.getByText("Saldo das contas")).toBeVisible();
  await expect(page.getByText("Recebido no mês")).toBeVisible();
  await expect(page.getByText("Saldo projetado")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Parcelas atrasadas ou vencendo hoje" })).toBeVisible();
  await semRolagemHorizontal(page);
  await capturar(page, "painel-financeiro");
});

test("os relatórios financeiros abrem e exportam", async ({ page }) => {
  for (const rota of ["/relatorios/financeiro/receber", "/relatorios/financeiro/pagar"]) {
    await page.goto(rota);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await semRolagemHorizontal(page);
  }
  const csv = await page.request.get("/api/exportar/financeiro/aging?tipo=receber");
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
});
