import { expect, test, type Page } from "@playwright/test";

import { CAIXAS_DA_IMAGEM } from "../../src/modules/propostas/pdf/imagens";
import { aguardarAvisosSumirem, entrarEEsperarPainel, toast } from "./ajudantes";
import { criarCondicaoDePagamentoDeTeste, criarTipologiaDeTeste, prepararUsuarioE2E } from "./banco";
import { ipFalso, USUARIO_E2E } from "./dados";
import { desenho, disparar, imagensDoPdf, type ImagemNoPdf } from "./desenho-ajudantes";

/**
 * Fase 3.6b-1 (Bloco 5): item NOVO com imagem ANTES de salvar (colar, arrastar, escolher), envio automático ao salvar,
 * falha de envio sem perder o item, diálogo que não fecha durante o envio, tamanho Normal/Grande no PDF (caixas lidas das
 * constantes) e a comparação de revisões. Registros "E2E " (a limpeza global os remove, inclusive os do Storage).
 */
test.describe.configure({ mode: "serial" });
test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(99) } });

const TIPOLOGIA = "E2E Janela do item novo";
const CONDICAO = "E2E condição do item novo";
const CLIENTE = "E2E Cliente do Item Novo";
const PROJETO = "E2E Obra do Item Novo";
let idProposta = "";
let idRevisao = "";

const X = { l: 800, a: 300, cor: "#2255cc" }; // item 1 (colar)
const Y = { l: 300, a: 800, cor: "#cc5522" }; // item 2 (arrastar)
const Z = { l: 500, a: 500, cor: "#22aa55" }; // item 3 (escolher arquivo)
const W = { l: 700, a: 400, cor: "#aa2288" }; // item 5 (falha e tentar de novo)
const V = { l: 640, a: 360, cor: "#118899" }; // item 6 (fechar durante o envio)

test.beforeAll(async () => {
  await prepararUsuarioE2E({ senhaDefinitiva: true });
  await criarTipologiaDeTeste(TIPOLOGIA);
  await criarCondicaoDePagamentoDeTeste(CONDICAO);
});

test.beforeEach(async ({ page }) => {
  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
});

const idDaUrl = (page: Page) => page.url().split("/").pop()!.split("?")[0];
const area = (page: Page) => page.getByRole("dialog").getByRole("group", { name: "Colar ou escolher imagem do desenho" });
const cartao = (page: Page, n: number) => page.getByRole("img", { name: `Desenho personalizado do item ${n}`, includeHidden: true });
const artigos = (page: Page) => page.getByRole("article", { name: /^Item \d+$/, includeHidden: true });
const arquivo = (d: { l: number; a: number; cor: string }, nome = "image.png") => desenho(d.l, d.a, d.cor).then((buffer) => ({ buffer, nome, mime: "image/png" }));

async function preencherItem(page: Page, largura: string) {
  const d = page.getByRole("dialog");
  await d.getByLabel("Tipologia", { exact: true }).selectOption({ label: TIPOLOGIA });
  await d.getByLabel("Largura da medida 1").fill(largura);
  await d.getByLabel("Altura da medida 1").fill("1200");
  await d.getByLabel("Valor do item").fill("1500");
  await expect(d.getByText(/Preço:/)).toBeVisible();
}

async function abrirItemNovo(page: Page, largura: string) {
  await page.getByRole("button", { name: "Adicionar item" }).click();
  await preencherItem(page, largura);
}

async function capturaDoDialogo(page: Page, nome: string) {
  if (!process.env.CAPTURAS) return;
  await page.waitForLoadState("networkidle");
  // A seção do desenho (com a prévia, a ajuda e o seletor de tamanho): o diálogo inteiro rola e, em 390 px, não cabe numa captura.
  const secao = page.getByRole("dialog").getByTestId("desenho-personalizado");
  await secao.scrollIntoViewIfNeeded();
  await secao.screenshot({ path: `test-results/capturas/${test.info().project.name}-${nome}.png` });
}

