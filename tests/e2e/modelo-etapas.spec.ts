import { expect, test } from "@playwright/test";

import { aguardarAvisosSumirem, capturar, entrarEEsperarPainel, semRolagemHorizontal, toast } from "./ajudantes";
import { prepararUsuarioE2E, restaurarModeloDeEtapas, tirarSnapshotDoModeloDeEtapas } from "./banco";
import { ipFalso, USUARIO_E2E } from "./dados";

test.describe.configure({ mode: "serial" });
test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(93) } });

test.beforeAll(async () => {
  await prepararUsuarioE2E({ senhaDefinitiva: true });
});

test.beforeEach(async ({ page }) => {
  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
});

test("modelo de etapas: mostra as 9 etapas do padrão, avisa o que ficaria sem funcionar e não rola na horizontal", async ({ page }) => {
  await page.goto("/configuracoes/modelo-etapas");
  await expect(page.getByRole("heading", { name: "Modelo de etapas", level: 1 })).toBeVisible();
  await expect(page.getByLabel("Nome da etapa 1")).toHaveValue("Medição exata");
  await expect(page.getByLabel("Nome da etapa 9")).toHaveValue("Entrega");
  await expect(page.getByLabel("Nome da etapa 10")).toHaveCount(0);
  // A medição exata não pertence a nenhum prazo (ela inicia o relógio).
  await expect(page.getByLabel("Prazo da etapa 1")).toBeDisabled();
  await expect(page.getByLabel("Prazo da etapa 2")).toHaveValue("MATERIAL");
  await expect(page.getByLabel("Parcela liberada pela etapa 3")).toHaveValue("ENTREGA_MATERIAL");
  await expect(page.getByLabel("Parcela liberada pela etapa 7")).toHaveValue("ENTREGA_E_INSTALACAO");
  await expect(page.getByRole("button", { name: "Salvar modelo" })).toBeDisabled(); // nada mudou
  await expect(page.getByRole("heading", { name: "Atenção" })).toHaveCount(0);
  await semRolagemHorizontal(page);
  await capturar(page, "modelo-etapas");

  // Tirar o gatilho do material: continua válido, mas avisa que a parcela ficaria aguardando para sempre.
  await page.getByLabel("Parcela liberada pela etapa 3").selectOption("");
  await expect(page.getByRole("heading", { name: "Atenção" })).toBeVisible();
  await expect(page.getByText(/Nenhuma etapa libera a parcela "Entrega do material/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Salvar modelo" })).toBeEnabled();
});

test("modelo de etapas: regras do modelo bloqueiam o salvamento e explicam o motivo", async ({ page }) => {
  await page.goto("/configuracoes/modelo-etapas");

  // Dois gatilhos iguais.
  await page.getByLabel("Parcela liberada pela etapa 4").selectOption("ENTREGA_MATERIAL");
  await expect(page.getByRole("status").filter({ hasText: /Só uma etapa pode liberar/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Salvar modelo" })).toBeDisabled();
  await page.getByLabel("Parcela liberada pela etapa 4").selectOption("");

  // Medição exata fora do começo.
  await page.getByLabel("Descer a etapa 1").click();
  await expect(page.getByRole("status").filter({ hasText: /precisa ser a primeira etapa/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Salvar modelo" })).toBeDisabled();
  await page.getByLabel("Subir a etapa 2").click();

  // Peso inválido.
  await page.getByLabel("Peso da etapa 2").fill("0");
  await expect(page.getByRole("status").filter({ hasText: /peso mínimo é 1/ })).toBeVisible();
  await page.getByLabel("Peso da etapa 2").fill("1");

  // Etapa inativa não libera parcela: ao desativar, o gatilho sai sozinho e o aviso diz o que ficou sem etapa.
  await expect(page.getByLabel("Parcela liberada pela etapa 3")).toHaveValue("ENTREGA_MATERIAL");
  await page.getByLabel("Ativa", { exact: true }).nth(2).uncheck(); // etapa 3 (fabricação)
  await expect(page.getByLabel("Parcela liberada pela etapa 3")).toHaveValue("");
  await expect(page.getByText(/Nenhuma etapa libera a parcela "Entrega do material/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Salvar modelo" })).toBeEnabled();
});

test("modelo de etapas: renomear e salvar persiste, e o modelo volta ao que era", async ({ page }) => {
  const snapshot = await tirarSnapshotDoModeloDeEtapas();
  try {
    await page.goto("/configuracoes/modelo-etapas");
    await page.getByLabel("Nome da etapa 9").fill("Entrega final ao cliente");
    await page.getByRole("button", { name: "Salvar modelo" }).click();
    await expect(toast(page, "Modelo de etapas salvo")).toBeVisible();
    await aguardarAvisosSumirem(page);

    await page.reload();
    await expect(page.getByLabel("Nome da etapa 9")).toHaveValue("Entrega final ao cliente");
    await expect(page.getByLabel("Nome da etapa 10")).toHaveCount(0);
    await expect(page.getByLabel("Parcela liberada pela etapa 7")).toHaveValue("ENTREGA_E_INSTALACAO"); // o resto ficou igual
  } finally {
    await restaurarModeloDeEtapas(snapshot);
  }

  await page.reload();
  await expect(page.getByLabel("Nome da etapa 9")).toHaveValue("Entrega");
});

test("modelo de etapas: acessível pelo menu de Configurações", async ({ page }) => {
  await page.goto("/configuracoes/empresa");
  await page.getByRole("navigation", { name: "Seções de configurações" }).getByRole("link", { name: "Modelo de etapas" }).click();
  await expect(page).toHaveURL(/\/configuracoes\/modelo-etapas$/);
});
