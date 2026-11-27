import { expect, test, type Page } from "@playwright/test";

import { aguardarAvisosSumirem, entrarEEsperarPainel, semRolagemHorizontal, toast } from "./ajudantes";
import { auditoriasDaTipologia, criarTipologiaDeTeste, dadosDoDesenhoDaTipologia, idDaTipologiaDeTeste, marcarTipologiaParaRevisar, prepararUsuarioE2E } from "./banco";
import { ipFalso, USUARIO_E2E } from "./dados";
import { desenho, disparar } from "./desenho-ajudantes";

/**
 * Fase 3.6b-3 (Bloco 2): desenho no cadastro da tipologia. Colar (evento simulado com DataTransfer), tamanho, trocar,
 * voltar ao automático, erro de formato, selo "criada de uma proposta, revisar" e "Marcar como revisada". Só cria registros
 * "E2E " (a limpeza global os remove, na ordem itens, tipologias, anexos, e apaga os arquivos do Storage).
 */
test.describe.configure({ mode: "serial" });
test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(98) } });

const TIPOLOGIA = "E2E Tipologia do Desenho";
const REVISAR = "E2E Tipologia Para Revisar";
let id = "";
let idRevisar = "";

test.beforeAll(async () => {
  await prepararUsuarioE2E({ senhaDefinitiva: true });
  await criarTipologiaDeTeste(TIPOLOGIA);
  await criarTipologiaDeTeste(REVISAR);
  await marcarTipologiaParaRevisar(REVISAR);
  id = await idDaTipologiaDeTeste(TIPOLOGIA);
  idRevisar = await idDaTipologiaDeTeste(REVISAR);
});

test.beforeEach(async ({ page }) => {
  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
});

const area = (page: Page) => page.getByRole("group", { name: "Colar ou escolher imagem do desenho" });
const previa = (page: Page) => page.getByTestId("previa-desenho");
const linhaDaLista = (page: Page, nome: string) => page.locator("li").filter({ hasText: nome });

async function abrirDesenho(page: Page, tipologiaId = id) {
  await page.goto(`/tipologias/${tipologiaId}?aba=desenho`);
  await expect(page.getByTestId("aviso-desenho-tipologia")).toBeVisible();
}

async function captura(page: Page, nome: string) {
  if (!process.env.CAPTURAS) return;
  await page.waitForLoadState("networkidle");
  const projeto = test.info().project.name;
  for (const tema of ["claro", "escuro"] as const) {
    await page.emulateMedia({ colorScheme: tema === "claro" ? "light" : "dark" });
    await page.screenshot({ path: `test-results/capturas/${projeto}-${nome}-${tema}.png`, fullPage: true });
  }
  await page.emulateMedia({ colorScheme: "light" });
}

test("sem desenho: aviso fixo, dica do Word, desenho automático e nada de tamanho", async ({ page }) => {
  await abrirDesenho(page);
  await expect(page.getByTestId("aviso-desenho-tipologia")).toHaveText("Mudar o desenho afeta propostas em rascunho que usam esta tipologia. As propostas já enviadas não mudam.");
  await expect(page.getByText("tecla Windows + Shift + S").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Colar ou escolher imagem" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Voltar ao desenho automático" })).toHaveCount(0);
  await expect(page.getByTestId("tamanho-do-desenho")).toHaveCount(0); // sem imagem não há tamanho
  await expect(page.getByText("O desenho é salvo na hora.")).toBeVisible();
  await semRolagemHorizontal(page);
  await captura(page, "tipologia-desenho-vazio");
  // A lista não mostra o selo "Com desenho".
  await page.goto("/tipologias");
  await expect(linhaDaLista(page, TIPOLOGIA)).toBeVisible();
  await expect(linhaDaLista(page, TIPOLOGIA).getByText("Com desenho")).toHaveCount(0);
});

test("colar uma imagem salva na hora (categoria própria, fora do portfólio) e aparece depois de recarregar", async ({ page }) => {
  await abrirDesenho(page);
  await disparar(area(page), "paste", { buffer: await desenho(800, 600, "#2563eb"), nome: "image.png", mime: "image/png" });
  await expect(toast(page, "Desenho da tipologia salvo")).toBeVisible();
  await expect(previa(page)).toBeVisible();
  await aguardarAvisosSumirem(page);

  const d = await dadosDoDesenhoDaTipologia(TIPOLOGIA);
  expect(d.desenhoAnexoId).toBeTruthy();
  expect(d.categoria).toBe("desenho-tipologia");
  expect(d.usarNoPortfolio).toBe(false);
  expect(d.caminho).toMatch(/^Tipologia\/.+\.png$/);
  expect(d.desenhoConfig).toBeNull(); // Normal = sem configuração

  await page.reload();
  await expect(previa(page)).toBeVisible(); // a prévia vem do servidor (URL assinada)
  await expect(page.getByTestId("tamanho-do-desenho")).toBeVisible();
  await captura(page, "tipologia-desenho-com-imagem");

  // A lista e o cabeçalho mostram "Com desenho".
  await expect(page.getByText("Com desenho").first()).toBeVisible();
  await page.goto("/tipologias");
  await expect(linhaDaLista(page, TIPOLOGIA).getByText("Com desenho")).toBeVisible();
});