async function baixarPdf(page: Page, id: string, rota: "pdf" | "producao") {
  const r = await page.request.get(`/api/propostas/${id}/${rota}`);
  expect(r.status(), `${rota} da proposta ${id}`).toBe(200);
  return r.body();
}
const nossa = (imagens: ImagemNoPdf[], d: { l: number; a: number }) => {
  const achadas = imagens.filter((i) => i.larguraPx === d.l && i.alturaPx === d.a);
  expect(achadas, `imagem ${d.l}×${d.a} no PDF`).toHaveLength(1);
  return achadas[0];
};
/** Cabe na caixa (sem passar) e encosta numa dimensão, com a proporção do original. */
function cabeNa(i: ImagemNoPdf, caixa: { largura: number; altura: number }) {
  const folga = 0.6;
  expect(i.larguraPt).toBeLessThanOrEqual(caixa.largura + folga);
  expect(i.alturaPt).toBeLessThanOrEqual(caixa.altura + folga);
  expect(Math.abs(i.larguraPt - caixa.largura) < folga || Math.abs(i.alturaPt - caixa.altura) < folga).toBe(true);
}

test("preparação: proposta vazia com a condição de pagamento escolhida", async ({ page }) => {
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
  idProposta = idDaUrl(page);
  await page.getByLabel("Modelo de condição de pagamento").selectOption({ label: CONDICAO });
  await page.getByRole("button", { name: "Salvar proposta" }).click();
  await expect(toast(page, "Proposta salva")).toBeVisible();
  await aguardarAvisosSumirem(page);
});

test("item NOVO: cola a imagem ANTES de salvar (prévia local, sem a dica de salvar) e o envio acontece ao salvar, mesmo com duplo clique", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto(`/propostas/${idProposta}`);
  await abrirItemNovo(page, "2000");
  const d = page.getByRole("dialog");
  await expect(d.getByText("Salve o item para adicionar")).toHaveCount(0); // a dica antiga saiu
  await expect(d.getByRole("button", { name: "Colar ou escolher imagem" })).toBeVisible();
  await expect(d.getByText("Windows + Shift + S").first()).toBeVisible(); // orientação para quem não consegue colar do Word

  await disparar(area(page), "paste", await arquivo(X));
  await expect(d.getByTestId("desenho-pendente")).toBeVisible();
  await expect(d.getByTestId("previa-desenho")).toHaveAttribute("src", /^blob:/); // prévia local, ainda nada enviado
  await expect(d.getByRole("radio", { name: "Normal" })).toBeChecked();
  await capturaDoDialogo(page, "item-novo-com-imagem-antes-de-salvar");

  await d.getByRole("button", { name: "Adicionar item" }).dblclick(); // duplo clique: salva UMA vez só
  await expect(toast(page, "Item salvo e desenho personalizado enviado")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(artigos(page)).toHaveCount(1);
  await expect(cartao(page, 1)).toBeVisible({ timeout: 20_000 });
  await aguardarAvisosSumirem(page);
});

test("item NOVO: arrastar (item 2) e escolher arquivo (item 3) antes de salvar", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto(`/propostas/${idProposta}`);

  await abrirItemNovo(page, "2100");
  await disparar(area(page), "drop", await arquivo(Y, "arrastada.png"));
  await expect(page.getByRole("dialog").getByTestId("desenho-pendente")).toContainText("arrastada.png");
  await page.getByRole("dialog").getByRole("button", { name: "Adicionar item" }).click();
  await expect(toast(page, "Item salvo e desenho personalizado enviado")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await aguardarAvisosSumirem(page);

  await abrirItemNovo(page, "2200");
  await page.getByRole("dialog").getByTestId("entrada-desenho").setInputFiles({ name: "escolhida.png", mimeType: "image/png", buffer: (await arquivo(Z)).buffer });
  await expect(page.getByRole("dialog").getByTestId("desenho-pendente")).toContainText("escolhida.png");
  await page.getByRole("dialog").getByRole("button", { name: "Adicionar item" }).click();
  await expect(toast(page, "Item salvo e desenho personalizado enviado")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await expect(artigos(page)).toHaveCount(3);
  for (const n of [1, 2, 3]) await expect(cartao(page, n)).toBeVisible({ timeout: 20_000 });
  await aguardarAvisosSumirem(page);
});

test("item NOVO: validação na hora (tipo e colagem sem imagem), 'Tirar imagem' e salvar sem imagem", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(`/propostas/${idProposta}`);
  await abrirItemNovo(page, "2300");
  const d = page.getByRole("dialog");
  await d.getByTestId("entrada-desenho").setInputFiles({ name: "x.gif", mimeType: "image/gif", buffer: Buffer.from("GIF89a") });
  await expect(d.getByRole("alert")).toContainText("Só aceitamos imagens PNG ou JPG");
  await expect(d.getByTestId("desenho-pendente")).toHaveCount(0);

  await disparar(area(page), "paste", null, "só texto do Word");
  await expect(d.getByRole("alert")).toContainText("Não encontrei uma imagem no que foi colado");
  await expect(d.getByRole("alert")).toContainText("tecla Windows + Shift + S");

  await disparar(area(page), "paste", await arquivo(X));
  await expect(d.getByTestId("desenho-pendente")).toBeVisible();
  await d.getByRole("button", { name: "Tirar imagem" }).click();
  await expect(d.getByTestId("desenho-pendente")).toHaveCount(0);
  await expect(d.getByTestId("previa-desenho")).toHaveCount(0); // volta ao desenho automático

  await d.getByRole("button", { name: "Adicionar item" }).click();
  await expect(toast(page, "Item adicionado")).toBeVisible({ timeout: 30_000 });
  await expect(artigos(page)).toHaveCount(4);
  await expect(cartao(page, 4)).toHaveCount(0);
  await aguardarAvisosSumirem(page);
});

