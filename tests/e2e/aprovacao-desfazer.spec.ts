import { expect, test, type Page } from "@playwright/test";

import { aguardarAvisosSumirem, capturar, entrarEEsperarPainel, semRolagemHorizontal, toast } from "./ajudantes";
import { contasDaProposta, criarPropostaRascunhoDeTeste, estadoDaObraDeTeste, prepararUsuarioE2E, statusDasRevisoes, type PropostaDeTeste } from "./banco";
import { ipFalso, USUARIO_E2E } from "./dados";

/**
 * Fase 7A.1: o engano do caso real (aprovar a ORIGINAL com a revisão em rascunho) e a saída pela tela: aviso ao aprovar,
 * desfazer, aprovar a revisão, trocar de volta. O aceite é em junho de 2020 para a venda nunca cair num mês de verdade.
 */
test.describe.configure({ mode: "serial" });
test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(122) } });

test.beforeAll(async () => {
  await prepararUsuarioE2E({ senhaDefinitiva: true });
});

test.beforeEach(async ({ page }) => {
  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
});

const ACEITE = "2020-06-10";
let t: PropostaDeTeste;
let idRevisao = "";

/** A propostas aprovadas de junho de 2020 listam este número? (o "Vendido" do mês do aceite) */
async function vendidoEmJunhoListaEste(page: Page, numero: string): Promise<boolean> {
  await page.goto("/relatorios/vendas?mes=2020-06");
  // A lista chega por streaming (a página abre antes do resumo e da tabela): espera o resumo para só então contar as linhas.
  await page.locator('section[aria-label="Resumo das vendas"]').waitFor();
  return (await page.getByRole("table", { name: "Propostas aprovadas no período" }).getByRole("row").filter({ hasText: numero }).count()) > 0;
}

