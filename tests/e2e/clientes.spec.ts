import { expect, test, type Page } from "@playwright/test";

import { aguardarAvisosSumirem, alertaDeFormulario, ehCelular, entrarEEsperarPainel, semRolagemHorizontal, toast } from "./ajudantes";
import { buscarAuditoriaFeitaPeloE2E, prepararUsuarioE2E } from "./banco";
import { ipFalso, USUARIO_E2E } from "./dados";

test.describe.configure({ mode: "serial" });
test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(81) } });

test.beforeAll(async () => {
  await prepararUsuarioE2E({ senhaDefinitiva: true });
});

test.beforeEach(async ({ page }) => {
  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
});

const MARIA = "E2E Maria Conceição";
const PEDRO = "E2E Pedro Duplicado";
const CARLA = "E2E Carla Indicada";
const CPF_MARIA = "529.982.247-25";

let idMaria = "";
let idCarla = "";

/** Link do cliente na lista (tabela no computador, cartões no celular: só um deles está visível). */
const linkDoCliente = (page: Page, nome: string) => page.getByRole("link", { name: nome, exact: true });

/** Espera abrir a ficha (e não a tela "novo") e devolve o id do cliente que está na URL. */
async function esperarFichaDoCliente(page: Page): Promise<string> {
  await expect(page).toHaveURL(/\/clientes\/(?!novo)[a-z0-9]+$/);
  return page.url().split("/").pop() ?? "";
}

async function preencherCliente(page: Page, dados: { nome: string; cpf?: string; telefone?: string; email?: string }) {
  await page.getByLabel("Nome completo").fill(dados.nome);
  if (dados.cpf) await page.getByLabel("CPF").fill(dados.cpf);
  if (dados.telefone) await page.getByLabel("Telefone").fill(dados.telefone);
  if (dados.email) await page.getByLabel("E-mail").fill(dados.email);
}

