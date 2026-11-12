import { expect, test } from "@playwright/test";

import { entrarEEsperarPainel, semRolagemHorizontal } from "./ajudantes";
import { criarObraDeTeste, prepararUsuarioE2E } from "./banco";
import { ipFalso, USUARIO_E2E } from "./dados";

/**
 * Aba "Custo e margem" da obra (Fase 6, Bloco 7). Os números (cada custo uma vez só, soma SQL independente, opção B) estão no
 * teste de integração; aqui: a aba abre, não inventa margem sem proposta aprovada nem sem mão de obra, explica a regra do imposto
 * e oferece a sugestão de mão de obra por m² SEM gravar nada.
 */
test.describe.configure({ mode: "serial" });
test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(109) } });

let obraId: string;

test.beforeAll(async () => {
  await prepararUsuarioE2E({ senhaDefinitiva: true });
  obraId = await criarObraDeTeste("Custo");
});

test.beforeEach(async ({ page }) => {
  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
});

test("sem proposta aprovada e sem mão de obra por m², a margem é INCOMPLETA (nunca zero) e o aviso diz o que falta", async ({ page }) => {
  await page.goto(`/obras/${obraId}?aba=custo`);
  await expect(page.getByRole("navigation", { name: "Seções da obra" }).getByRole("link", { name: "Custo e margem" })).toHaveAttribute("aria-current", "page");
  const aviso = page.getByRole("alert", { name: "Margem incompleta" });
  await expect(aviso).toContainText("Margem incompleta: falta custo para calcular");
  await expect(aviso).toContainText(/valor fechado/);
  await expect(page.getByRole("heading", { name: "Margem da obra" })).toBeVisible();
  await expect(page.getByText(/ainda não tem proposta aprovada/).first()).toBeVisible();
  await expect(page.getByText(/Nenhuma alíquota entra aqui/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "De onde vem cada custo" })).toBeVisible();
  await semRolagemHorizontal(page);
});

test("a sugestão de mão de obra por m² mostra a conta (ou explica por que não dá) e não grava sem confirmar", async ({ page }) => {
  await page.goto(`/obras/${obraId}?aba=custo`);
  const card = page.getByRole("region", { name: /Mão de obra: custo por m² não informado/ }).or(page.locator("section", { hasText: "Mão de obra: custo por m² não informado" }));
  // O cartão só existe enquanto o custo por m² está vazio em Configurações; se já estiver preenchido, não há o que sugerir.
  if ((await card.count()) === 0) return;
  await page.getByRole("button", { name: "Sugerir a partir dos salários" }).click();
  await expect(page.getByText(/É só uma sugestão: nada muda até você confirmar|Não dá para sugerir/)).toBeVisible();
  await semRolagemHorizontal(page);
  // Recarregar mostra que nada foi gravado: o aviso continua lá.
  await page.goto(`/obras/${obraId}?aba=custo`);
  await expect(page.getByText("Mão de obra: custo por m² não informado")).toBeVisible();
});

test("o relatório 'Margem por obra' lista a obra com margem INCOMPLETA (fora da soma) e exporta CSV", async ({ page }) => {
  await page.goto("/relatorios/margem-obras?situacao=todas&busca=E2E%20Obra%20Custo");
  await expect(page.getByRole("heading", { name: "Margem por obra", level: 1 })).toBeVisible();
  const linha = page.getByRole("listitem").filter({ hasText: "E2E Obra Custo" });
  await expect(linha).toBeVisible();
  await expect(linha.getByText("Incompleta")).toBeVisible();
  await expect(linha.getByText(/Falta:/)).toBeVisible();
  await expect(page.getByText(/A conta a pagar de uma compra não entra/)).toBeVisible();
  await semRolagemHorizontal(page);

  const csv = await page.request.get("/api/exportar/relatorios/margem-obras?situacao=todas&busca=E2E%20Obra%20Custo");
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  const texto = await csv.text();
  expect(texto).toContain("E2E Obra Custo");
  expect(texto).toContain("Incompleta");

  await page.goto("/relatorios");
  await expect(page.getByRole("link", { name: /Margem por obra/ })).toBeVisible();
});
