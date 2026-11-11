import { expect, test, type Page } from "@playwright/test";

import { aguardarAvisosSumirem, capturar, entrarEEsperarPainel, semRolagemHorizontal, toast } from "./ajudantes";
import { prepararUsuarioE2E } from "./banco";
import { ipFalso, USUARIO_E2E } from "./dados";

test.describe.configure({ mode: "serial" });
test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(93) } });

test.beforeAll(async () => {
  await prepararUsuarioE2E({ senhaDefinitiva: true });
});

test.beforeEach(async ({ page }) => {
  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
});

const CLIENTE = "E2E Cliente da Proposta";
const PROJETO = "E2E Obra da Proposta";

let idCliente = "";
let idProjeto = "";
let idProposta = "";

async function adicionarItemManual(page: Page, valor: string, largura = "2000", altura = "1200") {
  await page.getByRole("button", { name: "Adicionar item" }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("Tipologia", { exact: true }).selectOption({ label: "Janela de correr" });
  await dialogo.getByLabel("Largura da medida 1").fill(largura);
  await dialogo.getByLabel("Altura da medida 1").fill(altura);
  await dialogo.getByLabel("Valor do item").fill(valor);
  await expect(dialogo.getByText(/Preço:/)).toBeVisible();
  await dialogo.getByRole("button", { name: "Adicionar item" }).click();
  await expect(toast(page, "Item adicionado")).toBeVisible();
  await aguardarAvisosSumirem(page);
}

test("preparação: cliente e projeto", async ({ page }) => {
  await page.goto("/clientes/novo");
  await page.getByLabel("Nome completo").fill(CLIENTE);
  await page.getByRole("button", { name: "Cadastrar cliente" }).click();
  await expect(page).toHaveURL(/\/clientes\/(?!novo)[a-z0-9]+$/);
  idCliente = page.url().split("/").pop() ?? "";

  await page.goto(`/projetos/novo?cliente=${idCliente}`);
  await page.getByLabel("Título").fill(PROJETO);
  await page.getByRole("button", { name: "Criar projeto" }).click();
  await expect(page).toHaveURL(/\/projetos\/(?!novo)[a-z0-9]+$/);
  idProjeto = page.url().split("/").pop() ?? "";
});

test("cria a proposta a partir do projeto, com número, cliente e textos padrão", async ({ page }) => {
  await page.goto(`/projetos/${idProjeto}?aba=propostas`);
  await expect(page.getByText("Nenhuma proposta neste projeto")).toBeVisible();
  await page.getByRole("link", { name: "Nova proposta" }).click();
  await expect(page.getByLabel("Projeto da proposta")).toHaveValue(idProjeto);
  await page.getByRole("button", { name: "Criar proposta" }).click();
  await expect(page).toHaveURL(/\/propostas\/[a-z0-9]+$/);
  idProposta = page.url().split("/").pop() ?? "";

  await expect(page.getByRole("heading", { name: /^Proposta \d{4}-\d{2}$/ })).toBeVisible();
  await expect(page.getByLabel("Cliente", { exact: true })).toHaveValue(CLIENTE);
  // Textos padrão do modelo (Apêndice A) e validade padrão.
  await expect(page.getByLabel("Notas importantes", { exact: true })).toHaveValue(/Este serviço está sob os termos e condições da/);
  await expect(page.getByLabel("Validade (texto)")).toHaveValue("Até alteração dos fornecedores");
  await expect(page.getByLabel("Acréscimo da nota fiscal (%)")).toHaveValue("5");
  await expect(page.getByLabel(/Comissão do arquiteto/)).toHaveValue("0");
  await semRolagemHorizontal(page);
});

test("itens: total é a soma calculada; com nota soma 5% em linha separada", async ({ page }) => {
  await page.goto(`/propostas/${idProposta}`);
  await expect(page.getByText("Nenhum item nesta opção")).toBeVisible();

  await adicionarItemManual(page, "4.130,00");
  await adicionarItemManual(page, "9.050,00");

  const totais = page.getByRole("complementary", { name: "Totais da proposta" });
  await expect(totais.getByText("R$ 13.180,00").first()).toBeVisible();
  await expect(totais.getByText("sem nota fiscal")).toBeVisible();
  await expect(totais.getByText(/Acréscimo da nota fiscal/)).toHaveCount(0);

  // Descrição gerada pelo modelo, numeração automática e plural.
  await expect(page.getByRole("article", { name: "Item 1" })).toContainText("1 un — Janela de correr");
  await expect(page.getByRole("article", { name: "Item 2" })).toBeVisible();

  // Com nota: 13.180,00 × 1,05 = 13.839,00 (acréscimo 659,00), em linha separada.
  await page.getByLabel("Esta venda é COM nota fiscal").check();
  await expect(totais.getByText("Acréscimo da nota fiscal (5%)")).toBeVisible();
  await expect(totais.getByText("R$ 659,00")).toBeVisible();
  await expect(totais.getByText("R$ 13.839,00")).toBeVisible();
  await expect(totais.getByText("com nota fiscal")).toBeVisible();
  await capturar(page, "proposta-editor");
});

test("salvar, recarregar, duplicar opção e item; rascunho não aceita item sem valor/medida", async ({ page }) => {
  await page.goto(`/propostas/${idProposta}`);
  await page.getByLabel("Esta venda é COM nota fiscal").check();
  await page.getByLabel("Parte (ex.: Parte 01/02)").fill("Parte 01/02");
  // Cronograma 50/25/25 do modelo.
  await page.getByLabel("Modelo de condição de pagamento").selectOption({ label: "50% sinal + 25% entrega do material + 25% entrega dos vidros e instalação" });
  await expect(page.getByText("Soma: 100%")).toBeVisible();
  await page.getByRole("button", { name: "Salvar proposta" }).click();
  await expect(toast(page, "Proposta salva")).toBeVisible();
  await aguardarAvisosSumirem(page);

  await page.reload();
  await expect(page.getByLabel("Esta venda é COM nota fiscal")).toBeChecked();
  await expect(page.getByLabel("Parte (ex.: Parte 01/02)")).toHaveValue("Parte 01/02");
  await expect(page.getByLabel("Percentual da parcela 1")).toHaveValue("50");

  // Duplicar item.
  await page.getByLabel("Duplicar o item 1").click();
  await expect(page.getByRole("article", { name: "Item 3" })).toBeVisible();

  // Duplicar a opção (copia os itens).
  await page.getByRole("button", { name: "Duplicar", exact: true }).click();
  await page.getByLabel("Nome da nova opção").fill("Linha Gold");
  await page.getByRole("button", { name: "Criar cópia" }).click();
  await expect(page.getByRole("tab", { name: "Linha Gold" })).toBeVisible();
  await page.getByRole("tab", { name: "Linha Gold" }).click();
  await expect(page.getByRole("article", { name: "Item 3" })).toBeVisible();

  // Item sem medida válida é recusado antes de ir ao servidor.
  await page.getByRole("button", { name: "Adicionar item" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Adicionar item" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Preencha largura, altura e quantidade");
  await page.keyboard.press("Escape");

  // Duplicar a proposta cria um rascunho novo com outro número.
  await page.getByRole("button", { name: "Duplicar como base" }).click();
  await expect(page).not.toHaveURL(new RegExp(`/propostas/${idProposta}$`));
  await expect(page.getByRole("heading", { name: /^Proposta \d{4}-\d{2}$/ })).toBeVisible();
});

test("a lista de propostas mostra valor, situação e filtra", async ({ page }) => {
  await page.goto("/propostas");
  await expect(page.getByRole("heading", { name: "Propostas", exact: true })).toBeVisible();
  await expect(page.getByText(CLIENTE).first()).toBeVisible();
  await expect(page.getByRole("list").getByText("Rascunho").first()).toBeVisible();
  await semRolagemHorizontal(page);
  await page.getByLabel("Buscar propostas").fill("zzz-sem-resultado");
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page.getByText("Nenhuma proposta encontrada")).toBeVisible();
  await capturar(page, "propostas-lista");
});
