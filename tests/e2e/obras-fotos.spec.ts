import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";

import { aguardarAvisosSumirem, capturar, entrarEEsperarPainel, semRolagemHorizontal, toast } from "./ajudantes";
import { criarObraDeTeste, definirTiposDeServicoDaObra, idsDasFotosDaObra, prepararUsuarioE2E } from "./banco";
import { ipFalso, USUARIO_E2E } from "./dados";

test.describe.configure({ mode: "serial" });
test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(96) } });

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
let obraId: string;

test.beforeAll(async () => {
  await prepararUsuarioE2E({ senhaDefinitiva: true });
  obraId = await criarObraDeTeste("Fotos");
  await definirTiposDeServicoDaObra(obraId, ["JANELA"]);
});

test.beforeEach(async ({ page }) => {
  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
});

const artigo = (page: import("@playwright/test").Page) => page.getByRole("article", { name: "E2E Obra Fotos" });

test("fotos da obra: envia com o momento escolhido e agrupa em antes, durante e depois", async ({ page }) => {
  await page.goto(`/obras/${obraId}?aba=fotos`);
  await expect(page.getByRole("heading", { name: "Fotos da obra" })).toBeVisible();
  await expect(page.getByText("Nenhuma foto ainda.")).toBeVisible();
  await expect(page.getByLabel("O cliente autoriza usar as fotos desta obra no portfólio (site e Instagram)")).toBeChecked(); // padrão: autoriza (R18)

  await page.getByLabel("Momento das próximas fotos").selectOption({ label: "Antes" });
  // Nomes de arquivo como saem do celular, até com o nome do cliente: nada disso pode ir para o kit.
  await page.getByTestId("entrada-foto").setInputFiles({ name: "IMG_7731-casa-da-maria.png", mimeType: "image/png", buffer: PNG });
  await expect(toast(page, "Foto enviada.")).toBeVisible({ timeout: 30_000 });
  await aguardarAvisosSumirem(page);

  await page.getByLabel("Momento das próximas fotos").selectOption({ label: "Depois" });
  await page.getByTestId("entrada-foto").setInputFiles({ name: "IMG_7732-casa-da-maria.png", mimeType: "image/png", buffer: PNG });
  await expect(toast(page, "Foto enviada.")).toBeVisible({ timeout: 30_000 });
  await aguardarAvisosSumirem(page);

  await expect(page.getByRole("group", { name: "Fotos: Antes" }).getByRole("listitem")).toHaveCount(1);
  await expect(page.getByRole("group", { name: "Fotos: Depois" }).getByRole("listitem")).toHaveCount(1);
  await expect(page.getByRole("group", { name: "Fotos: Durante" })).toHaveCount(0);
  expect((await idsDasFotosDaObra(obraId)).length).toBe(2);
  await semRolagemHorizontal(page);
  await capturar(page, "obra-fotos");
});

test("descrição, momento e portfólio de cada foto", async ({ page }) => {
  await page.goto(`/obras/${obraId}?aba=fotos`);
  const antes = page.getByRole("group", { name: "Fotos: Antes" });

  await antes.getByRole("button", { name: /^Descrição da foto/ }).click();
  await page.getByRole("dialog").getByLabel("Descrição (opcional)").fill("Fachada antes da obra");
  await page.getByRole("dialog").getByRole("button", { name: "Salvar" }).click();
  await expect(toast(page, "Descrição salva")).toBeVisible();
  await aguardarAvisosSumirem(page);
  await expect(antes.getByRole("img", { name: "Fachada antes da obra" })).toBeVisible();

  // Tirar e pôr no portfólio.
  const noPortfolio = antes.getByLabel("No portfólio");
  await expect(noPortfolio).toBeChecked();
  await noPortfolio.click(); // grava no servidor e a tela atualiza em seguida
  await expect(noPortfolio).not.toBeChecked();
  await noPortfolio.click();
  await expect(noPortfolio).toBeChecked();

  // Trocar o momento move a foto de grupo.
  await antes.getByLabel(/^Momento da foto/).selectOption({ label: "Durante" });
  await expect(page.getByRole("group", { name: "Fotos: Durante" }).getByRole("listitem")).toHaveCount(1);
  await expect(page.getByRole("group", { name: "Fotos: Antes" })).toHaveCount(0);
  await page.getByRole("group", { name: "Fotos: Durante" }).getByLabel(/^Momento da foto/).selectOption({ label: "Antes" });
  await expect(page.getByRole("group", { name: "Fotos: Antes" }).getByRole("listitem")).toHaveCount(1);
});

