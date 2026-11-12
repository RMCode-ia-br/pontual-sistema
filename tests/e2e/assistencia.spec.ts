import { expect, test, type Page } from "@playwright/test";

import { aguardarAvisosSumirem, capturar, entrarEEsperarPainel, semRolagemHorizontal, toast } from "./ajudantes";
import { chamadosDoCliente, clienteDaObra, concluirMarcoDaGarantia, criarObraDeTeste, parcelasDaObra, prepararUsuarioE2E } from "./banco";
import { ipFalso, USUARIO_E2E } from "./dados";

test.describe.configure({ mode: "serial" });
test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(97) } });

let obraId: string;
let clienteId: string;
let obraSemInstalacaoId: string;
let chamadoUrl: string;

test.beforeAll(async () => {
  await prepararUsuarioE2E({ senhaDefinitiva: true });
  obraId = await criarObraDeTeste("Assistência");
  await concluirMarcoDaGarantia(obraId, 10); // instalação concluída há 10 dias: regulagem em garantia
  clienteId = await clienteDaObra(obraId);
  obraSemInstalacaoId = await criarObraDeTeste("Sem instalação");
});

test.beforeEach(async ({ page }) => {
  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
});

const painel = (page: Page, titulo: string) => page.locator("section").filter({ has: page.getByRole("heading", { name: titulo }) });

