import { expect, test, type Page } from "@playwright/test";

import { aguardarAvisosSumirem, entrarEEsperarPainel, semRolagemHorizontal, toast } from "./ajudantes";
import { contasPagarDasComprasDeTeste, criarAcabamentoDeTeste, criarObraDeTeste, criarPerfilPorKgDeTeste, estoqueDoProdutoDeTeste, lerCustoNoBanco, prepararUsuarioE2E, recebimentosDasComprasDeTeste } from "./banco";
import { ipFalso, USUARIO_E2E } from "./dados";

/**
 * Compras (Fase 6, Bloco 5): fornecedor e produto cadastrados na hora, pedido, recebimento com conversão kg → barras,
 * conta a pagar ligada à compra, último custo do produto e preço do kg. O custo é congelado no recebimento.
 */
test.describe.configure({ mode: "serial" });
test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(107) } });

const FORNECEDOR = "E2E Fornecedor Compras";
const CODIGO_RAPIDO = "E2E-RAPIDO-1";
const CODIGO_PERFIL = "E2E-KGC-1";
let compraUrl = "";
const dialogo = (page: Page) => page.getByRole("dialog");
const item = (page: Page, n: number) => page.getByRole("listitem", { name: `Item ${n}`, exact: true });

test.beforeAll(async () => {
  await prepararUsuarioE2E({ senhaDefinitiva: true });
  await criarObraDeTeste("Compras");
  const acabamentoId = await criarAcabamentoDeTeste("E2E Acabamento Compras");
  await criarPerfilPorKgDeTeste(CODIGO_PERFIL, "E2E Perfil Compra", acabamentoId, "0.500");
});

test.beforeEach(async ({ page }) => {
  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
});

