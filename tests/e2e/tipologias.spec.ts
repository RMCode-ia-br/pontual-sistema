import { expect, test } from "@playwright/test";

import { aguardarAvisosSumirem, capturar, entrarEEsperarPainel, semRolagemHorizontal, toast } from "./ajudantes";
import { prepararUsuarioE2E } from "./banco";
import { ipFalso, USUARIO_E2E } from "./dados";

test.describe.configure({ mode: "serial" });
test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(91) } });

test.beforeAll(async () => {
  await prepararUsuarioE2E({ senhaDefinitiva: true });
});

test.beforeEach(async ({ page }) => {
  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
});

const NOME = "E2E Tipologia de Teste";

test("tipologias: criar, compor, testar fórmula e cadastrar preço", async ({ page }) => {
  await page.goto("/tipologias");
  await expect(page.getByRole("heading", { name: "Tipologias e preços" })).toBeVisible();
  // As tipologias do seed aparecem; a de exemplo fica inativa.
  await expect(page.getByText("Janela de correr").first()).toBeVisible();
  await semRolagemHorizontal(page);
  await capturar(page, "tipologias-lista");

  await page.getByRole("link", { name: "Nova tipologia" }).first().click();
  await page.getByLabel("Nome").fill(NOME);
  await page.getByLabel("Opções de folhas").fill("2, 3");
  await page.getByLabel("Modelo da descrição técnica").fill("JANELA(S) {FOLHAS} FOLHAS LINHA {LINHA} MED. {MEDIDAS}");
  await page.getByRole("button", { name: "Criar tipologia" }).click();
  await expect(toast(page, "Tipologia criada")).toBeVisible();
  await expect(page).toHaveURL(/\/tipologias\/[a-z0-9]+$/);
  await aguardarAvisosSumirem(page);

  // Variável desconhecida no modelo é recusada.
  await page.getByLabel("Modelo da descrição técnica").fill("JANELA {XYZ}");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByText("Variável desconhecida no modelo")).toBeVisible();
  await page.getByLabel("Modelo da descrição técnica").fill("JANELA(S) {FOLHAS} FOLHAS LINHA {LINHA} MED. {MEDIDAS}");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(toast(page, "Tipologia atualizada")).toBeVisible();
  await aguardarAvisosSumirem(page);

  // Composição: fórmula com erro mostra mensagem; custo ausente nunca vira zero.
  await page.getByRole("link", { name: "Composição de custo" }).click();
  await page.getByRole("button", { name: "Insumo", exact: true }).click();
  await page.getByLabel("Descrição do insumo 1").fill("E2E Perfil");
  await page.getByLabel("Fórmula do insumo 1").fill("(L/1000)*2 + (A/1000)*2");
  await expect(page.getByText(/Com L=2000, A=1200, F=2, Q=1: 6,4/)).toBeVisible();
  await page.getByLabel("Fórmula do insumo 1").fill("eval(1)");
  await expect(page.getByText("Função não permitida")).toBeVisible();
  await page.getByLabel("Fórmula do insumo 1").fill("(L/1000)*2 + (A/1000)*2");
  await expect(page.getByText(/Falta informar: custo de "E2E Perfil"/)).toBeVisible();
  await page.getByLabel("Custo do insumo 1").fill("50,00");
  await expect(page.getByText(/Custo estimado: R\$\s?320,00/)).toBeVisible();
  await page.getByRole("button", { name: "Salvar composição" }).click();
  await expect(toast(page, "Composição salva")).toBeVisible();
  await aguardarAvisosSumirem(page);

  // Preço pela tabela.
  await page.getByRole("link", { name: "Tabela de preços" }).click();
  await page.getByLabel("Valor (R$)").fill("850,00");
  await page.getByRole("button", { name: "Adicionar preço" }).click();
  await expect(toast(page, "Preço adicionado")).toBeVisible();
  await expect(page.getByText("Preços cadastrados (1)")).toBeVisible();
  // A mesma combinação (tudo "Qualquer") não repete.
  await page.getByLabel("Valor (R$)").fill("900,00");
  await page.getByRole("button", { name: "Adicionar preço" }).click();
  await expect(page.getByText("Já existe um preço para essa combinação")).toBeVisible();
  await semRolagemHorizontal(page);
  await capturar(page, "tipologias-precos");

  // Fica só o que a limpeza dos testes remove ("E2E ").
  await page.getByRole("link", { name: "Dados" }).click();
  await expect(page.getByLabel("Nome")).toHaveValue(NOME);
});
