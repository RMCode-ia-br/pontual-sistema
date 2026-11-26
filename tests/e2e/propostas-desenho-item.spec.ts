import { expect, test, type Locator, type Page } from "@playwright/test";
import sharp from "sharp";

import { aguardarAvisosSumirem, ehCelular, entrarEEsperarPainel, semRolagemHorizontal, toast } from "./ajudantes";
import { criarTipologiaDeTeste, prepararUsuarioE2E } from "./banco";
import { ipFalso, USUARIO_E2E } from "./dados";

/**
 * Fase 3.6b-1 (Bloco 2): desenho personalizado no item da proposta. Colar (evento de colar simulado com DataTransfer),
 * arrastar e escolher arquivo; trocar; erro que mantém o desenho anterior; voltar ao automático. Arquivos de teste
 * próprios, pequenos, gerados aqui. Só cria registros "E2E " (a limpeza global os remove, inclusive os do Storage).
 */
test.describe.configure({ mode: "serial" });
test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(97) } });

const TIPOLOGIA = "E2E Janela do desenho";
const CLIENTE = "E2E Cliente do Desenho";
const PROJETO = "E2E Obra do Desenho";
let idProposta = "";

test.beforeAll(async () => {
  await prepararUsuarioE2E({ senhaDefinitiva: true });
  await criarTipologiaDeTeste(TIPOLOGIA);
});

test.beforeEach(async ({ page }) => {
  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
});

/** Desenho de teste: fundo branco e um retângulo colorido (muda a cor para cada arquivo ficar distinto). */
async function desenho(largura: number, altura: number, cor: string): Promise<Buffer> {
  const retangulo = await sharp({ create: { width: Math.round(largura * 0.8), height: Math.round(altura * 0.8), channels: 3, background: cor } }).png().toBuffer();
  return sharp({ create: { width: largura, height: altura, channels: 3, background: "#ffffff" } })
    .composite([{ input: retangulo, gravity: "center" }])
    .png()
    .toBuffer();
}

/** Dispara um evento de colar (Ctrl+V) ou de soltar arquivo, com um arquivo dentro de um DataTransfer, no elemento. */
async function disparar(alvo: Locator, tipoDeEvento: "paste" | "drop", arquivo: { buffer: Buffer; nome: string; mime: string } | null, texto?: string) {
  await alvo.evaluate(
    (el, p) => {
      const dt = new DataTransfer();
      if (p.base64) {
        const bytes = Uint8Array.from(atob(p.base64), (c) => c.charCodeAt(0));
        dt.items.add(new File([bytes], p.nome, { type: p.mime }));
      }
      if (p.texto) dt.setData("text/plain", p.texto);
      const evento = p.tipo === "paste" ? new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }) : new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true });
      el.dispatchEvent(evento);
    },
    { tipo: tipoDeEvento, base64: arquivo?.buffer.toString("base64") ?? "", nome: arquivo?.nome ?? "", mime: arquivo?.mime ?? "", texto: texto ?? "" },
  );
}

const areaDoDesenho = (page: Page) => page.getByRole("group", { name: "Colar ou escolher imagem do desenho" });
const previa = (page: Page) => page.getByTestId("previa-desenho");
const cartaoComImagem = (page: Page) => page.getByRole("img", { name: "Desenho personalizado do item 1" });

async function abrirEdicaoDoItem(page: Page) {
  await page.goto(`/propostas/${idProposta}`);
  await page.getByRole("button", { name: "Editar o item 1" }).click();
  await expect(page.getByTestId("desenho-personalizado")).toBeVisible();
}

async function capturaDoDialogo(page: Page, nome: string) {
  if (!process.env.CAPTURAS) return;
  await page.waitForLoadState("networkidle");
  await page.getByRole("dialog").screenshot({ path: `test-results/capturas/${test.info().project.name}-${nome}.png` });
}

