import { expect, test, type Page } from "@playwright/test";

import { aguardarAvisosSumirem, ehCelular, entrarEEsperarPainel, semRolagemHorizontal, toast } from "./ajudantes";
import { clienteDaObra, contaDaObra, criarObraDeTeste, definirWhatsappDoClienteDaObra, parcelasDaObra, prepararUsuarioE2E, recebidoDaObra } from "./banco";
import { ipFalso, USUARIO_E2E } from "./dados";

/**
 * Ciclo de aceite da Fase 5 (parte do A receber): obra aprovada → cobrar o sinal por WhatsApp → receber → concluir a etapa
 * → a parcela de 25% abre → receber em duas vezes → estornar. As parcelas da obra de teste são 50/25/25 de R$ 10.000,00.
 */
test.describe.configure({ mode: "serial" });
test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(100) } });

let obraId: string;

const NOME_DA_CONTA = "E2E Conta Ciclo";
const dialogo = (page: Page) => page.getByRole("dialog");
const etapa = (page: Page, ordem: number, nome: string) => page.getByRole("listitem", { name: `Etapa ${ordem}: ${nome}` });
const listaDaObra = "/financeiro/receber?aba=todas&busca=E2E%20Obra%20Ciclo";

test.beforeAll(async () => {
  await prepararUsuarioE2E({ senhaDefinitiva: true });
  obraId = await criarObraDeTeste("Ciclo");
  await definirWhatsappDoClienteDaObra(obraId, "+5522999583288");
});

test.beforeEach(async ({ page }) => {
  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
});

async function receberNoDialogo(page: Page, valorDigitado: string | null) {
  const d = dialogo(page);
  if (valorDigitado) {
    await d.getByLabel("Valor recebido").fill(valorDigitado);
  } else {
    await d.getByRole("button", { name: /Receber o saldo todo/ }).click();
  }
  await d.getByLabel("Conta onde entrou").selectOption({ label: NOME_DA_CONTA });
  await d.getByRole("button", { name: "Registrar recebimento" }).click();
}

test("cadastra a conta financeira onde o dinheiro vai entrar", async ({ page }) => {
  await page.goto("/financeiro/contas");
  await page.getByRole("button", { name: /Nova conta|Cadastrar a primeira conta/ }).first().click();
  await page.getByLabel("Nome").fill(NOME_DA_CONTA);
  await page.getByRole("button", { name: "Cadastrar conta" }).click();
  await expect(toast(page, "Conta cadastrada.")).toBeVisible();
});

