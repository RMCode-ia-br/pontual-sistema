import { mkdirSync, writeFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { CAIXAS_DA_IMAGEM } from "../../src/modules/propostas/pdf/imagens";
import { aguardarAvisosSumirem, entrarEEsperarPainel, semRolagemHorizontal, toast } from "./ajudantes";
import { caminhoDoDesenhoDoItem, composicaoDaTipologia, contarAnexosComCaminho, contarAnexosDeDesenhoDoE2E, contarTipologiasComNome, criarCondicaoDePagamentoDeTeste, criarTipologiaDeTeste, dadosDoDesenhoDaTipologia, idDaTipologiaDeTeste, prepararUsuarioE2E, removerObjetoDoStorage } from "./banco";
import { ipFalso, USUARIO_E2E } from "./dados";
import { desenho, disparar, imagensDoPdf, type ImagemNoPdf } from "./desenho-ajudantes";

/**
 * Fase 3.6b-3 (Bloco 3): o desenho da tipologia na proposta. O item herda a imagem (cartão, diálogo, PDF da proposta e folha
 * de produção, dentro da caixa lida das constantes), a imagem própria vence, "voltar" devolve a da tipologia, o tamanho
 * herdado é o da tipologia e "Salvar este desenho como nova tipologia" cria UMA tipologia com o mesmo arquivo. Registros "E2E ".
 */
test.describe.configure({ mode: "serial" });
test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(99) } });

const COM = "E2E Janela Com Desenho Herdado";
const SEM = "E2E Janela Sem Desenho Herdado";
const NOVA = "E2E Janela Salva do Item";
const SEM_ARQUIVO = "E2E Janela Sem Arquivo no Storage";
const CONDICAO = "E2E condição do desenho herdado";
const CLIENTE = "E2E Cliente do Desenho Herdado";
const PROJETO = "E2E Obra do Desenho Herdado";
let idComDesenho = "";
let idProposta = "";
let idSegunda = "";

// Tamanhos em pixels menores que o limite de redução: o PDF recebe exatamente estes pixels.
const T = { l: 800, a: 300, cor: "#2255cc" }; // desenho da tipologia (horizontal)
const U = { l: 500, a: 500, cor: "#22aa55" }; // desenho PRÓPRIO do item 1 (quadrado)
const V = { l: 600, a: 400, cor: "#cc7722" }; // desenho próprio do item 2 (vira nova tipologia)

test.beforeAll(async () => {
  await prepararUsuarioE2E({ senhaDefinitiva: true });
  await criarTipologiaDeTeste(COM);
  await criarTipologiaDeTeste(SEM);
  await criarCondicaoDePagamentoDeTeste(CONDICAO);
  idComDesenho = await idDaTipologiaDeTeste(COM);
});

test.beforeEach(async ({ page }) => {
  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
});

const idDaUrl = (page: Page) => page.url().split("/").pop()!.split("?")[0];
const area = (page: Page) => page.getByRole("group", { name: "Colar ou escolher imagem do desenho" });
const cartao = (page: Page, n: number, nome: "Desenho personalizado" | "Desenho da tipologia") => page.getByRole("img", { name: `${nome} do item ${n}` });