test("preparação: proposta com um item", async ({ page }) => {
  await page.goto("/clientes/novo");
  await page.getByLabel("Nome completo").fill(CLIENTE);
  await page.getByRole("button", { name: "Cadastrar cliente" }).click();
  await expect(page).toHaveURL(/\/clientes\/(?!novo)[a-z0-9]+$/);
  const idCliente = page.url().split("/").pop() ?? "";
  await page.goto(`/projetos/novo?cliente=${idCliente}`);
  await page.getByLabel("Título").fill(PROJETO);
  await page.getByRole("button", { name: "Criar projeto" }).click();
  await expect(page).toHaveURL(/\/projetos\/(?!novo)[a-z0-9]+$/);
  const idProjeto = page.url().split("/").pop() ?? "";
  await page.goto(`/projetos/${idProjeto}?aba=propostas`);
  await page.getByRole("link", { name: "Nova proposta" }).click();
  await page.getByRole("button", { name: "Criar proposta" }).click();
  await expect(page).toHaveURL(/\/propostas\/[a-z0-9]+$/);
  idProposta = page.url().split("/").pop() ?? "";

  await page.getByRole("button", { name: "Adicionar item" }).click();
  const dialogo = page.getByRole("dialog");
  // Item NOVO ainda não existe: o desenho pede para salvar antes.
  await expect(dialogo.getByText("Salve o item para adicionar um desenho personalizado")).toBeVisible();
  await expect(dialogo.getByRole("button", { name: /Colar ou escolher imagem/ })).toHaveCount(0);
  await dialogo.getByLabel("Tipologia", { exact: true }).selectOption({ label: TIPOLOGIA });
  await dialogo.getByLabel("Largura da medida 1").fill("2000");
  await dialogo.getByLabel("Altura da medida 1").fill("1200");
  await dialogo.getByLabel("Valor do item").fill("1500");
  await expect(dialogo.getByText(/Preço:/)).toBeVisible();
  await dialogo.getByRole("button", { name: "Adicionar item" }).click();
  await expect(toast(page, "Item adicionado")).toBeVisible();
  await aguardarAvisosSumirem(page);
  await expect(cartaoComImagem(page)).toHaveCount(0); // sem imagem: continua o desenho automático
});

test("sem imagem: a seção oferece 'Colar ou escolher imagem' e mostra a dica do Word (e cabe em 390 px)", async ({ page }) => {
  await abrirEdicaoDoItem(page);
  const dialogo = page.getByRole("dialog");
  await expect(dialogo.getByText("Você pode copiar o desenho do Word e colar aqui com Ctrl+V.")).toBeVisible();
  const botao = dialogo.getByRole("button", { name: "Colar ou escolher imagem" });
  await botao.scrollIntoViewIfNeeded();
  await expect(botao).toBeVisible();
  await expect(dialogo.getByRole("button", { name: "Voltar ao desenho automático" })).toHaveCount(0);
  if (ehCelular(page)) {
    const caixa = await botao.boundingBox();
    expect(caixa && caixa.x >= 0 && caixa.x + caixa.width <= 390).toBe(true);
    expect(caixa && caixa.height >= 40).toBe(true); // alvo de toque confortável
    await semRolagemHorizontal(page);
  }
  await capturaDoDialogo(page, "desenho-editor-sem-imagem-claro");
  await page.emulateMedia({ colorScheme: "dark" });
  await capturaDoDialogo(page, "desenho-editor-sem-imagem-escuro");
  await page.emulateMedia({ colorScheme: "light" });
});

