import { expect, test } from "@playwright/test";

import { cartaoDoPainel, entrarEEsperarPainel, semRolagemHorizontal, toast } from "./ajudantes";
import { definirLimiteComNotaNoBanco, lerCampoConfiguracao, prepararUsuarioE2E, restaurarConfiguracao, tirarSnapshotConfiguracao, type SnapshotConfiguracao } from "./banco";
import { ipFalso, USUARIO_E2E } from "./dados";

/**
 * Limite do faturamento com nota fiscal (Fase 7): o campo existe em Configurações → Empresa; com o limite vazio o cartão
 * "Recebido com nota fiscal (12 meses)" diz "Limite não informado"; com um valor mostra o percentual do limite; com zero
 * volta a "não informado". A configuração é a linha REAL da empresa: o snapshot é restaurado sempre, no fim.
 */
test.describe.configure({ mode: "serial" });
test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(113) } });

const CAMPO = /Limite do faturamento com nota fiscal/;
let snapshot: SnapshotConfiguracao;

test.beforeAll(async () => {
  await prepararUsuarioE2E({ senhaDefinitiva: true });
  snapshot = await tirarSnapshotConfiguracao();
  await definirLimiteComNotaNoBanco(null);
});

test.afterAll(async () => {
  await restaurarConfiguracao(snapshot);
});

test.beforeEach(async ({ page }) => {
  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
});

async function salvarLimite(page: import("@playwright/test").Page, texto: string) {
  await page.goto("/configuracoes/empresa");
  const campo = page.getByLabel(CAMPO);
  await expect(campo).toBeVisible();
  await campo.fill(texto);
  await page.getByRole("button", { name: "Salvar configurações" }).click();
  await expect(toast(page, "Configurações salvas.")).toBeVisible();
}

test("o snapshot guarda o limite original (o teste restaura no fim)", () => {
  expect(snapshot, "a configuração da empresa precisa existir").not.toBeNull();
  expect(Object.keys(snapshot ?? {})).toContain("limiteSimplesCentavos");
});

test("limite vazio: o cartão diz 'Limite não informado' e não mostra percentual", async ({ page }) => {
  await page.goto("/configuracoes/empresa");
  await expect(page.getByLabel(CAMPO)).toHaveValue("");
  await page.goto("/");
  const cartao = cartaoDoPainel(page, /Recebido com nota fiscal \(12 meses\)/);
  await expect(cartao).toContainText("Limite não informado");
  await expect(cartao).not.toContainText("% do limite");
  await semRolagemHorizontal(page);
});

test("com um limite informado o cartão mostra o percentual do limite", async ({ page }) => {
  await salvarLimite(page, "1.000.000,00");
  expect(Number(await lerCampoConfiguracao("limiteSimplesCentavos"))).toBe(100_000_000);

  await page.goto("/configuracoes/empresa");
  await expect(page.getByLabel(CAMPO)).toHaveValue("1.000.000,00");

  await page.goto("/");
  const cartao = cartaoDoPainel(page, /Recebido com nota fiscal \(12 meses\)/);
  await expect(cartao).toContainText(/% do limite de R\$\s*1\.000\.000,00/);
  await expect(cartao).not.toContainText("Limite não informado");
  await semRolagemHorizontal(page);
});

test("limite zero volta a 'Limite não informado'", async ({ page }) => {
  await salvarLimite(page, "0");
  const guardado = await lerCampoConfiguracao("limiteSimplesCentavos");
  expect(guardado === null || Number(guardado) === 0, `valor guardado: ${String(guardado)}`).toBe(true);

  await page.goto("/");
  const cartao = cartaoDoPainel(page, /Recebido com nota fiscal \(12 meses\)/);
  await expect(cartao).toContainText("Limite não informado");
  await expect(cartao).not.toContainText("% do limite");
});

test("o limite original da empresa volta ao fim (conferência da restauração)", async () => {
  await restaurarConfiguracao(snapshot);
  const original = snapshot?.limiteSimplesCentavos ?? null;
  const atual = await lerCampoConfiguracao("limiteSimplesCentavos");
  expect(atual ?? null).toBe(original);
});
