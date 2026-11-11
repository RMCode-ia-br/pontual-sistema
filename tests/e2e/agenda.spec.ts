import { expect, request, test, type Page } from "@playwright/test";

import { aguardarAvisosSumirem, capturar, ehCelular, entrarEEsperarPainel, semRolagemHorizontal, toast } from "./ajudantes";
import { buscarAuditoriaFeitaPeloE2E, prepararUsuarioE2E } from "./banco";
import { ipFalso, USUARIO_E2E } from "./dados";

test.describe.configure({ mode: "serial" });
test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(89) } });

test.beforeAll(async () => {
  await prepararUsuarioE2E({ senhaDefinitiva: true });
});

test.beforeEach(async ({ page }) => {
  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
});

const CLIENTE = "E2E Cliente da Agenda";
const PROJETO = "E2E Obra da Agenda";
// 12/03/2030 é terça-feira (dia útil, sem feriado semeado). 10/03/2030 é domingo.
const TERCA = "2030-03-12";
const DOMINGO = "2030-03-10";

let idProjeto = "";
let linkDoFeed = "";

async function agendar(page: Page, inicio: string, opcoes: { confirmar?: boolean } = {}) {
  await page.goto(`/projetos/${idProjeto}?aba=visitas`);
  await page.getByRole("link", { name: "Agendar visita" }).first().click();
  await expect(page.getByRole("heading", { name: "Novo compromisso" })).toBeVisible();
  await page.getByLabel("Data e hora").fill(inicio);
  await page.getByRole("button", { name: "Agendar", exact: true }).click();
  if (opcoes.confirmar) {
    await expect(page.getByText("Atenção antes de agendar")).toBeVisible();
    await page.getByRole("button", { name: "Agendar assim mesmo" }).click();
  }
}

test("preparação: cadastra o cliente e o projeto da agenda", async ({ page }) => {
  await page.goto("/clientes/novo");
  await page.getByLabel("Nome completo").fill(CLIENTE);
  await page.getByRole("button", { name: "Cadastrar cliente" }).click();
  await expect(page).toHaveURL(/\/clientes\/(?!novo)[a-z0-9]+$/);
  const idCliente = page.url().split("/").pop() ?? "";

  await page.goto(`/projetos/novo?cliente=${idCliente}`);
  await page.getByLabel("Título").fill(PROJETO);
  await page.getByRole("button", { name: "Criar projeto" }).click();
  await expect(page).toHaveURL(/\/projetos\/(?!novo)[a-z0-9]+$/);
  idProjeto = page.url().split("/").pop() ?? "";
  expect(idProjeto).not.toBe("");
});

test("a agenda abre nas quatro visões, sem rolagem horizontal, e orienta quando está vazia", async ({ page }) => {
  await page.goto("/agenda");
  await expect(page.getByRole("heading", { name: "Agenda", exact: true })).toBeVisible();
  const visoes = page.getByRole("navigation", { name: "Visão da agenda" });
  for (const nome of ["Semana", "Dia", "Lista", "Mês"]) {
    await visoes.getByRole("link", { name: nome, exact: true }).click();
    await expect(visoes.getByRole("link", { name: nome, exact: true })).toHaveAttribute("aria-current", "page");
    await semRolagemHorizontal(page);
  }
  await visoes.getByRole("link", { name: "Lista", exact: true }).click();
  await expect(page.getByText("Nenhum compromisso nos próximos 30 dias")).toBeVisible();
});

test("agendar a visita pelo projeto move o projeto para 'Visita agendada' e aparece na semana", async ({ page }) => {
  await agendar(page, `${TERCA}T10:00`);
  await expect(page).toHaveURL(new RegExp(`/agenda\\?vista=semana&data=${TERCA}`));
  await expect(page.getByRole("link", { name: /Visita técnica — E2E Cliente da Agenda/ }).first()).toBeVisible();

  await page.goto(`/projetos/${idProjeto}`);
  await expect(page.getByText("Visita agendada").first()).toBeVisible();
  expect((await buscarAuditoriaFeitaPeloE2E("EventoAgenda", "CRIAR")).length).toBeGreaterThanOrEqual(1);
});