test("falha simulada no envio: o item fica SALVO, a tela avisa e oferece tentar de novo (sem duplicar o item)", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto(`/propostas/${idProposta}`);
  await abrirItemNovo(page, "2400");
  const d = page.getByRole("dialog");
  await disparar(area(page), "paste", await arquivo(W));
  await expect(d.getByTestId("desenho-pendente")).toBeVisible();

  const ENVIO_AO_STORAGE = "**/storage/v1/object/upload/sign/**";
  await page.route(ENVIO_AO_STORAGE, (rota) => rota.abort("failed")); // a internet "cai" na hora de subir a imagem
  await d.getByRole("button", { name: "Adicionar item" }).click();

  await expect(d.getByTestId("desenho-nao-enviado")).toContainText("O item foi salvo, mas o desenho não foi enviado. Tente de novo.", { timeout: 60_000 });
  await expect(page.getByRole("dialog")).toBeVisible(); // o diálogo continua aberto
  await expect(artigos(page)).toHaveCount(5); // o item 5 EXISTE (salvo), um só
  await expect(d.getByRole("button", { name: "Salvar item" })).toBeVisible(); // agora salvar de novo ATUALIZA este item
  await expect(d.getByRole("button", { name: "Fechar" })).toBeVisible();
  await expect(d.getByRole("button", { name: "Tentar enviar de novo" })).toBeEnabled();
  await expect(cartao(page, 5)).toHaveCount(0); // sem imagem ainda

  await page.unroute(ENVIO_AO_STORAGE); // a internet volta
  await d.getByRole("button", { name: "Tentar enviar de novo" }).click();
  await expect(toast(page, "Desenho personalizado salvo")).toBeVisible({ timeout: 60_000 });
  await expect(d.getByTestId("desenho-nao-enviado")).toHaveCount(0);
  await expect(d.getByTestId("previa-desenho")).toBeVisible();
  await d.getByRole("button", { name: "Fechar" }).click();
  await expect(artigos(page)).toHaveCount(5); // nada duplicou
  await expect(cartao(page, 5)).toBeVisible({ timeout: 20_000 });
  await aguardarAvisosSumirem(page);
});

test("o diálogo NÃO fecha durante o envio (Esc, Cancelar) e fecha sozinho quando termina", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto(`/propostas/${idProposta}`);
  await abrirItemNovo(page, "2500");
  const d = page.getByRole("dialog");
  await disparar(area(page), "paste", await arquivo(V));
  const ENVIO_AO_STORAGE = "**/storage/v1/object/upload/sign/**";
  await page.route(ENVIO_AO_STORAGE, async (rota) => {
    await new Promise((r) => setTimeout(r, 4000)); // envio lento
    await rota.continue();
  });
  await d.getByRole("button", { name: "Adicionar item" }).click();
  await expect(d.getByRole("status").filter({ hasText: "Enviando…" })).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeVisible(); // Esc não fecha no meio do envio
  // Durante o envio o item já está salvo: o botão virou "Fechar" e fica desabilitado até terminar.
  await expect(d.getByRole("button", { name: "Fechar" })).toBeDisabled();
  await expect(toast(page, "Item salvo e desenho personalizado enviado")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.unroute(ENVIO_AO_STORAGE);
  await expect(artigos(page)).toHaveCount(6);
  await expect(cartao(page, 6)).toBeVisible({ timeout: 20_000 });
  await aguardarAvisosSumirem(page);
});