async function adicionarItem(page: Page, tipologia: string, largura: string) {
  await page.getByRole("button", { name: "Adicionar item" }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("Tipologia", { exact: true }).selectOption({ label: tipologia });
  await dialogo.getByLabel("Largura da medida 1").fill(largura);
  await dialogo.getByLabel("Altura da medida 1").fill("1200");
  await dialogo.getByLabel("Valor do item").fill("1500");
  await expect(dialogo.getByText(/Preço:/)).toBeVisible();
  await dialogo.getByRole("button", { name: "Adicionar item" }).click();
  await expect(toast(page, "Item adicionado")).toBeVisible();
  await aguardarAvisosSumirem(page);
}

async function criarProposta(page: Page, projeto: string, cliente?: string) {
  if (cliente) {
    await page.goto("/clientes/novo");
    await page.getByLabel("Nome completo").fill(cliente);
    await page.getByRole("button", { name: "Cadastrar cliente" }).click();
    await expect(page).toHaveURL(/\/clientes\/(?!novo)[a-z0-9]+$/);
  }
  const idCliente = idDaUrl(page);
  await page.goto(`/projetos/novo?cliente=${idCliente}`);
  await page.getByLabel("Título").fill(projeto);
  await page.getByRole("button", { name: "Criar projeto" }).click();
  await expect(page).toHaveURL(/\/projetos\/(?!novo)[a-z0-9]+$/);
  const idProjeto = idDaUrl(page);
  await page.goto(`/projetos/${idProjeto}?aba=propostas`);
  await page.getByRole("link", { name: "Nova proposta" }).click();
  await page.getByRole("button", { name: "Criar proposta" }).click();
  await expect(page).toHaveURL(/\/propostas\/[a-z0-9]+$/);
  return idDaUrl(page);
}

async function abrirItem(page: Page, n: number) {
  await page.getByRole("button", { name: `Editar o item ${n}` }).click();
  const dialogo = page.getByRole("dialog");
  await expect(dialogo.getByTestId("desenho-personalizado")).toBeVisible();
  return dialogo;
}

async function colarNoDialogo(page: Page, d: { l: number; a: number; cor: string }) {
  const dialogo = page.getByRole("dialog");
  await disparar(area(page), "paste", { buffer: await desenho(d.l, d.a, d.cor), nome: "image.png", mime: "image/png" });
  await expect(toast(page, "Desenho personalizado salvo")).toBeVisible({ timeout: 40_000 });
  await aguardarAvisosSumirem(page);
  return dialogo;
}

const nossas = (imagens: ImagemNoPdf[], d: { l: number; a: number }) => imagens.filter((i) => i.larguraPx === d.l && i.alturaPx === d.a);

/** A imagem está dentro da caixa, sem esticar e sem encolher à toa (encosta numa das dimensões). */
function dentroDaCaixa(i: ImagemNoPdf, caixa: { largura: number; altura: number }, d: { l: number; a: number }) {
  const folga = 0.6;
  expect(i.larguraPt).toBeLessThanOrEqual(caixa.largura + folga);
  expect(i.alturaPt).toBeLessThanOrEqual(caixa.altura + folga);
  expect(Math.abs(i.larguraPt - caixa.largura) < folga || Math.abs(i.alturaPt - caixa.altura) < folga, `deveria preencher uma dimensão da caixa (${i.larguraPt.toFixed(1)} × ${i.alturaPt.toFixed(1)} pt)`).toBe(true);
  expect(Math.abs(i.larguraPt / i.alturaPt - d.l / d.a) / (d.l / d.a)).toBeLessThan(0.01);
}

async function baixarPdf(page: Page, id: string, rota: "pdf" | "producao", guardarComo?: string) {
  const r = await page.request.get(`/api/propostas/${id}/${rota}`);
  expect(r.status(), `${rota} da proposta ${id}`).toBe(200);
  const corpo = await r.body();
  if (process.env.CAPTURAS && guardarComo) {
    mkdirSync("test-results/capturas", { recursive: true });
    writeFileSync(`test-results/capturas/${test.info().project.name}-${guardarComo}.pdf`, corpo);
  }
  return corpo;
}

/** Captura do diálogo do item, nos dois temas (só com CAPTURAS). */
async function capturaDoDialogo(page: Page, nome: string) {
  if (!process.env.CAPTURAS) return;
  await page.waitForLoadState("networkidle");
  const projeto = test.info().project.name;
  for (const tema of ["claro", "escuro"] as const) {
    await page.emulateMedia({ colorScheme: tema === "claro" ? "light" : "dark" });
    await page.getByRole("dialog").screenshot({ path: `test-results/capturas/${projeto}-dialogo-${nome}-${tema}.png` });
  }
  await page.emulateMedia({ colorScheme: "light" });
}

test("preparação: o desenho da tipologia (colado no cadastro) e uma proposta com 3 itens", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto(`/tipologias/${idComDesenho}?aba=desenho`);
  await disparar(area(page), "paste", { buffer: await desenho(T.l, T.a, T.cor), nome: "image.png", mime: "image/png" });
  await expect(toast(page, "Desenho da tipologia salvo")).toBeVisible({ timeout: 40_000 });
  await aguardarAvisosSumirem(page);

  idProposta = await criarProposta(page, PROJETO, CLIENTE);
  await adicionarItem(page, COM, "2000"); // item 1: herda
  await adicionarItem(page, SEM, "2100"); // item 2: tipologia sem desenho
  await adicionarItem(page, COM, "2200"); // item 3: herda
  await page.getByLabel("Modelo de condição de pagamento").selectOption({ label: CONDICAO });
  await page.getByRole("button", { name: "Salvar proposta" }).click();
  await expect(toast(page, "Proposta salva")).toBeVisible();
  await aguardarAvisosSumirem(page);
});