test("galeria: a obra aparece com o par antes/depois marcado e a legenda sem dados do cliente", async ({ page }) => {
  await page.goto("/obras/galeria");
  await expect(page.getByRole("heading", { name: "Galeria de obras", level: 1 })).toBeVisible();
  const obra = artigo(page);
  await expect(obra).toBeVisible();
  await expect(obra.getByRole("checkbox", { checked: true })).toHaveCount(2); // o par antes/depois já vem escolhido
  await expect(obra.getByRole("button", { name: /Baixar kit \(2 fotos\)|Baixar o kit/ }).or(obra.getByRole("link", { name: /Baixar o kit de E2E Obra Fotos \(2 fotos\)/ }))).toBeVisible();

  // Tipo de serviço vem do cadastro; linha, cidade e UF faltam e ficam visíveis para completar.
  const legenda = obra.getByLabel("Legenda sugerida");
  await expect(legenda).toHaveValue(/^Janelas em alumínio linha \{\{linha\}\}, entregues em \{\{cidade\}\}\/\{\{regiao\}\}/);
  await expect(legenda).not.toHaveValue(/E2E Cliente Fotos/);
  await expect(obra.getByText(/Complete o que está entre chaves/)).toBeVisible();
  await semRolagemHorizontal(page);
  await capturar(page, "obras-galeria");

  await legenda.fill("Janelas em alumínio linha Suprema, entregues em Macaé/RJ.");
  await expect(obra.getByText(/Complete o que está entre chaves/)).toHaveCount(0);
});

test("o kit de postagem baixa um ZIP com as fotos escolhidas e a legenda", async ({ page }) => {
  await page.goto("/obras/galeria");
  const obra = artigo(page);
  await obra.getByLabel("Legenda sugerida").fill("Janelas em alumínio linha Suprema, entregues em Macaé/RJ.");

  const [download] = await Promise.all([page.waitForEvent("download"), obra.getByRole("link", { name: /Baixar o kit de E2E Obra Fotos \(2 fotos\)/ }).click()]);
  expect(download.suggestedFilename()).toMatch(/^kit-postagem-P-0000-[0-9a-f]{8}\.zip$/);

  const zip = unzipSync(new Uint8Array(readFileSync(await download.path())));
  const nomes = Object.keys(zip).sort();
  expect(nomes).toHaveLength(3);
  expect(nomes[0]).toMatch(/^01-antes\.(png|jpg|webp)$/);
  expect(nomes[1]).toMatch(/^02-depois\.(png|jpg|webp)$/);
  expect(nomes[2]).toBe("legenda.txt");
  expect(strFromU8(zip["legenda.txt"])).toContain("Janelas em alumínio linha Suprema, entregues em Macaé/RJ.");
  for (const nome of nomes.slice(0, 2)) expect(zip[nome].length).toBeGreaterThan(50); // são imagens de verdade, não arquivos vazios
  // Nada do cliente nem dos nomes originais no pacote.
  expect(nomes.join(" ")).not.toMatch(/IMG_77|maria|casa|cliente/i);
  expect(strFromU8(zip["legenda.txt"])).not.toContain("E2E Cliente");

  // Sem foto escolhida não há o que baixar.
  const fotos = obra.getByRole("checkbox");
  for (const caixa of await fotos.all()) await caixa.uncheck();
  await expect(obra.getByRole("button", { name: "Escolha ao menos uma foto" })).toBeDisabled();
});

