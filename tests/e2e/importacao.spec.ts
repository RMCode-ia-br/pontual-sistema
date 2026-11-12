import { expect, test, type Page } from "@playwright/test";

import { entrarEEsperarPainel, semRolagemHorizontal, toast } from "./ajudantes";
import { criarCategoriaDeProdutoDeTeste, criarFornecedorDeTeste, prepararUsuarioE2E } from "./banco";
import { ipFalso, USUARIO_E2E } from "./dados";
import { csvDaPlanilhaDeExemplo } from "../fixtures/planilha-de-produtos";

test.describe.configure({ mode: "serial" });
test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(85) } });

// A planilha de exemplo usa fornecedores e categorias criados aqui (prefixo "E2E "), nunca os do cadastro real:
// o dono pode excluir ou renomear os semeados sem quebrar este teste. A limpeza do `banco.ts` remove todos.
const CATEGORIAS = ["E2E Imp Cat 1", "E2E Imp Cat 2", "E2E Imp Cat 3", "E2E Imp Cat 4"];
const FORNECEDORES = ["E2E Imp Forn A", "E2E Imp Forn B", "E2E Imp Forn C", "E2E Imp Forn D"];

test.beforeAll(async () => {
  await prepararUsuarioE2E({ senhaDefinitiva: true });
  for (const nome of CATEGORIAS) await criarCategoriaDeProdutoDeTeste(nome);
  for (const nome of FORNECEDORES) await criarFornecedorDeTeste(nome);
});

test.beforeEach(async ({ page }) => {
  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
});

const PREFIXO = "E2E-IMP-";

async function enviar(page: Page, csv: string, nome = "produtos.csv") {
  await page.goto("/configuracoes/importacao");
  await page.getByTestId("entrada-planilha").setInputFiles({ name: nome, mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
}

test("a tela abre com os 4 passos, o modelo para baixar e sem rolagem horizontal", async ({ page }) => {
  await page.goto("/configuracoes/importacao");
  await expect(page.getByRole("heading", { name: "Importação de planilhas" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Passos da importação" }).getByRole("listitem")).toHaveCount(4);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Baixar modelo de planilha" }).click()]);
  expect(download.suggestedFilename()).toBe("modelo-produtos.csv");
  await semRolagemHorizontal(page);
});

test("arquivo que não é planilha é recusado com mensagem clara", async ({ page }) => {
  await page.goto("/configuracoes/importacao");
  await page.getByTestId("entrada-planilha").setInputFiles({ name: "foto.png", mimeType: "image/png", buffer: Buffer.from("x") });
  await expect(page.getByRole("alert").filter({ hasText: "Envie um arquivo .csv ou .xlsx." })).toBeVisible();
});

test("passo 2 sugere as colunas e exige as obrigatórias", async ({ page }) => {
  await enviar(page, "Coluna A;Coluna B\r\n1;2\r\n");
  await expect(page.getByRole("heading", { name: /Quais colunas/ })).toBeVisible();
  await expect(page.getByText(/Falta escolher a coluna de: Código, Descrição/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Conferir a planilha" })).toBeDisabled();
});

test("importa 300 produtos de exemplo: confere erros e repetidas, importa só as válidas e desfaz", async ({ page }) => {
  await enviar(page, csvDaPlanilhaDeExemplo({ prefixo: PREFIXO, comProblemas: true, categorias: CATEGORIAS, fornecedores: FORNECEDORES }));
  // Mapeamento automático já acerta pelos nomes das colunas.
  await expect(page.getByLabel("Código", { exact: false }).first()).toHaveValue("0");
  await page.getByRole("button", { name: "Conferir a planilha" }).click();

  await expect(page.getByRole("heading", { name: /Conferência/ })).toBeVisible();
  const total = (rotulo: string) => page.getByRole("term").filter({ hasText: rotulo }).locator("xpath=following-sibling::dd[1]");
  await expect(total("Novos")).toHaveText("300");
  await expect(total("Repetidos")).toHaveText("1");
  await expect(total("Com erro")).toHaveText("4");
  await expect(page.getByText("Repetida no arquivo: mesmo código da linha 2.")).toBeVisible();
  await expect(page.getByText(/Unidade "CAIXA" não existe/)).toBeVisible();

  // Com erros, não dá para importar sem escolher importar só as válidas.
  const importar = page.getByRole("button", { name: /^Importar 300 registros/ });
  await expect(importar).toBeDisabled();
  await page.getByLabel(/Importar só as 300 linhas válidas/).check();
  await importar.click();

  await expect(toast(page, /Importação concluída: 300 criados, 5 ignorados/)).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Importação concluída");

  await page.goto(`/produtos?busca=${PREFIXO}`);
  await expect(page.getByText("Mostrando 1–25 de 300")).toBeVisible();

  // Desfazer pela lista de importações anteriores.
  await page.goto("/configuracoes/importacao");
  await page.getByRole("button", { name: /Desfazer a importação de produtos.csv/ }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Desfazer importação" }).click();
  await expect(toast(page, /300 registros enviados para a lixeira/)).toBeVisible();
  await expect(page.getByText("Desfeita", { exact: true })).toBeVisible();
  await page.goto(`/produtos?busca=${PREFIXO}`);
  await expect(page.getByText("Nenhum produto nesse filtro")).toBeVisible();
});

test("clientes: importa uma planilha pequena e a repetição é ignorada na segunda vez", async ({ page }) => {
  const csv = "Nome;CPF/CNPJ;Telefone\r\nE2E Importada Ana;529.982.247-25;(22) 98888-1111\r\n";
  await page.goto("/configuracoes/importacao");
  await page.getByRole("radio", { name: "Clientes" }).check();
  await page.getByTestId("entrada-planilha").setInputFiles({ name: "clientes.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
  await page.getByRole("button", { name: "Conferir a planilha" }).click();
  await page.getByRole("button", { name: /^Importar 1 registro/ }).click();
  await expect(toast(page, /1 criado/)).toBeVisible();

  await page.goto("/configuracoes/importacao");
  await page.getByRole("radio", { name: "Clientes" }).check();
  await page.getByTestId("entrada-planilha").setInputFiles({ name: "clientes.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
  await page.getByRole("button", { name: "Conferir a planilha" }).click();
  await expect(page.getByText(/Já cadastrado: E2E Importada Ana \(mesmo CPF\/CNPJ\)/)).toBeVisible();
  await expect(page.getByRole("button", { name: /^Importar 0 registros/ })).toBeDisabled();
});
