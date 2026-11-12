import { expect, test, type Page } from "@playwright/test";

import { aguardarAvisosSumirem, ehCelular, entrarEEsperarPainel, semRolagemHorizontal, toast } from "./ajudantes";
import { buscarAuditoriaFeitaPeloE2E, criarCategoriaDeProdutoDeTeste, criarFornecedorDeTeste, prepararUsuarioE2E } from "./banco";
import { ipFalso, USUARIO_E2E } from "./dados";

test.describe.configure({ mode: "serial" });
test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(82) } });

// Categorias e o fornecedor com acento são criados aqui (prefixo "E2E "): o teste nunca depende dos cadastros reais,
// que o dono pode renomear ou excluir ("Perfis", "Vidros", "Nova Opção"...). A limpeza do `banco.ts` remove todos.
const CAT_PERFIS = "E2E Cat Perfis";
const CAT_FERRAGENS = "E2E Cat Ferragens";
const CAT_VIDROS = "E2E Cat Vidros";
const COM_ACENTO = "E2E Nova Opção Ação";

test.beforeAll(async () => {
  await prepararUsuarioE2E({ senhaDefinitiva: true });
  for (const nome of [CAT_PERFIS, CAT_FERRAGENS, CAT_VIDROS]) await criarCategoriaDeProdutoDeTeste(nome);
  await criarFornecedorDeTeste(COM_ACENTO, [CAT_VIDROS]);
});

test.beforeEach(async ({ page }) => {
  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
});

const ALUMINIOS = "E2E Alumínios Macaé Ltda";
const OUTRO = "E2E Vidraria São João";
const CNPJ = "11.222.333/0001-81";

let idAluminios = "";

const linkDoFornecedor = (page: Page, nome: string) => page.getByRole("link", { name: nome, exact: true });

async function esperarFicha(page: Page): Promise<string> {
  await expect(page).toHaveURL(/\/fornecedores\/(?!novo)[a-z0-9]+$/);
  return page.url().split("/").pop() ?? "";
}

test("a busca ignora acentos e a lista mostra a categoria do fornecedor", async ({ page }) => {
  // O nome tem acento ("Opção Ação"); a busca digitada sem acento e em minúsculas o encontra.
  await page.goto("/fornecedores?busca=nova%20opcao%20acao");
  await expect(linkDoFornecedor(page, COM_ACENTO)).toBeVisible();
  await semRolagemHorizontal(page);
  const linha = ehCelular(page) ? page.locator("ul li").filter({ hasText: COM_ACENTO }) : page.locator("tr").filter({ hasText: COM_ACENTO });
  await expect(linha).toContainText(CAT_VIDROS);
});

test("valida o CNPJ e o e-mail no servidor", async ({ page }) => {
  await page.goto("/fornecedores/novo");
  await page.getByLabel("Razão social ou nome").fill(ALUMINIOS);
  await page.getByLabel("CNPJ (opcional)").fill("11.111.111/1111-11");
  await page.getByLabel("E-mail").fill("a@b");
  await page.getByRole("button", { name: "Cadastrar fornecedor" }).click();
  await expect(page.getByText("CNPJ inválido. Confira os 14 números.")).toBeVisible();
  await expect(page.getByText(/E-mail: informe um endereço válido/)).toBeVisible();
});

test("cadastrar fornecedor com categorias, contato e prazo", async ({ page }) => {
  await page.goto("/fornecedores/novo");
  await page.getByLabel("Razão social ou nome").fill(ALUMINIOS);
  await page.getByLabel("Nome fantasia (opcional)").fill("E2E Alumínios");
  await page.getByLabel("CNPJ (opcional)").pressSequentially("11222333000181");
  await expect(page.getByLabel("CNPJ (opcional)")).toHaveValue(CNPJ);
  await page.getByLabel(CAT_PERFIS, { exact: true }).check();
  await page.getByLabel(CAT_FERRAGENS, { exact: true }).check();
  await page.getByLabel("Vendedor ou contato").fill("Sandro");
  await page.getByLabel("Telefone ou WhatsApp").fill("22999583288");
  await page.getByLabel("E-mail").fill("Vendas@E2E-Aluminios.com");
  await page.getByLabel("Prazo de entrega (dias)").fill("7");
  await page.getByLabel("Condições de pagamento").fill("28 dias, boleto");
  await page.getByRole("button", { name: "Cadastrar fornecedor" }).click();

  await expect(toast(page, "Fornecedor cadastrado.")).toBeVisible();
  idAluminios = await esperarFicha(page);
  await expect(page.getByRole("heading", { name: ALUMINIOS })).toBeVisible();
  await expect(page.getByText(/11\.222\.333\/0001-81/)).toBeVisible();
  await expect(page.getByLabel(CAT_PERFIS, { exact: true })).toBeChecked();
  await expect(page.getByLabel(CAT_VIDROS, { exact: true })).not.toBeChecked();
  await expect(page.getByLabel("E-mail")).toHaveValue("vendas@e2e-aluminios.com");
  await semRolagemHorizontal(page);
});

