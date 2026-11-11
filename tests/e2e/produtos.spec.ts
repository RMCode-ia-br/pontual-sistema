import { expect, test, type Page } from "@playwright/test";

import { aguardarAvisosSumirem, ehCelular, entrarEEsperarPainel, semRolagemHorizontal, toast } from "./ajudantes";
import { alterarCustoDiretoNoBanco, buscarAuditoriaFeitaPeloE2E, lerCustoNoBanco, prepararUsuarioE2E } from "./banco";
import { ipFalso, USUARIO_E2E } from "./dados";

test.describe.configure({ mode: "serial" });
test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(84) } });

test.beforeAll(async () => {
  await prepararUsuarioE2E({ senhaDefinitiva: true });
});

test.beforeEach(async ({ page }) => {
  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
});

const FORNECEDOR = "E2E Fornecedor de Perfis";
const P1 = { codigo: "E2E-P1", descricao: "E2E Perfil Alumínio A" };
const P2 = { codigo: "E2E-P2", descricao: "E2E Perfil Alumínio B" };
const P3 = { codigo: "E2E-P3", descricao: "E2E Item sem custo" };

let idP1 = "";

const linkDoProduto = (page: Page, descricao: string) => page.getByRole("link", { name: descricao, exact: true });

async function esperarFicha(page: Page): Promise<string> {
  await expect(page).toHaveURL(/\/produtos\/(?!novo|reajuste)[a-z0-9]+$/);
  return page.url().split("/").pop() ?? "";
}

async function cadastrarProduto(page: Page, p: { codigo: string; descricao: string }, custo?: string) {
  await page.goto("/produtos/novo");
  await page.getByLabel("Código").fill(p.codigo);
  await page.getByLabel("Descrição").fill(p.descricao);
  await page.getByLabel("Unidade de medida").selectOption("BARRA");
  await page.getByLabel("Fornecedor principal").selectOption({ label: FORNECEDOR });
  if (custo) await page.getByLabel("Custo unitário (R$)").pressSequentially(custo);
  await page.getByRole("button", { name: "Cadastrar produto" }).click();
  await expect(toast(page, "Produto cadastrado.")).toBeVisible();
  return esperarFicha(page);
}

async function pedirPrevia(page: Page, valor: string, modo: "PERCENTUAL" | "VALOR_FIXO" = "PERCENTUAL") {
  await page.goto("/produtos/reajuste");
  await page.getByLabel("Fornecedor").selectOption({ label: FORNECEDOR });
  await page.getByLabel("Tipo de reajuste").selectOption(modo);
  await page.getByLabel(modo === "PERCENTUAL" ? "Percentual" : "Valor em reais").fill(valor);
  await page.getByRole("button", { name: "Ver prévia" }).click();
}

test("cria o fornecedor usado nos testes de produto", async ({ page }) => {
  await page.goto("/fornecedores/novo");
  await page.getByLabel("Razão social ou nome").fill(FORNECEDOR);
  await page.getByRole("button", { name: "Cadastrar fornecedor" }).click();
  await expect(toast(page, "Fornecedor cadastrado.")).toBeVisible();
});

test("o formulário valida a descrição no servidor e explica o custo vazio", async ({ page }) => {
  await page.goto("/produtos/novo");
  await expect(page.getByText(/o sistema nunca inventa preço/)).toBeVisible();
  await page.getByLabel("Código").fill("E2E-X");
  await page.getByLabel("Descrição").fill("x");
  await page.getByRole("button", { name: "Cadastrar produto" }).click();
  await expect(page.getByText("Informe a descrição.")).toBeVisible();
  await semRolagemHorizontal(page);
});

test("cadastrar produto com custo grava o custo inicial no histórico e usa 6.000 mm na barra", async ({ page }) => {
  idP1 = await cadastrarProduto(page, P1, "10000");
  await expect(page.getByRole("heading", { name: P1.descricao })).toBeVisible();
  await expect(page.getByText(/R\$\s*100,00 por barra/)).toBeVisible();
  await expect(page.getByLabel("Custo unitário (R$)")).toHaveValue("100,00");
  await expect(page.getByLabel("Comprimento da barra (mm)")).toHaveValue("6000");

  await page.goto(`/produtos/${idP1}?aba=historico`);
  await expect(page.getByText("sem custo")).toBeVisible();
  await expect(page.getByText("Custo inicial")).toBeVisible();
  await expect(page.getByText(/Digitado/)).toBeVisible();
});

test("outros dois produtos: um com custo de 5 centavos e um sem custo", async ({ page }) => {
  await cadastrarProduto(page, P2, "5");
  await cadastrarProduto(page, P3);
  await expect(page.getByText("Sem custo informado")).toBeVisible();
});

