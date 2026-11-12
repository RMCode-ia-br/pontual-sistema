import { expect, test, type Page } from "@playwright/test";

import { aguardarAvisosSumirem, entrarEEsperarPainel, semRolagemHorizontal, toast } from "./ajudantes";
import { criarObraDeTeste, criarProdutoDeTeste, estoqueDoProdutoDeTeste, prepararUsuarioE2E } from "./banco";
import { ipFalso, USUARIO_E2E } from "./dados";

/**
 * Estoque (Fase 6, Bloco 2): saldo parte de zero (nada inventado); entrada avulsa com custo atualiza o custo do produto;
 * saída para obra congela o custo; saída sem saldo exige confirmação e justificativa; estorno cria o movimento inverso;
 * contagem inicial opcional só para produto sem movimentos.
 */
test.describe.configure({ mode: "serial" });
test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(104) } });

const CODIGO = "E2E-EST-1";
const CODIGO_CONTAGEM = "E2E-EST-2";
let produtoId: string;
let contagemId: string;
const dialogo = (page: Page) => page.getByRole("dialog");
const urlDoProduto = () => `/produtos/${produtoId}?aba=estoque`;

test.beforeAll(async () => {
  await prepararUsuarioE2E({ senhaDefinitiva: true });
  await criarObraDeTeste("Estoque");
  produtoId = await criarProdutoDeTeste(CODIGO, "E2E Perfil de teste");
  contagemId = await criarProdutoDeTeste(CODIGO_CONTAGEM, "E2E Produto da contagem");
});

test.beforeEach(async ({ page }) => {
  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
});

async function abrirMovimento(page: Page, tipo: string) {
  await page.getByRole("button", { name: "Registrar movimento" }).click();
  await dialogo(page).getByLabel("Tipo").selectOption(tipo);
}

test("o produto novo parte de saldo zero e sem custo: nada inventado", async ({ page }) => {
  await page.goto(urlDoProduto());
  await expect(page.getByText("Saldo em estoque").locator("..")).toContainText("0 un");
  await expect(page.getByText("Custo unitário atual").locator("..")).toContainText("Sem custo");
  await expect(page.getByText(/Nenhum movimento ainda/)).toBeVisible();
  await expect(page.getByText(/Sem estoque mínimo definido/)).toBeVisible();
  await semRolagemHorizontal(page);
});

test("entrada avulsa com custo: o saldo sobe e o custo do produto passa a ser esse (último custo)", async ({ page }) => {
  await page.goto(urlDoProduto());
  await abrirMovimento(page, "ENTRADA_COMPRA");
  await dialogo(page).getByLabel(/Quantidade/).fill("10");
  await dialogo(page).getByLabel(/Custo unitário desta compra/).fill("1250");
  await dialogo(page).getByRole("button", { name: "Registrar", exact: true }).click();
  await expect(toast(page, "Movimento registrado.")).toBeVisible();
  await aguardarAvisosSumirem(page);
  await expect(page.getByText("Saldo em estoque").locator("..")).toContainText("10 un");
  await expect(page.getByText("Custo unitário atual").locator("..")).toContainText("12,50");
  await expect(page.getByText("Entrada de compra").first()).toBeVisible();
  const e = await estoqueDoProdutoDeTeste(CODIGO);
  expect(e).toEqual({ saldoCache: 10, somaDosMovimentos: 10, movimentos: 1 });
});

test("saída para a obra: pede a obra, congela o custo e baixa o saldo", async ({ page }) => {
  await page.goto(urlDoProduto());
  await abrirMovimento(page, "SAIDA_OBRA");
  await dialogo(page).getByLabel(/Quantidade/).fill("3");
  // Sem escolher a obra, o servidor recusa.
  await dialogo(page).getByRole("button", { name: "Registrar", exact: true }).click();
  await expect(dialogo(page).getByText("Escolha a obra.").first()).toBeVisible();

  await dialogo(page).getByLabel("Obra", { exact: false }).first().fill("E2E Obra Estoque");
  await dialogo(page).getByRole("option", { name: /E2E Obra Estoque/ }).first().click();
  await dialogo(page).getByRole("button", { name: "Registrar", exact: true }).click();
  await expect(toast(page, "Movimento registrado.")).toBeVisible();
  await aguardarAvisosSumirem(page);
  await expect(page.getByText("Saldo em estoque").locator("..")).toContainText("7 un");
  await expect(page.getByText("Saída para obra").first()).toBeVisible();
  await expect(page.getByText("−3 un")).toBeVisible();
  await expect(page.getByText("a R$ 12,50").first()).toBeVisible();
  expect(await estoqueDoProdutoDeTeste(CODIGO)).toEqual({ saldoCache: 7, somaDosMovimentos: 7, movimentos: 2 });
});

