import { expect, test, type Page } from "@playwright/test";

import { aguardarAvisosSumirem, capturar, ehCelular, entrarEEsperarPainel, semRolagemHorizontal, toast } from "./ajudantes";
import { buscarAuditoriaFeitaPeloE2E, criarMotivoDePerdaDeTeste, prepararUsuarioE2E } from "./banco";
import { ipFalso, USUARIO_E2E } from "./dados";

test.describe.configure({ mode: "serial" });
test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(88) } });

// Motivo de perda do próprio teste (o dono pode renomear ou excluir os do catálogo).
const MOTIVO_PERDA = "E2E Motivo de perda";

test.beforeAll(async () => {
  await prepararUsuarioE2E({ senhaDefinitiva: true });
  await criarMotivoDePerdaDeTeste(MOTIVO_PERDA);
});

test.beforeEach(async ({ page }) => {
  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
});

const CLIENTE = "E2E Cliente do Funil";
const PROJETO = "E2E Janelas e portas";
const OUTRO = "E2E Box do banheiro";

let idCliente = "";
let idProjeto = "";

// O nome acessível da coluna é o título seguido da contagem ("Novo contato 1 projetos").
const coluna = (page: Page, nome: string) => page.getByRole("region", { name: new RegExp(`^${nome}`) });
const cartao = (page: Page, titulo: string) => page.getByTestId("cartao-projeto").filter({ hasText: titulo });
const menuMover = (page: Page, titulo: string) => cartao(page, titulo).getByLabel(/Mover .* para outra fase/);

async function criarProjeto(page: Page, titulo: string): Promise<string> {
  await page.goto(`/projetos/novo?cliente=${idCliente}`);
  await expect(page.getByText(CLIENTE).first()).toBeVisible();
  await page.getByLabel("Título").fill(titulo);
  await page.getByRole("button", { name: "Criar projeto" }).click();
  await expect(page).toHaveURL(/\/projetos\/(?!novo)[a-z0-9]+$/);
  return page.url().split("/").pop() ?? "";
}

test("preparação: cadastra o cliente do funil", async ({ page }) => {
  await page.goto("/clientes/novo");
  await page.getByLabel("Nome completo").fill(CLIENTE);
  await page.getByRole("button", { name: "Cadastrar cliente" }).click();
  await expect(page).toHaveURL(/\/clientes\/(?!novo)[a-z0-9]+$/);
  idCliente = page.url().split("/").pop() ?? "";
  expect(idCliente).not.toBe("");
});

test("o funil vazio ensina o próximo passo e o formulário valida o essencial", async ({ page }) => {
  await page.goto("/funil");
  await expect(page.getByRole("heading", { name: "Funil", exact: true })).toBeVisible();
  await semRolagemHorizontal(page);

  await page.goto("/projetos/novo");
  await page.getByLabel("Título").fill(PROJETO);
  await page.getByRole("button", { name: "Criar projeto" }).click();
  // Sem escolher o cliente, o servidor recusa e mostra o erro ao lado do campo; o título digitado fica.
  await expect(page.getByText("Escolha o cliente do projeto.")).toBeVisible();
  await expect(page.getByLabel("Título")).toHaveValue(PROJETO);
});

test("cria um projeto a partir da ficha do cliente e ele ganha um código P-AAAA-NNNN", async ({ page }) => {
  idProjeto = await criarProjeto(page, PROJETO);
  await expect(page.getByRole("heading", { name: PROJETO })).toBeVisible();
  await expect(page.getByText(/P-\d{4}-\d{4,}/).first()).toBeVisible();
  await expect(page.getByText("Novo contato").first()).toBeVisible();

  // O projeto aparece na aba "Projetos" do cliente e a auditoria registrou a criação.
  await page.goto(`/clientes/${idCliente}?aba=projetos`);
  await expect(page.getByRole("link", { name: new RegExp(PROJETO) })).toBeVisible();
  expect((await buscarAuditoriaFeitaPeloE2E("Projeto", "CRIAR")).length).toBeGreaterThanOrEqual(1);
});