async function aprovarPelaTela(page: Page) {
  await page.getByRole("button", { name: "Aprovar", exact: true }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("Forma do aceite").selectOption("WHATSAPP");
  await dialogo.getByLabel("Data do aceite").fill(ACEITE);
  await dialogo.getByRole("button", { name: "Aprovar proposta" }).click();
  await expect(toast(page, "aprovada")).toBeVisible();
  await aguardarAvisosSumirem(page);
}

test("preparação: proposta enviada e uma revisão em rascunho", async ({ page }) => {
  t = await criarPropostaRascunhoDeTeste(`Desfazer ${Date.now()}`);
  await page.goto(`/propostas/${t.propostaId}`);
  await page.getByRole("button", { name: "Marcar como enviada" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Marcar como enviada" }).click();
  await expect(toast(page, "marcada como enviada")).toBeVisible();
  await aguardarAvisosSumirem(page);

  await page.getByRole("button", { name: "Nova revisão" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Criar revisão" }).click();
  await expect(page).not.toHaveURL(new RegExp(`/propostas/${t.propostaId}$`));
  idRevisao = page.url().split("/").pop() ?? "";
  await expect(page.getByText("Rev. 1").first()).toBeVisible();
  await expect(statusDasRevisoes(t.numero)).resolves.toEqual([
    { revisao: 0, status: "ENVIADA" },
    { revisao: 1, status: "RASCUNHO" },
  ]);
});

test("cabeçalho e lista dizem qual revisão vale; aprovar a original avisa da revisão mais nova", async ({ page }) => {
  await page.goto(`/propostas/${t.propostaId}`);
  await expect(page.getByText(/· Original$/)).toBeVisible();
  await expect(page.getByText("Revisão vigente")).toBeVisible();
  await expect(page.getByText(/Revisões deste número/)).toContainText("original (enviada, vigente)");

  // A revisão em rascunho não é a vigente e aponta a vigente.
  await page.goto(`/propostas/${idRevisao}`);
  await expect(page.getByText(/Não vigente: a vigente é a/)).toBeVisible();
  await expect(page.getByRole("link", { name: "original", exact: true }).first()).toBeVisible();

  // A página do projeto marca a vigente.
  await page.goto(`/projetos/${t.projetoId}?aba=propostas`);
  await expect(page.getByText("Vigente", { exact: true })).toHaveCount(1);
  await semRolagemHorizontal(page);

  // O aviso do diálogo de aprovar, com o atalho para a revisão mais nova.
  await page.goto(`/propostas/${t.propostaId}`);
  await page.getByRole("button", { name: "Aprovar", exact: true }).click();
  const dialogo = page.getByRole("dialog");
  await expect(dialogo.getByText("A Rev. 1 é mais recente (rascunho). Aprovar esta, a original, vai descartar a Rev. 1.")).toBeVisible();
  await expect(dialogo.getByRole("link", { name: "Abrir a Rev. 1" })).toHaveAttribute("href", `/propostas/${idRevisao}`);
  await semRolagemHorizontal(page);
  await capturar(page, "aprovar-com-revisao-mais-nova");
});

test("o engano: aprova a original mesmo com o aviso; a Rev. 1 fica substituída; o Vendido de junho/2020 conta", async ({ page }) => {
  await page.goto(`/propostas/${t.propostaId}`);
  await aprovarPelaTela(page);
  await expect(statusDasRevisoes(t.numero)).resolves.toEqual([
    { revisao: 0, status: "APROVADA" },
    { revisao: 1, status: "SUBSTITUIDA" },
  ]);
  const contas = await contasDaProposta(t.numero);
  expect(contas.map((c) => c.valorCentavos)).toEqual([640_000, 640_000]);
  const obra = await estadoDaObraDeTeste(t.projetoId);
  expect(obra).toMatchObject({ status: "APROVADO", valorFechadoCentavos: 1_280_000, parcelasVivas: 2 });
  expect(obra.etapasVivas).toBeGreaterThan(0);
  expect(await vendidoEmJunhoListaEste(page, t.numero)).toBe(true);

  // A tela da proposta aprovada oferece a saída; a da revisão diz onde trocar.
  await page.goto(`/propostas/${t.propostaId}`);
  await expect(page.getByRole("button", { name: "Desfazer aprovação" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Trocar pela Rev. 1" })).toBeVisible();
  await page.goto(`/propostas/${idRevisao}`);
  await expect(page.getByText(/Para aprovar esta no lugar, abra a original e use “Trocar pela Rev\. 1”/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Reabrir esta revisão" })).toHaveCount(0);
});

test("desfazer: prévia, bloqueia sem motivo, avisa o mês do Vendido, e a Rev. 1 volta como rascunho", async ({ page }) => {
  await page.goto(`/propostas/${t.propostaId}`);
  await page.getByRole("button", { name: "Desfazer aprovação" }).click();
  const dialogo = page.getByRole("dialog");
  await expect(dialogo.getByText(/2 parcela\(s\) a receber serão canceladas/)).toBeVisible();
  await expect(dialogo.getByText(/etapa\(s\) da obra serão removidas/)).toBeVisible();
  await expect(dialogo.getByText(/A aprovação é de junho\/2020: desfazer tira .* do Vendido de junho\/2020/)).toBeVisible();
  await expect(dialogo.getByRole("radio", { name: /A Rev\. 1 — volta como rascunho/ })).toBeChecked();
  await semRolagemHorizontal(page);
  await capturar(page, "desfazer-aprovacao");

  const confirmar = dialogo.getByRole("button", { name: "Desfazer aprovação" });
  await expect(confirmar).toBeDisabled(); // sem motivo
  await dialogo.getByLabel("Motivo de desfazer a aprovação").fill("Aprovei a original por engano");
  await expect(confirmar).toBeEnabled();
  await confirmar.click();
  await expect(toast(page, "desfeita")).toBeVisible();
  await aguardarAvisosSumirem(page);

  await expect(statusDasRevisoes(t.numero)).resolves.toEqual([
    { revisao: 0, status: "ENVIADA" },
    { revisao: 1, status: "RASCUNHO" },
  ]);
  expect(await contasDaProposta(t.numero)).toEqual([]);
  const obra = await estadoDaObraDeTeste(t.projetoId);
  expect(obra).toMatchObject({ status: "PROPOSTA_ENVIADA", valorFechadoCentavos: null, parcelasVivas: 0, etapasVivas: 0, prazoDias: null });
  // Não é mais venda: o Vendido de junho/2020 deixa de listar a proposta.
  expect(await vendidoEmJunhoListaEste(page, t.numero)).toBe(false);
  await page.goto(`/propostas/${t.propostaId}`);
  await expect(page.getByText("Revisão vigente")).toBeVisible();
});

test("aprovar a Rev. 1: sem aviso (é a mais nova), parcelas e etapas da revisão, e o Vendido volta", async ({ page }) => {
  await page.goto(`/propostas/${idRevisao}`);
  await page.getByRole("button", { name: "Aprovar", exact: true }).click();
  await expect(page.getByRole("dialog").getByText(/é mais recente/)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await aprovarPelaTela(page);

  await expect(statusDasRevisoes(t.numero)).resolves.toEqual([
    { revisao: 0, status: "SUBSTITUIDA" },
    { revisao: 1, status: "APROVADA" },
  ]);
  expect((await contasDaProposta(t.numero, 1)).map((c) => c.valorCentavos)).toEqual([640_000, 640_000]);
  expect(await contasDaProposta(t.numero, 0)).toEqual([]);
  const obra = await estadoDaObraDeTeste(t.projetoId);
  expect(obra).toMatchObject({ status: "APROVADO", valorFechadoCentavos: 1_280_000, parcelasVivas: 2 });
  expect(obra.etapasVivas).toBeGreaterThan(0);
  expect(await vendidoEmJunhoListaEste(page, t.numero)).toBe(true);
});

test("trocar a aprovação: prévia de parcelas e etapas, e a original volta a ser a aprovada numa transação só", async ({ page }) => {
  await page.goto(`/propostas/${idRevisao}`);
  await page.getByRole("button", { name: "Trocar pela original" }).click();
  const dialogo = page.getByRole("dialog");
  await expect(dialogo.getByText("O que muda: Rev. 1 → original")).toBeVisible();
  await expect(dialogo.getByText(/Parcelas hoje \(serão canceladas\)/)).toBeVisible();
  await expect(dialogo.getByText(/etapa\(s\) da obra saem e são geradas de novo\. Prazo:/)).toBeVisible();
  // Data e forma do aceite vêm da aprovação anterior.
  await expect(dialogo.getByLabel("Data do aceite")).toHaveValue(ACEITE);
  await expect(dialogo.getByLabel("Forma do aceite")).toHaveValue("WHATSAPP");
  await semRolagemHorizontal(page);
  await capturar(page, "trocar-aprovacao");

  const confirmar = dialogo.getByRole("button", { name: "Trocar aprovação" });
  await expect(confirmar).toBeDisabled();
  await dialogo.getByLabel("Motivo da troca").fill("O cliente voltou para a proposta original");
  await confirmar.click();
  await expect(toast(page, "Aprovação trocada")).toBeVisible();
  await aguardarAvisosSumirem(page);

  await expect(statusDasRevisoes(t.numero)).resolves.toEqual([
    { revisao: 0, status: "APROVADA" },
    { revisao: 1, status: "SUBSTITUIDA" },
  ]);
  expect((await contasDaProposta(t.numero, 0)).map((c) => c.valorCentavos)).toEqual([640_000, 640_000]);
  expect(await contasDaProposta(t.numero, 1)).toEqual([]);
  const obra = await estadoDaObraDeTeste(t.projetoId);
  expect(obra).toMatchObject({ status: "APROVADO", valorFechadoCentavos: 1_280_000, parcelasVivas: 2 });
  expect(obra.etapasVivas).toBeGreaterThan(0);
  expect(await vendidoEmJunhoListaEste(page, t.numero)).toBe(true);
});

test("reabrir revisão substituída: depois de desfazer sem escolher, a Rev. 1 volta pelo botão", async ({ page }) => {
  await page.goto(`/propostas/${t.propostaId}`);
  await page.getByRole("button", { name: "Desfazer aprovação" }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByRole("radio", { name: /Nenhuma/ }).check();
  await dialogo.getByLabel("Motivo de desfazer a aprovação").fill("Vou rever com o cliente");
  await dialogo.getByRole("button", { name: "Desfazer aprovação" }).click();
  await expect(toast(page, "desfeita")).toBeVisible();
  await aguardarAvisosSumirem(page);
  await expect(statusDasRevisoes(t.numero)).resolves.toEqual([
    { revisao: 0, status: "ENVIADA" },
    { revisao: 1, status: "SUBSTITUIDA" },
  ]);

  await page.goto(`/propostas/${idRevisao}`);
  await page.getByRole("button", { name: "Reabrir esta revisão" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Reabrir revisão" }).click();
  await expect(toast(page, "reaberta como enviada")).toBeVisible();
  await aguardarAvisosSumirem(page);
  // A Rev. 1 foi congelada quando foi aprovada (já foi "enviada"): volta como ENVIADA e a original sai de vigor (uma só vale).
  await expect(statusDasRevisoes(t.numero)).resolves.toEqual([
    { revisao: 0, status: "SUBSTITUIDA" },
    { revisao: 1, status: "ENVIADA" },
  ]);
  await expect(page.getByText("Revisão vigente")).toBeVisible();
  await semRolagemHorizontal(page);
});
