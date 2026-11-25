import { expect, test } from "@playwright/test";

import { aguardarAvisosSumirem, capturar, entrarEEsperarPainel, semRolagemHorizontal, toast } from "./ajudantes";
import { criarPropostaRascunhoDeTeste, prepararUsuarioE2E, type PropostaDeTeste } from "./banco";
import { ipFalso, USUARIO_E2E } from "./dados";

// Fase 3.6a, Bloco 2: editor das formas de pagamento. A proposta de teste vale R$ 12.800,00 (um valor só, sem nota).
test.describe.configure({ mode: "serial" });
test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(94) } });

let proposta: PropostaDeTeste;

test.beforeAll(async () => {
  await prepararUsuarioE2E({ senhaDefinitiva: true });
  proposta = await criarPropostaRascunhoDeTeste("Formas de pagamento");
});

test.beforeEach(async ({ page }) => {
  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
});

async function abrirEditor(page: import("@playwright/test").Page) {
  await page.goto(`/propostas/${proposta.propostaId}`);
  // Espera algo positivo antes de afirmar qualquer coisa (a página chega por streaming).
  await expect(page.getByRole("heading", { name: "Formas de pagamento", exact: true })).toBeVisible();
}

test("sem formas extras o editor é o de sempre: só a forma principal, sem campo de nome", async ({ page }) => {
  await abrirEditor(page);
  await expect(page.getByLabel("Descrição da parcela 1")).toBeVisible();
  await expect(page.getByLabel("Nome da forma principal")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Adicionar forma de pagamento" })).toBeVisible();
});

test("adiciona cartão em 10x (total digitado) e à vista com desconto: totais ao vivo, salva e recarrega", async ({ page }) => {
  await abrirEditor(page);

  await page.getByRole("button", { name: "Adicionar forma de pagamento" }).click();
  await expect(page.getByLabel("Nome da forma principal")).toBeVisible();
  await page.getByLabel("Nome da forma principal").fill("À vista");

  // Forma 2: cartão em 10x com o total digitado (+10% sobre R$ 12.800,00 = R$ 14.080,00).
  await page.getByLabel("Forma 2: nome").fill("10x no cartão");
  const f2 = page.getByRole("group", { name: /^Forma 2:/ });
  await f2.getByRole("button", { name: "Parcela", exact: true }).click();
  await page.getByLabel("Forma 2 — Descrição da parcela 1").fill("No cartão");
  await page.getByLabel("Forma 2 — Percentual da parcela 1").fill("100");
  await page.getByLabel("Forma 2 — Forma da parcela 1").selectOption("CARTAO_CREDITO");
  await page.getByLabel("Forma 2 — Parcelas do cartão da parcela 1").fill("10");
  await page.getByLabel("Forma 2 — Como informar o valor").selectOption("TOTAL_DIGITADO");
  await page.getByLabel("Forma 2 — Total desta forma").fill("1408000"); // o campo de dinheiro põe os dígitos pela direita, como maquininha
  await expect(page.getByLabel("Forma 2 — Total desta forma")).toHaveValue("14.080,00");
  await expect(f2.getByText("Total desta forma: R$ 14.080,00")).toBeVisible();
  await expect(f2.getByText(/ajuste \+10%/)).toBeVisible();
  await expect(f2.getByText(/10x R\$\s1\.408,00/)).toBeVisible();
  // Cartão: a marca de repasse vem ligada.
  await expect(f2.getByLabel("O acréscimo desta forma é taxa da maquininha (repasse)")).toBeChecked();

  // Forma 3: à vista com 5% de desconto em %, 50% de sinal + 50% na instalação.
  await page.getByRole("button", { name: "Adicionar forma de pagamento" }).click();
  await page.getByLabel("Forma 3: nome").fill("Pix com desconto");
  const f3 = page.getByRole("group", { name: /^Forma 3:/ });
  await f3.getByRole("button", { name: "Parcela", exact: true }).click();
  await page.getByLabel("Forma 3 — Descrição da parcela 1").fill("Sinal");
  await page.getByLabel("Forma 3 — Percentual da parcela 1").fill("50");
  await f3.getByRole("button", { name: "Parcela", exact: true }).click();
  await page.getByLabel("Forma 3 — Descrição da parcela 2").fill("Instalação");
  await page.getByLabel("Forma 3 — Percentual da parcela 2").fill("50");
  await page.getByLabel("Forma 3 — Gatilho da parcela 2").selectOption("ENTREGA_E_INSTALACAO");
  await page.getByLabel("Forma 3 — Ajuste em porcentagem").fill("-5");
  await expect(f3.getByText("Total desta forma: R$ 12.160,00")).toBeVisible();
  await expect(f3.getByText(/Sinal: R\$\s6\.080,00/)).toBeVisible();
  await expect(f3.getByText(/Desconto: reduz o Vendido e a margem/)).toBeVisible();

  await page.getByRole("button", { name: "Salvar proposta" }).click();
  await expect(toast(page, "Proposta salva")).toBeVisible();
  await aguardarAvisosSumirem(page);

  await abrirEditor(page);
  await expect(page.getByLabel("Nome da forma principal")).toHaveValue("À vista");
  await expect(page.getByLabel("Forma 2: nome")).toHaveValue("10x no cartão");
  await expect(page.getByLabel("Forma 2 — Total desta forma")).toHaveValue("14.080,00");
  await expect(page.getByLabel("Forma 3: nome")).toHaveValue("Pix com desconto");
  await expect(page.getByLabel("Forma 3 — Ajuste em porcentagem")).toHaveValue("-5");
  // A forma principal continua com o cronograma que a proposta já tinha (50% + 50%).
  await expect(page.getByLabel("Descrição da parcela 2", { exact: true })).toHaveValue("Entrega e instalação");
  await expect(page.getByText("Total nesta forma: R$ 12.800,00")).toBeVisible();
});

test("recusa ajuste fora de -50% a +50%, total a mais de 50% e nomes repetidos, com mensagem simples", async ({ page }) => {
  await abrirEditor(page);
  await expect(page.getByLabel("Forma 3: nome")).toBeVisible();

  await page.getByLabel("Forma 3 — Ajuste em porcentagem").fill("60");
  await page.getByRole("button", { name: "Salvar proposta" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "-50% a +50%" })).toBeVisible();

  await page.getByLabel("Forma 3 — Ajuste em porcentagem").fill("0");
  await page.getByLabel("Forma 2 — Total desta forma").fill("2000000"); // R$ 20.000,00
  await expect(page.getByText("difere mais de 50%").first()).toBeVisible();
  await page.getByRole("button", { name: "Salvar proposta" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "difere mais de 50%" }).first()).toBeVisible();

  await page.getByLabel("Forma 2 — Total desta forma").fill("1408000");
  await page.getByLabel("Forma 3: nome").fill("10x NO CARTÃO");
  await page.getByRole("button", { name: "Salvar proposta" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "duas formas" }).first()).toBeVisible();
});