test("mover pelo menu 'Mover para…' respeita as regras: Aprovado é recusado", async ({ page }) => {
  await page.goto("/funil");
  await expect(coluna(page, "Novo contato").getByText(PROJETO)).toBeVisible();
  await semRolagemHorizontal(page);

  await menuMover(page, PROJETO).selectOption({ label: "Negociação" });
  await expect(toast(page, /movido para "Negociação"/)).toBeVisible();
  await expect(coluna(page, "Negociação").getByText(PROJETO)).toBeVisible();
  await expect(coluna(page, "Novo contato").getByText(PROJETO)).toHaveCount(0);

  // Persistiu no banco: recarregar mantém.
  await page.reload();
  await expect(coluna(page, "Negociação").getByText(PROJETO)).toBeVisible();

  await aguardarAvisosSumirem(page);
  await menuMover(page, PROJETO).selectOption({ label: "Aprovado" });
  await expect(toast(page, /só vai para "Aprovado" aprovando uma proposta/i)).toBeVisible();
  await expect(coluna(page, "Negociação").getByText(PROJETO)).toBeVisible();
});

test("arrastar o cartão com o mouse muda de fase (computador)", async ({ page }) => {
  test.skip(ehCelular(page), "o arrasto com o mouse é do computador; no celular vale o toque longo e o menu");
  // Volta o cartão para a primeira coluna (pelo menu) para origem e destino ficarem visíveis na tela.
  await page.goto("/funil");
  await menuMover(page, PROJETO).selectOption({ label: "Novo contato" });
  await expect(coluna(page, "Novo contato").getByText(PROJETO)).toBeVisible();
  await aguardarAvisosSumirem(page);

  const origem = await cartao(page, PROJETO).locator("span.font-mono").boundingBox();
  const destino = await coluna(page, "Visita agendada").boundingBox();
  if (!origem || !destino) throw new Error("cartão ou coluna não encontrados");

  await page.mouse.move(origem.x + origem.width / 2, origem.y + origem.height / 2);
  await page.mouse.down();
  await page.mouse.move(origem.x + 30, origem.y + 30, { steps: 5 });
  await page.mouse.move(destino.x + destino.width / 2, destino.y + 120, { steps: 20 });
  // Uma pessoa não solta o cartão no mesmo milissegundo em que chega: dá tempo de o arrasto detectar a coluna.
  await page.waitForTimeout(300);
  await page.mouse.up();
  await page.waitForTimeout(500);
  await expect(coluna(page, "Visita agendada").getByText(PROJETO)).toBeVisible();
  await page.reload();
  await expect(coluna(page, "Visita agendada").getByText(PROJETO)).toBeVisible();
});

test("perder exige o motivo; reabrir pela ficha devolve o projeto ao funil", async ({ page }) => {
  await page.goto("/funil");
  await menuMover(page, PROJETO).selectOption({ label: "Perdido" });

  const dialogo = page.getByRole("dialog");
  await expect(dialogo.getByRole("heading", { name: "Marcar como perdido" })).toBeVisible();
  // Sem motivo o navegador nem envia (campo obrigatório); escolhe o motivo criado pelo teste.
  await dialogo.getByLabel("Motivo").selectOption({ label: MOTIVO_PERDA });
  await dialogo.getByLabel(/qual\? \(opcional\)/).fill("E2E Concorrente");
  await dialogo.getByRole("button", { name: "Marcar como perdido" }).click();

  await expect(toast(page, /marcado como perdido/i)).toBeVisible();
  await expect(coluna(page, "Perdidos").getByText(PROJETO)).toBeVisible();

  // Na ficha aparecem o motivo e o concorrente; reabrir limpa a perda.
  await page.goto(`/projetos/${idProjeto}`);
  await expect(page.getByText("Por que foi perdido")).toBeVisible();
  await expect(page.getByText("E2E Concorrente")).toBeVisible();
  await aguardarAvisosSumirem(page);
  await page.getByLabel("Reabrir o projeto em uma fase").selectOption({ label: "Elaborando proposta" });
  await expect(toast(page, /movido para "Elaborando proposta"/)).toBeVisible();
  await expect(page.getByText("Por que foi perdido")).toHaveCount(0);

  await page.getByRole("link", { name: "Linha do tempo" }).click();
  await expect(page.getByText(/Fase alterada de "Perdido" para "Elaborando proposta"/)).toBeVisible();
});