test("saída maior que o saldo: só com confirmação e justificativa; fica marcada", async ({ page }) => {
  await page.goto(urlDoProduto());
  await abrirMovimento(page, "PERDA");
  await dialogo(page).getByLabel(/Quantidade/).fill("20");
  await expect(dialogo(page).getByText(/passa do saldo/)).toBeVisible();
  await dialogo(page).getByRole("button", { name: "Registrar", exact: true }).click();
  await expect(dialogo(page).getByRole("alert").first()).toContainText(/maior que o saldo/);
  expect((await estoqueDoProdutoDeTeste(CODIGO)).movimentos).toBe(2); // nada gravado

  await dialogo(page).getByLabel("Confirmo: o saldo vai ficar negativo").check();
  await dialogo(page).getByRole("button", { name: "Registrar", exact: true }).click();
  await expect(dialogo(page).getByRole("alert").first()).toContainText(/justificativa/);
  await dialogo(page).getByLabel("Justificativa").fill("Quebrou no transporte");
  await dialogo(page).getByRole("button", { name: "Registrar", exact: true }).click();
  await expect(toast(page, "Movimento registrado.")).toBeVisible();
  await aguardarAvisosSumirem(page);
  await expect(page.getByText("Saldo em estoque").locator("..")).toContainText("-13 un");
  await expect(page.getByText("Sem saldo (confirmado)")).toBeVisible();
  expect(await estoqueDoProdutoDeTeste(CODIGO)).toEqual({ saldoCache: -13, somaDosMovimentos: -13, movimentos: 3 });
});

test("estornar a perda cria o movimento inverso e devolve o saldo; não estorna duas vezes", async ({ page }) => {
  await page.goto(urlDoProduto());
  const linha = page.getByRole("listitem").filter({ hasText: "Quebrou no transporte" });
  await linha.getByRole("button", { name: "Estornar" }).click();
  await dialogo(page).getByLabel("Motivo").fill("Lançada por engano");
  await dialogo(page).getByRole("button", { name: "Estornar", exact: true }).click();
  await expect(toast(page, "Movimento estornado.")).toBeVisible();
  await aguardarAvisosSumirem(page);
  await expect(page.getByText("Saldo em estoque").locator("..")).toContainText("7 un");
  await expect(page.getByText("Estornado", { exact: true })).toBeVisible();
  await expect(page.getByText("Estorno", { exact: true })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Quebrou no transporte" }).getByRole("button", { name: "Estornar" })).toHaveCount(0);
  expect(await estoqueDoProdutoDeTeste(CODIGO)).toEqual({ saldoCache: 7, somaDosMovimentos: 7, movimentos: 4 });
});

test("a lista de movimentações filtra por tipo e mostra o saldo da lista de produtos", async ({ page }) => {
  await page.goto("/estoque/movimentacoes?busca=E2E%20Perfil&tipo=SAIDA_OBRA");
  await expect(page.getByRole("heading", { name: "Movimentações de estoque", level: 1 })).toBeVisible();
  // O texto também existe nas opções do filtro: confere só os itens da lista.
  const itens = page.getByRole("listitem");
  await expect(itens.filter({ hasText: "Saída para obra" }).first()).toBeVisible();
  await expect(itens.filter({ hasText: "Entrada de compra" })).toHaveCount(0);
  await semRolagemHorizontal(page);

  const csv = await page.request.get("/api/exportar/estoque/movimentacoes?busca=E2E%20Perfil");
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(await csv.text()).toContain("E2E Perfil de teste");

  await page.goto("/produtos?busca=E2E-EST-1");
  await expect(page.getByText("7 un").locator("visible=true").first()).toBeVisible();
});

test("contagem inicial: só entra o que for digitado, e o produto sai da grade depois", async ({ page }) => {
  await page.goto("/estoque/inventario-inicial?busca=E2E-EST");
  await expect(page.getByRole("heading", { name: "Contagem inicial do estoque", level: 1 })).toBeVisible();
  // O produto que já tem movimentos não aparece; o outro, sim, sem nada preenchido.
  await expect(page.getByText("E2E Perfil de teste")).toHaveCount(0);
  await expect(page.getByText("E2E Produto da contagem")).toBeVisible();
  await expect(page.getByRole("button", { name: "Registrar a contagem" })).toBeDisabled();
  await semRolagemHorizontal(page);

  await page.getByLabel("Quantidade contada de E2E Produto da contagem").fill("15");
  await page.getByRole("button", { name: "Registrar a contagem" }).click();
  await expect(toast(page, /Contagem inicial registrada para 1 produto/)).toBeVisible();
  await aguardarAvisosSumirem(page);
  await expect(page.getByText("E2E Produto da contagem")).toHaveCount(0);
  expect(await estoqueDoProdutoDeTeste(CODIGO_CONTAGEM)).toEqual({ saldoCache: 15, somaDosMovimentos: 15, movimentos: 1 });

  // Sem custo informado, o produto continua sem custo (nada inventado).
  await page.goto(`/produtos/${contagemId}?aba=estoque`);
  await expect(page.getByText("Custo unitário atual").locator("..")).toContainText("Sem custo");
  await expect(page.getByText("Contagem inicial").first()).toBeVisible();
});
