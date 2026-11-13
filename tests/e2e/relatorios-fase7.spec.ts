import { expect, test, type APIResponse } from "@playwright/test";

import { entrarEEsperarPainel, semRolagemHorizontal } from "./ajudantes";
import { criarRecebimentoDeTeste, criarVendaDeTeste, prepararUsuarioE2E } from "./banco";
import { ipFalso, USUARIO_E2E } from "./dados";

/**
 * Relatórios novos da Fase 7: cada página abre sem erro, tem título, seletor de período (onde existe), "Como é calculado" e
 * não rola na horizontal no celular; as rotas de CSV exigem sessão e saem no padrão brasileiro. Os dados de prova usam
 * janeiro de 2020, onde só existem os dados do teste, para conferir valores exatos mesmo com dados reais no banco.
 */
test.describe.configure({ mode: "serial" });
test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(112) } });

const MES = "2020-01";
// Vendas: R$ 10.500,00 sem nota e R$ 5.250,00 com nota. Recebimentos: R$ 10.500,00 sem nota e R$ 3.000,00 com nota.
let semNota: { projetoId: string; numero: string };
let comNota: { projetoId: string; numero: string };

test.beforeAll(async () => {
  await prepararUsuarioE2E({ senhaDefinitiva: true });
  semNota = await criarVendaDeTeste("Indicadores sem nota", { valorCentavos: 1_050_000, comNota: false, aceitaEm: "2020-01-15T15:00:00Z" });
  comNota = await criarVendaDeTeste("Indicadores com nota", { valorCentavos: 525_000, comNota: true, aceitaEm: "2020-01-20T15:00:00Z" });
  await criarRecebimentoDeTeste(semNota.projetoId, { data: "2020-01-10", valorCentavos: 1_050_000, comNota: false });
  await criarRecebimentoDeTeste(comNota.projetoId, { data: "2020-01-12", valorCentavos: 300_000, comNota: true });
});

test.beforeEach(async ({ page }) => {
  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
});

const mesDeHoje = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 7);

const PAGINAS = [
  { url: "/relatorios/vendas", h1: "Vendas por período", seletor: true },
  { url: "/relatorios/fechamento", h1: "Fechamento e tempo de resposta", seletor: true },
  { url: "/relatorios/producao", h1: "Produção da fábrica", seletor: false },
  { url: "/relatorios/faturamento", h1: "Faturamento mensal (12 meses)", seletor: false },
  { url: "/financeiro/recebimentos?nota=com&periodo=12m", h1: "Recebimentos", seletor: true },
] as const;

for (const p of PAGINAS) {
  test(`${p.url} abre sem erro, com título, definição e sem rolagem horizontal`, async ({ page }) => {
    const resposta = await page.goto(p.url);
    expect(resposta?.status(), p.url).toBeLessThan(400);
    await expect(page.getByRole("heading", { name: p.h1, level: 1 })).toBeVisible();
    await expect(page.getByText(/Application error|Something went wrong|Este erro/)).toHaveCount(0);
    if (p.seletor) {
      const seletor = page.getByRole("group", { name: "Período" });
      await expect(seletor).toBeVisible();
      await expect(seletor.locator("#periodo-pronto")).toBeVisible();
    }
    // "Como é calculado": botão nos cartões (NumeroDoPainel) ou o <details> do faturamento.
    await expect(page.getByText("Como é calculado").first()).toBeVisible();
    await semRolagemHorizontal(page);
  });
}

test("o filtro de nota e o período de 12 meses de Recebimentos vêm da URL", async ({ page }) => {
  await page.goto("/financeiro/recebimentos?nota=com&periodo=12m");
  await expect(page.locator("#filtro-nota")).toHaveValue("com");
  await expect(page.locator("#periodo-pronto")).toHaveValue("12m");
  await expect(page.getByRole("link", { name: /Exportar CSV/ })).toHaveAttribute("href", /\/api\/exportar\/financeiro\/recebimentos\?de=\d{4}-\d{2}-\d{2}&ate=\d{4}-\d{2}-\d{2}&nota=com$/);
});