test("a rota do kit recusa pedido inválido, foto de outro lugar e excesso", async ({ page }) => {
  const [uma] = await idsDasFotosDaObra(obraId);
  expect((await page.request.get(`/api/obras/${obraId}/kit?fotos=`)).status()).toBe(400);
  expect((await page.request.get(`/api/obras/${obraId}/kit?fotos=id-que-nao-existe`)).status()).toBe(404);
  expect((await page.request.get(`/api/obras/id-que-nao-existe/kit?fotos=${uma}`)).status()).toBe(404);
  const muitas = Array.from({ length: 21 }, (_, i) => `foto${i}`).join(",");
  expect((await page.request.get(`/api/obras/${obraId}/kit?fotos=${muitas}`)).status()).toBe(400);
  expect((await page.request.get(`/api/obras/${obraId}/kit?fotos=${uma}`)).status()).toBe(200);
});

test("marcar como publicada no Instagram tira a obra de 'ainda não publicadas'", async ({ page }) => {
  await page.goto("/obras/galeria");
  await expect(artigo(page).getByText("Ainda não publicada")).toBeVisible();
  await artigo(page).getByRole("button", { name: "Marcar como publicada" }).click();
  await expect(toast(page, "Obra marcada como publicada")).toBeVisible();
  await aguardarAvisosSumirem(page);
  await expect(artigo(page).getByText(/Publicada em \d{2}\/\d{2}\/\d{4}/)).toBeVisible();

  await page.goto("/obras/galeria?publicada=nao");
  await expect(artigo(page)).toHaveCount(0);
  await expect(page.getByText("Nenhuma obra com esses filtros")).toBeVisible();
  await page.goto("/obras/galeria?publicada=sim");
  await expect(artigo(page)).toBeVisible();

  await artigo(page).getByRole("button", { name: "Desmarcar publicação" }).click();
  await expect(toast(page, "Marca de publicação removida")).toBeVisible();
  await expect(artigo(page)).toHaveCount(0); // com o filtro "Já publicadas" ativo, a obra deixa de casar
  await page.goto("/obras/galeria");
  await expect(artigo(page).getByText("Ainda não publicada")).toBeVisible();
});

test("filtros da galeria por tipo, cidade e ano", async ({ page }) => {
  await page.goto("/obras/galeria");
  await page.getByLabel("Tipo de serviço").selectOption({ label: "Box de banheiro" });
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page.getByText("Nenhuma obra com esses filtros")).toBeVisible();
  await page.getByRole("link", { name: "Limpar" }).click();
  await expect(artigo(page)).toBeVisible();

  await page.getByLabel("Tipo de serviço").selectOption({ label: "Janelas" });
  await page.getByLabel("Ano da foto").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(artigo(page)).toBeVisible();
});

test("sem a autorização do cliente a obra sai da galeria e o kit é recusado", async ({ page }) => {
  await page.goto(`/obras/${obraId}?aba=fotos`);
  const autoriza = page.getByLabel("O cliente autoriza usar as fotos desta obra no portfólio (site e Instagram)");
  await autoriza.click();
  await expect(toast(page, "As fotos desta obra saíram da galeria")).toBeVisible();
  await aguardarAvisosSumirem(page);
  await expect(page.getByText(/Sem a autorização, as fotos desta obra não aparecem/)).toBeVisible();

  await page.goto("/obras/galeria");
  await expect(artigo(page)).toHaveCount(0);
  const [uma] = await idsDasFotosDaObra(obraId);
  const resposta = await page.request.get(`/api/obras/${obraId}/kit?fotos=${uma}`);
  expect(resposta.status()).toBe(403);
  expect((await resposta.json()).erro).toContain("não autorizou");

  await page.goto(`/obras/${obraId}?aba=fotos`);
  await autoriza.click();
  await expect(toast(page, "Uso das fotos no portfólio autorizado")).toBeVisible();
  await aguardarAvisosSumirem(page);
});

test("remover a foto pede confirmação", async ({ page }) => {
  await page.goto(`/obras/${obraId}?aba=fotos`);
  const antes = page.getByRole("group", { name: "Fotos: Antes" });
  await antes.getByRole("button", { name: /^Remover a foto/ }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Remover a foto?");
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancelar" }).click();
  await expect(antes.getByRole("listitem")).toHaveCount(1);

  await antes.getByRole("button", { name: /^Remover a foto/ }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remover" }).click();
  await expect(toast(page, "Foto removida")).toBeVisible();
  await expect(page.getByRole("group", { name: "Fotos: Antes" })).toHaveCount(0);
  expect((await idsDasFotosDaObra(obraId)).length).toBe(1);
});
