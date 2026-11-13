import { expect, test, type Locator, type Page } from "@playwright/test";

export async function entrarComo(page: Page, login: string, senha: string) {
  await page.goto("/login");
  await page.getByLabel("Usuário").fill(login);
  await page.getByLabel("Senha", { exact: true }).fill(senha);
  await page.getByRole("button", { name: "Entrar" }).click();
}

/** Entra e espera chegar ao painel (usuário com senha já definitiva). */
export async function entrarEEsperarPainel(page: Page, login: string, senha: string) {
  await entrarComo(page, login, senha);
  await expect(page).toHaveURL(/\/$/);
}

export function ehCelular(page: Page): boolean {
  return (page.viewportSize()?.width ?? 1280) < 768;
}

export async function semRolagemHorizontal(page: Page) {
  const medidas = await page.evaluate(() => ({ conteudo: document.documentElement.scrollWidth, janela: window.innerWidth }));
  expect(medidas.conteudo, "a página não pode rolar na horizontal").toBeLessThanOrEqual(medidas.janela);
}

/** Mensagem curta (toast) com o texto esperado. */
export function toast(page: Page, texto: string | RegExp) {
  return page.locator("[data-sonner-toast]").filter({ hasText: texto }).first();
}

/** Espera os avisos temporários (toasts) desaparecerem: no celular eles cobrem o fim da página. */
export async function aguardarAvisosSumirem(page: Page) {
  // O Sonner PAUSA o relógio dos avisos enquanto o mouse está sobre eles: tira o ponteiro de cima
  // (canto inferior esquerdo da janela) e deixa expirarem sozinhos. Clicar no "x" deixaria o mouse
  // parado em cima da pilha e os avisos nunca sumiriam.
  const altura = page.viewportSize()?.height ?? 700;
  await page.mouse.move(1, altura - 1);
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 20_000 });
}

/** Mensagem de erro do formulário atual (o Next também tem um role="alert" para anunciar rotas). */
export function alertaDeFormulario(page: Page) {
  return page.locator("form, [role='dialog']").getByRole("alert");
}

/**
 * Captura de tela para a revisão visual (só com CAPTURAS=1). Salva em test-results/capturas/<projeto>-<nome>.png,
 * pasta que não vai para o Git.
 */
export async function capturar(page: Page, nome: string) {
  if (!process.env.CAPTURAS) return;
  await page.waitForLoadState("networkidle");
  const projeto = test.info().project.name;
  await page.screenshot({ path: `test-results/capturas/${projeto}-${nome}.png`, fullPage: true });
}

/**
 * O cartão de um número do painel (`NumeroDoPainel`): o <div> que contém o link com o título. O valor, o detalhe, os
 * comparativos e o botão "Como é calculado" ficam dentro dele (só o título é o link, que cobre o cartão inteiro).
 */
export function cartaoDoPainel(page: Page, titulo: string | RegExp) {
  return page.getByRole("link", { name: titulo }).first().locator("xpath=..");
}

/**
 * Confere o "Como é calculado" de um cartão: o botão tem a dica (title), a definição começa escondida, abre ao clicar
 * (aria-expanded) e o texto da definição aparece. Devolve o botão. Não fecha de volta.
 */
export async function conferirComoECalculado(cartao: Locator, trecho: string | RegExp) {
  const botao = cartao.getByRole("button", { name: /Como é calculado/ });
  await expect(botao).toHaveAttribute("title", /Como é calculado: /);
  await expect(botao).toHaveAttribute("aria-expanded", "false");
  await expect(cartao.getByText(trecho, { exact: false }).last()).toBeHidden();
  await botao.click();
  await expect(botao).toHaveAttribute("aria-expanded", "true");
  await expect(cartao.getByText(trecho, { exact: false }).last()).toBeVisible();
  return botao;
}
