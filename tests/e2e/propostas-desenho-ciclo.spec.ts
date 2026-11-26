import { expect, test, type Page } from "@playwright/test";

import { CAIXAS_DA_IMAGEM } from "../../src/modules/propostas/pdf/imagens";
import { aguardarAvisosSumirem, entrarEEsperarPainel, semRolagemHorizontal, toast } from "./ajudantes";
import { criarCondicaoDePagamentoDeTeste, criarTipologiaDeTeste, prepararUsuarioE2E } from "./banco";
import { ipFalso, USUARIO_E2E } from "./dados";
import { desenho, disparar, imagensDoPdf, type ImagemNoPdf } from "./desenho-ajudantes";

/**
 * Fase 3.6b-1 (Bloco 4): o ciclo da proposta com desenho personalizado. Enviar congela a imagem e o PDF da ENVIADA a
 * mostra dentro da caixa do item (lida das constantes, não de números do teste); a revisão muda o desenho (adicionado,
 * trocado, removido) e a tela de comparação diz isso; o PDF da enviada não muda. Registros "E2E " (a limpeza global os remove).
 */
test.describe.configure({ mode: "serial" });
test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(98) } });

const TIPOLOGIA = "E2E Janela do ciclo do desenho";
const CONDICAO = "E2E condição do ciclo do desenho";
const CLIENTE = "E2E Cliente do Ciclo do Desenho";
const PROJETO = "E2E Obra do Ciclo do Desenho";
let idOriginal = "";
let idRevisao = "";

// Desenhos de teste (tamanhos em pixels menores que o limite de redução: o PDF recebe exatamente estes pixels).
const X = { l: 800, a: 300, cor: "#2255cc" }; // horizontal, item 2 da original
const Y = { l: 300, a: 800, cor: "#cc5522" }; // vertical, item 3 da original
const Z = { l: 500, a: 500, cor: "#22aa55" }; // quadrado, item 1 da revisão (adicionado)
const W = { l: 700, a: 400, cor: "#aa2288" }; // horizontal diferente, item 2 da revisão (trocado)

test.beforeAll(async () => {
  await prepararUsuarioE2E({ senhaDefinitiva: true });
  await criarTipologiaDeTeste(TIPOLOGIA);
  await criarCondicaoDePagamentoDeTeste(CONDICAO);
});

test.beforeEach(async ({ page }) => {
  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
});

const idDaUrl = (page: Page) => page.url().split("/").pop()!.split("?")[0];