test("código repetido é recusado, mesmo com outra caixa de letras", async ({ page }) => {
  await page.goto("/produtos/novo");
  await page.getByLabel("Código").fill("e2e-p1");
  await page.getByLabel("Descrição").fill("E2E Outro perfil");
  await page.getByRole("button", { name: "Cadastrar produto" }).click();
  await expect(page.getByText(`Código já usado em ${P1.descricao}.`)).toBeVisible();
  await expect(page).toHaveURL(/\/produtos\/novo/);
});

test("mudar o custo à mão grava antes e depois no histórico e na auditoria", async ({ page }) => {
  await page.goto(`/produtos/${idP1}`);
  await page.getByLabel("Custo unitário (R$)").fill("");
  await page.getByLabel("Custo unitário (R$)").pressSequentially("11000");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(toast(page, "Produto atualizado.")).toBeVisible();
  await page.goto(`/produtos/${idP1}?aba=historico`);
  const itens = page.locator("ol li");
  await expect(itens).toHaveCount(2);
  await expect(itens.first()).toContainText("R$ 100,00");
  await expect(itens.first()).toContainText("R$ 110,00");
  await expect(itens.first()).toContainText("+10,0%");
  const logs = await buscarAuditoriaFeitaPeloE2E("Produto", "ATUALIZAR");
  expect(JSON.stringify(logs[0].depois)).toContain("11000");
});

test("a lista busca sem acento, filtra por 'sem custo' e mostra o custo com a unidade", async ({ page }) => {
  await page.goto("/produtos?busca=aluminio");
  await expect(linkDoProduto(page, P1.descricao)).toBeVisible();
  await expect(linkDoProduto(page, P2.descricao)).toBeVisible();
  const linha = ehCelular(page) ? page.locator("ul li").filter({ hasText: P1.descricao }) : page.locator("tr").filter({ hasText: P1.descricao });
  await expect(linha).toContainText("/ barra");

  await page.goto("/produtos?busca=E2E&custo=sem");
  await expect(linkDoProduto(page, P3.descricao)).toBeVisible();
  await expect(linkDoProduto(page, P1.descricao)).toHaveCount(0);
  await semRolagemHorizontal(page);
});

test("reajuste: valor inválido é recusado antes da prévia", async ({ page }) => {
  await pedirPrevia(page, "abc");
  await expect(page.getByText("Percentual inválido. Use números, por exemplo 5 ou -3,5.").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: /Prévia/ })).toHaveCount(0);
});

test("reajuste: a prévia mostra antes e depois, o que será ignorado e o porquê, sem gravar nada", async ({ page }) => {
  await pedirPrevia(page, "10");
  await expect(page.getByRole("heading", { name: /Prévia: Fornecedor E2E Fornecedor de Perfis, \+10%/ })).toBeVisible();
  const resumo = page.getByRole("term").filter({ hasText: "Produtos reajustados" }).locator("xpath=following-sibling::dd[1]");
  await expect(resumo).toHaveText("2");
  const tabela = page.getByRole("table", { name: "Produtos que serão reajustados" });
  await expect(tabela.locator("tr").filter({ hasText: P1.codigo })).toContainText("R$ 110,00");
  await expect(tabela.locator("tr").filter({ hasText: P1.codigo })).toContainText("R$ 121,00");
  await expect(tabela.locator("tr").filter({ hasText: P2.codigo })).toContainText("R$ 0,05");
  await expect(tabela.locator("tr").filter({ hasText: P2.codigo })).toContainText("R$ 0,06"); // meio centavo para cima
  await page.getByText(/1 produto ignorado/).click();
  await expect(page.getByText("Produto sem custo informado.")).toBeVisible();
  // Nada foi gravado.
  expect(await lerCustoNoBanco(P1.codigo)).toBe(11000);
  expect(await lerCustoNoBanco(P2.codigo)).toBe(5);
});