test("horário em conflito avisa e só agenda depois de confirmar (alerta, não bloqueio)", async ({ page }) => {
  await agendar(page, `${TERCA}T10:30`);
  const aviso = page.getByRole("alert").filter({ hasText: "Atenção antes de agendar" });
  await expect(aviso).toBeVisible();
  await expect(aviso).toContainText("Conflito de horário");
  await capturar(page, "agenda-conflito");
  await page.getByRole("button", { name: "Agendar assim mesmo" }).click();
  await expect(page).toHaveURL(new RegExp(`/agenda\\?vista=semana&data=${TERCA}`));
  await expect(page.getByRole("link", { name: /Visita técnica — E2E Cliente da Agenda/ })).toHaveCount(2);
  await capturar(page, "agenda-semana");
  await page.goto(`/agenda?vista=mes&data=${TERCA}`);
  await capturar(page, "agenda-mes");
  await page.goto(`/agenda?vista=dia&data=${TERCA}`);
  await capturar(page, "agenda-dia");
});

test("domingo e fora do expediente também avisam; 'ver horários livres' sugere e preenche", async ({ page }) => {
  await agendar(page, `${DOMINGO}T10:00`);
  await expect(page.getByRole("alert").filter({ hasText: "fora do expediente" })).toBeVisible();

  // Ajusta para a terça e pede os horários livres: as 10h estão ocupadas, as 8h não.
  await page.getByLabel("Data e hora").fill(`${TERCA}T09:00`);
  await page.getByRole("button", { name: "Ver horários livres" }).click();
  const livres = page.getByRole("list", { name: "Horários livres" });
  await expect(livres).toBeVisible();
  await expect(livres.getByRole("button", { name: "08:00" })).toBeVisible();
  await expect(livres.getByRole("button", { name: "10:00" })).toHaveCount(0);
  await livres.getByRole("button", { name: "08:00" }).click();
  await expect(page.getByLabel("Data e hora")).toHaveValue(`${TERCA}T08:00`);
});

test("visita realizada sugere a próxima fase do projeto e a pessoa decide", async ({ page }) => {
  await page.goto(`/agenda?vista=lista&data=${TERCA}`);
  await page.getByRole("link", { name: /Visita técnica — E2E Cliente da Agenda/ }).first().click();
  await expect(page.getByRole("button", { name: "Visita realizada" })).toBeVisible();
  await page.getByRole("button", { name: "Visita realizada" }).click();

  await expect(toast(page, /marcado como realizado/i)).toBeVisible();
  await expect(toast(page, /Quer mover o projeto para “Elaborando proposta”\?/)).toBeVisible();
  await toast(page, /Quer mover o projeto/).getByRole("button", { name: "Mover" }).click();
  await expect(toast(page, /movido para "Elaborando proposta"/)).toBeVisible();

  // Realizado não muda mais de situação.
  await expect(page.getByRole("button", { name: "Visita realizada" })).toHaveCount(0);
  await page.goto(`/projetos/${idProjeto}?aba=linha-do-tempo`);
  await expect(page.getByText(/Visita técnica de .*: realizado/)).toBeVisible();
});

test("remarcar muda a situação para 'Remarcado' e registra na linha do tempo", async ({ page }) => {
  await page.goto(`/agenda?vista=lista&data=${TERCA}`);
  // O segundo compromisso (10:30) ainda está em aberto.
  await page.getByRole("link", { name: /Visita técnica — E2E Cliente da Agenda/ }).last().click();
  await page.getByLabel("Data e hora").fill(`${TERCA}T15:00`);
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page).toHaveURL(/\/agenda\/[a-z0-9]+$/);
  await expect(page.getByText("Remarcado", { exact: true }).first()).toBeVisible();

  await page.goto(`/projetos/${idProjeto}?aba=linha-do-tempo`);
  await expect(page.getByText(/remarcada de/)).toBeVisible();
});