test("tamanho Normal/Grande é salvo na hora: Grande grava só {tamanhoDesenho:'GRANDE'} e Normal volta a nulo", async ({ page }) => {
  await abrirDesenho(page);
  const grande = page.getByRole("radio", { name: "Grande" });
  const normal = page.getByRole("radio", { name: "Normal" });
  await expect(normal).toBeChecked();
  await grande.check();
  await expect(toast(page, "Tamanho do desenho salvo")).toBeVisible();
  await aguardarAvisosSumirem(page);
  expect((await dadosDoDesenhoDaTipologia(TIPOLOGIA)).desenhoConfig).toEqual({ tamanhoDesenho: "GRANDE" });
  await page.reload();
  await expect(page.getByRole("radio", { name: "Grande" })).toBeChecked();

  await page.getByRole("radio", { name: "Normal" }).check();
  await expect(toast(page, "Tamanho do desenho salvo")).toBeVisible();
  await aguardarAvisosSumirem(page);
  expect((await dadosDoDesenhoDaTipologia(TIPOLOGIA)).desenhoConfig).toBeNull();
});

test("formato não aceito é recusado e o desenho continua o mesmo; arrastar e soltar troca a imagem", async ({ page }) => {
  await abrirDesenho(page);
  const antes = (await dadosDoDesenhoDaTipologia(TIPOLOGIA)).desenhoAnexoId;
  await disparar(area(page), "drop", { buffer: Buffer.from("GIF89a"), nome: "x.gif", mime: "image/gif" });
  await expect(page.getByRole("alert").filter({ hasText: "Só aceitamos imagens PNG ou JPG" })).toBeVisible();
  expect((await dadosDoDesenhoDaTipologia(TIPOLOGIA)).desenhoAnexoId).toBe(antes);

  await disparar(area(page), "drop", { buffer: await desenho(600, 600, "#16a34a"), nome: "novo.png", mime: "image/png" });
  await expect(toast(page, "Desenho da tipologia salvo")).toBeVisible();
  await aguardarAvisosSumirem(page);
  const depois = (await dadosDoDesenhoDaTipologia(TIPOLOGIA)).desenhoAnexoId;
  expect(depois).toBeTruthy();
  expect(depois).not.toBe(antes);
});

test("voltar ao desenho automático tira a imagem e o tamanho; some o selo 'Com desenho' da lista", async ({ page }) => {
  await abrirDesenho(page);
  await page.getByRole("button", { name: "Voltar ao desenho automático" }).click();
  await expect(toast(page, "Voltou ao desenho automático")).toBeVisible();
  await aguardarAvisosSumirem(page);
  const d = await dadosDoDesenhoDaTipologia(TIPOLOGIA);
  expect(d.desenhoAnexoId).toBeNull();
  expect(d.desenhoConfig).toBeNull();
  await expect(page.getByTestId("tamanho-do-desenho")).toHaveCount(0);
  await page.goto("/tipologias");
  await expect(linhaDaLista(page, TIPOLOGIA)).toBeVisible();
  await expect(linhaDaLista(page, TIPOLOGIA).getByText("Com desenho")).toHaveCount(0);
});

test("selo 'Criada de uma proposta — revisar' na lista e no cadastro; 'Marcar como revisada' tira e audita", async ({ page }) => {
  await page.goto("/tipologias");
  await expect(linhaDaLista(page, REVISAR).getByText("Criada de uma proposta — revisar")).toBeVisible();
  await expect(linhaDaLista(page, TIPOLOGIA).getByText("Criada de uma proposta — revisar")).toHaveCount(0);

  await page.goto(`/tipologias/${idRevisar}`);
  const aviso = page.getByTestId("aviso-criada-de-proposta");
  await expect(aviso).toBeVisible();
  await expect(aviso).toContainText("Falta cadastrar a composição de custo e a tabela de preços");
  await semRolagemHorizontal(page);
  await captura(page, "tipologia-revisar");

  await aviso.getByRole("button", { name: "Marcar como revisada" }).click();
  await expect(toast(page, "Tipologia marcada como revisada")).toBeVisible();
  await expect(page.getByTestId("aviso-criada-de-proposta")).toHaveCount(0);
  expect((await dadosDoDesenhoDaTipologia(REVISAR)).revisarCadastro).toBe(false);
  expect(await auditoriasDaTipologia(REVISAR, '"revisarCadastro": false')).toBe(1);

  await page.goto("/tipologias");
  await expect(linhaDaLista(page, REVISAR)).toBeVisible();
  await expect(linhaDaLista(page, REVISAR).getByText("Criada de uma proposta — revisar")).toHaveCount(0);
});