test("mexer no formulário depois da prévia a invalida", async ({ page }) => {
  await pedirPrevia(page, "10");
  await expect(page.getByRole("heading", { name: /Prévia/ })).toBeVisible();
  await page.getByLabel("Percentual").fill("12");
  await expect(page.getByRole("heading", { name: /Prévia/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Aplicar o reajuste" })).toHaveCount(0);
});

test("reajuste que zeraria o custo mostra o motivo e não deixa aplicar", async ({ page }) => {
  await pedirPrevia(page, "-1000,00", "VALOR_FIXO");
  await expect(page.getByText(/Nenhum produto seria reajustado/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Aplicar o reajuste" })).toBeDisabled();
  await page.getByText(/produtos ignorados/).click();
  await expect(page.getByText("O novo custo ficaria zerado ou negativo.").first()).toBeVisible();
});

test("se alguém alterar um custo depois da prévia, o servidor recusa e não grava nada", async ({ page }) => {
  await pedirPrevia(page, "10");
  await expect(page.getByRole("heading", { name: /Prévia/ })).toBeVisible();
  await alterarCustoDiretoNoBanco(P1.codigo, 11500); // outra pessoa editou nesse meio-tempo
  await page.getByRole("button", { name: "Aplicar o reajuste" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Aplicar reajuste" }).click();
  await expect(toast(page, /mudaram desde a prévia/)).toBeVisible();
  expect(await lerCustoNoBanco(P1.codigo)).toBe(11500);
  expect(await lerCustoNoBanco(P2.codigo)).toBe(5);
  await alterarCustoDiretoNoBanco(P1.codigo, 11000);
});

test("aplicar o reajuste muda os custos, grava histórico de lote e auditoria", async ({ page }) => {
  await pedirPrevia(page, "10");
  await page.getByRole("button", { name: "Aplicar o reajuste" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Para desfazer, será preciso aplicar o reajuste contrário");
  await page.getByRole("alertdialog").getByRole("button", { name: "Aplicar reajuste" }).click();
  await expect(toast(page, "2 produtos reajustados (+10%).")).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Cada mudança ficou registrada no histórico de preço");
  await aguardarAvisosSumirem(page);

  expect(await lerCustoNoBanco(P1.codigo)).toBe(12100);
  expect(await lerCustoNoBanco(P2.codigo)).toBe(6);
  expect(await lerCustoNoBanco(P3.codigo)).toBeNull(); // sem custo: nunca recebe preço inventado

  await page.goto(`/produtos/${idP1}?aba=historico`);
  const primeiro = page.locator("ol li").first();
  await expect(primeiro).toContainText("R$ 110,00");
  await expect(primeiro).toContainText("R$ 121,00");
  await expect(primeiro).toContainText("Reajuste em lote");
  await expect(primeiro).toContainText(`+10% · Fornecedor ${FORNECEDOR}`);

  const logs = await buscarAuditoriaFeitaPeloE2E("Produto", "REAJUSTE_LOTE");
  expect(logs).toHaveLength(1);
  expect(JSON.stringify(logs[0].depois)).toContain('"produtos":2');
});

test("produto inativo não entra no reajuste", async ({ page }) => {
  await page.goto("/produtos?busca=E2E");
  await page.getByRole("checkbox", { name: `Marcar ${P2.descricao}` }).check();
  await page.getByRole("button", { name: "Inativar", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Inativar" }).click();
  await expect(toast(page, "1 produto inativado.")).toBeVisible();
  await pedirPrevia(page, "10");
  const resumo = page.getByRole("term").filter({ hasText: "Produtos reajustados" }).locator("xpath=following-sibling::dd[1]");
  await expect(resumo).toHaveText("1");
});

test("exportar CSV traz o custo em reais com vírgula", async ({ page }) => {
  const r = await page.request.get("/api/exportar/produtos?busca=E2E&situacao=todos");
  expect(r.status()).toBe(200);
  const corpo = await r.text();
  expect(corpo).toContain("Código;Descrição;Categoria;Unidade;Fornecedor;Custo unitário (R$)");
  expect(corpo).toMatch(/E2E-P1;.*;121,00;/);
  expect(corpo).toMatch(/E2E-P2;.*;0,06;/);
});

test("anexos do produto e envio à lixeira liberam o código", async ({ page }) => {
  await page.goto(`/produtos/${idP1}?aba=anexos`);
  await expect(page.getByText("Nenhum arquivo ainda")).toBeVisible();
  await page.goto(`/produtos/${idP1}`);
  await page.getByRole("button", { name: "Enviar à lixeira" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Enviar à lixeira" }).click();
  await expect(toast(page, "1 produto enviado para a lixeira.")).toBeVisible();
  await expect(page).toHaveURL(/\/produtos$/);
  await page.goto(`/produtos/${idP1}`);
  await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
  // O código ficou livre para um produto novo.
  await cadastrarProduto(page, { codigo: P1.codigo, descricao: "E2E Perfil reaproveitando o código" }, "100");
});

test("as telas de produtos cabem no celular", async ({ page }) => {
  for (const caminho of ["/produtos", "/produtos/novo", "/produtos/reajuste"]) {
    await page.goto(caminho);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await semRolagemHorizontal(page);
  }
});
