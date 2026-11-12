import { expect, test, type Page } from "@playwright/test";

import { aguardarAvisosSumirem, entrarEEsperarPainel, semRolagemHorizontal, toast } from "./ajudantes";
import { criarCategoriaFinanceiraDeTeste, prepararUsuarioE2E } from "./banco";
import { ipFalso, USUARIO_E2E } from "./dados";

/** A pagar: conta única, parcelada e recorrente; baixa parcial e total; estorno; atraso derivado; exportação. */
test.describe.configure({ mode: "serial" });
test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(101) } });

const NOME_DA_CONTA = "E2E Conta Pagar";
// Categorias de despesa do próprio teste (o dono pode renomear ou excluir as do catálogo).
const CATEGORIA_PADRAO = "E2E Despesa Vidros";
const CATEGORIA_ALUGUEL = "E2E Aluguel";
const dialogo = (page: Page) => page.getByRole("dialog");

/** Data "aaaa-mm-dd" a `dias` de hoje (fuso de São Paulo, como o navegador do teste). */
function aDias(dias: number): string {
  const d = new Date(Date.now() + dias * 86_400_000);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(d);
}

test.beforeAll(async () => {
  await prepararUsuarioE2E({ senhaDefinitiva: true });
  await criarCategoriaFinanceiraDeTeste(CATEGORIA_PADRAO, "DESPESA", "CUSTOS_DIRETOS");
  await criarCategoriaFinanceiraDeTeste(CATEGORIA_ALUGUEL, "DESPESA", "DESPESAS_FIXAS");
});

test.beforeEach(async ({ page }) => {
  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
});

async function novaConta(page: Page, campos: { descricao: string; valor: string; vencimento?: string; categoria?: string; modo?: string; parcelas?: string }) {
  await page.getByRole("button", { name: "Nova conta a pagar" }).first().click();
  const d = dialogo(page);
  if (campos.modo) await d.getByLabel("Como lançar").selectOption(campos.modo);
  await d.getByLabel("Descrição").fill(campos.descricao);
  await d.getByLabel(/^(Valor|Valor total|Valor de cada vez)/).fill(campos.valor);
  if (campos.vencimento) await d.getByLabel(/Vencimento|Primeiro vencimento/).fill(campos.vencimento);
  if (campos.parcelas) await d.getByLabel("Número de parcelas").fill(campos.parcelas);
  await d.getByLabel("Categoria").selectOption({ label: campos.categoria ?? CATEGORIA_PADRAO });
  await d.getByRole("button", { name: "Criar" }).click();
}

test("cadastra a conta financeira de onde sairá o dinheiro", async ({ page }) => {
  await page.goto("/financeiro/contas");
  await page.getByRole("button", { name: /Nova conta|Cadastrar a primeira conta/ }).first().click();
  await page.getByLabel("Nome").fill(NOME_DA_CONTA);
  await page.getByRole("button", { name: "Cadastrar conta" }).click();
  await expect(toast(page, "Conta cadastrada.")).toBeVisible();
});

test("conta única: pagar em duas vezes fecha a conta; o estorno devolve o saldo", async ({ page }) => {
  await page.goto("/financeiro/pagar");
  await expect(page.getByRole("heading", { name: "A pagar", level: 1 })).toBeVisible();
  await novaConta(page, { descricao: "E2E Vidro do fornecedor", valor: "100000", vencimento: aDias(5) });
  await expect(toast(page, "Conta a pagar criada.")).toBeVisible();
  await aguardarAvisosSumirem(page);

  await page.goto("/financeiro/pagar?busca=E2E%20Vidro");
  await page.getByRole("link", { name: "E2E Vidro do fornecedor" }).click();
  await expect(page.getByText("Falta pagar").locator("..")).toContainText("1.000,00");

  await page.getByRole("button", { name: "Registrar pagamento" }).click();
  await dialogo(page).getByLabel("Valor pago").fill("40000");
  await dialogo(page).getByLabel("Conta de onde saiu").selectOption({ label: NOME_DA_CONTA });
  await dialogo(page).getByRole("button", { name: "Registrar pagamento" }).click();
  await expect(toast(page, "Pagamento parcial registrado.")).toBeVisible();
  await aguardarAvisosSumirem(page);
  await expect(page.getByText("Falta pagar").locator("..")).toContainText("600,00");

  // Passar do saldo é recusado.
  await page.getByRole("button", { name: "Registrar pagamento" }).click();
  await dialogo(page).getByLabel("Valor pago").fill("700000");
  await dialogo(page).getByLabel("Conta de onde saiu").selectOption({ label: NOME_DA_CONTA });
  await dialogo(page).getByRole("button", { name: "Registrar pagamento" }).click();
  await expect(dialogo(page).getByRole("alert").first()).toContainText("passa do saldo");
  await dialogo(page).getByRole("button", { name: "Pagar o saldo todo" }).click();
  await dialogo(page).getByRole("button", { name: "Registrar pagamento" }).click();
  await expect(toast(page, "Pagamento registrado: conta quitada.")).toBeVisible();
  await aguardarAvisosSumirem(page);
  await expect(page.getByRole("button", { name: "Registrar pagamento" })).toHaveCount(0);
  await semRolagemHorizontal(page);

  // Estorna o último pagamento (R$ 600,00): a conta volta a dever.
  await page.getByRole("link", { name: /R\$\s?600,00 em/ }).click();
  await page.getByRole("button", { name: "Estornar" }).click();
  await page.getByLabel("Motivo").fill("Boleto pago em duplicidade");
  await page.getByRole("button", { name: "Estornar", exact: true }).last().click();
  await expect(toast(page, "Lançamento estornado.")).toBeVisible();
  await page.goBack();
  await page.reload();
  await expect(page.getByText("Falta pagar").locator("..")).toContainText("600,00");
});

