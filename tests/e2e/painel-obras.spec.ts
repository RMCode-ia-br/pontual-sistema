import { expect, test } from "@playwright/test";

import { capturar, entrarEEsperarPainel, semRolagemHorizontal } from "./ajudantes";
import { atrasarEtapaDaObra, criarObraDeTeste, prepararUsuarioE2E } from "./banco";
import { ipFalso, USUARIO_E2E } from "./dados";

test.describe.configure({ mode: "serial" });
test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(98) } });

let obraId: string;

test.beforeAll(async () => {
  await prepararUsuarioE2E({ senhaDefinitiva: true });
  obraId = await criarObraDeTeste("Painel");
  await atrasarEtapaDaObra(obraId, "MEDICAO_EXATA", 5); // a medição era para 5 dias atrás
});

test.beforeEach(async ({ page }) => {
  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
});

test("o painel mostra as obras: números com definição, por etapa e a obra atrasada", async ({ page }) => {
  await page.goto("/");
  const obras = page.locator("section").filter({ has: page.getByRole("heading", { name: "Obras", level: 2, exact: true }) });
  await expect(obras.getByRole("link", { name: /Obras em andamento/ })).toBeVisible();
  await expect(obras.getByRole("link", { name: /Obras atrasadas/ })).toBeVisible();
  await expect(obras.getByRole("link", { name: /Vencem em breve/ })).toBeVisible();
  await expect(obras.getByRole("link", { name: /Pontualidade/ })).toBeVisible();
  await expect(obras.getByRole("link", { name: /Chamados em aberto/ })).toBeVisible();
  // Cada indicador explica como é calculado (tooltip) e leva à lista filtrada.
  await expect(obras.getByRole("link", { name: /Obras atrasadas/ })).toHaveAttribute("title", /Como é calculado/);
  await expect(obras.getByRole("link", { name: /Obras atrasadas/ })).toHaveAttribute("href", "/obras?semaforo=VERMELHO");
  await expect(obras.getByRole("link", { name: /Pontualidade/ })).toHaveAttribute("href", /situacao=concluidas&de=\d{4}-\d{2}-\d{2}&ate=\d{4}-\d{2}-\d{2}/);

  // A obra de teste está na etapa "Medição exata" e com ela atrasada.
  await expect(obras.getByRole("link", { name: "Medição exata" })).toHaveAttribute("href", "/obras?etapa=MEDICAO_EXATA");
  const atencao = page.locator("div").filter({ has: page.getByRole("heading", { name: "Obras com etapa atrasada" }) }).last();
  await expect(atencao.getByRole("link", { name: /E2E Obra Painel/ })).toBeVisible();
  await expect(atencao.getByText(/etapas? atrasadas?/).first()).toBeVisible();
  await semRolagemHorizontal(page);
  await capturar(page, "painel-obras");

  // O link da obra atrasada leva às etapas dela.
  await atencao.getByRole("link", { name: /E2E Obra Painel/ }).click();
  await expect(page).toHaveURL(new RegExp(`/obras/${obraId}\\?aba=etapas`));
});

test("os links do painel chegam às listas filtradas", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /Obras atrasadas/ }).click();
  await expect(page).toHaveURL(/\/obras\?semaforo=VERMELHO/);
  await expect(page.getByRole("link", { name: "E2E Obra Painel" })).toBeVisible();

  await page.goto("/");
  await page.getByRole("link", { name: "Medição exata", exact: true }).click();
  await expect(page).toHaveURL(/\/obras\?etapa=MEDICAO_EXATA/);
  await expect(page.getByRole("link", { name: "E2E Obra Painel" })).toBeVisible();
});

test("relatório de obras e assistência: seções com definição, filtro de período e CSV", async ({ page }) => {
  await page.goto("/relatorios");
  await page.getByRole("link", { name: /Obras e assistência/ }).click();
  await expect(page).toHaveURL(/\/relatorios\/obras/);
  await expect(page.getByRole("heading", { name: "Obras e assistência", level: 1 })).toBeVisible();
  for (const secao of ["Pontualidade das obras concluídas", "Atrasos por etapa", "Pausas e bloqueios por motivo", "Assistências"]) {
    await expect(page.getByRole("heading", { name: secao, level: 2 })).toBeVisible();
  }
  // Toda seção traz "como é calculado".
  await expect(page.getByText(/^Como é calculado: /)).toHaveCount(4);
  // A medição atrasada aparece em "Atrasadas hoje".
  const tabela = page.getByRole("table", { name: "Atrasos por etapa" });
  await expect(tabela.getByRole("row", { name: /Medição exata/ })).toBeVisible();
  await semRolagemHorizontal(page);
  await capturar(page, "relatorio-obras");

  // Período: datas invertidas são corrigidas (a URL é dado não confiável) e a tela não quebra.
  await page.goto("/relatorios/obras?de=2026-12-31&ate=2026-01-01&de=lixo");
  await expect(page.getByRole("heading", { name: "Obras e assistência", level: 1 })).toBeVisible();

  await page.locator('input[name="de"]').fill("2020-01-01");
  await page.locator('input[name="ate"]').fill("2020-01-31");
  await page.getByRole("button", { name: "Aplicar" }).click();
  await expect(page).toHaveURL(/de=2020-01-01&ate=2020-01-31/);
  await expect(page.getByText(/Nenhuma obra concluída com prazo definido nesse período/)).toBeVisible();
  await expect(page.getByText(/Nenhum chamado aberto nesse período/)).toBeVisible();

  const resposta = await page.request.get("/api/exportar/relatorios/obras?de=2020-01-01&ate=2020-01-31");
  expect(resposta.status()).toBe(200);
  expect(resposta.headers()["content-type"]).toContain("text/csv");
  expect(await resposta.text()).toContain("Pontualidade %");
});

test("o relatório e a exportação exigem sessão", async ({ browser }) => {
  const contexto = await browser.newContext({ baseURL: `http://localhost:3100`, extraHTTPHeaders: { "x-forwarded-for": ipFalso(98) } });
  const semSessao = await contexto.newPage();
  // Sem sessão o proxy redireciona ao login (e a rota ainda confere a sessão por conta própria).
  for (const rota of ["/api/exportar/relatorios/obras", "/api/exportar/chamados", "/relatorios/obras", "/obras/assistencia"]) {
    const r = await semSessao.request.get(rota, { maxRedirects: 0 });
    expect([301, 302, 303, 307, 308], rota).toContain(r.status());
    expect(r.headers().location, rota).toContain("/login");
  }
  await semSessao.goto("/relatorios/obras");
  await expect(semSessao).toHaveURL(/\/login/);
  await contexto.close();
});
