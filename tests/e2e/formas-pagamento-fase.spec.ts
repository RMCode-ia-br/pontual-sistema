import { expect, test, type Page } from "@playwright/test";

import { aguardarAvisosSumirem, capturar, entrarEEsperarPainel, semRolagemHorizontal, toast } from "./ajudantes";
import { contasDaProposta, criarPropostaRascunhoDeTeste, prepararUsuarioE2E, type PropostaDeTeste } from "./banco";
import { ipFalso, USUARIO_E2E } from "./dados";

/**
 * Fase 3.6a, Bloco 5: a história inteira pela tela. Proposta de R$ 12.800,00 com TRÊS formas de pagamento (principal "À vista",
 * "Pix com desconto" −5% e "Cartão 10x" com o total digitado de R$ 14.080,00 e a marca de taxa da maquininha): criar, enviar, ver o
 * PDF, aprovar escolhendo o cartão, conferir parcelas a receber, Vendido, painel e margem da obra; depois mudar a forma (desfazer e
 * aprovar de novo, o caminho que a tela ensina). O aceite é em setembro de 2020 (sem dado real); a proposta sem formas, em outubro.
 */
test.describe.configure({ mode: "serial" });
test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(95) } });

const MES = "2020-09";
const ACEITE = "2020-09-15";
let comFormas: PropostaDeTeste;
let semFormas: PropostaDeTeste;

test.beforeAll(async () => {
  await prepararUsuarioE2E({ senhaDefinitiva: true });
  comFormas = await criarPropostaRascunhoDeTeste(`Fase formas ${Date.now()}`);
  semFormas = await criarPropostaRascunhoDeTeste(`Fase sem formas ${Date.now()}`);
});

test.beforeEach(async ({ page }) => {
  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
});

