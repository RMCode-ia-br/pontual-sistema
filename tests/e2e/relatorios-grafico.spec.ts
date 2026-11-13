import { expect, test } from "@playwright/test";

import { entrarEEsperarPainel, semRolagemHorizontal } from "./ajudantes";
import { criarRecebimentoDeTeste, criarVendaDeTeste, prepararUsuarioE2E } from "./banco";
import { ipFalso, USUARIO_E2E } from "./dados";

/**
 * O gráfico do faturamento só existe quando há dados nos últimos 12 meses, então uma tela sem dados não prova que ele
 * renderiza. Em 2026-11 o servidor passava FUNÇÕES (formatadores) para o gráfico, que é um componente de cliente: o Next
 * recusa e a página de erro aparecia só com dados. Este teste cria vendas e recebimentos "E2E " nos meses recentes e confere
 * que o gráfico aparece, sem erro, e que os números da tabela são os que foram criados.
 */
test.describe.configure({ mode: "serial" });
test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(121) } });

test.beforeAll(async () => {
  await prepararUsuarioE2E({ senhaDefinitiva: true });
  const agora = new Date();
  // Dois meses atrás, dia 15: sempre dentro dos 12 meses mostrados e nunca no mês corrente (que ainda está em andamento).
  const quando = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - 2, 15, 15, 0, 0));
  const iso = quando.toISOString();
  const semNota = await criarVendaDeTeste("Grafico sem nota", { valorCentavos: 4_000_000, comNota: false, aceitaEm: iso });
  await criarRecebimentoDeTeste(semNota.projetoId, { data: iso.slice(0, 10), valorCentavos: 2_000_000, comNota: false });
  const comNota = await criarVendaDeTeste("Grafico com nota", { valorCentavos: 1_050_000, comNota: true, aceitaEm: iso });
  await criarRecebimentoDeTeste(comNota.projetoId, { data: iso.slice(0, 10), valorCentavos: 500_000, comNota: true });
});

test.beforeEach(async ({ page }) => {
  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
});

test("com dados nos últimos 12 meses, os dois gráficos do faturamento aparecem e a tabela traz os números criados", async ({ page }) => {
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(e.message));
  await page.goto("/relatorios/faturamento");
  await expect(page.getByRole("heading", { name: "Faturamento mensal (12 meses)" })).toBeVisible();

  // Os dois gráficos (vendido e recebido) renderizam; sem a página de erro do Next.
  await expect(page.locator("svg.recharts-surface")).toHaveCount(2);
  await expect(page.getByText("Application error")).toHaveCount(0);
  await expect(page.getByText("Functions cannot be passed")).toHaveCount(0);
  await expect(page.getByRole("img", { name: /Vendido em cada um dos últimos 12 meses/ })).toBeVisible();

  // Legenda quando há duas séries.
  await expect(page.getByRole("list", { name: "Legenda" }).first()).toContainText("Sem nota");
  await expect(page.getByRole("list", { name: "Legenda" }).first()).toContainText("Com nota");

  // A tabela do total dos 12 meses contém os valores criados (a conta é por diferença: pode haver dado real em outros meses).
  const total = page.getByRole("row", { name: /Total dos 12 meses/ });
  await expect(total).toBeVisible();
  const linhaDoMes = page.getByRole("row").filter({ hasText: "R$ 40.000,00" }).filter({ hasText: "R$ 10.500,00" });
  await expect(linhaDoMes.first()).toBeVisible();
  await semRolagemHorizontal(page);
  expect(erros, erros.join("\n")).toEqual([]);
});

test("a margem por obra e o relatório de idade das contas também renderizam o gráfico sem erro", async ({ page }) => {
  await page.goto("/relatorios/financeiro/receber");
  await expect(page.getByRole("heading", { name: /A receber por idade/ })).toBeVisible();
  await expect(page.getByText("Application error")).toHaveCount(0);
  await page.goto("/relatorios/margem-obras?situacao=todas");
  await expect(page.getByRole("heading", { name: "Margem por obra" })).toBeVisible();
  await expect(page.getByText("Application error")).toHaveCount(0);
  await expect(page.getByText("Functions cannot be passed")).toHaveCount(0);
});