test("cartão e diálogo: o item herda a imagem da tipologia (sem imagem na tipologia, continua o desenho automático)", async ({ page }) => {
  await page.goto(`/propostas/${idProposta}`);
  await expect(cartao(page, 1, "Desenho da tipologia")).toBeVisible({ timeout: 20_000 });
  await expect(cartao(page, 3, "Desenho da tipologia")).toBeVisible();
  await expect(cartao(page, 2, "Desenho da tipologia")).toHaveCount(0);
  await expect(cartao(page, 1, "Desenho personalizado")).toHaveCount(0);

  const dialogo = await abrirItem(page, 1);
  await expect(dialogo.getByTestId("previa-desenho-herdado")).toBeVisible();
  await expect(dialogo.getByTestId("desenho-herdado-aviso")).toContainText("Este item usa o desenho da tipologia");
  await expect(dialogo.getByTestId("tamanho-da-tipologia")).toHaveText("Tamanho definido na tipologia: Normal.");
  await expect(dialogo.getByTestId("tamanho-do-desenho")).toHaveCount(0); // o seletor some com a imagem herdada
  await expect(dialogo.getByRole("button", { name: /^Voltar ao desenho/ })).toHaveCount(0);
  await expect(dialogo.getByRole("button", { name: "Salvar este desenho como nova tipologia" })).toHaveCount(0); // só com imagem própria
  await capturaDoDialogo(page, "imagem-herdada");
  await page.keyboard.press("Escape");

  const sem = await abrirItem(page, 2);
  await expect(sem.getByTestId("previa-desenho-herdado")).toHaveCount(0);
  await expect(sem.getByTestId("tamanho-da-tipologia")).toHaveCount(0);
  await expect(sem.getByRole("button", { name: "Colar ou escolher imagem" })).toBeVisible();
  await capturaDoDialogo(page, "sem-imagem");
  await page.keyboard.press("Escape");
});

test("trocar a tipologia no diálogo mostra a imagem da nova (link pedido sob demanda) e some ao voltar para uma sem desenho", async ({ page }) => {
  await page.goto(`/propostas/${idProposta}`);
  const dialogo = await abrirItem(page, 2);
  await expect(dialogo.getByTestId("previa-desenho-herdado")).toHaveCount(0);
  await dialogo.getByLabel("Tipologia", { exact: true }).selectOption({ label: COM });
  await expect(dialogo.getByTestId("previa-desenho-herdado")).toBeVisible({ timeout: 20_000 });
  await expect(dialogo.getByTestId("tamanho-da-tipologia")).toHaveText("Tamanho definido na tipologia: Normal.");
  await dialogo.getByLabel("Tipologia", { exact: true }).selectOption({ label: SEM });
  await expect(dialogo.getByTestId("previa-desenho-herdado")).toHaveCount(0);
  await page.keyboard.press("Escape"); // sem salvar: o item continua na tipologia SEM desenho
});

test("a imagem própria vence a da tipologia; o botão vira 'Voltar ao desenho da tipologia' e o seletor de tamanho volta", async ({ page }) => {
  await page.goto(`/propostas/${idProposta}`);
  const dialogo = await abrirItem(page, 1);
  await colarNoDialogo(page, U);
  await expect(dialogo.getByRole("button", { name: "Voltar ao desenho da tipologia" })).toBeVisible();
  await expect(dialogo.getByRole("button", { name: "Voltar ao desenho automático" })).toHaveCount(0);
  await expect(dialogo.getByTestId("tamanho-do-desenho")).toBeVisible(); // com imagem própria, o item escolhe o tamanho
  await expect(dialogo.getByTestId("tamanho-da-tipologia")).toHaveCount(0);
  await expect(dialogo.getByRole("button", { name: "Salvar este desenho como nova tipologia" })).toBeVisible();
  await capturaDoDialogo(page, "imagem-propria");
  await page.keyboard.press("Escape");
  await expect(cartao(page, 1, "Desenho personalizado")).toBeVisible({ timeout: 20_000 });
  await expect(cartao(page, 1, "Desenho da tipologia")).toHaveCount(0);
});