test("exporta .ics autenticado e valida o conteúdo", async ({ page }) => {
  const r = await page.request.get(`/api/agenda/exportar?de=${TERCA.slice(0, 8)}01&ate=${TERCA.slice(0, 8)}31`);
  expect(r.status()).toBe(200);
  expect(r.headers()["content-type"]).toContain("text/calendar");
  const corpo = await r.text();
  expect(corpo).toContain("BEGIN:VCALENDAR");
  expect(corpo).toContain("SUMMARY:Visita técnica — E2E Cliente da Agenda");
  expect(corpo).toContain("TRIGGER:-PT1440M");
  expect(corpo).not.toMatch(/R\$/);
  expect((await buscarAuditoriaFeitaPeloE2E("EventoAgenda", "EXPORTAR")).length).toBeGreaterThanOrEqual(1);

  // Período invertido ou longo demais é recusado com mensagem.
  expect((await page.request.get(`/api/agenda/exportar?de=2030-04-01&ate=2030-03-01`)).status()).toBe(400);
  expect((await page.request.get(`/api/agenda/exportar?id=nao-existe`)).status()).toBe(404);
});

test("o link assinado funciona sem login, é mostrado uma vez e pode ser desligado", async ({ page, baseURL }) => {
  test.skip(ehCelular(page), "o fluxo do link é o mesmo no celular; evita repetir os 5 links do limite");
  await page.goto("/agenda");
  await page.getByRole("button", { name: "Assinar no calendário" }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("Nome do link (opcional)").fill("E2E Celular");
  await dialogo.getByRole("button", { name: "Criar link" }).click();

  const campo = dialogo.getByLabel("Link da agenda");
  await expect(campo).toBeVisible();
  linkDoFeed = await campo.inputValue();
  expect(linkDoFeed).toMatch(/\/api\/public\/agenda\/[A-Za-z0-9_-]{40,}$/);

  // Sem cookies de sessão: o token basta.
  const anonimo = await request.newContext({ baseURL });
  const caminho = new URL(linkDoFeed).pathname;
  const aberto = await anonimo.get(caminho);
  expect(aberto.status()).toBe(200);
  expect(await aberto.text()).toContain("BEGIN:VCALENDAR");

  // O token em claro não volta: reabrir a janela mostra só o nome do link, com o botão de desligar.
  await page.reload();
  await page.getByRole("button", { name: "Assinar no calendário" }).click();
  await expect(page.getByRole("dialog").getByText("E2E Celular")).toBeVisible();
  await expect(page.getByRole("dialog").getByLabel("Link da agenda")).toHaveCount(0);

  await page.getByRole("button", { name: "Desligar o link E2E Celular" }).click();
  await expect(toast(page, /Link desligado/)).toBeVisible();
  await expect.poll(async () => (await anonimo.get(caminho)).status()).toBe(404);
  await anonimo.dispose();

  // Token inventado: o mesmo 404.
  const outro = await request.newContext({ baseURL });
  expect((await outro.get("/api/public/agenda/" + "a".repeat(43))).status()).toBe(404);
  await outro.dispose();
  expect((await buscarAuditoriaFeitaPeloE2E("FeedAgenda", "REVOGAR")).length).toBe(1);
});

test("a visão em lista mostra os compromissos agrupados por dia", async ({ page }) => {
  await page.goto(`/agenda?vista=lista&data=${TERCA}`);
  await expect(page.getByRole("heading", { level: 3, name: /12\/03\/2030/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Visita técnica — E2E Cliente da Agenda/ })).toHaveCount(2);
  await aguardarAvisosSumirem(page);
  await semRolagemHorizontal(page);
  await capturar(page, "agenda-lista");

  // Filtro por tipo que não tem nada: estado vazio com orientação.
  await page.goto(`/agenda?vista=lista&data=${TERCA}&tipo=INSTALACAO`);
  await expect(page.getByText("Nenhum compromisso com esses filtros")).toBeVisible();
});