async function enviar(page: Page, p: PropostaDeTeste) {
  await page.goto(`/propostas/${p.propostaId}`);
  await page.getByRole("button", { name: "Marcar como enviada" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Marcar como enviada" }).click();
  await expect(toast(page, "marcada como enviada")).toBeVisible();
  await aguardarAvisosSumirem(page);
  await expect(page.getByText("Conteúdo congelado")).toBeVisible();
}

async function aprovar(page: Page, p: PropostaDeTeste, forma: string | null, data: string) {
  await page.goto(`/propostas/${p.propostaId}`);
  await page.getByRole("button", { name: "Aprovar", exact: true }).click();
  const dialogo = page.getByRole("dialog");
  if (forma) await dialogo.getByLabel("Forma de pagamento escolhida").selectOption(forma);
  await dialogo.getByLabel("Forma do aceite").selectOption("WHATSAPP");
  await dialogo.getByLabel("Data do aceite").fill(data);
  await dialogo.getByRole("button", { name: "Aprovar proposta" }).click();
  await expect(toast(page, "aprovada")).toBeVisible();
  await aguardarAvisosSumirem(page);
}

test("cria as três formas pela tela: principal, Pix com desconto e cartão 10x com a marca da maquininha", async ({ page }) => {
  await page.goto(`/propostas/${comFormas.propostaId}`);
  await expect(page.getByRole("heading", { name: "Formas de pagamento", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Adicionar forma de pagamento" }).click();
  await page.getByLabel("Nome da forma principal").fill("À vista");

  // Forma 2: Pix com desconto de 5%, uma parcela só.
  await page.getByLabel("Forma 2: nome").fill("Pix com desconto");
  const f2 = page.getByRole("group", { name: /^Forma 2:/ });
  await f2.getByRole("button", { name: "Parcela", exact: true }).click();
  await page.getByLabel("Forma 2 — Descrição da parcela 1").fill("No Pix");
  await page.getByLabel("Forma 2 — Percentual da parcela 1").fill("100");
  await page.getByLabel("Forma 2 — Forma da parcela 1").selectOption("PIX");
  await page.getByLabel("Forma 2 — Ajuste em porcentagem").fill("-5");
  await expect(f2.getByText("Total desta forma: R$ 12.160,00")).toBeVisible();

  // Forma 3: cartão em 10x com o total digitado; a marca de taxa da maquininha liga sozinha (há parcela no cartão).
  await page.getByRole("button", { name: "Adicionar forma de pagamento" }).click();
  await page.getByLabel("Forma 3: nome").fill("Cartão 10x");
  const f3 = page.getByRole("group", { name: /^Forma 3:/ });
  await f3.getByRole("button", { name: "Parcela", exact: true }).click();
  await page.getByLabel("Forma 3 — Descrição da parcela 1").fill("No cartão");
  await page.getByLabel("Forma 3 — Percentual da parcela 1").fill("100");
  await page.getByLabel("Forma 3 — Forma da parcela 1").selectOption("CARTAO_CREDITO");
  await page.getByLabel("Forma 3 — Parcelas do cartão da parcela 1").fill("10");
  await page.getByLabel("Forma 3 — Como informar o valor").selectOption("TOTAL_DIGITADO");
  await page.getByLabel("Forma 3 — Total desta forma").fill("1408000");
  await expect(f3.getByText("Total desta forma: R$ 14.080,00")).toBeVisible();
  await expect(f3.getByLabel("O acréscimo desta forma é taxa da maquininha (repasse)")).toBeChecked();
  await expect(f3.getByText(/10x R\$\s1\.408,00/)).toBeVisible();
  await expect(f2.getByLabel("O acréscimo desta forma é taxa da maquininha (repasse)")).not.toBeChecked();

  await page.getByRole("button", { name: "Salvar proposta" }).click();
  await expect(toast(page, "Proposta salva")).toBeVisible();
  await aguardarAvisosSumirem(page);
  await semRolagemHorizontal(page);
  await capturar(page, "fase-formas-editor");
});

test("envia e o PDF sai", async ({ page }) => {
  await enviar(page, comFormas);
  const pdf = await page.request.get(`/api/propostas/${comFormas.propostaId}/pdf`);
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
});

test("o aceite pede a forma (em branco), mostra a prévia e o texto de desfazer; a linha 'Valor aprovado' fica escondida", async ({ page }) => {
  await page.goto(`/propostas/${comFormas.propostaId}`);
  await page.getByRole("button", { name: "Aprovar", exact: true }).click();
  const dialogo = page.getByRole("dialog");
  await expect(dialogo.getByLabel("Forma de pagamento escolhida")).toHaveValue("");
  await expect(dialogo.getByRole("button", { name: "Aprovar proposta" })).toBeDisabled();
  // Com formas, o total que vale é o da forma escolhida: a linha genérica "Valor aprovado" da opção não aparece.
  await expect(dialogo.getByText("Valor aprovado:")).toHaveCount(0);
  await expect(dialogo.getByText("Para mudar a forma de pagamento depois de aprovada, desfaça a aprovação e aprove de novo (só se ainda não houve recebimento).")).toBeVisible();

  await dialogo.getByLabel("Forma de pagamento escolhida").selectOption("Cartão 10x");
  const previa = dialogo.getByRole("group", { name: "Prévia da forma de pagamento" });
  await expect(previa.getByText("R$ 14.080,00").first()).toBeVisible();
  await expect(previa.getByText(/10X R\$\s1\.408,00 CARTÃO/)).toBeVisible();
  await expect(dialogo.getByRole("button", { name: "Aprovar proposta" })).toBeEnabled();
  await semRolagemHorizontal(page);
  await capturar(page, "fase-formas-aceite");
  await page.emulateMedia({ colorScheme: "dark" });
  await capturar(page, "fase-formas-aceite-escuro");
  await page.emulateMedia({ colorScheme: "light" });
  await page.keyboard.press("Escape");
});

test("aprova escolhendo o cartão 10x: parcela a receber, Vendido, painel e margem da obra", async ({ page }) => {
  await aprovar(page, comFormas, "Cartão 10x", ACEITE);

  // Parcela a receber: UMA conta no cartão em 10x, com o total que o cliente paga (R$ 14.080,00, já com o acréscimo).
  const contas = await contasDaProposta(comFormas.numero);
  expect(contas.map((c) => c.valorCentavos)).toEqual([1_408_000]);
  expect(contas[0].status).toBe("ABERTA");

  // Vendido de setembro/2020 = total da forma; o repasse de cartão (R$ 1.280,00) aparece à parte.
  await page.goto(`/relatorios/vendas?mes=${MES}`);
  const resumo = page.locator('section[aria-label="Resumo das vendas"]');
  await resumo.waitFor();
  await expect(resumo.getByText("R$ 14.080,00").first()).toBeVisible();
  await expect(resumo.getByText("Repasse de taxa de cartão")).toBeVisible();
  await expect(resumo.getByText("R$ 1.280,00")).toBeVisible();
  await expect(page.getByRole("table", { name: "Propostas aprovadas no período" }).getByRole("row").filter({ hasText: comFormas.numero })).toHaveCount(1);

  // Painel do mesmo mês: o repasse de cartão aparece ao lado do de imposto.
  await page.goto(`/?mes=${MES}`);
  await expect(page.getByText("Repasse de taxa de cartão, fora da margem: R$ 1.280,00")).toBeVisible();

  // Margem da obra: o valor fechado inclui o acréscimo; a receita da margem NÃO (R$ 14.080,00 − R$ 1.280,00 = R$ 12.800,00).
  await page.goto(`/obras/${comFormas.projetoId}?aba=custo`);
  await expect(page.getByRole("heading", { name: "Margem da obra" })).toBeVisible();
  const margem = page.locator("dl").filter({ hasText: "Valor fechado" });
  await expect(margem).toContainText("R$ 14.080,00");
  await expect(margem.getByText("(−) Repasse de taxa de cartão, fora da margem")).toBeVisible();
  await expect(margem.getByText("Receita da margem").locator("..")).toContainText("R$ 12.800,00");
  await semRolagemHorizontal(page);
  await capturar(page, "fase-formas-margem");
  await page.emulateMedia({ colorScheme: "dark" });
  await capturar(page, "fase-formas-margem-escuro");
  await page.emulateMedia({ colorScheme: "light" });
});

test("mudar a forma depois de aprovada: desfazer e aprovar de novo escolhendo o Pix com desconto (Vendido menor, sem repasse)", async ({ page }) => {
  await page.goto(`/propostas/${comFormas.propostaId}`);
  await page.getByRole("button", { name: "Desfazer aprovação" }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("Motivo de desfazer a aprovação").fill("O cliente quis pagar no Pix");
  await dialogo.getByRole("button", { name: "Desfazer aprovação" }).click();
  await expect(toast(page, "desfeita")).toBeVisible();
  await aguardarAvisosSumirem(page);
  expect(await contasDaProposta(comFormas.numero)).toEqual([]);

  await aprovar(page, comFormas, "Pix com desconto", ACEITE);
  expect((await contasDaProposta(comFormas.numero)).map((c) => c.valorCentavos)).toEqual([1_216_000]);

  await page.goto(`/relatorios/vendas?mes=${MES}`);
  const resumo = page.locator('section[aria-label="Resumo das vendas"]');
  await resumo.waitFor();
  await expect(resumo.getByText("R$ 12.160,00").first()).toBeVisible();
  await expect(resumo.getByText("Repasse de taxa de cartão")).toHaveCount(0); // desconto à vista não é repasse
  await page.goto(`/obras/${comFormas.projetoId}?aba=custo`);
  const margem = page.locator("dl").filter({ hasText: "Valor fechado" });
  await expect(margem).toContainText("R$ 12.160,00");
  await expect(margem.getByText("Repasse de taxa de cartão")).toHaveCount(0);
  await expect(margem.getByText("Receita da margem").locator("..")).toContainText("R$ 12.160,00"); // o desconto reduz a margem
});

test("sem formas extras o aceite é o de sempre: 'Valor aprovado' aparece, sem pedir forma e sem o texto de desfazer", async ({ page }) => {
  await enviar(page, semFormas);
  await page.getByRole("button", { name: "Aprovar", exact: true }).click();
  const dialogo = page.getByRole("dialog");
  await expect(dialogo.getByText("Valor aprovado:")).toBeVisible();
  await expect(dialogo.getByText("R$ 12.800,00").first()).toBeVisible();
  await expect(dialogo.getByLabel("Forma de pagamento escolhida")).toHaveCount(0);
  await expect(dialogo.getByText(/Para mudar a forma de pagamento depois de aprovada/)).toHaveCount(0);
  await semRolagemHorizontal(page);
  await dialogo.getByLabel("Forma do aceite").selectOption("WHATSAPP");
  await dialogo.getByLabel("Data do aceite").fill("2020-10-15");
  await dialogo.getByRole("button", { name: "Aprovar proposta" }).click();
  await expect(toast(page, "aprovada")).toBeVisible();
  await aguardarAvisosSumirem(page);
  expect((await contasDaProposta(semFormas.numero)).map((c) => c.valorCentavos)).toEqual([640_000, 640_000]); // 50% + 50% como sempre
});