test("margem por obra com período: mostra o seletor e o link 'Remover o período'", async ({ page }) => {
  const mes = mesDeHoje();
  await page.goto(`/relatorios/margem-obras?mes=${mes}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("group", { name: "Período" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Remover o período" })).toHaveAttribute("href", /^\/relatorios\/margem-obras(\?(?!.*mes=).*)?$/);
  await expect(page.getByText("Como é calculado").first()).toBeVisible();
  await semRolagemHorizontal(page);

  await page.getByRole("link", { name: "Remover o período" }).click();
  await expect(page).not.toHaveURL(/mes=/);
  await expect(page.getByRole("group", { name: "Período" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Filtrar por período" })).toBeVisible();

  // O CSV usa o mesmo filtro (período incluso): cabeçalho esperado.
  const csv = await page.request.get(`/api/exportar/relatorios/margem-obras?mes=${mes}`);
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain("Receita da margem (R$)");
});

test("a lista de relatórios traz os relatórios novos", async ({ page }) => {
  await page.goto("/relatorios");
  for (const [nome, href] of [
    ["Vendas por período", "/relatorios/vendas"],
    ["Fechamento e tempo de resposta", "/relatorios/fechamento"],
    ["Produção da fábrica", "/relatorios/producao"],
    ["Faturamento mensal (12 meses)", "/relatorios/faturamento"],
    ["Recebimentos", "/financeiro/recebimentos"],
  ] as const) {
    await expect(page.getByRole("link", { name: new RegExp(`^${nome.replace(/[()]/g, "\\$&")}`) }), nome).toHaveAttribute("href", href);
  }
  await semRolagemHorizontal(page);
});

test("vendas de janeiro de 2020: valor, linha da proposta e CSV no padrão brasileiro", async ({ page }) => {
  await page.goto(`/relatorios/vendas?mes=${MES}`);
  const resumo = page.getByRole("region", { name: "Resumo das vendas" });
  // Nesta página os cartões não têm link (são o resumo da lista): o título é um parágrafo.
  const cartao = (titulo: string) => resumo.locator("div.relative").filter({ has: page.getByText(titulo, { exact: true }) });
  await expect(cartao("Vendido")).toContainText("15.750,00");
  await expect(cartao("Vendido sem nota")).toContainText("10.500,00");
  await expect(cartao("Vendido com nota")).toContainText("5.250,00");
  await expect(cartao("Valor médio por obra")).toContainText("7.875,00");
  await expect(resumo).toContainText("2 proposta(s) em 2 projeto(s)");

  const tabela = page.getByRole("table", { name: "Propostas aprovadas no período" });
  const linha = tabela.getByRole("row").filter({ hasText: semNota.numero });
  await expect(linha).toContainText("15/01/2020");
  await expect(linha).toContainText("Sem nota");
  await expect(linha).toContainText("10.500,00");
  await expect(linha).toContainText("E2E Obra Indicadores sem nota");
  await expect(tabela.getByRole("row").filter({ hasText: comNota.numero })).toContainText("Com nota");
  await semRolagemHorizontal(page);

  // Outro mês não traz essas propostas.
  await page.goto("/relatorios/vendas?mes=2020-02");
  await expect(page.getByText("Nenhuma proposta foi aprovada neste período")).toBeVisible();

  const resposta = await page.request.get(`/api/exportar/relatorios/vendas?mes=${MES}`);
  expect(resposta.status()).toBe(200);
  expect(resposta.headers()["content-type"]).toContain("text/csv");
  await conferirBomEPontoEVirgula(resposta);
  const csv = await resposta.text();
  expect(csv).toContain("Valor aprovado (R$)");
  const linhaCsv = csv.split(/\r?\n/).find((l) => l.includes(semNota.numero)) ?? "";
  expect(linhaCsv).toContain("15/01/2020");
  expect(linhaCsv.endsWith(";10500,00"), linhaCsv).toBe(true);
  expect(linhaCsv).toContain("Sem nota");
  const linhaCom = csv.split(/\r?\n/).find((l) => l.includes(comNota.numero)) ?? "";
  expect(linhaCom.endsWith(";5250,00"), linhaCom).toBe(true);
});

test("recebimentos de janeiro de 2020: total, linha, filtro de nota e CSV", async ({ page }) => {
  await page.goto(`/financeiro/recebimentos?mes=${MES}`);
  await expect(page.getByRole("region", { name: "Total do filtro" })).toContainText("13.500,00");
  await expect(page.getByRole("region", { name: "Total do filtro" })).toContainText("2 pagamento(s)");
  const tabela = page.getByRole("table", { name: "Recebimentos do período" });
  const sem = tabela.getByRole("row").filter({ hasText: "10/01/2020" });
  await expect(sem).toContainText("Sem nota");
  await expect(sem).toContainText("10.500,00");
  await expect(sem).toContainText(/pix/i);
  const com = tabela.getByRole("row").filter({ hasText: "12/01/2020" });
  await expect(com).toContainText("Com nota");
  await expect(com).toContainText("3.000,00");
  await semRolagemHorizontal(page);

  // Filtro "Só com nota".
  await page.locator("#filtro-nota").selectOption("com");
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page).toHaveURL(/nota=com/);
  await expect(page.getByRole("region", { name: "Total do filtro" })).toContainText("3.000,00");
  await expect(page.getByRole("region", { name: "Total do filtro" })).toContainText("1 pagamento(s)");
  await expect(tabela.getByRole("row").filter({ hasText: "10/01/2020" })).toHaveCount(0);

  // CSV com e sem o filtro.
  const todos = await page.request.get(`/api/exportar/financeiro/recebimentos?mes=${MES}`);
  expect(todos.status()).toBe(200);
  expect(todos.headers()["content-type"]).toContain("text/csv");
  await conferirBomEPontoEVirgula(todos);
  const csv = await todos.text();
  expect(csv).toContain("Valor (R$)");
  expect(csv).toContain("Data do pagamento");
  const linhaSem = csv.split(/\r?\n/).find((l) => l.includes("10/01/2020")) ?? "";
  expect(linhaSem.endsWith(";10500,00"), linhaSem).toBe(true);
  expect(linhaSem).toContain("E2E Conta dos indicadores");
  expect(linhaSem).toContain("Sem nota");
  const linhaCom = csv.split(/\r?\n/).find((l) => l.includes("12/01/2020")) ?? "";
  expect(linhaCom.endsWith(";3000,00"), linhaCom).toBe(true);

  const soCom = await (await page.request.get(`/api/exportar/financeiro/recebimentos?mes=${MES}&nota=com`)).text();
  expect(soCom).toContain(";3000,00");
  expect(soCom).not.toContain(";10500,00");
});

test("as rotas de CSV novas respondem sem sessão com 401 (ou redirecionam ao login) e nunca entregam o arquivo", async ({ playwright, baseURL }) => {
  const anonimo = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { "x-forwarded-for": ipFalso(112) } });
  for (const rota of [
    "/api/exportar/relatorios/vendas",
    "/api/exportar/relatorios/fechamento",
    "/api/exportar/relatorios/faturamento",
    "/api/exportar/relatorios/margem-obras",
    "/api/exportar/financeiro/recebimentos",
    "/api/exportar/financeiro/fluxo",
  ]) {
    const r = await anonimo.get(rota, { maxRedirects: 0 });
    expect([401, 307, 308], `${rota} → ${r.status()}`).toContain(r.status());
    if (r.status() !== 401) expect(r.headers().location, rota).toContain("/login");
    expect(r.headers()["content-type"] ?? "", rota).not.toContain("text/csv");
  }
  await anonimo.dispose();
});

test("com sessão, cada CSV novo responde 200 como text/csv, com BOM, ';' e o cabeçalho esperado", async ({ page }) => {
  for (const [rota, cabecalho] of [
    ["/api/exportar/relatorios/vendas", "Valor aprovado (R$)"],
    ["/api/exportar/relatorios/fechamento", "Resultado;Código da obra;Obra;Cliente;Data da decisão;Valor fechado (R$)"],
    ["/api/exportar/relatorios/fechamento?tabela=tempo", "Visita realizada em"],
    ["/api/exportar/relatorios/faturamento", "Mês;Vendido sem nota (R$)"],
    ["/api/exportar/relatorios/margem-obras", "Receita da margem (R$)"],
    ["/api/exportar/financeiro/recebimentos", "Valor (R$)"],
    ["/api/exportar/financeiro/fluxo", "Período;Entradas previstas"],
    ["/api/exportar/financeiro/fluxo?visao=dias", "Período;Entradas previstas"],
  ] as const) {
    const r = await page.request.get(rota);
    expect(r.status(), rota).toBe(200);
    expect(r.headers()["content-type"], rota).toContain("text/csv");
    expect(r.headers()["content-disposition"], rota).toContain("attachment");
    await conferirBomEPontoEVirgula(r);
    expect(await r.text(), rota).toContain(cabecalho);
  }
});

/** O arquivo começa com o BOM do UTF-8 (U+FEFF: bytes EF BB BF) e separa as colunas por ponto e vírgula. */
async function conferirBomEPontoEVirgula(r: APIResponse) {
  const corpo = await r.body();
  expect([...corpo.subarray(0, 3)], r.url()).toEqual([0xef, 0xbb, 0xbf]);
  expect(corpo.toString("utf8").charCodeAt(0)).toBe(0xfeff);
  expect(corpo.toString("utf8"), r.url()).toContain(";");
}