test("PDFs: o item 1 usa a imagem PRÓPRIA, o item 3 herda a da tipologia (Normal), proposta e folha de produção dentro da caixa", async ({ page }) => {
  test.setTimeout(120_000);
  for (const [rota, caixa] of [["pdf", CAIXAS_DA_IMAGEM.NORMAL.proposta], ["producao", CAIXAS_DA_IMAGEM.NORMAL.producao]] as const) {
    const imagens = await imagensDoPdf(await baixarPdf(page, idProposta, rota, `${rota}-propria-vence-e-herdada-normal`));
    expect(nossas(imagens, U), `${rota}: a imagem própria do item 1`).toHaveLength(1);
    expect(nossas(imagens, T), `${rota}: a imagem da tipologia só no item 3 (o item 1 usa a própria)`).toHaveLength(1);
    dentroDaCaixa(nossas(imagens, U)[0], caixa, U);
    dentroDaCaixa(nossas(imagens, T)[0], caixa, T);
  }
});

test("tamanho Grande na tipologia vale para quem herda (item 3) e não para o item 1, que tem imagem própria Normal", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(`/tipologias/${idComDesenho}?aba=desenho`);
  await page.getByRole("radio", { name: "Grande" }).check();
  await expect(toast(page, "Tamanho do desenho salvo")).toBeVisible();
  await aguardarAvisosSumirem(page);
  expect((await dadosDoDesenhoDaTipologia(COM)).desenhoConfig).toEqual({ tamanhoDesenho: "GRANDE" });

  await page.goto(`/propostas/${idProposta}`);
  await abrirItem(page, 3);
  await expect(page.getByRole("dialog").getByTestId("tamanho-da-tipologia")).toHaveText("Tamanho definido na tipologia: Grande.");
  await capturaDoDialogo(page, "imagem-herdada-grande");
  await page.keyboard.press("Escape");

  for (const [rota, normal, grande] of [
    ["pdf", CAIXAS_DA_IMAGEM.NORMAL.proposta, CAIXAS_DA_IMAGEM.GRANDE.proposta],
    ["producao", CAIXAS_DA_IMAGEM.NORMAL.producao, CAIXAS_DA_IMAGEM.GRANDE.producao],
  ] as const) {
    const imagens = await imagensDoPdf(await baixarPdf(page, idProposta, rota, `${rota}-herdada-grande`));
    dentroDaCaixa(nossas(imagens, T)[0], grande, T);
    dentroDaCaixa(nossas(imagens, U)[0], normal, U);
  }
});

test("'Voltar ao desenho da tipologia' tira a imagem própria e devolve a da tipologia", async ({ page }) => {
  await page.goto(`/propostas/${idProposta}`);
  const dialogo = await abrirItem(page, 1);
  await dialogo.getByRole("button", { name: "Voltar ao desenho da tipologia" }).click();
  await expect(toast(page, "Voltou ao desenho da tipologia")).toBeVisible();
  await aguardarAvisosSumirem(page);
  await expect(dialogo.getByTestId("tamanho-da-tipologia")).toHaveText("Tamanho definido na tipologia: Grande.");
  await expect(dialogo.getByTestId("tamanho-do-desenho")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(cartao(page, 1, "Desenho da tipologia")).toBeVisible({ timeout: 20_000 });
  expect(await caminhoDoDesenhoDoItem(idProposta)).toBeNull(); // nenhum item tem imagem própria agora
});

test("salvar o desenho do item como nova tipologia: validações, nome repetido, duplo clique = UMA tipologia, mesmo arquivo", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(`/propostas/${idProposta}`);
  const dialogo = await abrirItem(page, 2);
  await colarNoDialogo(page, V); // o item 2 (tipologia SEM desenho) ganha imagem própria
  const caminhoDoItem = await caminhoDoDesenhoDoItem(idProposta);
  expect(caminhoDoItem).toBeTruthy();

  await dialogo.getByRole("button", { name: "Salvar este desenho como nova tipologia" }).click();
  const painel = dialogo.getByTestId("salvar-como-tipologia");
  await expect(painel.getByTestId("aviso-sem-preco")).toContainText("composição de custo e a tabela de preços ficam em branco");
  const criar = painel.getByRole("button", { name: "Criar tipologia" });
  await expect(criar).toBeDisabled(); // nome obrigatório
  await expect(painel.getByLabel("Tipo de desenho da nova tipologia")).toHaveValue("JANELA_CORRER"); // o do item de origem
  await expect(painel.getByLabel("Modelo da descrição da nova tipologia")).not.toHaveValue(""); // modelo pré-preenchido, editável
  await capturaDoDialogo(page, "salvar-como-tipologia");

  await painel.getByLabel("Nome da nova tipologia").fill(SEM); // nome já usado por outra tipologia
  await criar.click();
  await expect(painel.getByRole("alert")).toContainText("Já existe uma tipologia com esse nome.");
  expect(await contarTipologiasComNome(SEM)).toBe(1);

  await painel.getByLabel("Nome da nova tipologia").fill(NOVA);
  await criar.dblclick(); // duplo clique: uma só criação
  await expect(dialogo.getByTestId("tipologia-criada")).toBeVisible({ timeout: 20_000 });
  expect(await contarTipologiasComNome(NOVA)).toBe(1);
  expect(await composicaoDaTipologia(NOVA)).toEqual({ insumos: 0, maoDeObra: 0, precos: 0 }); // nada comercial inventado
  const nova = await dadosDoDesenhoDaTipologia(NOVA);
  expect(nova.revisarCadastro).toBe(true);
  expect(nova.caminho).toBe(caminhoDoItem); // o MESMO arquivo, sem cópia
  expect(await contarAnexosComCaminho(caminhoDoItem!)).toBe(1);
  expect(await caminhoDoDesenhoDoItem(idProposta)).toBe(caminhoDoItem); // o item de origem continua com a imagem dele

  await dialogo.getByTestId("link-tipologia-criada").click();
  await expect(page).toHaveURL(/\/tipologias\/[a-z0-9]+$/);
  await expect(page.getByTestId("aviso-criada-de-proposta")).toBeVisible();
  await expect(page.getByText("Com desenho").first()).toBeVisible();
  await semRolagemHorizontal(page);
});

