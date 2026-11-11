import { expect, test, type Page } from "@playwright/test";

import { aguardarAvisosSumirem, ehCelular, entrarEEsperarPainel, semRolagemHorizontal, toast } from "./ajudantes";
import { buscarAuditoriaFeitaPeloE2E, prepararUsuarioE2E } from "./banco";
import { ipFalso, USUARIO_E2E } from "./dados";

test.describe.configure({ mode: "serial" });
test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(83) } });

test.beforeAll(async () => {
  await prepararUsuarioE2E({ senhaDefinitiva: true });
});

test.beforeEach(async ({ page }) => {
  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
});

const JOSE = "E2E José Instalador";
const ANA = "E2E Ana Vendedora";
const EQUIPE = "E2E Equipe de instalação 1";
const CPF_JOSE = "529.982.247-25";

let idJose = "";
let idEquipe = "";

const linkDe = (page: Page, nome: string) => page.getByRole("link", { name: nome, exact: true });

async function esperarFicha(page: Page, base: string): Promise<string> {
  await expect(page).toHaveURL(new RegExp(`${base}/(?!novo|equipes)[a-z0-9]+$`));
  return page.url().split("/").pop() ?? "";
}

test("a lista de funcionários e a de equipes abrem sem rolagem horizontal", async ({ page }) => {
  await page.goto("/funcionarios");
  await expect(page.getByRole("heading", { name: "Funcionários e equipes" })).toBeVisible();
  await semRolagemHorizontal(page);
  await page.getByRole("link", { name: "Equipes", exact: true }).click();
  await expect(page).toHaveURL(/\/funcionarios\/equipes$/);
  await semRolagemHorizontal(page);
});

test("o cadastro exige função e valida CPF, datas e valores", async ({ page }) => {
  await page.goto("/funcionarios/novo");
  await expect(page.getByText(/todos os usuários do sistema enxergam estes valores/)).toBeVisible(); // aviso de sensibilidade
  await page.getByLabel("Nome completo").fill(JOSE);
  await page.getByLabel("CPF (opcional)").fill("111.111.111-11");
  await page.getByLabel("Admissão (opcional)").fill("2024-05-10");
  await page.getByLabel("Demissão (opcional)").fill("2024-01-10");
  await page.getByRole("button", { name: "Cadastrar funcionário" }).click();
  // Sem escolher a função, o navegador barra o envio.
  await expect(page).toHaveURL(/\/funcionarios\/novo/);
  await page.getByLabel("Função").selectOption("INSTALACAO");
  await page.getByRole("button", { name: "Cadastrar funcionário" }).click();
  await expect(page.getByText("CPF inválido. Confira os 11 números.")).toBeVisible();
  await expect(page.getByText("A demissão não pode ser antes da admissão.")).toBeVisible();
});

test("cadastrar funcionário com salário, função e vínculo de usuário", async ({ page }) => {
  await page.goto("/funcionarios/novo");
  await page.getByLabel("Nome completo").fill(JOSE);
  await page.getByLabel("CPF (opcional)").pressSequentially("52998224725");
  await expect(page.getByLabel("CPF (opcional)")).toHaveValue(CPF_JOSE);
  await page.getByLabel("Cargo (opcional)").fill("Instalador sênior");
  await page.getByLabel("Função").selectOption("INSTALACAO");
  await page.getByLabel("Admissão (opcional)").fill("2023-03-15");
  await page.getByLabel("Salário base (R$)").pressSequentially("350000");
  await expect(page.getByLabel("Salário base (R$)")).toHaveValue("3.500,00");
  await page.getByLabel("Custo por hora (R$, opcional)").pressSequentially("2500");
  await page.getByLabel("Usuário do sistema (opcional)").selectOption({ label: `${USUARIO_E2E.nome} (${USUARIO_E2E.login})` });
  await page.getByRole("button", { name: "Cadastrar funcionário" }).click();

  await expect(toast(page, "Funcionário cadastrado.")).toBeVisible();
  idJose = await esperarFicha(page, "/funcionarios");
  await expect(page.getByRole("heading", { name: JOSE })).toBeVisible();
  await expect(page.getByText(/Instalação · Instalador sênior/)).toBeVisible();
  await expect(page.getByText(/Admitido em 15\/03\/2023/)).toBeVisible();
  await expect(page.getByLabel("Salário base (R$)")).toHaveValue("3.500,00");
  await expect(page.getByLabel("Custo por hora (R$, opcional)")).toHaveValue("25,00");
  await semRolagemHorizontal(page);
});