test("tamanho Normal/Grande: vale ao salvar o item e aparece no PDF dentro da caixa da constante", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto(`/propostas/${idProposta}`);
  await page.getByRole("button", { name: "Editar o item 1" }).click();
  const d = page.getByRole("dialog");
  await expect(d.getByRole("radio", { name: "Normal" })).toBeChecked();
  await expect(d.getByRole("radio", { name: "Grande" })).not.toBeChecked();
  await capturaDoDialogo(page, "tamanho-do-desenho-normal-claro");

  // No PDF de hoje (rascunho) o item 1 está Normal.
  const normal = nossa(await imagensDoPdf(await baixarPdf(page, idProposta, "pdf")), X);
  cabeNa(normal, CAIXAS_DA_IMAGEM.NORMAL.proposta);

  await d.getByRole("radio", { name: "Grande" }).check();
  await page.emulateMedia({ colorScheme: "dark" });
  await capturaDoDialogo(page, "tamanho-do-desenho-grande-escuro");
  await page.emulateMedia({ colorScheme: "light" });
  await d.getByRole("button", { name: "Salvar item" }).click();
  await expect(toast(page, "Item atualizado")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await aguardarAvisosSumirem(page);

  const grande = nossa(await imagensDoPdf(await baixarPdf(page, idProposta, "pdf")), X);
  cabeNa(grande, CAIXAS_DA_IMAGEM.GRANDE.proposta);
  expect(grande.larguraPt).toBeGreaterThan(normal.larguraPt);
  cabeNa(nossa(await imagensDoPdf(await baixarPdf(page, idProposta, "producao")), X), CAIXAS_DA_IMAGEM.GRANDE.producao);
  // Os outros itens (que ficaram Normal) não mudaram de tamanho.
  cabeNa(nossa(await imagensDoPdf(await baixarPdf(page, idProposta, "pdf")), Y), CAIXAS_DA_IMAGEM.NORMAL.proposta);

  // Reabrir: o seletor lembra Grande. Voltar a Normal e salvar traz o PDF de volta ao tamanho Normal.
  await page.getByRole("button", { name: "Editar o item 1" }).click();
  await expect(page.getByRole("dialog").getByRole("radio", { name: "Grande" })).toBeChecked();
  await page.getByRole("dialog").getByRole("radio", { name: "Normal" }).check();
  await page.getByRole("dialog").getByRole("button", { name: "Salvar item" }).click();
  await expect(toast(page, "Item atualizado")).toBeVisible({ timeout: 30_000 });
  await aguardarAvisosSumirem(page);
  cabeNa(nossa(await imagensDoPdf(await baixarPdf(page, idProposta, "pdf")), X), CAIXAS_DA_IMAGEM.NORMAL.proposta);
});

test("enviar congela o tamanho; a revisão muda o tamanho e a comparação diz 'tamanho do desenho alterado'", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto(`/propostas/${idProposta}`);
  await page.getByRole("button", { name: "Marcar como enviada" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Marcar como enviada" }).click();
  await expect(toast(page, "marcada como enviada")).toBeVisible({ timeout: 60_000 });
  await aguardarAvisosSumirem(page);

  await page.goto(`/propostas/${idProposta}`);
  await page.getByRole("button", { name: "Nova revisão" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Criar revisão" }).click();
  await page.waitForURL((u) => /\/propostas\/[\w-]+$/.test(u.pathname) && !u.pathname.endsWith(idProposta), { timeout: 30_000 });
  await expect(page.getByText("Rev. 1").first()).toBeVisible();
  idRevisao = idDaUrl(page);

  await page.getByRole("button", { name: "Editar o item 1" }).click();
  await page.getByRole("dialog").getByRole("radio", { name: "Grande" }).check();
  await page.getByRole("dialog").getByRole("button", { name: "Salvar item" }).click();
  await expect(toast(page, "Item atualizado")).toBeVisible({ timeout: 30_000 });
  await aguardarAvisosSumirem(page);

  // A enviada continua Normal (snapshot); o rascunho da revisão está Grande.
  cabeNa(nossa(await imagensDoPdf(await baixarPdf(page, idProposta, "pdf")), X), CAIXAS_DA_IMAGEM.NORMAL.proposta);
  cabeNa(nossa(await imagensDoPdf(await baixarPdf(page, idRevisao, "pdf")), X), CAIXAS_DA_IMAGEM.GRANDE.proposta);

  await page.goto(`/propostas/${idRevisao}/comparar?com=${idProposta}`);
  await expect(page.getByRole("heading", { name: /^Comparar revisões da / })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Tamanho do desenho alterado", { exact: true })).toBeVisible();
  await expect(page.getByText(/Desenho personalizado (adicionado|trocado|removido)/)).toHaveCount(0);
  await expect(page.getByText("Preço alterado", { exact: true })).toHaveCount(0);
});