test("a lista encontra o projeto ignorando acentos, tem CSV e o formulário edita os dados", async ({ page }) => {
  idProjeto = idProjeto || (await criarProjeto(page, PROJETO));
  await page.goto("/projetos?busca=janelas+e+PORTAS");
  await expect(page.getByRole("link", { name: PROJETO }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Exportar CSV/ })).toHaveAttribute("href", /\/api\/exportar\/projetos/);
  await semRolagemHorizontal(page);

  await page.goto(`/projetos/${idProjeto}?aba=dados`);
  await page.getByLabel("Temperatura").selectOption("QUENTE");
  await page.getByLabel("Valor estimado do projeto (opcional)").pressSequentially("1234567");
  await expect(page.getByLabel("Valor estimado do projeto (opcional)")).toHaveValue("12.345,67");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page).toHaveURL(new RegExp(`/projetos/${idProjeto}$`));
  await expect(page.getByText("R$ 12.345,67").first()).toBeVisible();
  await capturar(page, "projeto-ficha");
  expect((await buscarAuditoriaFeitaPeloE2E("Projeto", "ATUALIZAR")).length).toBeGreaterThanOrEqual(1);
});

test("o cartão mostra valor e temperatura; um segundo projeto convive no funil", async ({ page }) => {
  await criarProjeto(page, OUTRO);
  await page.goto("/funil");
  await expect(cartao(page, PROJETO).getByText("R$ 12.345,67")).toBeVisible();
  await expect(cartao(page, PROJETO).getByText("Quente")).toBeVisible();
  await expect(coluna(page, "Novo contato").getByText(OUTRO)).toBeVisible();
  await capturar(page, "funil");
  // Filtro por texto no funil.
  await page.goto("/funil?busca=box+do+banheiro");
  await expect(cartao(page, OUTRO)).toBeVisible();
  await expect(cartao(page, PROJETO)).toHaveCount(0);
});

test("tarefa criada pela ficha do projeto fica ligada a ele e volta para a aba de tarefas", async ({ page }) => {
  await page.goto(`/projetos/${idProjeto}?aba=tarefas`);
  await page.getByRole("link", { name: "Nova tarefa" }).click();
  await expect(page.getByText(/Projeto: P-\d{4}-\d{4,} · E2E Janelas e portas/)).toBeVisible();
  await page.getByLabel("O que precisa ser feito?").fill("E2E Ligar para o cliente");
  await page.getByRole("button", { name: "Adicionar tarefa" }).click();
  await expect(page).toHaveURL(new RegExp(`/projetos/${idProjeto}\\?aba=tarefas`));
  await expect(page.getByText("E2E Ligar para o cliente")).toBeVisible();
});

test("enviar à lixeira tira o projeto das listas e dá para restaurar", async ({ page }) => {
  await page.goto("/funil");
  await page.goto(`/projetos?busca=${encodeURIComponent(OUTRO)}`);
  await page.getByRole("link", { name: OUTRO }).first().click();
  await page.getByRole("button", { name: "Enviar à lixeira" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Enviar à lixeira" }).click();
  await expect(page).toHaveURL(/\/projetos$/);

  await page.goto("/funil");
  await expect(cartao(page, OUTRO)).toHaveCount(0);

  await page.goto("/lixeira?tipo=projetos");
  await expect(page.getByText(OUTRO)).toBeVisible();
  await page.getByRole("button", { name: `Restaurar ${OUTRO}` }).click();
  await expect(toast(page, /restaurado/i)).toBeVisible();

  await page.goto("/funil");
  await expect(cartao(page, OUTRO)).toBeVisible();
});

test("a busca global acha o projeto", async ({ page }) => {
  await page.goto("/funil");
  await page.keyboard.press("Control+k");
  await page.getByPlaceholder(/Buscar páginas/).fill("janelas e portas");
  await expect(page.getByRole("option", { name: new RegExp(PROJETO) })).toBeVisible();
});