test("colar (Ctrl+V) uma imagem horizontal: vira o desenho do item e aparece no cartão da lista", async ({ page }) => {
  await abrirEdicaoDoItem(page);
  const dialogo = page.getByRole("dialog");
  await disparar(areaDoDesenho(page), "paste", { buffer: await desenho(800, 300, "#2255cc"), nome: "image.png", mime: "image/png" });
  await expect(toast(page, "Desenho personalizado salvo")).toBeVisible({ timeout: 40_000 });
  await expect(previa(page)).toBeVisible();
  await expect(dialogo.getByRole("button", { name: "Trocar imagem" })).toBeVisible();
  await expect(dialogo.getByRole("button", { name: "Voltar ao desenho automático" })).toBeVisible();
  await capturaDoDialogo(page, "desenho-editor-horizontal-claro");
  await page.emulateMedia({ colorScheme: "dark" });
  await capturaDoDialogo(page, "desenho-editor-horizontal-escuro");
  await page.emulateMedia({ colorScheme: "light" });
  await page.keyboard.press("Escape");
  await expect(cartaoComImagem(page)).toBeVisible({ timeout: 20_000 });
  if (ehCelular(page)) await semRolagemHorizontal(page);

  // Recarregar traz a imagem do servidor (link temporário do Storage), não a prévia local.
  await page.reload();
  await expect(cartaoComImagem(page)).toBeVisible({ timeout: 20_000 });
  await expect(cartaoComImagem(page)).toHaveJSProperty("complete", true);
  expect(await cartaoComImagem(page).evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
});

test("colar em qualquer campo do diálogo também vale, mas texto colado nos campos não é tocado", async ({ page }) => {
  await abrirEdicaoDoItem(page);
  const dialogo = page.getByRole("dialog");
  const antes = await previa(page).getAttribute("src");
  // Texto colado no campo Local: nada de erro, nada de envio.
  await disparar(dialogo.getByLabel("Local da medida 1"), "paste", null, "sala de estar");
  await expect(dialogo.getByRole("alert")).toHaveCount(0);
  // Imagem colada com o foco fora da área (campo Local): vira o desenho (vertical).
  await disparar(dialogo.getByLabel("Local da medida 1"), "paste", { buffer: await desenho(300, 800, "#cc5522"), nome: "image.png", mime: "image/png" });
  await expect(toast(page, "Desenho personalizado salvo")).toBeVisible({ timeout: 40_000 });
  await expect.poll(() => previa(page).getAttribute("src")).not.toBe(antes);
  await capturaDoDialogo(page, "desenho-editor-vertical-claro");
});

test("arrastar e soltar um arquivo na área troca o desenho (quadrado)", async ({ page }) => {
  await abrirEdicaoDoItem(page);
  const antes = await previa(page).getAttribute("src");
  await disparar(areaDoDesenho(page), "drop", { buffer: await desenho(500, 500, "#22aa55"), nome: "quadrado.png", mime: "image/png" });
  await expect(toast(page, "Desenho personalizado salvo")).toBeVisible({ timeout: 40_000 });
  await expect.poll(() => previa(page).getAttribute("src")).not.toBe(antes);
  await capturaDoDialogo(page, "desenho-editor-quadrado-claro");
});

test("escolher arquivo (JPG) pelo botão; o envio mostra 'Enviando…'", async ({ page }) => {
  await abrirEdicaoDoItem(page);
  const dialogo = page.getByRole("dialog");
  const jpg = await sharp(await desenho(600, 400, "#aa2288")).jpeg().toBuffer();
  await dialogo.getByTestId("entrada-desenho").setInputFiles({ name: "desenho.jpg", mimeType: "image/jpeg", buffer: jpg });
  await expect(dialogo.getByRole("status").filter({ hasText: "Enviando…" }).or(toast(page, "Desenho personalizado salvo"))).toBeVisible();
  await expect(toast(page, "Desenho personalizado salvo")).toBeVisible({ timeout: 40_000 });
  await expect(previa(page)).toBeVisible();
});

test("erros em português simples e o desenho anterior é mantido", async ({ page }) => {
  await abrirEdicaoDoItem(page);
  const dialogo = page.getByRole("dialog");
  const entrada = dialogo.getByTestId("entrada-desenho");
  const mantido = await previa(page).getAttribute("src");

  // Formato que não é PNG/JPG: recusado já na tela.
  await entrada.setInputFiles({ name: "x.gif", mimeType: "image/gif", buffer: Buffer.from("GIF89a") });
  await expect(dialogo.getByRole("alert")).toContainText("Só aceitamos imagens PNG ou JPG");

  // Colagem sem imagem DENTRO da área: mensagem do Word.
  await disparar(areaDoDesenho(page), "paste", null, "só texto do Word");
  await expect(dialogo.getByRole("alert")).toContainText("Não encontrei uma imagem no que foi colado");

  // "PNG" que na verdade é lixo: passa na tela, é recusado pelo servidor; nada muda no item.
  await entrada.setInputFiles({ name: "falso.png", mimeType: "image/png", buffer: Buffer.from("isto não é uma imagem de verdade, só texto") });
  await expect(dialogo.getByRole("alert")).toContainText(/PNG ou JPG|incompleto|danificado/, { timeout: 40_000 });
  await expect(dialogo.getByRole("alert")).toContainText("O desenho anterior foi mantido");
  expect(await previa(page).getAttribute("src")).toBe(mantido);
  await capturaDoDialogo(page, "desenho-editor-erro-claro");

  // Depois de fechar e recarregar, o item continua com a imagem anterior.
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(cartaoComImagem(page)).toBeVisible({ timeout: 20_000 });
});

test("voltar ao desenho automático remove a imagem do item", async ({ page }) => {
  await abrirEdicaoDoItem(page);
  const dialogo = page.getByRole("dialog");
  await dialogo.getByRole("button", { name: "Voltar ao desenho automático" }).click();
  await expect(toast(page, "Voltou ao desenho automático")).toBeVisible({ timeout: 30_000 });
  await expect(previa(page)).toHaveCount(0);
  await expect(dialogo.getByRole("button", { name: "Colar ou escolher imagem" })).toBeVisible();
  await expect(dialogo.getByRole("button", { name: "Voltar ao desenho automático" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.getByRole("article", { name: "Item 1" })).toBeVisible();
  await expect(cartaoComImagem(page)).toHaveCount(0);
});
