import { expect, test, type Page } from "@playwright/test";

import { aguardarAvisosSumirem, entrarEEsperarPainel, semRolagemHorizontal, toast } from "./ajudantes";
import { criarObraDeTeste, prazoDaParcela, prepararUsuarioE2E, vencerParcelaDaObra } from "./banco";
import { ipFalso, USUARIO_E2E } from "./dados";

/**
 * "Cliente pediu até o dia X" (Fase 6, Bloco 0): a parcela vencida continua ATRASADA pelo vencimento original, mas o cliente
 * prometeu uma nova data. A promessa fica registrada (com histórico) e o vencimento nunca muda.
 */
test.describe.configure({ mode: "serial" });
test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(103) } });

let obraId: string;
const dialogo = (page: Page) => page.getByRole("dialog");
const lista = "/financeiro/receber?busca=E2E%20Obra%20Prazo";

/** Data de hoje + `dias`, no formato do campo de data (aaaa-mm-dd), no fuso de São Paulo. */
function emDias(dias: number): string {
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const d = new Date(`${hoje}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

test.beforeAll(async () => {
  await prepararUsuarioE2E({ senhaDefinitiva: true });
  obraId = await criarObraDeTeste("Prazo");
  await vencerParcelaDaObra(obraId, 1, 10); // o sinal venceu há 10 dias
});

test.beforeEach(async ({ page }) => {
  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
});

test("a parcela vencida aparece atrasada; registrar o prazo mantém o atraso e mostra a promessa", async ({ page }) => {
  await page.goto(lista);
  // A lista tem tabela e cartões (um deles oculto conforme a tela): olha só o que está visível.
  await expect(page.getByText("Atrasada há 10 dias").locator("visible=true")).toBeVisible();
  await expect(page.getByText(/Prometido para/).locator("visible=true")).toHaveCount(0);
  await page.getByRole("link", { name: "Sinal" }).click();
  await expect(page.getByRole("heading", { name: "Sinal", level: 1 })).toBeVisible();
  await expect(page.getByText("Atrasada há 10 dias")).toBeVisible();

  const prometida = emDias(7);
  await page.getByRole("button", { name: "Cliente pediu mais prazo" }).click();
  await expect(dialogo(page).getByText(/vencimento original/i)).toBeVisible();
  await dialogo(page).getByLabel("Cliente prometeu pagar até").fill(prometida);
  await dialogo(page).getByLabel("Observação (opcional)").fill("Disse que recebe na sexta");
  await dialogo(page).getByRole("button", { name: "Registrar prazo" }).click();
  await expect(toast(page, /Prazo extra registrado/)).toBeVisible();
  await aguardarAvisosSumirem(page);

  // O atraso segue o vencimento original; a promessa aparece à parte, com o histórico.
  await expect(page.getByText("Atrasada há 10 dias")).toBeVisible();
  await expect(page.getByText("Cliente prometeu pagar até").locator("..")).toContainText(prometida.split("-").reverse().join("/"));
  await expect(page.getByRole("heading", { name: "Pedidos de mais prazo" })).toBeVisible();
  await expect(page.getByText("Disse que recebe na sexta")).toBeVisible();
  await semRolagemHorizontal(page);

  const prazo = await prazoDaParcela(obraId, 1);
  expect(prazo.dataPrometida).toBe(prometida);
  expect(prazo.pedidos).toBe(1);
  expect(prazo.vencimento).toBe(emDias(-10)); // o vencimento original não mudou
});

test("a lista mostra a marca 'Prometido para' sem esconder o atraso; data até o vencimento é recusada", async ({ page }) => {
  await page.goto(lista);
  await expect(page.getByText("Atrasada há 10 dias").locator("visible=true")).toBeVisible();
  await expect(page.getByText(/Prometido para \d{2}\/\d{2}\/\d{4}/).locator("visible=true")).toBeVisible();
  await semRolagemHorizontal(page);

  await page.getByRole("link", { name: "Sinal" }).click();
  await expect(page.getByRole("heading", { name: "Sinal", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Cliente pediu mais prazo" }).click();
  // O servidor recusa mesmo se o campo for contornado: data anterior a hoje.
  await dialogo(page).getByLabel("Cliente prometeu pagar até").evaluate((el: HTMLInputElement, v) => {
    el.removeAttribute("min");
    el.value = v;
  }, emDias(-1));
  await dialogo(page).getByRole("button", { name: "Registrar prazo" }).click();
  await expect(dialogo(page).getByText(/anterior a hoje|de hoje em diante/).first()).toBeVisible();
  await dialogo(page).getByRole("button", { name: "Cancelar" }).click();
  expect((await prazoDaParcela(obraId, 1)).pedidos).toBe(1);
});

test("a visão geral do financeiro explica que o vencido entra no fluxo como esperado para hoje", async ({ page }) => {
  // Sem conta financeira a visão geral só convida a cadastrar uma: cria a de teste (a limpeza apaga "E2E %").
  await page.goto("/financeiro/contas");
  await expect(page.getByRole("heading", { name: /Contas/ }).first()).toBeVisible();
  if ((await page.getByText("E2E Conta Prazo").count()) === 0) {
    await page.getByRole("button", { name: /Nova conta|Cadastrar a primeira conta/ }).first().click();
    await page.getByLabel("Nome").fill("E2E Conta Prazo");
    await page.getByRole("button", { name: "Cadastrar conta" }).click();
    await expect(toast(page, "Conta cadastrada.")).toBeVisible();
  }
  await page.goto("/financeiro");
  await expect(page.getByText(/entram no fluxo como esperados para hoje/)).toBeVisible();
  await semRolagemHorizontal(page);
});