test("conta atrasada aparece na aba Atrasadas, derivada da data", async ({ page }) => {
  await page.goto("/financeiro/pagar");
  await novaConta(page, { descricao: "E2E Conta vencida", valor: "5000", vencimento: aDias(-3) });
  await expect(toast(page, "Conta a pagar criada.")).toBeVisible();
  await aguardarAvisosSumirem(page);

  await page.goto("/financeiro/pagar?aba=atrasadas&busca=E2E%20Conta%20vencida");
  await expect(page.getByRole("link", { name: "E2E Conta vencida" })).toBeVisible();
  await expect(page.getByText("Atrasada há 3 dias").locator("visible=true").first()).toBeVisible();
  await page.goto("/financeiro/pagar?aba=hoje&busca=E2E%20Conta%20vencida");
  await expect(page.getByRole("link", { name: "E2E Conta vencida" })).toHaveCount(0);
  await semRolagemHorizontal(page);
});

test("conta parcelada: 3 parcelas mensais que somam o total (a última absorve a diferença)", async ({ page }) => {
  await page.goto("/financeiro/pagar");
  await novaConta(page, { descricao: "E2E Compra parcelada", valor: "10000", vencimento: aDias(10), modo: "PARCELADA", parcelas: "3" });
  await expect(toast(page, "3 parcelas criadas.")).toBeVisible();
  await aguardarAvisosSumirem(page);

  await page.goto("/financeiro/pagar?aba=todas&busca=E2E%20Compra%20parcelada");
  await expect(page.getByRole("link", { name: /E2E Compra parcelada \(\d\/3\)/ })).toHaveCount(3);
  // Tabela no desktop e cartões no celular: o texto está nas duas versões do DOM.
  await expect(page.locator("main")).toContainText("33,33");
  await expect(page.locator("main")).toContainText("33,34");
});

test("conta recorrente: gera os próximos meses, edita e encerra", async ({ page }) => {
  await page.goto("/financeiro/pagar");
  await novaConta(page, { descricao: "E2E Aluguel da oficina", valor: "250000", vencimento: aDias(7), modo: "RECORRENTE", categoria: CATEGORIA_ALUGUEL });
  await expect(toast(page, /Recorrência criada: \d+ contas? geradas?/)).toBeVisible();
  await aguardarAvisosSumirem(page);

  await page.goto("/financeiro/pagar/recorrencias");
  await expect(page.getByRole("heading", { name: "Contas recorrentes", level: 1 })).toBeVisible();
  const item = page.getByRole("listitem").filter({ hasText: "E2E Aluguel da oficina" });
  await expect(item).toContainText("Todo mês");
  await semRolagemHorizontal(page);

  await item.getByRole("button", { name: /Editar a recorrência/ }).click();
  await dialogo(page).getByLabel("Valor de cada vez").fill("260000");
  await dialogo(page).getByRole("button", { name: "Salvar" }).click();
  await expect(toast(page, /Recorrência atualizada/)).toBeVisible();
  await aguardarAvisosSumirem(page);
  await expect(item).toContainText("2.600,00");

  await item.getByRole("button", { name: /Encerrar a recorrência/ }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Encerrar", exact: true }).click();
  await expect(toast(page, /Recorrência encerrada/)).toBeVisible();
  await expect(item).toContainText("Encerrada");
});

test("exporta em CSV com sessão e recusa sem sessão", async ({ page, request, baseURL }) => {
  const resposta = await page.request.get("/api/exportar/financeiro/pagar?aba=todas&busca=E2E");
  expect(resposta.status()).toBe(200);
  expect(resposta.headers()["content-type"]).toContain("text/csv");
  expect(await resposta.text()).toContain("E2E Vidro do fornecedor");
  const semSessao = await request.get(`${baseURL}/api/exportar/financeiro/pagar`, { maxRedirects: 0 });
  expect([307, 401]).toContain(semSessao.status());
  expect(semSessao.headers()["content-type"] ?? "").not.toContain("text/csv");
});