test("a auditoria registrou o cadastro do fornecedor", async () => {
  const logs = await buscarAuditoriaFeitaPeloE2E("Fornecedor", "CRIAR");
  expect(logs.length).toBeGreaterThanOrEqual(1);
  expect(JSON.stringify(logs[0].depois)).toContain(ALUMINIOS);
});

test("CNPJ repetido é recusado com o nome de quem já tem", async ({ page }) => {
  await page.goto("/fornecedores/novo");
  await page.getByLabel("Razão social ou nome").fill(OUTRO);
  await page.getByLabel("CNPJ (opcional)").fill(CNPJ);
  await page.getByRole("button", { name: "Cadastrar fornecedor" }).click();
  await expect(page.getByText(`Já cadastrado em ${ALUMINIOS}.`)).toBeVisible();
  await expect(page).toHaveURL(/\/fornecedores\/novo/);
});

test("editar muda as categorias e registra antes e depois na auditoria", async ({ page }) => {
  await page.goto(`/fornecedores/${idAluminios}`);
  await page.getByLabel(CAT_PERFIS, { exact: true }).uncheck();
  await page.getByLabel(CAT_VIDROS, { exact: true }).check();
  await page.getByLabel("Prazo de entrega (dias)").fill("10");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(toast(page, "Fornecedor atualizado.")).toBeVisible();
  await page.goto(`/fornecedores/${idAluminios}`);
  await expect(page.getByLabel(CAT_PERFIS, { exact: true })).not.toBeChecked();
  await expect(page.getByLabel(CAT_VIDROS, { exact: true })).toBeChecked();
  await expect(page.getByLabel("Prazo de entrega (dias)")).toHaveValue("10");
  const logs = await buscarAuditoriaFeitaPeloE2E("Fornecedor", "ATUALIZAR");
  expect(JSON.stringify(logs[0].depois)).toContain("prazoEntregaDias");
});

test("a lista mostra categoria e prazo, filtra por categoria e exporta CSV", async ({ page }) => {
  await page.goto("/fornecedores?busca=E2E");
  const linha = ehCelular(page) ? page.locator("ul li").filter({ hasText: ALUMINIOS }) : page.locator("tr").filter({ hasText: ALUMINIOS });
  await expect(linha).toContainText(CAT_VIDROS);
  await expect(linha).toContainText("10 dias");

  await page.getByLabel("O que fornece").selectOption({ label: CAT_PERFIS });
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(linkDoFornecedor(page, ALUMINIOS)).toHaveCount(0);

  const r = await page.request.get("/api/exportar/fornecedores?busca=E2E");
  expect(r.status()).toBe(200);
  const corpo = await r.text();
  expect(corpo).toContain(ALUMINIOS);
  expect(corpo).toContain("Razão social;Nome fantasia;CNPJ");
});

test("anexos do fornecedor: a aba abre e orienta o envio", async ({ page }) => {
  await page.goto(`/fornecedores/${idAluminios}?aba=anexos`);
  await expect(page.getByText("Nenhum arquivo ainda")).toBeVisible();
});

test("inativar pela ficha, ver em Inativos e reativar", async ({ page }) => {
  await page.goto(`/fornecedores/${idAluminios}`);
  await page.getByRole("button", { name: "Inativar" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Inativar" }).click();
  await expect(toast(page, "1 fornecedor inativado.")).toBeVisible();
  await aguardarAvisosSumirem(page);
  await page.goto("/fornecedores?busca=E2E");
  await expect(linkDoFornecedor(page, ALUMINIOS)).toHaveCount(0);
  await page.goto("/fornecedores?busca=E2E&situacao=inativos");
  await expect(linkDoFornecedor(page, ALUMINIOS)).toBeVisible();
  await page.goto(`/fornecedores/${idAluminios}`);
  await page.getByRole("button", { name: "Reativar" }).click();
  await expect(toast(page, "1 fornecedor reativado.")).toBeVisible();
});

test("enviar à lixeira em lote some da lista e a ficha deixa de abrir", async ({ page }) => {
  await page.goto("/fornecedores?busca=E2E");
  await page.getByRole("checkbox", { name: `Marcar ${ALUMINIOS}` }).check();
  await page.getByRole("button", { name: "Enviar à lixeira" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Os produtos deles continuam cadastrados");
  await page.getByRole("alertdialog").getByRole("button", { name: "Enviar à lixeira" }).click();
  await expect(toast(page, "1 fornecedor enviado para a lixeira.")).toBeVisible();
  await expect(linkDoFornecedor(page, ALUMINIOS)).toHaveCount(0);
  await page.goto(`/fornecedores/${idAluminios}`);
  await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
});

test("as telas de fornecedores cabem no celular", async ({ page }) => {
  for (const caminho of ["/fornecedores", "/fornecedores/novo"]) {
    await page.goto(caminho);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await semRolagemHorizontal(page);
  }
});