test("abre o chamado pela obra: a regulagem logo depois da instalação já nasce em garantia", async ({ page }) => {
  await page.goto(`/obras/${obraId}?aba=assistencia`);
  await expect(page.getByText("Nenhum chamado de assistência")).toBeVisible();
  await page.getByRole("link", { name: "Novo chamado" }).click();

  // Cliente e obra já vêm escolhidos.
  await expect(page.getByRole("heading", { name: "Novo chamado", level: 1 })).toBeVisible();
  await expect(page.getByText("E2E Cliente Assistência")).toBeVisible();
  await expect(page.getByLabel("Obra (opcional)")).not.toHaveValue("");
  await expect(page.getByText("Em garantia.", { exact: true })).toBeVisible();
  await expect(page.getByText(/Dentro da garantia de regulagem \(instalação concluída em \d{2}\/\d{2}\/\d{4}; regulagem até \d{2}\/\d{2}\/\d{4}\)/)).toBeVisible();

  // Vidro depois da instalação: a garantia de vidro só vale até a instalação.
  await page.getByLabel("Tipo do problema").selectOption({ label: "Vidro" });
  await expect(page.getByText("Fora da garantia.", { exact: true })).toBeVisible();
  await expect(page.getByText(/A garantia dos vidros vale só até a instalação/)).toBeVisible();
  await page.getByLabel("Tipo do problema").selectOption({ label: "Regulagem de acessórios" });
  await expect(page.getByText("Em garantia.", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Abrir chamado" }).click();
  await expect(page.getByLabel("O que aconteceu")).toBeVisible(); // validação nativa: descrição obrigatória
  await page.getByLabel("O que aconteceu").fill("A janela do quarto está raspando no trilho.");
  await page.getByRole("button", { name: "Abrir chamado" }).click();

  await expect(page).toHaveURL(/\/obras\/assistencia\/[\w-]+$/);
  chamadoUrl = new URL(page.url()).pathname;
  await expect(page.getByRole("heading", { level: 1, name: /^Chamado #\d{4}$/ })).toBeVisible();
  await expect(page.getByText("Situação atual:")).toContainText("Aberto");
  await expect(painel(page, "Como a garantia foi conferida")).toContainText("Dentro da garantia de regulagem");
  await expect(page.getByText("A janela do quarto está raspando no trilho.")).toBeVisible();

  const chamados = await chamadosDoCliente(clienteId);
  expect(chamados).toHaveLength(1);
  expect(chamados[0]).toMatchObject({ classificacao: "EM_GARANTIA", status: "ABERTO", temConta: false, visitas: 0 });
  await semRolagemHorizontal(page);
  await capturar(page, "assistencia-chamado");
});

test("agendar a visita pelo chamado muda a situação e liga o compromisso", async ({ page }) => {
  await page.goto(chamadoUrl);
  await page.getByRole("link", { name: "Agendar visita" }).click();
  await expect(page).toHaveURL(/\/agenda\/novo\?chamado=/);
  await expect(page.getByText(/Esta visita atende o chamado #\d{4}\./)).toBeVisible();
  await expect(page.getByLabel("Tipo")).toHaveValue("ASSISTENCIA");

  await page.getByLabel("Data e hora").fill("2027-03-10T10:00");
  await page.getByRole("button", { name: "Agendar", exact: true }).click();
  const assimMesmo = page.getByRole("button", { name: "Agendar assim mesmo" });
  if (await assimMesmo.isVisible({ timeout: 3000 }).catch(() => false)) await assimMesmo.click();
  await expect(page).toHaveURL(/\/agenda\?vista=semana/);

  await page.goto(chamadoUrl);
  await expect(page.getByText("Situação atual:")).toContainText("Visita agendada");
  await expect(painel(page, "Visitas").getByRole("listitem")).toHaveCount(1);
  expect((await chamadosDoCliente(clienteId))[0]).toMatchObject({ status: "AGENDADO", visitas: 1 });
});

test("ajusta a classificação, cobra a visita uma vez só e gera a conta da obra", async ({ page }) => {
  await page.goto(chamadoUrl);
  const garantia = painel(page, "Garantia e cobrança");

  await garantia.getByLabel("Classificação").selectOption({ label: "Fora da garantia" });
  await expect(garantia.getByText("O sistema sugeriu: em garantia.")).toBeVisible();
  await garantia.getByLabel("Cobrar a visita").check();
  await garantia.getByLabel("Valor da visita (R$)").fill("abc");
  await garantia.getByRole("button", { name: "Salvar ajustes" }).click();
  await expect(garantia.getByText("Informe um valor válido, como 150,00.")).toBeVisible();

  await garantia.getByLabel("Valor da visita (R$)").fill("150,00");
  await garantia.getByRole("button", { name: "Salvar ajustes" }).click();
  await expect(toast(page, "Chamado atualizado")).toBeVisible();
  await aguardarAvisosSumirem(page);
  await expect(page.getByText("A classificação foi ajustada manualmente")).toBeVisible();

  await garantia.getByRole("button", { name: "Gerar conta a receber" }).click();
  await expect(toast(page, "Cobrança gerada")).toBeVisible();
  await aguardarAvisosSumirem(page);
  await expect(garantia.getByRole("button", { name: "Gerar conta a receber" })).toHaveCount(0);
  await expect(garantia.getByText("A cobrança já virou conta a receber da obra")).toBeVisible();
  await expect(painel(page, "Cobrança da visita")).toContainText("R$ 150,00");

  const parcelas = await parcelasDaObra(obraId);
  const conta = parcelas.find((p) => p.descricao.startsWith("Visita de assistência #"));
  expect(conta?.status).toBe("ABERTA");
  expect(parcelas).toHaveLength(4);
  expect((await chamadosDoCliente(clienteId))[0]).toMatchObject({ classificacao: "FORA_DA_GARANTIA", temConta: true });
});

test("resolver exige dizer o que foi feito; o chamado encerrado pode ser reaberto", async ({ page }) => {
  await page.goto(chamadoUrl);
  await page.getByRole("button", { name: "Resolver" }).click();
  await page.getByRole("button", { name: "Confirmar resolução" }).click();
  await expect(page.getByText("Descreva a solução em poucas palavras.")).toBeVisible();

  await page.getByLabel("O que foi feito").fill("Trilho limpo e roldanas reguladas.");
  await page.getByRole("button", { name: "Confirmar resolução" }).click();
  await expect(toast(page, "Chamado resolvido")).toBeVisible();
  await aguardarAvisosSumirem(page);
  await expect(page.getByText("Situação atual:")).toContainText("Resolvido");
  await expect(page.getByText("Trilho limpo e roldanas reguladas.")).toBeVisible();

  // Encerrado sai de "Em aberto" e aparece em "Encerrados".
  await page.goto("/obras/assistencia");
  await expect(page.getByRole("link", { name: /#\d{4} · Regulagem de acessórios/ })).toHaveCount(0);
  await page.goto("/obras/assistencia?situacao=resolvidos");
  await expect(page.getByRole("link", { name: /#\d{4} · Regulagem de acessórios/ })).toBeVisible();

  await page.goto(chamadoUrl);
  await page.getByRole("button", { name: "Reabrir" }).click();
  await expect(toast(page, "Chamado reaberto")).toBeVisible();
  await expect(page.getByText("Situação atual:")).toContainText("Aberto");
});

test("sem instalação concluída não há garantia a conferir; lista, abas e CSV", async ({ page }) => {
  await page.goto(`/obras/assistencia/novo?projeto=${obraSemInstalacaoId}`);
  await expect(page.getByText("Fora da garantia.", { exact: true })).toBeVisible();
  await expect(page.getByText(/A instalação ainda não foi concluída/)).toBeVisible();
  await page.getByLabel("Tipo do problema").selectOption({ label: "Vidro" });
  await page.getByLabel("O que aconteceu").fill("Cliente reclama de infiltração no encontro do vidro.");
  await page.getByRole("button", { name: "Abrir chamado" }).click();
  await expect(page).toHaveURL(/\/obras\/assistencia\/[\w-]+$/);
  await expect(page.getByText("Situação atual:")).toContainText("Aberto");

  // Lista: filtros e busca por número.
  await page.goto("/obras/assistencia");
  await expect(page.getByRole("link", { name: /#\d{4} · Regulagem de acessórios/ })).toBeVisible(); // o reaberto
  await expect(page.getByRole("link", { name: /#\d{4} · Regulagem de acessórios/ })).toHaveCount(1);
  await page.getByLabel("Garantia").selectOption({ label: "Em garantia" });
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page).toHaveURL(/classificacao=EM_GARANTIA/);
  await expect(page.getByRole("list", { name: "Chamados de assistência" })).toHaveCount(0); // o reaberto foi reclassificado como fora da garantia
  await page.getByRole("link", { name: "Limpar" }).click();
  await semRolagemHorizontal(page);
  await capturar(page, "assistencia-lista");

  // Abas da obra e do cliente.
  await page.goto(`/obras/${obraId}?aba=assistencia`);
  await expect(page.getByRole("link", { name: /^#\d{4} · Regulagem de acessórios/ })).toBeVisible();
  await page.goto(`/clientes/${clienteId}?aba=assistencia`);
  await expect(page.getByRole("link", { name: /^#\d{4} · Regulagem de acessórios/ })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Seções do cliente" }).getByRole("link", { name: /Assistência/ })).toBeVisible();

  // CSV com os mesmos filtros; exige sessão (a página já está logada).
  const resposta = await page.request.get("/api/exportar/chamados?situacao=todos");
  expect(resposta.status()).toBe(200);
  expect(resposta.headers()["content-type"]).toContain("text/csv");
  const csv = await resposta.text();
  expect(csv).toContain("Regulagem de acessórios");
  expect(csv).toContain("Visita cobrada");
});
