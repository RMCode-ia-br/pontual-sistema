import { expect, test, type Page } from "@playwright/test";

import { aguardarAvisosSumirem, capturar, entrarEEsperarPainel, semRolagemHorizontal, toast } from "./ajudantes";
import { contasDaProposta, criarCondicaoDePagamentoDeTeste, criarTipologiaDeTeste, prepararUsuarioE2E, tarefasDoProjeto } from "./banco";
import { ipFalso, USUARIO_E2E } from "./dados";

test.describe.configure({ mode: "serial" });
test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(93) } });

// Tipologia e condição do próprio teste (o dono pode renomear ou excluir as semeadas): "E2E ..." é removido pela limpeza.
const TIPOLOGIA = "E2E Janela de correr";
const CONDICAO = "E2E 50% sinal + 25% material + 25% vidros e instalação";

test.beforeAll(async () => {
  await prepararUsuarioE2E({ senhaDefinitiva: true });
  await criarTipologiaDeTeste(TIPOLOGIA);
  await criarCondicaoDePagamentoDeTeste(CONDICAO);
});

test.beforeEach(async ({ page }) => {
  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
});

const CLIENTE = "E2E Cliente da Proposta";
const PROJETO = "E2E Obra da Proposta";

let idCliente = "";
let idProjeto = "";
let idProposta = "";

