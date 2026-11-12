import { test, type Page } from "@playwright/test";

import { ehCelular, entrarEEsperarPainel } from "./ajudantes";
import { prepararUsuarioE2E } from "./banco";
import { ipFalso, USUARIO_E2E } from "./dados";

/**
 * Capturas da Fase 3.5 (identidade visual). Só rodam com CAPTURAS_IDENTIDADE=antes|depois.
 * Saída: .capturas/identidade/<momento>/<projeto>-<tema>-<tela>.png (fora do Git e fora de test-results, que o Playwright apaga a cada rodada: tem dados do banco
 * e imagens do site). Não afirma nada: é material para a revisão visual.
 */
const momento = process.env.CAPTURAS_IDENTIDADE;
const SITE = "https://pontual-mu.vercel.app/";
const TEMAS = ["light", "dark"] as const;

async function salvar(page: Page, tema: string, tela: string) {
  await page.waitForLoadState("networkidle");
  const projeto = test.info().project.name;
  await page.screenshot({ path: `.capturas/identidade/${momento}/${projeto}-${tema}-${tela}.png`, fullPage: true });
}

/** Primeiro link de detalhe (ex.: /clientes/<id>) da lista atual, se existir. */
async function primeiroDetalhe(page: Page, base: string): Promise<string | null> {
  const href = await page
    .locator(`main a[href^="${base}/"]`)
    .evaluateAll((els, b) => {
      const re = new RegExp(`^${b}/[^/]+$`);
      const achado = els.map((e) => e.getAttribute("href") ?? "").find((h) => re.test(h) && !h.endsWith("/novo") && !h.endsWith("/nova"));
      return achado ?? null;
    }, base)
    .catch(() => null);
  return href;
}

test.describe("capturas de identidade (login)", () => {
  test.skip(!momento, "defina CAPTURAS_IDENTIDADE=antes|depois");
  test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(61) } });

  for (const tema of TEMAS) {
    test(`login ${tema}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: tema });
      await page.goto("/login");
      await salvar(page, tema, "login");
    });
  }
});

test.describe("capturas de identidade (área logada)", () => {
  test.skip(!momento, "defina CAPTURAS_IDENTIDADE=antes|depois");
  test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(62) } });

  test.beforeAll(async () => {
    await prepararUsuarioE2E({ senhaDefinitiva: true });
  });

  for (const tema of TEMAS) {
    test(`telas ${tema}`, async ({ page }) => {
      test.setTimeout(180_000);
      await page.emulateMedia({ colorScheme: tema });
      await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);

      const telas: Array<[string, string]> = [
        ["painel", "/"],
        ["funil", "/funil"],
        ["clientes", "/clientes"],
        ["propostas", "/propostas"],
        ["empresa", "/configuracoes/empresa"],
        ["tipologias", "/tipologias"],
      ];
      for (const [nome, rota] of telas) {
        await page.goto(rota);
        await salvar(page, tema, nome);
        if (nome === "clientes" || nome === "propostas") {
          const detalhe = await primeiroDetalhe(page, rota);
          if (detalhe) {
            await page.goto(detalhe);
            await salvar(page, tema, nome === "clientes" ? "cliente-detalhe" : "proposta-editor");
          }
        }
      }

      if (ehCelular(page)) {
        await page.goto("/");
        await page.getByRole("button", { name: "Mais" }).click();
        await page.waitForTimeout(500);
        await salvar(page, tema, "menu-mais");
      }
    });
  }
});

test.describe("capturas do site de referência", () => {
  test.skip(!momento, "defina CAPTURAS_IDENTIDADE=antes|depois");

  test("site", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto(SITE, { waitUntil: "networkidle" });
    // Só a primeira tela (cabeçalho + herói): é o que importa para comparar tokens.
    const projeto = test.info().project.name;
    await page.screenshot({ path: `.capturas/identidade/${momento}/${projeto}-site.png`, fullPage: false });
  });
});