test("usar a nova tipologia numa segunda proposta: o item herda a imagem e o PDF a mostra", async ({ page }) => {
  test.setTimeout(180_000);
  idSegunda = await criarProposta(page, `${PROJETO} 2`, `${CLIENTE} 2`);
  await adicionarItem(page, NOVA, "1800");
  await expect(cartao(page, 1, "Desenho da tipologia")).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("Modelo de condição de pagamento").selectOption({ label: CONDICAO });
  await page.getByRole("button", { name: "Salvar proposta" }).click();
  await expect(toast(page, "Proposta salva")).toBeVisible();
  await aguardarAvisosSumirem(page);
  const imagens = await imagensDoPdf(await baixarPdf(page, idSegunda, "pdf", "pdf-nova-tipologia"));
  expect(nossas(imagens, V)).toHaveLength(1);
  dentroDaCaixa(nossas(imagens, V)[0], CAIXAS_DA_IMAGEM.NORMAL.proposta, V);
});

test("item NOVO ainda não salvo: trocar de tipologia mostra a imagem de cada uma (link sob demanda) e NADA é gravado antes de salvar", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(`/propostas/${idSegunda}`);
  const cartoes = page.locator("article[aria-label^='Item ']");
  await expect(cartoes).toHaveCount(1);
  const anexosAntes = await contarAnexosDeDesenhoDoE2E();

  await page.getByRole("button", { name: "Adicionar item" }).click();
  const dialogo = page.getByRole("dialog");
  const previa = dialogo.getByTestId("previa-desenho-herdado");
  await expect(dialogo.getByRole("button", { name: "Colar ou escolher imagem" })).toBeVisible();
  await expect(previa).toHaveCount(0);

  await dialogo.getByLabel("Tipologia", { exact: true }).selectOption({ label: COM });
  await expect(previa).toBeVisible({ timeout: 20_000 });
  const srcCom = await previa.getAttribute("src");
  await expect(dialogo.getByTestId("tamanho-da-tipologia")).toContainText("Tamanho definido na tipologia");

  await dialogo.getByLabel("Tipologia", { exact: true }).selectOption({ label: NOVA });
  await expect(previa).toBeVisible({ timeout: 20_000 });
  await expect.poll(async () => previa.getAttribute("src"), { message: "a prévia deve passar a ser a da outra tipologia" }).not.toBe(srcCom);

  await dialogo.getByLabel("Tipologia", { exact: true }).selectOption({ label: SEM });
  await expect(previa).toHaveCount(0);
  await dialogo.getByLabel("Tipologia", { exact: true }).selectOption({ label: COM });
  await expect(previa).toBeVisible({ timeout: 20_000 });
  await expect(dialogo.getByRole("button", { name: "Salvar este desenho como nova tipologia" })).toHaveCount(0); // sem imagem própria

  expect(await contarAnexosDeDesenhoDoE2E(), "nada gravado antes de salvar").toBe(anexosAntes);
  await page.keyboard.press("Escape");
  await expect(cartoes).toHaveCount(1); // o item não foi criado
  expect(await contarAnexosDeDesenhoDoE2E()).toBe(anexosAntes);
});