/** Digita num campo de busca e espera a lista abrir; repete se a digitação veio antes da hidratação (o valor se perde). */
async function digitarAteAparecer(campo: ReturnType<Page["locator"]>, texto: string, opcao: ReturnType<Page["locator"]>) {
  await expect(async () => {
    await campo.fill("");
    await campo.fill(texto);
    await expect(opcao.first()).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
}

test("lança a compra cadastrando fornecedor e produto na hora e faz o pedido", async ({ page }) => {
  await page.goto("/compras/nova");
  await expect(page.getByRole("heading", { name: "Nova compra", level: 1 })).toBeVisible();

  // Fornecedor novo, direto no pedido.
  // O botão fica dentro de uma opção da lista (role=option): é a opção que se acha por papel.
  const cadastrarFornecedor = page.getByRole("option", { name: new RegExp(`Cadastrar “${FORNECEDOR}”`) });
  await digitarAteAparecer(page.locator("#cmp-fornecedor"), FORNECEDOR, cadastrarFornecedor);
  await cadastrarFornecedor.click();
  await expect(dialogo(page).getByRole("heading", { name: "Cadastrar fornecedor" })).toBeVisible();
  await dialogo(page).getByLabel("Telefone (opcional)").fill("22999990000");
  await dialogo(page).getByRole("button", { name: "Cadastrar fornecedor" }).click();
  await expect(toast(page, "Fornecedor cadastrado.")).toBeVisible();
  await aguardarAvisosSumirem(page);
  await expect(page.locator("#cmp-fornecedor")).toContainText(FORNECEDOR);

  // Item 1: produto novo, também na hora (sem custo; o primeiro custo vem desta compra).
  const cadastrarProduto = item(page, 1).getByRole("option", { name: /Cadastrar “E2E Produto rápido”/ });
  await digitarAteAparecer(item(page, 1).getByPlaceholder("Digite parte do código ou da descrição"), "E2E Produto rápido", cadastrarProduto);
  await cadastrarProduto.click();
  await dialogo(page).getByLabel("Código (opcional)").fill(CODIGO_RAPIDO);
  await dialogo(page).getByRole("button", { name: "Cadastrar produto" }).click();
  await expect(toast(page, "Produto cadastrado.")).toBeVisible();
  await aguardarAvisosSumirem(page);
  await item(page, 1).getByLabel("Quantidade").fill("10");
  await item(page, 1).getByLabel(/Preço por unidade/).fill("1250");

  // Item 2: perfil por kg já cadastrado: a unidade de compra vira kg.
  await page.getByRole("button", { name: "Adicionar item" }).click();
  const perfil = item(page, 2).getByRole("option", { name: /E2E-KGC-1/ });
  await digitarAteAparecer(item(page, 2).getByPlaceholder("Digite parte do código ou da descrição"), "E2E Perfil Compra", perfil);
  await perfil.first().click();
  await expect(item(page, 2).getByLabel("Unidade de compra")).toHaveValue("KG");
  await item(page, 2).getByLabel("Quantidade").fill("30");
  await item(page, 2).getByLabel(/Preço por kg/).fill("5200");
  await expect(page.getByText(/Total do pedido:/)).toContainText("1.685,00");
  await semRolagemHorizontal(page);

  await page.getByRole("button", { name: "Salvar e fazer o pedido" }).click();
  await expect(toast(page, "Pedido registrado.")).toBeVisible();
  // Espera a página da compra abrir (a URL "/compras/nova" também casaria com o padrão de id).
  await expect(page.getByRole("heading", { name: /^Compra C-\d{4}/, level: 1 })).toBeVisible();
  await expect(page).toHaveURL(/\/compras\/(?!nova)[\w-]+$/);
  compraUrl = new URL(page.url()).pathname;
  await expect(page.getByText("Pedido feito").first()).toBeVisible();
  await expect(page.getByText(/Total do pedido:/)).toContainText("1.685,00");
});

test("recebe tudo: o perfil em kg pede as barras, o preço do kg e o último custo se atualizam e a conta a pagar nasce ligada à compra", async ({ page }) => {
  await page.goto(compraUrl);
  await page.getByRole("button", { name: "Receber material" }).click();
  const d = dialogo(page);
  await expect(d.getByRole("heading", { name: "Receber material" })).toBeVisible();

  // Em kg, as barras que entraram precisam ser informadas (sugestão pelo peso nominal: 30 kg ÷ (0,5 kg/m × 6 m) = 10 barras).
  await d.getByRole("button", { name: "Registrar recebimento" }).click();
  await expect(d.getByRole("alert").filter({ hasText: /informe quantas barras entraram/ })).toBeVisible();
  await d.getByRole("button", { name: "Usar 10" }).click();
  await expect(d.getByLabel(/Atualizar o preço do kg do acabamento/)).toBeChecked();

  // Conta a pagar em 2 parcelas (categoria de despesa já existente).
  await d.getByLabel("Gerar a conta a pagar do que foi recebido").check();
  await d.getByLabel("Vencimento (1ª parcela)").fill("2027-02-10");
  await d.getByLabel("Parcelas").selectOption("2");
  await d.getByLabel("Categoria da despesa").selectOption({ index: 1 });
  await d.getByRole("button", { name: "Registrar recebimento" }).click();
  await expect(toast(page, "compra recebida por inteiro")).toBeVisible();
  await aguardarAvisosSumirem(page);

  await expect(page.getByText("Recebida", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Contas a pagar desta compra/)).toBeVisible();
  await expect(page.getByText(/nada é contado duas vezes/i)).toBeVisible();

  // Estoque, último custo e valor congelado.
  expect(await estoqueDoProdutoDeTeste(CODIGO_RAPIDO)).toMatchObject({ saldoCache: 10, somaDosMovimentos: 10 });
  expect(await estoqueDoProdutoDeTeste(CODIGO_PERFIL)).toMatchObject({ saldoCache: 10, somaDosMovimentos: 10 });
  expect(await lerCustoNoBanco(CODIGO_RAPIDO)).toBe(1250); // último custo
  expect(await lerCustoNoBanco(CODIGO_PERFIL)).toBe(15_600); // 52,00/kg × 0,5 kg/m × 6 m
  expect(await recebimentosDasComprasDeTeste(FORNECEDOR)).toEqual([
    { valorCentavos: 12_500, quantidadeCompra: "10.000", quantidadeEstoque: "10.000" },
    { valorCentavos: 156_000, quantidadeCompra: "30.000", quantidadeEstoque: "10.000" },
  ]);
  const contas = await contasPagarDasComprasDeTeste(FORNECEDOR);
  expect(contas).toHaveLength(2);
  expect(contas.reduce((s, c) => s + c.valorCentavos, 0)).toBe(168_500);
  expect(contas.every((c) => c.comCompra && c.parcelaTotal === 2)).toBe(true);
});

test("o recebimento não se estorna com conta a pagar ativa; a lista mostra a compra em 'Recebidas' e exporta CSV", async ({ page }) => {
  await page.goto(compraUrl);
  await page.getByRole("button", { name: "Estornar" }).click();
  await dialogo(page).getByLabel("Motivo").fill("Veio errado");
  await dialogo(page).getByRole("button", { name: "Estornar", exact: true }).click();
  await expect(dialogo(page).getByRole("alert")).toContainText(/conta a pagar ativa/);
  await dialogo(page).getByRole("button", { name: "Voltar" }).click();
  expect((await estoqueDoProdutoDeTeste(CODIGO_RAPIDO)).saldoCache).toBe(10); // nada mudou

  // PDF do pedido e link do WhatsApp (o fornecedor tem telefone cadastrado).
  const pdf = await page.request.get(`/api${compraUrl}/pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  expect((await page.request.get("/api/compras/inexistente123/pdf")).status()).toBe(404);
  await expect(page.getByRole("link", { name: "Enviar por WhatsApp" })).toHaveAttribute("href", /^https:\/\/wa\.me\/5522999990000\?text=/);
  await page.getByText("Ver a mensagem do pedido").click();
  await expect(page.getByText(/Segue o pedido C-\d{4}/)).toBeVisible();

  await page.goto("/compras?aba=recebidas&busca=E2E%20Fornecedor");
  await expect(page.getByRole("heading", { name: "Compras", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: /C-\d{4} · E2E Fornecedor Compras/ })).toBeVisible();
  await semRolagemHorizontal(page);
  const csv = await page.request.get("/api/exportar/compras?aba=todas&busca=E2E%20Fornecedor");
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(await csv.text()).toContain("E2E Fornecedor Compras");
});

test("compra com destino à obra não passa pelo estoque; vidro sob medida entra com medidas e sem produto", async ({ page }) => {
  await page.goto("/compras/nova?tipo=VIDRO");
  const doFornecedor = page.getByRole("option", { name: new RegExp(`^${FORNECEDOR}`) });
  await digitarAteAparecer(page.locator("#cmp-fornecedor"), "E2E Forn", doFornecedor);
  await doFornecedor.first().click();
  await expect(page.getByLabel("Destino")).toHaveValue("OBRA");
  const daObra = page.getByRole("option", { name: /E2E Obra Compras/ });
  await digitarAteAparecer(page.locator("#cmp-obra"), "E2E Obra Compras", daObra);
  await daObra.first().click();
  await item(page, 1).getByLabel("Largura (mm)").fill("1180");
  await item(page, 1).getByLabel("Altura (mm)").fill("980");
  await item(page, 1).getByLabel("Espessura (mm)").fill("8");
  await item(page, 1).getByLabel("Beneficiamentos (opcional)").fill("Temperado");
  await item(page, 1).getByLabel("Quantidade").fill("2");
  await item(page, 1).getByLabel(/Preço por unidade/).fill("19500");
  await page.getByRole("button", { name: "Salvar e fazer o pedido" }).click();
  await expect(toast(page, "Pedido registrado.")).toBeVisible();
  // A medida aparece no item e também no texto da mensagem do pedido (dentro do <details>): confere o item.
  await expect(page.getByRole("listitem").filter({ hasText: /1180 × 980 mm/ }).first()).toBeVisible();
  await expect(page.getByText("custo direto da obra").first()).toBeVisible();

  await page.getByRole("button", { name: "Receber material" }).click();
  await dialogo(page).getByRole("button", { name: "Registrar recebimento" }).click();
  await expect(toast(page, "compra recebida por inteiro")).toBeVisible();
  await aguardarAvisosSumirem(page);
  // Nenhum produto ganhou estoque com este recebimento (o vidro não tem produto) e o valor ficou congelado.
  const recebimentos = await recebimentosDasComprasDeTeste(FORNECEDOR);
  expect(recebimentos.at(-1)).toMatchObject({ valorCentavos: 39_000, quantidadeCompra: "2.000", quantidadeEstoque: "2.000" });
});
