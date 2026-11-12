import { expect, test } from "@playwright/test";

import { capturar, ehCelular, entrarEEsperarPainel, semRolagemHorizontal } from "./ajudantes";
import { atribuirEquipeAEtapas, criarObraDeTeste, prepararUsuarioE2E } from "./banco";
import { ipFalso, USUARIO_E2E } from "./dados";

test.describe.configure({ mode: "serial" });
test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(95) } });

const BUSCA = "E2E Obra Lista";
let obraId: string;

test.beforeAll(async () => {
  await prepararUsuarioE2E({ senhaDefinitiva: true });
  obraId = await criarObraDeTeste("Lista A");
  await atribuirEquipeAEtapas(obraId, "E2E Equipe Instaladores", ["INSTALACAO_ESQUADRIAS", "INSTALACAO_VIDROS"]);
});

test.beforeEach(async ({ page }) => {
  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
});

test("lista de obras em andamento: etapa atual, prazo e resumo; filtra e limpa", async ({ page }) => {
  await page.goto(`/obras?busca=${encodeURIComponent(BUSCA)}`);
  await expect(page.getByRole("heading", { name: "Obras", level: 1 })).toBeVisible();
  const lista = page.getByRole("list", { name: "Obras" });
  await expect(lista.getByRole("link", { name: "E2E Obra Lista A" })).toBeVisible();
  await expect(lista).toContainText("Etapa atual: Medição exata");
  await expect(lista).toContainText("0 de 9 etapas concluídas");
  await expect(lista).toContainText("Sem prazo definido");
  await expect(page.getByRole("status").filter({ hasText: "1 obra em andamento" })).toContainText("1 sem prazo definido");
  await semRolagemHorizontal(page);
  await capturar(page, "obras-lista");

  // Filtro por etapa atual: nenhuma obra está em "Fabricação".
  await page.getByLabel("Etapa atual").selectOption("FABRICACAO");
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page.getByText("Nenhuma obra com esses filtros")).toBeVisible();
  await page.getByRole("link", { name: "Limpar" }).click();
  await expect(page).toHaveURL(/\/obras$/);

  await page.goto(`/obras?busca=${encodeURIComponent(BUSCA)}&etapa=MEDICAO_EXATA`);
  await expect(page.getByRole("list", { name: "Obras" }).getByRole("link", { name: "E2E Obra Lista A" })).toBeVisible();
});

test("quadro por etapa: a obra aparece na coluna da etapa atual, sem arrastar, e a página não rola de lado", async ({ page }) => {
  await page.goto(`/obras?busca=${encodeURIComponent(BUSCA)}`);
  await page.getByRole("navigation", { name: "Como ver as obras" }).getByRole("link", { name: "Quadro por etapa" }).click();
  await expect(page).toHaveURL(/visao=quadro/);

  const medicao = page.getByRole("region", { name: /Obras por etapa atual/ }).locator("section").filter({ has: page.getByRole("heading", { name: "Medição exata" }) });
  await expect(medicao.getByRole("link", { name: "E2E Obra Lista A" })).toBeVisible();
  const fabricacao = page.getByRole("region", { name: /Obras por etapa atual/ }).locator("section").filter({ has: page.getByRole("heading", { name: "Fabricação" }) });
  await expect(fabricacao).toContainText("Nenhuma obra nesta etapa.");
  await semRolagemHorizontal(page); // a rolagem do quadro fica dentro dele
  await capturar(page, "obras-quadro");

  await medicao.getByRole("link", { name: "E2E Obra Lista A" }).click();
  await expect(page).toHaveURL(new RegExp(`/obras/${obraId}$`));
});

test("obras concluídas: sem obras no filtro mostra o estado vazio (e a pontualidade só aparece com dados)", async ({ page }) => {
  await page.goto(`/obras?situacao=concluidas&busca=${encodeURIComponent(BUSCA)}`);
  await expect(page.getByText("Nenhuma obra com esses filtros")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /Nenhuma obra concluída com prazo definido/ })).toBeVisible();
  await expect(page.getByLabel("Concluída de")).toBeVisible();
  await semRolagemHorizontal(page);
});

