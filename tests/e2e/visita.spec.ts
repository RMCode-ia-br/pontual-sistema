import { expect, test } from "@playwright/test";

import { aguardarAvisosSumirem, capturar, entrarEEsperarPainel, semRolagemHorizontal, toast } from "./ajudantes";
import { lerEndereco, prepararUsuarioE2E, vincularEnderecoDeObra } from "./banco";
import { ipFalso, USUARIO_E2E } from "./dados";

test.describe.configure({ mode: "serial" });
test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(90) } });

test.beforeAll(async () => {
  await prepararUsuarioE2E({ senhaDefinitiva: true });
});

test.beforeEach(async ({ page }) => {
  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
});

const CLIENTE = "E2E Cliente da Visita";
const PROJETO = "E2E Obra da Visita";
// PNG de 1x1 pixel (assinatura válida para o upload).
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

let urlDaVisita = "";
let enderecoId = "";

test("preparação: cliente, projeto e visita agendada", async ({ page }) => {
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

  await page.goto(`/agenda/novo?projeto=${idProjeto}&tipo=VISITA_TECNICA&inicio=2030-03-12T10:00`);
  await page.getByRole("button", { name: "Agendar", exact: true }).click();
  await expect(page).toHaveURL(/\/agenda\?vista=semana/);
  await page.getByRole("link", { name: /Visita técnica — E2E Cliente da Visita/ }).first().click();
  await page.getByRole("link", { name: "Medidas e fotos" }).click();
  await expect(page.getByRole("heading", { name: /Visita — E2E Cliente da Visita/ })).toBeVisible();
  urlDaVisita = page.url();
});

test("anota um vão com teclado numérico, valida e salva sem perder nada", async ({ page }) => {
  await page.goto(urlDaVisita);
  await semRolagemHorizontal(page);
  const novo = page.getByRole("article", { name: "Novo vão" });
  await expect(novo.getByLabel("Largura (mm)")).toHaveAttribute("inputmode", "numeric");
  await expect(novo.getByLabel("Altura (mm)")).toHaveAttribute("inputmode", "numeric");

  // Medida zero é recusada no servidor, com a mensagem ao lado do campo, e o que foi digitado fica.
  await novo.getByLabel("Ambiente").fill("Sala");
  await novo.getByLabel("Largura (mm)").fill("0");
  await novo.getByRole("button", { name: "Adicionar vão" }).click();
  await expect(novo.getByText(/Largura: informe um valor maior que zero/)).toBeVisible();
  await expect(novo.getByLabel("Ambiente")).toHaveValue("Sala");

  await novo.getByLabel("Tipo de esquadria").fill("Janela de correr");
  await novo.getByLabel("Largura (mm)").fill("2000");
  await novo.getByLabel("Altura (mm)").fill("1200");
  await novo.getByLabel("Quantidade").fill("2");
  await novo.getByRole("button", { name: "Adicionar vão" }).click();
  await expect(toast(page, "Medida salva.")).toBeVisible();

  const vao = page.getByRole("article", { name: "Vão 1" });
  await expect(vao.getByLabel("Largura (mm)")).toHaveValue("2000");
  await expect(vao.getByLabel("Altura (mm)")).toHaveValue("1200");
  await expect(vao.getByLabel("Quantidade")).toHaveValue("2");
  // O formulário de vão novo ficou limpo para o próximo.
  await expect(page.getByRole("article", { name: "Novo vão" }).getByLabel("Ambiente")).toHaveValue("");
});

test("tira a foto do vão (câmera traseira) e o arquivo fica ligado ao vão", async ({ page }) => {
  await page.goto(urlDaVisita);
  const vao = page.getByRole("article", { name: "Vão 1" });
  const entrada = vao.getByTestId("entrada-anexo");
  await expect(entrada).toHaveAttribute("capture", "environment");
  await expect(entrada).toHaveAttribute("accept", "image/*");
  await expect(vao.getByRole("button", { name: "Tirar foto" })).toBeVisible();

  await entrada.setInputFiles({ name: "vao-sala.png", mimeType: "image/png", buffer: PNG });
  await expect(toast(page, "Arquivo enviado.")).toBeVisible({ timeout: 30_000 });
  await expect(vao.getByText("vao-sala.png")).toBeVisible({ timeout: 15_000 });
  await capturar(page, "visita");
});

test("edita o vão, e remover pede confirmação", async ({ page }) => {
  await page.goto(urlDaVisita);
  const vao = page.getByRole("article", { name: "Vão 1" });
  await vao.getByLabel("Largura (mm)").fill("2100");
  await vao.getByRole("button", { name: "Salvar vão" }).click();
  await expect(toast(page, "Medida salva.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("article", { name: "Vão 1" }).getByLabel("Largura (mm)")).toHaveValue("2100");

  // Segundo vão para testar a remoção sem perder o primeiro.
  const novo = page.getByRole("article", { name: "Novo vão" });
  await novo.getByLabel("Ambiente").fill("Suíte");
  await novo.getByRole("button", { name: "Adicionar vão" }).click();
  await aguardarAvisosSumirem(page);
  await page.getByRole("button", { name: "Remover o vão 2" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Remover este vão?");
  await page.getByRole("alertdialog").getByRole("button", { name: "Remover" }).click();
  await expect(toast(page, "Medida removida.")).toBeVisible();
  await expect(page.getByRole("article", { name: "Vão 2" })).toHaveCount(0);
  await expect(page.getByRole("article", { name: "Vão 1" })).toBeVisible();
});

test("dados da obra: sem endereço o condomínio avisa; com endereço grava no endereço da obra", async ({ page }) => {
  await page.goto(urlDaVisita);
  await expect(page.getByText("Escolha o endereço da obra no projeto para registrar o condomínio.")).toBeVisible();
  await expect(page.getByLabel("A obra é em condomínio")).toBeDisabled();

  enderecoId = await vincularEnderecoDeObra(PROJETO);
  await page.reload();
  const form = page.getByRole("form", { name: "Dados da obra" });
  await form.getByLabel("Fase da obra").selectOption("EM_CONSTRUCAO");
  await form.getByLabel("Prazo desejado").fill("até junho");
  await form.getByLabel("A obra é em condomínio").check();
  await form.getByLabel("Nome do condomínio").fill("Residencial E2E");
  await form.getByLabel("Exige aprovação da fachada").check();
  await form.getByLabel("Fachada já aprovada").check();
  await form.getByLabel("Telefone do síndico").pressSequentially("22988887777");
  await form.getByRole("button", { name: "Salvar dados da obra" }).click();
  await expect(toast(page, "Dados da obra salvos.")).toBeVisible();

  expect(await lerEndereco(enderecoId)).toMatchObject({ condominio: true, condominioNome: "Residencial E2E", exigeAprovacaoFachada: true, fachadaAprovada: true, sindicoTelefone: "+5522988887777" });

  // Desmarcar o condomínio limpa os dados dele.
  await page.reload();
  await page.getByRole("form", { name: "Dados da obra" }).getByLabel("A obra é em condomínio").uncheck();
  await page.getByRole("form", { name: "Dados da obra" }).getByRole("button", { name: "Salvar dados da obra" }).click();
  await expect(toast(page, "Dados da obra salvos.")).toBeVisible();
  expect(await lerEndereco(enderecoId)).toMatchObject({ condominio: false, condominioNome: null, exigeAprovacaoFachada: false, fachadaAprovada: false, sindicoTelefone: null });
});