test("a lista mostra o sinal em aberto; a cobrança por WhatsApp traz o saldo e o link do cliente", async ({ page }) => {
  await page.goto(listaDaObra);
  await expect(page.getByRole("heading", { name: "A receber", level: 1 })).toBeVisible();
  await semRolagemHorizontal(page);
  // Aba padrão "Em aberto": só o sinal (as outras aguardam a etapa).
  await page.goto("/financeiro/receber?busca=E2E%20Obra%20Ciclo");
  await expect(page.getByRole("link", { name: "Sinal" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Entrega do material" })).toHaveCount(0);

  await page.getByRole("link", { name: "Sinal" }).click();
  await expect(page.getByRole("heading", { name: "Sinal", level: 1 })).toBeVisible();
  await expect(page.getByText("Valor da parcela").locator("..")).toContainText("5.000,00");

  const whatsapp = page.getByRole("link", { name: "Cobrar no WhatsApp" });
  await expect(whatsapp).toHaveAttribute("href", /^https:\/\/wa\.me\/5522999583288\?text=/);
  await page.getByText("Ver a mensagem de cobrança").click();
  await expect(page.getByText(/Identificamos a parcela de R\$\s?5\.000,00/)).toBeVisible();
  await semRolagemHorizontal(page);
});

test("recebimento parcial e depois a quitação do sinal", async ({ page }) => {
  await page.goto("/financeiro/receber?busca=E2E%20Obra%20Ciclo");
  await page.getByRole("link", { name: "Sinal" }).click();

  await page.getByRole("button", { name: "Registrar recebimento" }).click();
  await receberNoDialogo(page, "100000"); // R$ 1.000,00
  await expect(toast(page, "Recebimento parcial registrado.")).toBeVisible();
  await aguardarAvisosSumirem(page);
  await expect(page.getByText("Falta receber").locator("..")).toContainText("4.000,00");
  await expect(page.getByText("Já recebido").locator("..")).toContainText("1.000,00");
  expect((await contaDaObra(obraId, 1)).status).toBe("PARCIAL");

  // A mensagem de cobrança agora pede só o que falta.
  await page.getByText("Ver a mensagem de cobrança").click();
  await expect(page.getByText(/Identificamos a parcela de R\$\s?4\.000,00/)).toBeVisible();

  // Passar do saldo é recusado, com o saldo na mensagem.
  await page.getByRole("button", { name: "Registrar recebimento" }).click();
  await dialogo(page).getByLabel("Valor recebido").fill("500000");
  await dialogo(page).getByLabel("Conta onde entrou").selectOption({ label: NOME_DA_CONTA });
  await dialogo(page).getByRole("button", { name: "Registrar recebimento" }).click();
  await expect(dialogo(page).getByRole("alert").first()).toContainText("passa do saldo");
  await dialogo(page).getByRole("button", { name: "Cancelar" }).click();

  await page.getByRole("button", { name: "Registrar recebimento" }).click();
  await receberNoDialogo(page, null);
  await expect(toast(page, "Recebimento registrado: parcela quitada.")).toBeVisible();
  await expect(page.getByText("Falta receber").locator("..")).toContainText("0,00");
  await expect(page.getByRole("button", { name: "Registrar recebimento" })).toHaveCount(0);
  expect(await contaDaObra(obraId, 1)).toMatchObject({ status: "PAGA", valorPagoCentavos: 500000 });
  expect(await recebidoDaObra(obraId)).toBe(500000);
});

test("concluir a fabricação abre a parcela de 25%, que aparece na lista como vencendo hoje", async ({ page }) => {
  await page.goto(`/obras/${obraId}?aba=etapas`);
  await etapa(page, 1, "Medição exata").getByRole("button", { name: "Concluir: Medição exata" }).click();
  await dialogo(page).getByRole("button", { name: "Concluir", exact: true }).click();
  await expect(toast(page, "Etapa concluída")).toBeVisible();
  await aguardarAvisosSumirem(page);
  if (await dialogo(page).isVisible()) await dialogo(page).getByRole("button", { name: "Manter como está" }).click();

  await etapa(page, 3, "Fabricação").getByRole("button", { name: "Concluir: Fabricação" }).click();
  await dialogo(page).getByRole("button", { name: "Concluir", exact: true }).click();
  await expect(toast(page, /1 parcela\(s\) liberada\(s\) para cobrança/)).toBeVisible();
  await aguardarAvisosSumirem(page);
  if (await dialogo(page).isVisible()) await dialogo(page).getByRole("button", { name: "Manter como está" }).click();
  expect((await parcelasDaObra(obraId)).map((p) => p.status)).toEqual(["PAGA", "ABERTA", "AGUARDANDO_GATILHO"]);

  await page.goto("/financeiro/receber?busca=E2E%20Obra%20Ciclo&aba=hoje");
  await expect(page.getByRole("link", { name: "Entrega do material" })).toBeVisible();
  // A lista tem versão de tabela e de cartões: só a visível conta.
  await expect(page.getByText("Vence hoje").locator("visible=true").first()).toBeVisible();
  await page.goto("/financeiro/receber?busca=E2E%20Obra%20Ciclo&aba=aguardando");
  await expect(page.getByRole("link", { name: "Vidros e instalação" })).toBeVisible();
});

test("receber os 25% em duas vezes fecha a parcela e a obra mostra tudo", async ({ page }) => {
  await page.goto("/financeiro/receber?busca=E2E%20Obra%20Ciclo");
  await page.getByRole("link", { name: "Entrega do material" }).click();
  await page.getByRole("button", { name: "Registrar recebimento" }).click();
  await receberNoDialogo(page, "100000"); // R$ 1.000,00 de R$ 2.500,00
  await expect(toast(page, "Recebimento parcial registrado.")).toBeVisible();
  await aguardarAvisosSumirem(page);
  await page.getByRole("button", { name: "Registrar recebimento" }).click();
  await receberNoDialogo(page, null);
  await expect(toast(page, "parcela quitada")).toBeVisible();
  expect(await contaDaObra(obraId, 2)).toMatchObject({ status: "PAGA", valorPagoCentavos: 250000 });
  expect(await recebidoDaObra(obraId)).toBe(750000);

  await page.goto(`/obras/${obraId}`);
  await page.getByRole("navigation", { name: "Seções da obra" }).getByRole("link", { name: "Parcelas", exact: true }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Sinal" })).toContainText("Paga");
  await expect(page.getByRole("listitem").filter({ hasText: "Entrega do material" })).toContainText("Paga");
  await expect(page.getByRole("listitem").filter({ hasText: "Vidros e instalação" })).toContainText("Aguarda a etapa");
  await semRolagemHorizontal(page);
});

test("estornar um recebimento devolve o valor à parcela e reabre a cobrança", async ({ page }) => {
  await page.goto("/financeiro/receber?busca=E2E%20Obra%20Ciclo&aba=todas");
  await page.getByRole("link", { name: "Entrega do material" }).click();
  // O último recebimento (R$ 1.500,00) da parcela.
  await page.getByRole("link", { name: /R\$\s?1\.500,00 em/ }).click();
  await page.getByRole("button", { name: "Estornar" }).click();
  await page.getByLabel("Motivo").fill("Pix devolvido");
  await page.getByRole("button", { name: "Estornar", exact: true }).last().click();
  await expect(toast(page, "Lançamento estornado.")).toBeVisible();
  await expect(page.getByText("Estornado em")).toBeVisible();
  expect(await contaDaObra(obraId, 2)).toMatchObject({ status: "PARCIAL", valorPagoCentavos: 100000 });
  expect(await recebidoDaObra(obraId)).toBe(600000);

});

test("a ficha do cliente tem a aba Financeiro com o que falta, o atrasado e o recebido", async ({ page }) => {
  const clienteId = await clienteDaObra(obraId);
  await page.goto(`/clientes/${clienteId}?aba=financeiro`);
  await expect(page.getByText("Falta receber").locator("..")).toContainText("4.000,00"); // 1.500 da parcela do material + 2.500 dos vidros
  await expect(page.getByText("Já recebido").locator("..")).toContainText("6.000,00");
  await expect(page.getByRole("link", { name: "Sinal" })).toBeVisible();
  if (ehCelular(page)) await semRolagemHorizontal(page);
});
