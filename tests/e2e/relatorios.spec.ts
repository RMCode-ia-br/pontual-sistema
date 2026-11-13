import { expect, test } from "@playwright/test";

import { capturar, cartaoDoPainel, conferirComoECalculado, entrarEEsperarPainel, semRolagemHorizontal } from "./ajudantes";
import { buscarAuditoriaFeitaPeloE2E, contarProjetosDecididosForaDoE2E, criarMotivoDePerdaDeTeste, prepararUsuarioE2E } from "./banco";
import { ipFalso, USUARIO_E2E } from "./dados";

test.describe.configure({ mode: "serial" });
test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(91) } });

// Motivo de perda do próprio teste (o dono pode renomear ou excluir os do catálogo).
const MOTIVO_PERDA = "E2E Motivo de perda do relatório";

test.beforeAll(async () => {
  await prepararUsuarioE2E({ senhaDefinitiva: true });
  await criarMotivoDePerdaDeTeste(MOTIVO_PERDA);
});

test.beforeEach(async ({ page }) => {
  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
});

const CLIENTE = "E2E Cliente do Relatório";
const PROJETO = "E2E Obra do Relatório";

test("preparação: projeto com origem Google, perdido com motivo", async ({ page }) => {
  await page.goto("/clientes/novo");
  await page.getByLabel("Nome completo").fill(CLIENTE);
  await page.getByRole("button", { name: "Cadastrar cliente" }).click();
  await expect(page).toHaveURL(/\/clientes\/(?!novo)[a-z0-9]+$/);
  const idCliente = page.url().split("/").pop() ?? "";

  await page.goto(`/projetos/novo?cliente=${idCliente}`);
  await page.getByLabel("Título").fill(PROJETO);
  await page.getByLabel("Origem", { exact: true }).selectOption("GOOGLE");
  await page.getByRole("button", { name: "Criar projeto" }).click();
  await expect(page).toHaveURL(/\/projetos\/(?!novo)[a-z0-9]+$/);

  await page.getByRole("button", { name: "Marcar como perdido" }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("Motivo").selectOption({ label: MOTIVO_PERDA });
  await dialogo.getByRole("button", { name: "Marcar como perdido" }).click();
  await expect(page.getByText("Por que foi perdido")).toBeVisible();
});

test("o painel mostra as vendas e propostas, a atenção de hoje e origem/perdas do mês, com definições", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Vendas e propostas", level: 2 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Atenção hoje" })).toBeVisible();
  await expect(page.getByText("Nenhuma visita marcada para hoje ou amanhã.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Propostas sem retorno/ })).toHaveAttribute("href", "/projetos?semRetorno=1");
  // Os cartões das fases ficam sob "Projetos em cada fase hoje".
  await expect(page.getByRole("heading", { name: "Projetos em cada fase hoje", level: 3 })).toBeVisible();
  const novoContato = page.getByRole("link", { name: /Novo contato/ }).first();
  await expect(novoContato).toHaveAttribute("href", "/projetos?status=NOVO_LEAD");
  await conferirComoECalculado(cartaoDoPainel(page, /Novo contato/), "Projetos nessa fase hoje");
  // O projeto perdido no mês aparece em origem (Google) e em perdas.
  await expect(page.getByRole("heading", { name: /^De onde vieram os projetos novos \(/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Por que se perdeu \(/ })).toBeVisible();
  const origem = page.locator("div.rounded-xl").filter({ has: page.getByRole("heading", { name: /^De onde vieram/ }) });
  await expect(origem.getByRole("listitem").filter({ hasText: "Google" })).toContainText(/[1-9]/);
  const perdas = page.locator("div.rounded-xl").filter({ has: page.getByRole("heading", { name: /^Por que se perdeu/ }) });
  await expect(perdas.getByRole("listitem").filter({ hasText: MOTIVO_PERDA })).toContainText("1");
  await semRolagemHorizontal(page);
  await capturar(page, "painel");
});

test("o relatório de funil e origem conta o projeto, mostra as definições e leva à lista filtrada", async ({ page }) => {
  await page.goto("/relatorios");
  await page.getByRole("link", { name: /Funil e origem dos clientes/ }).click();
  await expect(page.getByRole("heading", { name: "Funil e origem dos clientes" })).toBeVisible();

  await expect(page.getByRole("heading", { name: "Onde estão os projetos agora" })).toBeVisible();
  const origem = page.getByRole("table", { name: "Funil por origem" });
  await expect(origem.getByRole("row", { name: /Google/ })).toContainText("1");
  await expect(page.getByRole("table", { name: "Projetos por fase atual" }).getByRole("row", { name: /Perdido/ })).toContainText("1");
  await expect(page.getByRole("heading", { name: "Por que se perdem" })).toBeVisible();
  // Sem propostas/aprovações, taxa de fechamento não é inventada. (O banco de desenvolvimento pode ter projetos reais
  // aprovados, e aí a taxa existe de verdade: nesse caso só conferimos que o cartão está lá.)
  if ((await contarProjetosDecididosForaDoE2E()) === 0) {
    await expect(page.getByText(/Aparece quando houver projetos aprovados ou perdidos com proposta/)).toBeVisible();
  } else {
    await expect(page.getByText("Taxa de fechamento", { exact: true })).toBeVisible();
  }
  await expect(page.getByText(/Como é calculado: conversão/)).toBeVisible();
  await semRolagemHorizontal(page);
  await capturar(page, "relatorio-funil");

  // O número leva à lista de projetos já filtrada (e o mesmo projeto está lá).
  await origem.getByRole("link", { name: "Google" }).click();
  await expect(page).toHaveURL(/\/projetos\?.*origem=GOOGLE/);
  await expect(page.getByRole("link", { name: PROJETO }).first()).toBeVisible();
});

test("filtro por origem sem projetos mostra o estado vazio; o CSV segue os mesmos filtros", async ({ page }) => {
  await page.goto("/relatorios/funil?origem=INSTAGRAM");
  await expect(page.getByText("Nenhum projeto criado nesse período")).toBeVisible();

  const r = await page.request.get("/api/exportar/relatorios/funil");
  expect(r.status()).toBe(200);
  expect(r.headers()["content-type"]).toContain("text/csv");
  const csv = await r.text();
  expect(csv).toContain("Origem;Projetos;Com visita");
  expect(csv).toMatch(/Google;[1-9]\d*;/); // o projeto do teste (e, no banco de desenvolvimento, os reais com a mesma origem)
  // Só o início do arquivo leva a marca de codificação (BOM), não cada seção.
  expect(csv.slice(1)).not.toContain("﻿");
  expect(csv).toContain("Perdido");
  expect((await buscarAuditoriaFeitaPeloE2E("Relatorio", "EXPORTAR")).length).toBe(1);

  const vazio = await (await page.request.get("/api/exportar/relatorios/funil?origem=INSTAGRAM")).text();
  expect(vazio).not.toMatch(/Google;[1-9]\d*;/);
});