async function adicionarItemManual(page: Page, valor: string, largura = "2000", altura = "1200") {
  await page.getByRole("button", { name: "Adicionar item" }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("Tipologia", { exact: true }).selectOption({ label: TIPOLOGIA });
  await dialogo.getByLabel("Largura da medida 1").fill(largura);
  await dialogo.getByLabel("Altura da medida 1").fill(altura);
  await dialogo.getByLabel("Valor do item").fill(valor);
  await expect(dialogo.getByText(/Preço:/)).toBeVisible();
  await dialogo.getByRole("button", { name: "Adicionar item" }).click();
  await expect(toast(page, "Item adicionado")).toBeVisible();
  await aguardarAvisosSumirem(page);
}

test("preparação: cliente e projeto", async ({ page }) => {
  await page.goto("/clientes/novo");
  await page.getByLabel("Nome completo").fill(CLIENTE);
  await page.getByRole("button", { name: "Cadastrar cliente" }).click();
  await expect(page).toHaveURL(/\/clientes\/(?!novo)[a-z0-9]+$/);
  idCliente = page.url().split("/").pop() ?? "";

  await page.goto(`/projetos/novo?cliente=${idCliente}`);
  await page.getByLabel("Título").fill(PROJETO);
  await page.getByRole("button", { name: "Criar projeto" }).click();
  await expect(page).toHaveURL(/\/projetos\/(?!novo)[a-z0-9]+$/);
  idProjeto = page.url().split("/").pop() ?? "";
});

test("cria a proposta a partir do projeto, com número, cliente e textos padrão", async ({ page }) => {
  await page.goto(`/projetos/${idProjeto}?aba=propostas`);
  await expect(page.getByText("Nenhuma proposta neste projeto")).toBeVisible();
  await page.getByRole("link", { name: "Nova proposta" }).click();
  await expect(page.getByLabel("Projeto da proposta")).toHaveValue(idProjeto);
  await page.getByRole("button", { name: "Criar proposta" }).click();
  await expect(page).toHaveURL(/\/propostas\/[a-z0-9]+$/);
  idProposta = page.url().split("/").pop() ?? "";

  await expect(page.getByRole("heading", { name: /^Proposta \d{4}-\d{2}$/ })).toBeVisible();
  await expect(page.getByLabel("Cliente", { exact: true })).toHaveValue(CLIENTE);
  // Textos padrão do modelo (Apêndice A) e validade padrão.
  await expect(page.getByLabel("Notas importantes", { exact: true })).toHaveValue(/Este serviço está sob os termos e condições da/);
  await expect(page.getByLabel("Validade (texto)")).toHaveValue("Até alteração dos fornecedores");
  await expect(page.getByLabel("Acréscimo da nota fiscal (%)")).toHaveValue("5");
  await expect(page.getByLabel(/Comissão do arquiteto/)).toHaveValue("0");
  await semRolagemHorizontal(page);
});

test("itens: total é a soma calculada; com nota soma 5% em linha separada", async ({ page }) => {
  await page.goto(`/propostas/${idProposta}`);
  await expect(page.getByText("Nenhum item nesta opção")).toBeVisible();

  await adicionarItemManual(page, "4.130,00");
  await adicionarItemManual(page, "9.050,00");

  const totais = page.getByRole("complementary", { name: "Totais da proposta" });
  await expect(totais.getByText("R$ 13.180,00").first()).toBeVisible();
  await expect(totais.getByText("sem nota fiscal")).toBeVisible();
  await expect(totais.getByText(/Acréscimo da nota fiscal/)).toHaveCount(0);

  // Descrição gerada pelo modelo, numeração automática e plural.
  await expect(page.getByRole("article", { name: "Item 1" })).toContainText(`1 un — ${TIPOLOGIA}`);
  await expect(page.getByRole("article", { name: "Item 2" })).toBeVisible();

  // Com nota: 13.180,00 × 1,05 = 13.839,00 (acréscimo 659,00), em linha separada.
  await page.getByLabel("Esta venda é COM nota fiscal").check();
  await expect(totais.getByText("Acréscimo da nota fiscal (5%)")).toBeVisible();
  await expect(totais.getByText("R$ 659,00")).toBeVisible();
  await expect(totais.getByText("R$ 13.839,00")).toBeVisible();
  await expect(totais.getByText("com nota fiscal")).toBeVisible();
  await capturar(page, "proposta-editor");
});

test("salvar, recarregar, duplicar opção e item; rascunho não aceita item sem valor/medida", async ({ page }) => {
  await page.goto(`/propostas/${idProposta}`);
  await page.getByLabel("Esta venda é COM nota fiscal").check();
  await page.getByLabel("Parte (ex.: Parte 01/02)").fill("Parte 01/02");
  // Cronograma 50/25/25 do modelo.
  await page.getByLabel("Modelo de condição de pagamento").selectOption({ label: CONDICAO });
  await expect(page.getByText("Soma: 100%")).toBeVisible();
  await page.getByRole("button", { name: "Salvar proposta" }).click();
  await expect(toast(page, "Proposta salva")).toBeVisible();
  await aguardarAvisosSumirem(page);

  await page.reload();
  await expect(page.getByLabel("Esta venda é COM nota fiscal")).toBeChecked();
  await expect(page.getByLabel("Parte (ex.: Parte 01/02)")).toHaveValue("Parte 01/02");
  await expect(page.getByLabel("Percentual da parcela 1")).toHaveValue("50");

  // Duplicar item.
  await page.getByLabel("Duplicar o item 1").click();
  await expect(page.getByRole("article", { name: "Item 3" })).toBeVisible();

  // Duplicar a opção (copia os itens).
  await page.getByRole("button", { name: "Duplicar", exact: true }).click();
  await page.getByLabel("Nome da nova opção").fill("Linha Gold");
  await page.getByRole("button", { name: "Criar cópia" }).click();
  await expect(page.getByRole("tab", { name: "Linha Gold" })).toBeVisible();
  await page.getByRole("tab", { name: "Linha Gold" }).click();
  await expect(page.getByRole("article", { name: "Item 3" })).toBeVisible();

  // Item sem medida válida é recusado antes de ir ao servidor.
  await page.getByRole("button", { name: "Adicionar item" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Adicionar item" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Preencha largura, altura e quantidade");
  await page.keyboard.press("Escape");

  // Duplicar a proposta cria um rascunho novo com outro número.
  await page.getByRole("button", { name: "Duplicar como base" }).click();
  await expect(page).not.toHaveURL(new RegExp(`/propostas/${idProposta}$`));
  await expect(page.getByRole("heading", { name: /^Proposta \d{4}-\d{2}$/ })).toBeVisible();
});

test("a lista de propostas mostra valor, situação e filtra", async ({ page }) => {
  await page.goto("/propostas");
  await expect(page.getByRole("heading", { name: "Propostas", exact: true })).toBeVisible();
  await expect(page.getByText(CLIENTE).first()).toBeVisible();
  await expect(page.getByRole("list").getByText("Rascunho").first()).toBeVisible();
  await semRolagemHorizontal(page);
  await page.getByLabel("Buscar propostas").fill("zzz-sem-resultado");
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page.getByText("Nenhuma proposta encontrada")).toBeVisible();
  await capturar(page, "propostas-lista");
});

test("ciclo: enviar congela, nova revisão compara, aprovar gera parcelas e leva o projeto a Aprovado", async ({ page }) => {
  await page.goto(`/propostas/${idProposta}`);
  const numero = (await page.getByRole("heading", { name: /^Proposta [0-9]{4}-[0-9]{2}$/ }).textContent())!.replace("Proposta ", "");

  // Marcar como enviada: congela e a tela vira leitura.
  await page.getByRole("button", { name: "Marcar como enviada" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Marcar como enviada" }).click();
  await expect(toast(page, "marcada como enviada")).toBeVisible();
  await aguardarAvisosSumirem(page);
  await expect(page.getByText("Conteúdo congelado")).toBeVisible();
  await expect(page.getByRole("button", { name: "Adicionar item" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Salvar proposta" })).toHaveCount(0);
  await page.goto(`/projetos/${idProjeto}`);
  await expect(page.getByText("Proposta enviada").first()).toBeVisible();

  // Nova revisão: mesmo número, Rev. 1, e comparação sem diferenças.
  await page.goto(`/propostas/${idProposta}`);
  await page.getByRole("button", { name: "Nova revisão" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Criar revisão" }).click();
  await expect(page.getByRole("heading", { name: `Proposta ${numero}` })).toBeVisible();
  await expect(page.getByText("Rev. 1").first()).toBeVisible();
  await page.getByRole("link", { name: "Comparar com a revisão anterior" }).click();
  await expect(page.getByText("Nenhuma diferença nos itens")).toBeVisible();

  // Aprovar a proposta original, escolhendo a opção.
  await page.goto(`/propostas/${idProposta}`);
  await page.getByRole("button", { name: "Aprovar", exact: true }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("Opção aprovada").selectOption({ index: 0 });
  await dialogo.getByLabel("Forma do aceite").selectOption("WHATSAPP");
  await dialogo.getByRole("button", { name: "Aprovar proposta" }).click();
  await expect(toast(page, "aprovada")).toBeVisible();
  await aguardarAvisosSumirem(page);
  await expect(page.getByText("Aprovada", { exact: true }).first()).toBeVisible();

  // Opção 1: 4.130 + 9.050 + 4.130 (item duplicado) = 17.310,00; com nota ×1,05 = 18.175,50, em 50/25/25.
  // A última parcela absorve o arredondamento (454.387,50 → 454388 + 454387).
  const contas = await contasDaProposta(numero);
  expect(contas.map((c) => c.valorCentavos)).toEqual([908775, 454388, 454387]);
  expect(contas.reduce((soma, c) => soma + c.valorCentavos, 0)).toBe(1817550);
  expect(contas.map((c) => c.status)).toEqual(["ABERTA", "AGUARDANDO_GATILHO", "AGUARDANDO_GATILHO"]);
  expect(contas.every((c) => c.comNotaFiscal)).toBe(true);

  const tarefas = await tarefasDoProjeto(PROJETO);
  expect(tarefas.some((t) => t.tipo === "AGENDAR_MEDICAO" && t.status === "ABERTA")).toBe(true);

  await page.goto(`/projetos/${idProjeto}`);
  await expect(page.getByText("Aprovado", { exact: true }).first()).toBeVisible();
  await semRolagemHorizontal(page);

  // A aprovação gerou as etapas da obra (R5 passo 4 → R7): o atalho leva à obra, com as 9 etapas do modelo pendentes
  // e as parcelas por gatilho ainda aguardando a conclusão da etapa que as libera.
  await page.getByRole("link", { name: "Acompanhar obra" }).click();
  await expect(page).toHaveURL(/\/obras\/[\w-]+$/);
  await page.getByRole("navigation", { name: "Seções da obra" }).getByRole("link", { name: "Etapas e prazo" }).click();
  await expect(page.getByRole("listitem", { name: /^Etapa \d: / })).toHaveCount(9);
  await expect(page.getByRole("listitem", { name: "Etapa 1: Medição exata" })).toContainText("Pendente");
  await page.getByRole("navigation", { name: "Seções da obra" }).getByRole("link", { name: "Parcelas" }).click();
  await expect(page.getByText(/Aguarda a etapa “Fabricação”/)).toBeVisible();
  await semRolagemHorizontal(page);
});

test("custo de material do programa de corte: informado no painel interno (mesmo com a proposta aprovada), só para o gestor", async ({ page }) => {
  await page.goto(`/propostas/${idProposta}`);
  const painel = page.getByRole("complementary", { name: "Totais da proposta" });
  // A proposta tem duas opções (uma foi duplicada): cada uma tem o seu bloco interno e o seu botão. Usa a primeira.
  await expect(painel.getByText("Só para você (não vai ao PDF)").first()).toBeVisible();
  await painel.getByRole("button", { name: "Informar custo de material (programa)" }).first().click();
  const dialogo = page.getByRole("dialog");
  await expect(dialogo.getByText(/não aparece no PDF/)).toBeVisible();
  await dialogo.getByLabel("Total da opção (R$)").fill("500000");
  await dialogo.getByRole("button", { name: "Salvar" }).click();
  await expect(toast(page, "Custo de material salvo")).toBeVisible();
  await aguardarAvisosSumirem(page);

  // O painel passa a usar o custo informado (só material) na margem estimada.
  await expect(painel.getByText("Custo de material (informado)")).toHaveCount(1);
  await expect(painel.getByText(/Só material, sem mão de obra/)).toHaveCount(1);
  await expect(painel.getByText("Lucro sobre o preço (só material)")).toHaveCount(1);
  await semRolagemHorizontal(page);

  // O conteúdo da proposta continua igual: a proposta segue aprovada e o PDF continua sendo gerado (sem o custo).
  await expect(page.getByText("Aprovada", { exact: true }).first()).toBeVisible();
  const pdf = await page.request.get(`/api/propostas/${idProposta}/pdf`);
  expect(pdf.status()).toBe(200);
});

test("PDFs: a proposta e a folha de produção abrem; sem sessão são recusados", async ({ page, browser }) => {
  await page.goto(`/propostas/${idProposta}`);
  const pdf = await page.request.get(`/api/propostas/${idProposta}/pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  expect(pdf.headers()["content-disposition"]).toMatch(/proposta-[0-9]{4}-[0-9]{2}.pdf/);

  const producao = await page.request.get(`/api/propostas/${idProposta}/producao`);
  expect(producao.status()).toBe(200);
  expect((await producao.body()).subarray(0, 5).toString()).toBe("%PDF-");

  expect((await page.request.get("/api/propostas/inexistente123/pdf")).status()).toBe(404);
  expect((await page.request.get("/api/propostas/x%20y/pdf")).status()).toBeGreaterThanOrEqual(400);

  // Sem sessão (contexto novo, sem cookies): 401 ou redirecionamento ao login, nunca o arquivo.
  const anonimo = await browser.newContext({ baseURL: "http://localhost:3100", extraHTTPHeaders: { "x-forwarded-for": ipFalso(93) } });
  const r = await anonimo.request.get(`/api/propostas/${idProposta}/pdf`, { maxRedirects: 0 });
  expect([307, 308, 401]).toContain(r.status());
  await anonimo.close();
});

test("painel mostra os números de propostas e a busca global acha pelo número", async ({ page }) => {
  await page.goto(`/propostas/${idProposta}`);
  const numero = (await page.getByRole("heading", { name: /^Proposta [0-9]{4}-[0-9]{2}$/ }).textContent())!.replace("Proposta ", "");

  await page.goto("/");
  // "Aprovadas no mês" deixou de existir: o número equivalente é "Vendido" (propostas aprovadas no período, aqui o mês
  // atual), que leva à lista de vendas do mesmo mês, onde a proposta aprovada pelo teste aparece.
  const periodo = page.getByRole("region", { name: /O período em números/ });
  await expect(periodo.getByRole("link", { name: "Vendido", exact: true })).toBeVisible();
  const vendas = page.getByRole("region", { name: "Vendas e propostas" });
  await expect(vendas.getByRole("link", { name: "Propostas aguardando resposta" })).toBeVisible();
  await semRolagemHorizontal(page);
  await periodo.getByRole("link", { name: "Vendido", exact: true }).click();
  await expect(page).toHaveURL(/\/relatorios\/vendas\?mes=\d{4}-\d{2}$/);
  await expect(page.getByText(numero).first()).toBeVisible();

  await page.keyboard.press("Control+k");
  await page.getByPlaceholder("Buscar páginas, clientes, produtos...").fill(numero);
  await expect(page.getByRole("option", { name: new RegExp(`Proposta ${numero}`) }).first()).toBeVisible();
});