test("proposta ENVIADA (somente leitura): o cartão mostra a imagem congelada, mesmo depois da tipologia mudar", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto(`/propostas/${idSegunda}`);
  await page.getByRole("button", { name: "Marcar como enviada" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Marcar como enviada" }).click();
  await expect(toast(page, "marcada como enviada")).toBeVisible({ timeout: 30_000 });
  await aguardarAvisosSumirem(page);
  await expect(page.getByText("Conteúdo congelado")).toBeVisible();
  await expect(cartao(page, 1, "Desenho da tipologia")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Editar o item 1" })).toHaveCount(0); // somente leitura

  // A tipologia NOVA perde a imagem depois do envio: a enviada continua mostrando (e imprimindo) a congelada.
  await page.goto(`/tipologias/${await idDaTipologiaDeTeste(NOVA)}?aba=desenho`);
  await page.getByRole("button", { name: "Voltar ao desenho automático" }).click();
  await expect(toast(page, "Voltou ao desenho automático")).toBeVisible();
  await aguardarAvisosSumirem(page);
  expect((await dadosDoDesenhoDaTipologia(NOVA)).desenhoAnexoId).toBeNull();

  await page.goto(`/propostas/${idSegunda}`);
  await expect(cartao(page, 1, "Desenho da tipologia")).toBeVisible({ timeout: 20_000 });
  const imagens = await imagensDoPdf(await baixarPdf(page, idSegunda, "pdf"));
  expect(nossas(imagens, V)).toHaveLength(1);
});

test("Storage indisponível: a prévia diz 'indisponível' (cadastro, diálogo sob demanda e cartão) e o desenho continua salvo", async ({ page }) => {
  test.setTimeout(180_000);
  await criarTipologiaDeTeste(SEM_ARQUIVO);
  const id = await idDaTipologiaDeTeste(SEM_ARQUIVO);
  await page.goto(`/tipologias/${id}?aba=desenho`);
  await disparar(area(page), "paste", { buffer: await desenho(T.l, T.a, "#884422"), nome: "image.png", mime: "image/png" });
  await expect(toast(page, "Desenho da tipologia salvo")).toBeVisible({ timeout: 40_000 });
  await aguardarAvisosSumirem(page);
  const caminho = (await dadosDoDesenhoDaTipologia(SEM_ARQUIVO)).caminho!;
  await removerObjetoDoStorage(caminho); // o arquivo some do Storage; a linha no banco continua

  await page.reload();
  await expect(page.getByText("Prévia indisponível agora. O desenho está salvo.")).toBeVisible();
  expect((await dadosDoDesenhoDaTipologia(SEM_ARQUIVO)).desenhoAnexoId).toBeTruthy();

  await page.goto(`/propostas/${idProposta}`);
  await page.getByRole("button", { name: "Adicionar item" }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("Tipologia", { exact: true }).selectOption({ label: SEM_ARQUIVO }); // link pedido sob demanda: sem link
  await expect(dialogo.getByText("Prévia indisponível agora. O desenho da tipologia está salvo.")).toBeVisible({ timeout: 20_000 });
  await expect(dialogo.getByTestId("tamanho-da-tipologia")).toContainText("Tamanho definido na tipologia");
  await dialogo.getByLabel("Largura da medida 1").fill("1500");
  await dialogo.getByLabel("Altura da medida 1").fill("1200");
  await dialogo.getByLabel("Valor do item").fill("1500");
  await expect(dialogo.getByText(/Preço:/)).toBeVisible();
  await dialogo.getByRole("button", { name: "Adicionar item" }).click();
  await expect(toast(page, "Item adicionado")).toBeVisible();
  await aguardarAvisosSumirem(page);
  await expect(page.getByText("Desenho da tipologia (prévia indisponível agora)")).toBeVisible({ timeout: 20_000 });
});