test("exportar CSV respeita os filtros e vem com cabeçalho em português", async ({ page }) => {
  const resposta = await page.request.get(`/api/exportar/obras?busca=${encodeURIComponent(BUSCA)}`);
  expect(resposta.status()).toBe(200);
  expect(resposta.headers()["content-type"]).toContain("text/csv");
  const csv = await resposta.text();
  expect(csv).toContain("Código");
  expect(csv).toContain("Etapa atual");
  expect(csv).toContain("E2E Obra Lista A");
  expect(csv).toContain("Medição exata");
});

test("calendário de instalação: etapas previstas sem agendamento; agendar liga o compromisso à etapa e a tira da lista", async ({ page }) => {
  await page.goto("/obras/calendario?vista=lista");
  await expect(page.getByRole("heading", { name: "Calendário de instalação", level: 1 })).toBeVisible();
  const pendentes = page.getByRole("region").or(page.locator("section")).filter({ has: page.getByRole("heading", { name: "Previstas, sem agendamento" }) }).first();
  await expect(pendentes).toBeVisible();

  const agendarInstalacao = page.getByRole("link", { name: "Agendar Instalação das esquadrias: E2E Obra Lista A" });
  await expect(agendarInstalacao).toBeVisible();
  await expect(page.getByRole("link", { name: "Agendar Instalação dos vidros: E2E Obra Lista A" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Agendar Entrega: E2E Obra Lista A" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Agendar Medição dos vidros: E2E Obra Lista A" })).toBeVisible();
  await semRolagemHorizontal(page);
  await capturar(page, "obras-calendario");

  await agendarInstalacao.click();
  await expect(page).toHaveURL(/\/agenda\/novo\?/);
  await expect(page.getByText("Este compromisso cumpre a etapa Instalação das esquadrias da obra.")).toBeVisible();
  await expect(page.getByLabel("Tipo")).toHaveValue("INSTALACAO");
  await expect(page.getByLabel("Equipe (opcional)")).not.toHaveValue(""); // veio da etapa
  await page.getByRole("button", { name: "Agendar", exact: true }).click();
  // Avisos (conflito, fim de semana, feriado) pedem confirmação, como sempre.
  const assimMesmo = page.getByRole("button", { name: "Agendar assim mesmo" });
  if (await assimMesmo.isVisible({ timeout: 3000 }).catch(() => false)) await assimMesmo.click();
  await expect(page).toHaveURL(/\/agenda\?vista=semana/);

  // A etapa deixou de estar "sem agendamento", e o compromisso aparece no calendário de instalação.
  await page.goto("/obras/calendario?vista=lista");
  await expect(page.getByRole("link", { name: "Agendar Instalação das esquadrias: E2E Obra Lista A" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Agendar Instalação dos vidros: E2E Obra Lista A" })).toBeVisible();
  await expect(page.getByText("E2E Cliente Lista A").first()).toBeVisible();
});

test("o filtro de equipe do calendário mostra só as etapas dela (e as sem equipe)", async ({ page }) => {
  await page.goto("/obras/calendario?vista=lista");
  await page.getByLabel("Equipe").selectOption({ label: "E2E Equipe Instaladores" });
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page).toHaveURL(/equipe=/);
  await expect(page.getByRole("link", { name: "Agendar Instalação dos vidros: E2E Obra Lista A" })).toBeVisible();
  await page.getByRole("link", { name: "Limpar" }).click();
  await expect(page).toHaveURL(/\/obras\/calendario/);
});

test("menu: Obras tem os dois itens e só o da página atual fica realçado", async ({ page }) => {
  await page.goto("/obras/calendario");
  if (ehCelular(page)) await page.getByRole("button", { name: "Mais" }).click();
  const menu = page.getByRole("navigation", { name: "Menu principal" });
  // O grupo da página atual já começa aberto.
  await expect(menu.getByRole("link", { name: "Em andamento" })).toBeVisible();
  const calendario = menu.getByRole("link", { name: "Calendário de instalação" });
  await expect(calendario).toHaveAttribute("aria-current", "page");
  await expect(menu.getByRole("link", { name: "Em andamento" })).not.toHaveAttribute("aria-current", "page");
});