test("a auditoria registrou o cadastro do funcionário", async () => {
  const logs = await buscarAuditoriaFeitaPeloE2E("Funcionario", "CRIAR");
  expect(logs.length).toBeGreaterThanOrEqual(1);
  expect(JSON.stringify(logs[0].depois)).toContain("350000");
});

test("CPF repetido é recusado e o mesmo usuário não vincula a dois funcionários", async ({ page }) => {
  await page.goto("/funcionarios/novo");
  await page.getByLabel("Nome completo").fill(ANA);
  await page.getByLabel("CPF (opcional)").fill(CPF_JOSE);
  await page.getByLabel("Função").selectOption("VENDAS");
  await page.getByRole("button", { name: "Cadastrar funcionário" }).click();
  await expect(page.getByText(`Já cadastrado em ${JOSE}.`)).toBeVisible();

  // O usuário de teste já está vinculado ao José, então nem aparece na escolha da Ana.
  await page.getByLabel("CPF (opcional)").fill("");
  await expect(page.getByLabel("Usuário do sistema (opcional)").locator("option", { hasText: USUARIO_E2E.login })).toHaveCount(0);
  await page.getByRole("button", { name: "Cadastrar funcionário" }).click();
  await expect(toast(page, "Funcionário cadastrado.")).toBeVisible();
  await esperarFicha(page, "/funcionarios");
});

test("a lista filtra por função, esconde o salário por padrão e exporta sem dados sensíveis", async ({ page }) => {
  await page.goto("/funcionarios?busca=E2E");
  await expect(linkDe(page, JOSE)).toBeVisible();
  await expect(linkDe(page, ANA)).toBeVisible();
  if (!ehCelular(page)) await expect(page.getByRole("columnheader", { name: "Salário base" })).toHaveCount(0);

  await page.goto("/funcionarios?busca=E2E&funcao=VENDAS");
  await expect(linkDe(page, ANA)).toBeVisible();
  await expect(linkDe(page, JOSE)).toHaveCount(0);

  const r = await page.request.get("/api/exportar/funcionarios?busca=E2E");
  expect(r.status()).toBe(200);
  const corpo = await r.text();
  expect(corpo).toContain(JOSE);
  expect(corpo).not.toContain("3500"); // salário nunca vai para a planilha
  expect(corpo).not.toMatch(/sal[áa]rio/i);
});

test("editar muda a função e a auditoria guarda antes e depois", async ({ page }) => {
  await page.goto(`/funcionarios/${idJose}`);
  await page.getByLabel("Cargo (opcional)").fill("Chefe de instalação");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(toast(page, "Funcionário atualizado.")).toBeVisible();
  const logs = await buscarAuditoriaFeitaPeloE2E("Funcionario", "ATUALIZAR");
  expect(JSON.stringify(logs[0].antes)).toContain("Instalador sênior");
  expect(JSON.stringify(logs[0].depois)).toContain("Chefe de instalação");
});