test("ajuste zero vale; duplicar, subir e remover funcionam; o limite é de 5 formas", async ({ page }) => {
  await abrirEditor(page);
  await page.getByLabel("Forma 3 — Ajuste em porcentagem").fill("0");
  await expect(page.getByRole("group", { name: /^Forma 3:/ }).getByText("Total desta forma: R$ 12.800,00")).toBeVisible();

  await page.getByRole("button", { name: "Duplicar a forma 3" }).click();
  await expect(page.getByLabel("Forma 4: nome")).toHaveValue("Pix com desconto (cópia)");
  await page.getByRole("button", { name: "Subir a forma 4" }).click();
  await expect(page.getByLabel("Forma 3: nome")).toHaveValue("Pix com desconto (cópia)");
  await page.getByRole("button", { name: "Adicionar forma de pagamento" }).click();
  await expect(page.getByLabel("Forma 5: nome")).toBeVisible();
  await expect(page.getByRole("button", { name: "Adicionar forma de pagamento" })).toBeDisabled();
  await expect(page.getByText("No máximo 5 formas por proposta.")).toBeVisible();

  await page.getByRole("button", { name: "Remover a forma 5" }).click();
  await page.getByRole("button", { name: "Remover a forma 4" }).click();
  await expect(page.getByLabel("Forma 4: nome")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Adicionar forma de pagamento" })).toBeEnabled();
});

test("editor mostra o aviso de recurso em construção e cabe na tela (390 px sem rolagem lateral)", async ({ page }) => {
  await abrirEditor(page);
  await page.getByLabel("Forma 3 — Ajuste em porcentagem").fill("-6");
  await page.getByRole("button", { name: "Salvar proposta" }).click();
  await expect(toast(page, "Proposta salva")).toBeVisible();
  await aguardarAvisosSumirem(page);
  await expect(page.getByText(/Em preparo: a proposta com formas extras já pode ser enviada/)).toBeVisible();
  await semRolagemHorizontal(page);
  await capturar(page, "formas-pagamento-editor-claro");
  await page.emulateMedia({ colorScheme: "dark" });
  await capturar(page, "formas-pagamento-editor-escuro");
  await semRolagemHorizontal(page);
});

test("envia com formas extras: o PDF sai, a revisão copia tudo e a comparação não vê diferença; a aprovação fica em preparo", async ({ page }) => {
  await abrirEditor(page);
  await page.getByRole("button", { name: "Marcar como enviada" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Marcar como enviada" }).click();
  await expect(toast(page, "marcada como enviada")).toBeVisible();
  await aguardarAvisosSumirem(page);
  await expect(page.getByText("Conteúdo congelado")).toBeVisible();

  const pdf = await page.request.get(`/api/propostas/${proposta.propostaId}/pdf`);
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

  // Aprovar ainda não: a escolha da forma no aceite está em preparo (Bloco 4).
  await page.getByRole("button", { name: "Aprovar", exact: true }).click();
  const dialogo = page.getByRole("dialog");
  await expect(dialogo.getByText(/Em preparo: esta proposta tem mais de uma forma de pagamento/)).toBeVisible();
  await expect(dialogo.getByRole("button", { name: "Aprovar proposta" })).toBeDisabled();
  await page.keyboard.press("Escape");

  // Nova revisão: as formas vêm copiadas e a comparação não aponta diferença.
  await page.getByRole("button", { name: "Nova revisão" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Criar revisão" }).click();
  await expect(page.getByText("Rev. 1").first()).toBeVisible();
  await expect(page.getByLabel("Nome da forma principal")).toHaveValue("À vista");
  await expect(page.getByLabel("Forma 2: nome")).toHaveValue("10x no cartão");
  await expect(page.getByLabel("Forma 2 — Total desta forma")).toHaveValue("14.080,00");
  await expect(page.getByLabel("Forma 3: nome")).toHaveValue("Pix com desconto");
  await page.getByRole("link", { name: "Comparar com a revisão anterior" }).click();
  await expect(page.getByText("Nenhuma diferença nos itens, nos totais, nas formas de pagamento nem na nota fiscal.")).toBeVisible();
});
