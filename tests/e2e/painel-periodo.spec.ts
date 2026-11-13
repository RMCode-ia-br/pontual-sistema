import { expect, test, type Page } from "@playwright/test";

import { cartaoDoPainel, entrarEEsperarPainel, semRolagemHorizontal } from "./ajudantes";
import { prepararUsuarioE2E } from "./banco";
import { ipFalso, USUARIO_E2E } from "./dados";

/**
 * Seletor de período do painel (Fase 7): abre no mês atual, anda de mês em mês, tem períodos prontos e datas livres,
 * não aceita período inválido, e os números "Vendido" e "Recebido" levam às listas COM o mesmo período. O botão
 * "Como é calculado" abre e fecha a definição (também pelo teclado).
 */
test.describe.configure({ mode: "serial" });
test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(111) } });

test.beforeAll(async () => {
  await prepararUsuarioE2E({ senhaDefinitiva: true });
});

test.beforeEach(async ({ page }) => {
  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
});

/** O mês de hoje em São Paulo, calculado como o servidor. */
function hojeEmSaoPaulo(): { ano: number; mes: number } {
  const [ano, mes] = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }).split("-").map(Number);
  return { ano, mes };
}
/** O mês `delta` meses depois (ou antes) do dado: chave "aaaa-mm" e nome ("novembro de 2026"). */
function somarMesesDe(ano: number, mes: number, delta: number): { chave: string; rotulo: string } {
  const d = new Date(Date.UTC(ano, mes - 1 + delta, 15));
  const a = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return { chave: `${a}-${String(m).padStart(2, "0")}`, rotulo: d.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }) };
}
const mesAtual = () => somarMesesDe(hojeEmSaoPaulo().ano, hojeEmSaoPaulo().mes, 0);
const mesAnterior = () => somarMesesDe(hojeEmSaoPaulo().ano, hojeEmSaoPaulo().mes, -1);

const titulo = (page: Page) => page.getByRole("heading", { name: /^O período em números/, level: 2 });
const nomeDoPeriodo = (page: Page) => page.getByRole("group", { name: "Período" }).locator("p[aria-live]").first();