test("equipe: criar, adicionar pessoas, definir líder, tirar e a lista mostra os membros", async ({ page }) => {
  await page.goto("/funcionarios/equipes");
  await page.getByLabel("Nome da equipe").fill(EQUIPE);
  await page.getByRole("button", { name: "Criar equipe" }).click();
  await expect(toast(page, "Equipe criada.")).toBeVisible();
  await expect(page).toHaveURL(/\/funcionarios\/equipes\/[a-z0-9]+$/);
  idEquipe = page.url().split("/").pop() ?? "";
  await expect(page.getByRole("heading", { name: EQUIPE })).toBeVisible();
  await expect(page.getByText("Equipe sem ninguém ainda")).toBeVisible();
  await aguardarAvisosSumirem(page);

  await page.getByLabel("Adicionar pessoa").selectOption({ label: `${JOSE} — Instalação` });
  await page.getByLabel("É o líder").check();
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();
  await expect(toast(page, "Pessoa adicionada à equipe.")).toBeVisible();
  await expect(page.locator("li").filter({ hasText: JOSE })).toContainText("Líder");
  await aguardarAvisosSumirem(page);

  await page.getByLabel("Adicionar pessoa").selectOption({ label: `${ANA} — Vendas` });
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();
  await expect(toast(page, "Pessoa adicionada à equipe.")).toBeVisible();
  await expect(page.locator("li").filter({ hasText: ANA })).not.toContainText("Líder");
  await aguardarAvisosSumirem(page);

  // Quem já está na equipe não aparece mais para adicionar.
  await expect(page.getByLabel("Adicionar pessoa").locator("option", { hasText: JOSE })).toHaveCount(0);

  await page.locator("li").filter({ hasText: ANA }).getByRole("button", { name: "Tornar líder" }).click();
  await expect(toast(page, "Definido como líder.")).toBeVisible();
  await aguardarAvisosSumirem(page);

  await page.getByRole("button", { name: `Tirar ${ANA} da equipe` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Tirar da equipe" }).click();
  await expect(toast(page, "Pessoa removida da equipe.")).toBeVisible();
  await expect(page.locator("li").filter({ hasText: ANA })).toHaveCount(0);

  await page.goto("/funcionarios/equipes");
  const cartao = page.locator("li").filter({ hasText: EQUIPE });
  await expect(cartao).toContainText(`${JOSE} (líder)`);
  await page.goto("/funcionarios?busca=E2E+José");
  await expect(page.locator("tr, ul li").filter({ hasText: JOSE }).first()).toContainText(EQUIPE);
});

test("quem saiu da equipe pode voltar e o nome da equipe não se repete", async ({ page }) => {
  await page.goto(`/funcionarios/equipes/${idEquipe}`);
  await page.getByLabel("Adicionar pessoa").selectOption({ label: `${ANA} — Vendas` });
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();
  await expect(toast(page, "Pessoa adicionada à equipe.")).toBeVisible();
  await expect(page.locator("li").filter({ hasText: ANA })).toBeVisible();
  await aguardarAvisosSumirem(page);

  await page.goto("/funcionarios/equipes");
  await page.getByLabel("Nome da equipe").fill(EQUIPE.toUpperCase());
  await page.getByRole("button", { name: "Criar equipe" }).click();
  await expect(page.getByText("Já existe uma equipe com esse nome.")).toBeVisible();
});

test("anexos do funcionário e inativação", async ({ page }) => {
  await page.goto(`/funcionarios/${idJose}?aba=anexos`);
  await expect(page.getByText("Nenhum arquivo ainda")).toBeVisible();
  await page.goto(`/funcionarios/${idJose}`);
  await page.getByRole("button", { name: "Inativar" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Inativar" }).click();
  await expect(toast(page, "1 funcionário inativado.")).toBeVisible();
  await aguardarAvisosSumirem(page);
  await page.goto("/funcionarios?busca=E2E");
  await expect(linkDe(page, JOSE)).toHaveCount(0);
  await page.goto("/funcionarios?busca=E2E&situacao=inativos");
  await expect(linkDe(page, JOSE)).toBeVisible();
});

test("enviar funcionário à lixeira o tira também das equipes; enviar a equipe à lixeira preserva as pessoas", async ({ page }) => {
  await page.goto("/funcionarios?busca=E2E&situacao=todos");
  await page.getByRole("checkbox", { name: `Marcar ${ANA}` }).check();
  await page.getByRole("button", { name: "Enviar à lixeira" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Enviar à lixeira" }).click();
  await expect(toast(page, "1 funcionário enviado para a lixeira.")).toBeVisible();
  await aguardarAvisosSumirem(page);
  await page.goto(`/funcionarios/equipes/${idEquipe}`);
  await expect(page.locator("li").filter({ hasText: ANA })).toHaveCount(0);

  await page.getByRole("button", { name: "Enviar à lixeira" }).first().click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Enviar à lixeira" }).click();
  await expect(toast(page, "Equipe enviada para a lixeira.")).toBeVisible();
  await expect(page).toHaveURL(/\/funcionarios\/equipes$/);
  await page.goto(`/funcionarios/equipes/${idEquipe}`);
  await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
  await page.goto("/funcionarios?busca=E2E&situacao=inativos");
  await expect(linkDe(page, JOSE)).toBeVisible();
});

test("as telas de funcionários cabem no celular", async ({ page }) => {
  for (const caminho of ["/funcionarios", "/funcionarios/novo", "/funcionarios/equipes", `/funcionarios/${idJose}`]) {
    await page.goto(caminho);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await semRolagemHorizontal(page);
  }
});