test("a lista de clientes abre sem rolagem horizontal e oferece o cadastro", async ({ page }) => {
  await page.goto("/clientes");
  await expect(page.getByRole("heading", { name: "Clientes", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Novo cliente" }).first()).toBeVisible();
  await semRolagemHorizontal(page);
});

test("o formulário valida CPF e telefone no servidor, ao lado do campo", async ({ page }) => {
  await page.goto("/clientes/novo");
  await preencherCliente(page, { nome: "E2E Teste Inválido", cpf: "111.111.111-11", telefone: "123" });
  await page.getByRole("button", { name: "Cadastrar cliente" }).click();
  await expect(page.getByText("CPF inválido. Confira os 11 números.")).toBeVisible();
  await expect(page.getByText(/Telefone: informe DDD e número/)).toBeVisible();
  // O que foi digitado continua no formulário.
  await expect(page.getByLabel("Nome completo")).toHaveValue("E2E Teste Inválido");
});

test("a máscara formata telefone e CPF enquanto digita", async ({ page }) => {
  await page.goto("/clientes/novo");
  await page.getByLabel("CPF").pressSequentially("52998224725");
  await expect(page.getByLabel("CPF")).toHaveValue(CPF_MARIA);
  await page.getByLabel("Telefone").pressSequentially("22999583288");
  await expect(page.getByLabel("Telefone")).toHaveValue("(22) 99958-3288");
  await page.getByLabel("Tipo de pessoa").selectOption("PJ");
  await expect(page.getByRole("textbox", { name: "CNPJ" })).toBeVisible();
});

test("cadastrar cliente pessoa física abre a ficha com os dados formatados", async ({ page }) => {
  await page.goto("/clientes/novo");
  await preencherCliente(page, { nome: MARIA, cpf: CPF_MARIA, telefone: "22999583288", email: "Maria.E2E@Exemplo.com" });
  await page.getByLabel("Origem", { exact: true }).selectOption("INDICACAO_CLIENTE");
  await page.getByLabel("Arquiteto/designer").check();
  await page.getByRole("button", { name: "Cadastrar cliente" }).click();

  await expect(toast(page, "Cliente cadastrado.")).toBeVisible();
  idMaria = await esperarFichaDoCliente(page);
  await expect(page.getByRole("heading", { name: MARIA })).toBeVisible();
  await expect(page.getByText(/529\.982\.247-25/)).toBeVisible();
  await expect(page.getByText(/\(22\) 99958-3288/).first()).toBeVisible();
  await expect(page.getByText("Origem: Indicação de cliente")).toBeVisible();
  // Botões de contato.
  await expect(page.getByRole("link", { name: "WhatsApp" })).toHaveAttribute("href", /^https:\/\/wa\.me\/5522999583288/);
  await expect(page.getByRole("link", { name: "Ligar" })).toHaveAttribute("href", "tel:+5522999583288");
  await expect(page.getByRole("link", { name: "E-mail" })).toHaveAttribute("href", "mailto:maria.e2e@exemplo.com");
  await semRolagemHorizontal(page);
});

test("a auditoria registrou o cadastro do cliente", async () => {
  const logs = await buscarAuditoriaFeitaPeloE2E("Cliente", "CRIAR");
  expect(logs.length).toBeGreaterThanOrEqual(1);
  expect(JSON.stringify(logs[0].depois)).toContain(MARIA);
});

test("mesmo CPF avisa a duplicidade, oferece abrir o existente e deixa cadastrar assim mesmo", async ({ page }) => {
  await page.goto("/clientes/novo");
  await preencherCliente(page, { nome: PEDRO, cpf: CPF_MARIA });
  await page.getByRole("button", { name: "Cadastrar cliente" }).click();

  const aviso = page.getByRole("alert").filter({ hasText: "parece já estar cadastrado" });
  await expect(aviso).toBeVisible();
  await expect(aviso.getByRole("link", { name: MARIA })).toHaveAttribute("href", `/clientes/${idMaria}`);
  await expect(aviso).toContainText("mesmo CPF/CNPJ");
  await expect(page).toHaveURL(/\/clientes\/novo/); // nada foi gravado ainda

  await aviso.getByRole("button", { name: "Cadastrar assim mesmo" }).click();
  await expect(toast(page, "Cliente cadastrado.")).toBeVisible();
  await expect(page.getByRole("heading", { name: PEDRO })).toBeVisible();
});

test("a busca ignora acentos e maiúsculas e acha por pedaço do CPF", async ({ page }) => {
  for (const termo of ["maria conceicao", "MARIA CONCEIÇÃO", "529.982"]) {
    await page.goto(`/clientes?busca=${encodeURIComponent(termo)}`);
    await expect(linkDoCliente(page, MARIA), termo).toBeVisible();
  }
  await page.goto("/clientes?busca=zzzinexistentezzz");
  await expect(page.getByText("Nenhum cliente nesse filtro")).toBeVisible();
});

test("endereço de obra em condomínio: cadastrar, editar e remover", async ({ page }) => {
  await page.goto(`/clientes/${idMaria}?aba=enderecos`);
  await expect(page.getByText("Nenhum endereço cadastrado")).toBeVisible();
  await page.getByRole("button", { name: "Adicionar endereço" }).first().click();
  await page.getByLabel("Apelido (opcional)").fill("Casa da praia");
  await page.getByLabel("Rua, avenida...").fill("Rua das Flores");
  await page.getByLabel("Número", { exact: true }).fill("10");
  await page.getByLabel("Bairro").fill("Centro");
  await page.getByLabel("Cidade").fill("Macaé");
  await page.getByLabel("Estado").selectOption("RJ");
  await page.getByLabel("É em condomínio").check();
  await page.getByLabel("Nome do condomínio").fill("Cond. Mar Azul");
  await page.getByLabel("Exige aprovação da fachada").check();
  await page.getByLabel("Horários permitidos para obra").fill("seg a sex, 8h às 17h");
  await page.getByLabel("Síndico", { exact: true }).fill("Sr. Paulo");
  await page.getByRole("button", { name: "Adicionar endereço" }).click();

  await expect(toast(page, "Endereço adicionado.")).toBeVisible();
  const cartao = page.locator("li").filter({ hasText: "Casa da praia" });
  await expect(cartao).toContainText("Rua das Flores, 10 — Centro, Macaé/RJ");
  await expect(cartao).toContainText("Condomínio: Cond. Mar Azul");
  await expect(cartao).toContainText("Fachada: aguardando aprovação");
  await expect(cartao).toContainText("seg a sex, 8h às 17h");
  await aguardarAvisosSumirem(page);

  await page.getByRole("button", { name: /Editar endereço Casa da praia/ }).click();
  await page.getByLabel("Número", { exact: true }).fill("20");
  await page.getByLabel("Fachada já aprovada").check();
  await page.getByRole("button", { name: "Salvar endereço" }).click();
  await expect(toast(page, "Endereço atualizado.")).toBeVisible();
  await expect(page.locator("li").filter({ hasText: "Casa da praia" })).toContainText("Rua das Flores, 20");
  await expect(page.locator("li").filter({ hasText: "Casa da praia" })).toContainText("Fachada: aprovada");
  await aguardarAvisosSumirem(page);

  await page.getByRole("button", { name: /Remover endereço Casa da praia/ }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remover" }).click();
  await expect(toast(page, "Endereço removido.")).toBeVisible();
  await expect(page.getByText("Nenhum endereço cadastrado")).toBeVisible();
});

test("endereço sem rua, apelido nem CEP é recusado", async ({ page }) => {
  await page.goto(`/clientes/${idMaria}?aba=enderecos`);
  await page.getByRole("button", { name: "Adicionar endereço" }).first().click();
  await page.getByLabel("Cidade").fill("Macaé");
  await page.getByRole("button", { name: "Adicionar endereço" }).click();
  await expect(page.getByText("Informe ao menos o apelido, a rua ou o CEP.")).toBeVisible();
});

test("contatos: valida o telefone, cadastra e remove", async ({ page }) => {
  await page.goto(`/clientes/${idMaria}?aba=contatos`);
  await page.getByRole("button", { name: "Adicionar contato" }).first().click();
  await page.getByLabel("Nome").fill("E2E Esposa do cliente");
  await page.getByLabel("Cargo ou relação (opcional)").fill("esposa");
  await page.getByLabel("WhatsApp").fill("123");
  await page.getByRole("button", { name: "Adicionar contato" }).click();
  await expect(page.getByText(/WhatsApp: informe DDD e número/)).toBeVisible();

  await page.getByLabel("WhatsApp").fill("22988887777");
  await page.getByRole("button", { name: "Adicionar contato" }).click();
  await expect(toast(page, "Contato adicionado.")).toBeVisible();
  const item = page.locator("li").filter({ hasText: "E2E Esposa do cliente" });
  await expect(item).toContainText("esposa");
  await expect(item.getByRole("link", { name: /\(22\) 98888-7777/ })).toHaveAttribute("href", "https://wa.me/5522988887777");
  await aguardarAvisosSumirem(page);

  await page.getByRole("button", { name: "Remover contato E2E Esposa do cliente" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remover" }).click();
  await expect(toast(page, "Contato removido.")).toBeVisible();
  await expect(page.getByText("Nenhum contato adicional")).toBeVisible();
});

test("linha do tempo: evento do sistema, registro manual e remoção", async ({ page }) => {
  await page.goto(`/clientes/${idMaria}?aba=linha-do-tempo`);
  await expect(page.getByText("Cliente cadastrado.").first()).toBeVisible();

  await page.getByLabel("O que aconteceu").selectOption("LIGACAO");
  await page.getByRole("textbox", { name: "Registro" }).fill("Liguei e pediu proposta para 4 janelas.");
  await page.getByRole("button", { name: "Registrar" }).click();
  await expect(toast(page, "Registro adicionado à linha do tempo.")).toBeVisible();
  await expect(page.getByText("Liguei e pediu proposta para 4 janelas.")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Registro" })).toHaveValue(""); // formulário limpo para o próximo
  await aguardarAvisosSumirem(page);

  // Só os registros manuais têm botão de remover; o evento do sistema não.
  await expect(page.getByRole("button", { name: /^Remover o registro de/ })).toHaveCount(1);
  await page.getByRole("button", { name: /^Remover o registro de/ }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remover" }).click();
  await expect(toast(page, "Registro removido.")).toBeVisible();
  await expect(page.getByText("Liguei e pediu proposta para 4 janelas.")).toHaveCount(0);
});

test("indicado por: escolhe o cliente na busca e a ficha mostra os dois lados", async ({ page }) => {
  await page.goto("/clientes/novo");
  await preencherCliente(page, { nome: CARLA });
  await page.getByLabel("Indicado por (opcional)").fill("maria conc");
  await page.getByRole("option", { name: MARIA }).click();
  await page.getByRole("button", { name: "Cadastrar cliente" }).click();
  await expect(toast(page, "Cliente cadastrado.")).toBeVisible();
  idCarla = await esperarFichaDoCliente(page);
  const indicacao = page.getByText(/^Indicado por E2E/);
  await expect(indicacao).toBeVisible();
  await expect(indicacao.getByRole("link", { name: MARIA })).toHaveAttribute("href", `/clientes/${idMaria}`);

  await page.goto(`/clientes/${idMaria}`);
  await expect(page.getByText("Indicou 1 cliente")).toBeVisible();
});

test("Parceiros lista só arquitetos e construtoras, com a contagem de indicados", async ({ page }) => {
  await page.goto("/parceiros?busca=E2E");
  await expect(linkDoCliente(page, MARIA)).toBeVisible();
  await expect(linkDoCliente(page, PEDRO)).toHaveCount(0);
  await expect(linkDoCliente(page, CARLA)).toHaveCount(0);
  const linha = ehCelular(page) ? page.locator("ul li").filter({ hasText: MARIA }) : page.locator("tr").filter({ hasText: MARIA });
  await expect(linha).toContainText("Arquiteto/designer");
  await expect(linha).toContainText("1");
});

test("editar o cliente salva e registra a alteração na auditoria", async ({ page }) => {
  await page.goto(`/clientes/${idMaria}`);
  await page.getByLabel("Observações (opcional)").fill("Prefere contato à tarde.");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(toast(page, "Cliente atualizado.")).toBeVisible();
  await page.goto(`/clientes/${idMaria}`);
  await expect(page.getByLabel("Observações (opcional)")).toHaveValue("Prefere contato à tarde.");
  const logs = await buscarAuditoriaFeitaPeloE2E("Cliente", "ATUALIZAR");
  expect(JSON.stringify(logs[0].depois)).toContain("Prefere contato à tarde.");
});

test("sair do formulário com alterações pergunta antes de descartar", async ({ page }) => {
  await page.goto("/clientes/novo");
  await page.getByLabel("Nome completo").fill("E2E Rascunho");
  let pergunta = "";
  page.once("dialog", async (dialogo) => {
    pergunta = dialogo.message();
    await dialogo.dismiss(); // ficar na página
  });
  await page.getByRole("link", { name: "Cancelar" }).click();
  expect(pergunta).toContain("não foram salvas");
  await expect(page).toHaveURL(/\/clientes\/novo/);
  await expect(page.getByLabel("Nome completo")).toHaveValue("E2E Rascunho");
});

test("filtros salvos: salvar a combinação atual, reaplicar e remover", async ({ page }) => {
  await page.goto("/clientes?marcacao=arquiteto&busca=E2E");
  await page.getByRole("button", { name: /Meus filtros/ }).click();
  await page.getByLabel("Salvar o filtro atual como").fill("E2E Arquitetos");
  await page.getByRole("button", { name: "Salvar filtro" }).click();
  await expect(toast(page, "Filtro salvo.")).toBeVisible();
  await aguardarAvisosSumirem(page);

  await page.goto("/clientes");
  await page.getByRole("button", { name: /Meus filtros/ }).click();
  await page.getByRole("link", { name: "E2E Arquitetos" }).click();
  await expect(page).toHaveURL(/marcacao=arquiteto/);
  await expect(page).toHaveURL(/busca=E2E/);
  await expect(linkDoCliente(page, MARIA)).toBeVisible();

  await page.getByRole("button", { name: /Meus filtros/ }).click();
  await page.getByRole("button", { name: "Remover o filtro E2E Arquitetos" }).click();
  await expect(toast(page, "Filtro removido.")).toBeVisible();
});

test("escolha de colunas: liga uma coluna escondida e lembra a escolha (computador)", async ({ page }) => {
  test.skip(ehCelular(page), "a tabela de colunas só existe no computador");
  await page.goto("/clientes?busca=E2E");
  await expect(page.getByRole("columnheader", { name: "Origem" })).toHaveCount(0);
  await page.getByRole("button", { name: "Colunas" }).click();
  await page.getByRole("checkbox", { name: "Origem" }).check();
  await expect(page.getByRole("columnheader", { name: "Origem" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("columnheader", { name: "Origem" })).toBeVisible();
  await page.getByRole("button", { name: "Colunas" }).click();
  await page.getByRole("checkbox", { name: "Origem" }).uncheck();
  await expect(page.getByRole("columnheader", { name: "Origem" })).toHaveCount(0);
});

test("ordenar pela coluna Nome inverte a ordem (computador)", async ({ page }) => {
  test.skip(ehCelular(page), "o cabeçalho ordenável só existe na tabela");
  await page.goto("/clientes?busca=E2E");
  await page.getByRole("link", { name: /Ordenar por Nome/ }).click();
  await expect(page).toHaveURL(/direcao=desc/);
  const nomes = await page.locator("tbody tr td:nth-child(2)").allInnerTexts();
  const ordenados = [...nomes].sort((a, b) => b.localeCompare(a, "pt-BR"));
  expect(nomes.map((n) => n.split("\n")[0])).toEqual(ordenados.map((n) => n.split("\n")[0]));
});

test("exportar CSV traz os clientes filtrados, e sem sessão não exporta nada", async ({ page, request }) => {
  const r = await page.request.get("/api/exportar/clientes?busca=E2E");
  expect(r.status()).toBe(200);
  expect(r.headers()["content-type"]).toContain("text/csv");
  const corpo = await r.text();
  expect(corpo.charCodeAt(0)).toBe(0xfeff); // BOM para o Excel
  expect(corpo).toContain(MARIA);
  expect(corpo).toContain("Nome;Nome fantasia;Pessoa;CPF/CNPJ");
  expect(corpo).toContain("529.982.247-25");

  // O contexto `request` não tem o cookie da sessão.
  const semSessao = await request.get("/api/exportar/clientes?busca=E2E", { maxRedirects: 0 });
  expect([307, 401]).toContain(semSessao.status());
  expect(semSessao.headers()["content-type"] ?? "").not.toContain("text/csv");
});

test("ação em lote: inativar tira da lista padrão e aparece em 'Inativos'; reativar volta", async ({ page }) => {
  await page.goto("/clientes?busca=E2E");
  await page.getByRole("checkbox", { name: `Marcar ${PEDRO}` }).check();
  await page.getByRole("button", { name: "Inativar", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Inativar" }).click();
  await expect(toast(page, "1 cliente inativado.")).toBeVisible();
  await expect(linkDoCliente(page, PEDRO)).toHaveCount(0);
  await aguardarAvisosSumirem(page);

  await page.goto("/clientes?busca=E2E&situacao=inativos");
  await expect(linkDoCliente(page, PEDRO)).toBeVisible();
  await page.getByRole("checkbox", { name: `Marcar ${PEDRO}` }).check();
  await page.getByRole("button", { name: "Reativar", exact: true }).click();
  await expect(toast(page, "1 cliente reativado.")).toBeVisible();
  await page.goto("/clientes?busca=E2E");
  await expect(linkDoCliente(page, PEDRO)).toBeVisible();
});

test("enviar à lixeira pede confirmação, some da lista e da busca e a ficha deixa de abrir", async ({ page }) => {
  await page.goto(`/clientes/${idCarla}`);
  await page.getByRole("button", { name: "Enviar à lixeira" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("pode ser restaurado depois na Lixeira");
  await page.getByRole("alertdialog").getByRole("button", { name: "Enviar à lixeira" }).click();
  await expect(toast(page, "1 cliente enviado para a lixeira.")).toBeVisible();
  await expect(page).toHaveURL(/\/clientes$/);

  await page.goto("/clientes?busca=E2E Carla");
  await expect(linkDoCliente(page, CARLA)).toHaveCount(0);
  await page.goto(`/clientes/${idCarla}`);
  await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
});

test("cliente inexistente mostra página não encontrada e as telas cabem no celular", async ({ page }) => {
  await page.goto("/clientes/id-que-nao-existe");
  await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
  for (const caminho of ["/clientes", "/clientes/novo", `/clientes/${idMaria}`, `/clientes/${idMaria}?aba=enderecos`, `/clientes/${idMaria}?aba=linha-do-tempo`, "/parceiros"]) {
    await page.goto(caminho);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await semRolagemHorizontal(page);
    await expect(alertaDeFormulario(page)).toHaveCount(0);
  }
});