async function adicionarItem(page: Page, largura: string) {
  await page.getByRole("button", { name: "Adicionar item" }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("Tipologia", { exact: true }).selectOption({ label: TIPOLOGIA });
  await dialogo.getByLabel("Largura da medida 1").fill(largura);
  await dialogo.getByLabel("Altura da medida 1").fill("1200");
  await dialogo.getByLabel("Valor do item").fill("1500");
  await expect(dialogo.getByText(/Preço:/)).toBeVisible();
  await dialogo.getByRole("button", { name: "Adicionar item" }).click();
  await expect(toast(page, "Item adicionado")).toBeVisible();
  await aguardarAvisosSumirem(page);
}

/** Abre o item `n` da proposta aberta e cola uma imagem (evento de colar simulado); espera o servidor confirmar. */
async function colarNoItem(page: Page, n: number, d: { l: number; a: number; cor: string }) {
  await page.getByRole("button", { name: `Editar o item ${n}` }).click();
  const dialogo = page.getByRole("dialog");
  await expect(dialogo.getByTestId("desenho-personalizado")).toBeVisible();
  await disparar(dialogo.getByRole("group", { name: "Colar ou escolher imagem do desenho" }), "paste", { buffer: await desenho(d.l, d.a, d.cor), nome: "image.png", mime: "image/png" });
  await expect(toast(page, "Desenho personalizado salvo")).toBeVisible({ timeout: 40_000 });
  await page.keyboard.press("Escape");
  await aguardarAvisosSumirem(page);
}

/** As imagens do PDF que são NOSSAS (pelo tamanho em pixels), ignorando a logo da empresa. */
function nossas(imagens: ImagemNoPdf[], d: { l: number; a: number }) {
  return imagens.filter((i) => i.larguraPx === d.l && i.alturaPx === d.a);
}

/** A imagem está dentro da caixa do item, sem esticar e sem encolher à toa (encosta numa das dimensões). */
function conferirDentroDaCaixa(i: ImagemNoPdf, caixa: { largura: number; altura: number }, d: { l: number; a: number }) {
  const folga = 0.6;
  expect(i.larguraPt).toBeLessThanOrEqual(caixa.largura + folga);
  expect(i.alturaPt).toBeLessThanOrEqual(caixa.altura + folga);
  expect(Math.abs(i.larguraPt - caixa.largura) < folga || Math.abs(i.alturaPt - caixa.altura) < folga, `deveria preencher uma dimensão da caixa (${i.larguraPt.toFixed(1)} × ${i.alturaPt.toFixed(1)} pt)`).toBe(true);
  expect(Math.abs(i.larguraPt / i.alturaPt - d.l / d.a) / (d.l / d.a)).toBeLessThan(0.01); // proporção preservada
  expect(i.x).toBeGreaterThanOrEqual(36 - folga); // dentro das margens da página (A4, margem de 36 pt)
  expect(i.x + i.larguraPt).toBeLessThanOrEqual(595.3 - 36 + folga);
}

async function baixarPdf(page: Page, id: string, rota: "pdf" | "producao") {
  const r = await page.request.get(`/api/propostas/${id}/${rota}`);
  expect(r.status(), `${rota} da proposta ${id}`).toBe(200);
  return r.body();
}

test("preparação: proposta com 3 itens; imagens nos itens 2 (horizontal) e 3 (vertical)", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/clientes/novo");
  await page.getByLabel("Nome completo").fill(CLIENTE);
  await page.getByRole("button", { name: "Cadastrar cliente" }).click();
  await expect(page).toHaveURL(/\/clientes\/(?!novo)[a-z0-9]+$/);
  const idCliente = idDaUrl(page);
  await page.goto(`/projetos/novo?cliente=${idCliente}`);
  await page.getByLabel("Título").fill(PROJETO);
  await page.getByRole("button", { name: "Criar projeto" }).click();
  await expect(page).toHaveURL(/\/projetos\/(?!novo)[a-z0-9]+$/);
  const idProjeto = idDaUrl(page);
  await page.goto(`/projetos/${idProjeto}?aba=propostas`);
  await page.getByRole("link", { name: "Nova proposta" }).click();
  await page.getByRole("button", { name: "Criar proposta" }).click();
  await expect(page).toHaveURL(/\/propostas\/[a-z0-9]+$/);
  idOriginal = idDaUrl(page);

  for (const largura of ["2000", "2100", "2200"]) await adicionarItem(page, largura);
  // O servidor só deixa enviar com condição de pagamento escolhida.
  await page.getByLabel("Modelo de condição de pagamento").selectOption({ label: CONDICAO });
  await page.getByRole("button", { name: "Salvar proposta" }).click();
  await expect(toast(page, "Proposta salva")).toBeVisible();
  await aguardarAvisosSumirem(page);
  await colarNoItem(page, 2, X);
  await colarNoItem(page, 3, Y);
  await expect(page.getByRole("img", { name: "Desenho personalizado do item 2" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("img", { name: "Desenho personalizado do item 3" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Desenho personalizado do item 1" })).toHaveCount(0);
});

test("enviar: o PDF da enviada e a folha de produção mostram a imagem DENTRO da caixa do item (constantes), sem esticar", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(`/propostas/${idOriginal}`);
  await page.getByRole("button", { name: "Marcar como enviada" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Marcar como enviada" }).click();
  await expect(toast(page, "marcada como enviada")).toBeVisible({ timeout: 30_000 });
  await aguardarAvisosSumirem(page);
  await expect(page.getByText("Conteúdo congelado")).toBeVisible();

  const proposta = await imagensDoPdf(await baixarPdf(page, idOriginal, "pdf"));
  expect(nossas(proposta, X)).toHaveLength(1);
  expect(nossas(proposta, Y)).toHaveLength(1);
  conferirDentroDaCaixa(nossas(proposta, X)[0], CAIXAS_DA_IMAGEM.NORMAL.proposta, X);
  conferirDentroDaCaixa(nossas(proposta, Y)[0], CAIXAS_DA_IMAGEM.NORMAL.proposta, Y);

  const producao = await imagensDoPdf(await baixarPdf(page, idOriginal, "producao"));
  expect(nossas(producao, X)).toHaveLength(1);
  expect(nossas(producao, Y)).toHaveLength(1);
  conferirDentroDaCaixa(nossas(producao, X)[0], CAIXAS_DA_IMAGEM.NORMAL.producao, X);
  conferirDentroDaCaixa(nossas(producao, Y)[0], CAIXAS_DA_IMAGEM.NORMAL.producao, Y);

  // O item 1 (sem imagem) segue com o desenho automático (vetorial): além das duas imagens nossas só pode haver a logo da empresa.
  expect(proposta.length - nossas(proposta, X).length - nossas(proposta, Y).length).toBeLessThanOrEqual(1);
});

test("revisão: item 1 ganha desenho (adicionado), item 2 troca (trocado), item 3 volta ao automático (removido)", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto(`/propostas/${idOriginal}`);
  await page.getByRole("button", { name: "Nova revisão" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Criar revisão" }).click();
  await page.waitForURL((u) => /\/propostas\/[\w-]+$/.test(u.pathname) && !u.pathname.endsWith(idOriginal), { timeout: 30_000 });
  await expect(page.getByText("Rev. 1").first()).toBeVisible();
  idRevisao = idDaUrl(page);
  expect(idRevisao).not.toBe(idOriginal);
  // A revisão nasce com os desenhos da original (a referência é copiada).
  await expect(page.getByRole("img", { name: "Desenho personalizado do item 2" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("img", { name: "Desenho personalizado do item 3" })).toBeVisible();

  await colarNoItem(page, 1, Z); // adicionado
  await colarNoItem(page, 2, W); // trocado
  await page.getByRole("button", { name: "Editar o item 3" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Voltar ao desenho automático" }).click();
  await expect(toast(page, "Voltou ao desenho automático")).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press("Escape");
  await aguardarAvisosSumirem(page);
});

test("comparação: a tela mostra desenho personalizado adicionado, trocado e removido", async ({ page }) => {
  await page.goto(`/propostas/${idRevisao}/comparar?com=${idOriginal}`);
  // Espera o conteúdo positivo antes de afirmar qualquer coisa (a página é renderizada com streaming).
  await expect(page.getByRole("heading", { name: /^Comparar revisões da / })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Desenho personalizado adicionado", { exact: true })).toBeVisible();
  await expect(page.getByText("Desenho personalizado trocado", { exact: true })).toBeVisible();
  await expect(page.getByText("Desenho personalizado removido", { exact: true })).toBeVisible();
  await expect(page.getByText("Nenhuma diferença nos itens")).toHaveCount(0);
  await expect(page.getByText("Preço alterado", { exact: true })).toHaveCount(0); // nenhum preço mudou: só o desenho
  await semRolagemHorizontal(page);
});

test("comparar duas revisões SEM mudança de desenho continua dizendo que não há diferença (sem regressão)", async ({ page }) => {
  // A original contra ela mesma: mesmos desenhos nos dois lados.
  await page.goto(`/propostas/${idOriginal}/comparar?com=${idOriginal}`);
  await expect(page.getByRole("heading", { name: /^Comparar revisões da / })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Nenhuma diferença nos itens")).toBeVisible();
  await expect(page.getByText(/Desenho personalizado (adicionado|trocado|removido)/)).toHaveCount(0);
});

test("a mexida na revisão não alterou o PDF da enviada (lê o snapshot); o rascunho da revisão traz os desenhos novos", async ({ page }) => {
  const original = await imagensDoPdf(await baixarPdf(page, idOriginal, "pdf"));
  expect(nossas(original, X)).toHaveLength(1);
  expect(nossas(original, Y)).toHaveLength(1);
  expect(nossas(original, Z)).toHaveLength(0);
  expect(nossas(original, W)).toHaveLength(0);

  const revisao = await imagensDoPdf(await baixarPdf(page, idRevisao, "pdf"));
  expect(nossas(revisao, Z)).toHaveLength(1); // item 1: adicionado
  expect(nossas(revisao, W)).toHaveLength(1); // item 2: trocado
  expect(nossas(revisao, X)).toHaveLength(0);
  expect(nossas(revisao, Y)).toHaveLength(0); // item 3: voltou ao automático
  conferirDentroDaCaixa(nossas(revisao, Z)[0], CAIXAS_DA_IMAGEM.NORMAL.proposta, Z);
  conferirDentroDaCaixa(nossas(revisao, W)[0], CAIXAS_DA_IMAGEM.NORMAL.proposta, W);
});
