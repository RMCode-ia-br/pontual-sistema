import { expect, type Page } from "@playwright/test";

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
  // Fecha pelo botão (o aviso pausa o relógio enquanto o mouse está sobre ele) e confere que sumiu.
  for (const fechar of await page.locator("[data-sonner-toast] [data-close-button]").all()) {
    await fechar.click({ force: true }).catch(() => undefined);
  }
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 15_000 });
}

/** Mensagem de erro do formulário atual (o Next também tem um role="alert" para anunciar rotas). */
export function alertaDeFormulario(page: Page) {
  return page.locator("form, [role='dialog']").getByRole("alert");
}