test("abre no mês atual, anda de mês em mês e não deixa ir além do mês atual", async ({ page }) => {
  const atual = mesAtual();
  const anterior = mesAnterior();

  await page.goto("/");
  await expect(titulo(page)).toContainText(`(${atual.rotulo})`);
  await expect(nomeDoPeriodo(page)).toHaveText(atual.rotulo);
  expect(new URL(page.url()).search).toBe("");
  await expect(page.getByRole("button", { name: "Mês seguinte" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Mês anterior" })).toBeEnabled();
  await semRolagemHorizontal(page);

  await page.getByRole("button", { name: "Mês anterior" }).click();
  await expect(page).toHaveURL(new RegExp(`\\?mes=${anterior.chave}$`));
  await expect(titulo(page)).toContainText(`(${anterior.rotulo})`);
  await expect(titulo(page)).not.toContainText(atual.rotulo);
  await expect(page.getByRole("button", { name: "Mês seguinte" })).toBeEnabled();

  await page.getByRole("button", { name: "Mês seguinte" }).click();
  await expect(page).toHaveURL(new RegExp(`\\?mes=${atual.chave}$`));
  await expect(titulo(page)).toContainText(`(${atual.rotulo})`);
  await expect(page.getByRole("button", { name: "Mês seguinte" })).toBeDisabled();
});

test("a lista Período escreve o período pronto na URL e o painel passa a ser desse período", async ({ page }) => {
  await page.goto("/");
  await page.locator("#periodo-pronto").selectOption("90d");
  await expect(page).toHaveURL(/\?periodo=90d$/);
  await expect(page.locator("#periodo-pronto")).toHaveValue("90d");
  // Fora do "por mês" não há setas: só o nome do período (datas de/até).
  await expect(page.getByRole("button", { name: "Mês anterior" })).toHaveCount(0);
  await expect(titulo(page)).toContainText(/\(\d{2}\/\d{2}\/\d{4} a \d{2}\/\d{2}\/\d{4}\)/);
  await semRolagemHorizontal(page);

  // Voltar a "Por mês" retoma o mês atual.
  await page.locator("#periodo-pronto").selectOption("mes");
  await expect(page).toHaveURL(new RegExp(`\\?mes=${mesAtual().chave}$`));
});

test("datas livres: período invertido não pode ser aplicado; corrigido, vale", async ({ page }) => {
  await page.goto("/");
  await page.locator("#periodo-pronto").selectOption("livre");
  const aplicar = page.getByRole("button", { name: "Aplicar", exact: true });
  await page.locator("#periodo-de").fill("2020-02-10");
  await page.locator("#periodo-ate").fill("2020-02-01");
  await expect(aplicar).toBeDisabled();
  await page.locator("#periodo-ate").fill("2020-02-20");
  await expect(aplicar).toBeEnabled();
  await aplicar.click();
  await expect(page).toHaveURL(/\?de=2020-02-10&ate=2020-02-20$/);
  await expect(titulo(page)).toContainText("(10/02/2020 a 20/02/2020)");
  await semRolagemHorizontal(page);
});

test("mês inválido na URL mostra o aviso e cai no mês atual (sem quebrar a página)", async ({ page }) => {
  const atual = mesAtual();
  await page.goto("/?mes=2026-13");
  await expect(page.getByText("O mês escolhido não é válido")).toBeVisible();
  await expect(titulo(page)).toContainText(`(${atual.rotulo})`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await semRolagemHorizontal(page);

  await page.goto("/?periodo=lixo");
  await expect(page.getByText("O período escolhido não existe")).toBeVisible();
  await page.goto("/?de=2020-05-10&ate=2020-05-01");
  await expect(page.getByText("A data inicial é depois da final")).toBeVisible();
});

test("'Vendido' e 'Recebido' levam às listas com o MESMO período", async ({ page }) => {
  const anterior = mesAnterior();

  // Por mês: o link leva o mesmo mes=.
  await page.goto(`/?mes=${anterior.chave}`);
  await expect(page.getByRole("link", { name: "Vendido", exact: true })).toHaveAttribute("href", `/relatorios/vendas?mes=${anterior.chave}`);
  await expect(page.getByRole("link", { name: "Recebido", exact: true })).toHaveAttribute("href", `/financeiro/recebimentos?mes=${anterior.chave}`);
  await page.getByRole("link", { name: "Vendido", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/relatorios/vendas\\?mes=${anterior.chave}$`));
  await expect(page.getByRole("heading", { name: "Vendas por período", level: 1 })).toBeVisible();
  await expect(nomeDoPeriodo(page)).toHaveText(anterior.rotulo);

  await page.goto(`/?mes=${anterior.chave}`);
  await page.getByRole("link", { name: "Recebido", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/financeiro/recebimentos\\?mes=${anterior.chave}$`));
  await expect(page.getByRole("heading", { name: "Recebimentos", level: 1 })).toBeVisible();
  await expect(nomeDoPeriodo(page)).toHaveText(anterior.rotulo);

  // Datas livres: o link leva de= e ate=.
  await page.goto("/?de=2020-02-10&ate=2020-02-20");
  await expect(page.getByRole("link", { name: "Vendido", exact: true })).toHaveAttribute("href", "/relatorios/vendas?de=2020-02-10&ate=2020-02-20");
  await expect(page.getByRole("link", { name: "Recebido", exact: true })).toHaveAttribute("href", "/financeiro/recebimentos?de=2020-02-10&ate=2020-02-20");
  await page.getByRole("link", { name: "Recebido", exact: true }).click();
  await expect(page).toHaveURL(/\/financeiro\/recebimentos\?de=2020-02-10&ate=2020-02-20$/);
  await expect(nomeDoPeriodo(page)).toHaveText("10/02/2020 a 20/02/2020");
});

test("'Como é calculado' abre e fecha a definição e funciona pelo teclado", async ({ page }) => {
  await page.goto("/");
  const cartao = cartaoDoPainel(page, "Vendido");
  const botao = cartao.getByRole("button", { name: /Como é calculado/ });
  const definicao = cartao.getByText(/Soma do valor aprovado de cada proposta/);

  await expect(botao).toHaveAttribute("aria-expanded", "false");
  await expect(botao).toHaveAttribute("title", /^Como é calculado: Soma do valor aprovado/);
  await expect(definicao).toBeHidden();

  await botao.click();
  await expect(botao).toHaveAttribute("aria-expanded", "true");
  await expect(definicao).toBeVisible();
  await botao.click();
  await expect(botao).toHaveAttribute("aria-expanded", "false");
  await expect(definicao).toBeHidden();

  // Teclado: foco no botão e Enter abre; Enter de novo fecha. Não navega (o botão não é o link do cartão).
  const url = page.url();
  await botao.focus();
  await page.keyboard.press("Enter");
  await expect(botao).toHaveAttribute("aria-expanded", "true");
  await expect(definicao).toBeVisible();
  expect(page.url()).toBe(url);
  await page.keyboard.press("Enter");
  await expect(botao).toHaveAttribute("aria-expanded", "false");
  await semRolagemHorizontal(page);
});
