import { expect, test, type Page } from "@playwright/test";

import { aguardarAvisosSumirem, aguardarHidratado, ehCelular, entrarEEsperarPainel, semRolagemHorizontal, toast } from "./ajudantes";
import {
  clienteDaObra,
  criarObraDeTeste,
  criarPropostaRascunhoDeTeste,
  criarUsuarioDePerfil,
  definirValorFechadoDaObra,
  estadoDaObraDeTeste,
  idsDasFotosDaObra,
  perfilDoUsuario,
  prepararUsuarioE2E,
  type PropostaDeTeste,
} from "./banco";
import { ipFalso, USUARIO_E2E, USUARIO_E2E_CAMPO, USUARIO_E2E_ESCRITORIO } from "./dados";

/**
 * Fase 7C, Bloco 9: entrar com um usuário de CADA perfil (criados aqui, com login "e2e-*", removidos pela limpeza geral) e
 * conferir menu, rotas e saídas bloqueadas, que custo e margem não aparecem para quem não tem e que o Campo não vê NENHUM
 * valor. Também: o Escritório faz ponta a ponta (criar, enviar e aprovar proposta, receber, estornar, cancelar a obra) e o
 * Campo faz o trabalho dele (agenda, visita, etapa, foto e nota de campo). Os E2E dos outros arquivos seguem como administrador.
 */
test.describe.configure({ mode: "serial" });
test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(160) } });

let obraId: string;
let clienteId: string;
let proposta: PropostaDeTeste;
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const SEM_ACESSO = "Você não tem acesso a esta área";
const NOME_DA_CONTA = "E2E Conta Perfis";

test.beforeAll(async () => {
  await prepararUsuarioE2E({ senhaDefinitiva: true }); // roda a limpeza geral (que também remove usuários e2e-* antigos)
  await criarUsuarioDePerfil(USUARIO_E2E_ESCRITORIO, "ESCRITORIO");
  await criarUsuarioDePerfil(USUARIO_E2E_CAMPO, "CAMPO");
  obraId = await criarObraDeTeste("Perfis");
  clienteId = await clienteDaObra(obraId);
  await definirValorFechadoDaObra(obraId, 1_234_500);
  proposta = await criarPropostaRascunhoDeTeste(`Perfis ${Date.now()}`);
});

const comoEscritorio = (page: Page) => entrarEEsperarPainel(page, USUARIO_E2E_ESCRITORIO.login, USUARIO_E2E_ESCRITORIO.senha);
const comoCampo = (page: Page) => entrarEEsperarPainel(page, USUARIO_E2E_CAMPO.login, USUARIO_E2E_CAMPO.senha);

async function abrirMenu(page: Page) {
  if (ehCelular(page)) await page.getByRole("button", { name: "Mais" }).click();
  const menu = page.getByRole("navigation", { name: "Menu principal" });
  await expect(menu).toBeVisible();
  return menu;
}

const abas = (page: Page) => page.getByRole("navigation", { name: "Seções da obra" });
const dialogo = (page: Page) => page.getByRole("dialog");
const etapa = (page: Page, ordem: number, nome: string) => page.getByRole("listitem", { name: `Etapa ${ordem}: ${nome}` });

async function semAcesso(page: Page, rota: string) {
  await page.goto(rota);
  await expect(page.getByRole("heading", { name: SEM_ACESSO })).toBeVisible();
}

// ------------------------------------------------------------------------------------------------------------------
// Escritório
// ------------------------------------------------------------------------------------------------------------------

test("Escritório: menu sem Configurações, vê valores, custo e margem, e baixa o PDF da proposta", async ({ page }) => {
  await comoEscritorio(page);
  const menu = await abrirMenu(page);
  for (const grupo of ["Agenda e tarefas", "Comercial", "Clientes", "Obras", "Financeiro", "Estoque e compras", "Cadastros"]) {
    await expect(menu.getByRole("button", { name: grupo, exact: true }), grupo).toBeVisible();
  }
  await expect(menu.getByRole("link", { name: "Relatórios" })).toBeVisible();
  await expect(menu.getByRole("button", { name: "Configurações", exact: true })).toHaveCount(0);
  await expect(menu.getByRole("link", { name: "Ajuda" })).toHaveCount(0);

  await semAcesso(page, "/configuracoes/usuarios");
  await semAcesso(page, "/configuracoes/empresa");

  // Valores e custo: valor fechado, aba Parcelas e aba Custo e margem existem.
  await page.goto(`/obras/${obraId}`);
  await expect(abas(page)).toBeVisible();
  await expect(abas(page).getByRole("link", { name: "Parcelas", exact: true })).toBeVisible();
  await expect(abas(page).getByRole("link", { name: "Custo e margem" })).toBeVisible();
  await expect(page.getByText(/R\$\s?12\.345,00/)).toBeVisible();
  await page.goto("/relatorios/margem-obras");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText(SEM_ACESSO)).toHaveCount(0);
  expect((await page.request.get("/api/exportar/relatorios/margem-obras")).status()).not.toBe(403);
  expect((await page.request.get("/api/exportar/financeiro/receber")).status()).toBe(200);

  const pdf = await page.request.get(`/api/propostas/${proposta.propostaId}/pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  await semRolagemHorizontal(page);
});

// ------------------------------------------------------------------------------------------------------------------
// Campo
// ------------------------------------------------------------------------------------------------------------------

test("Campo: o menu mostra só Agenda e tarefas, Clientes e Obras", async ({ page }) => {
  await comoCampo(page);
  const menu = await abrirMenu(page);
  for (const grupo of ["Agenda e tarefas", "Clientes", "Obras"]) await expect(menu.getByRole("button", { name: grupo, exact: true }), grupo).toBeVisible();
  for (const grupo of ["Comercial", "Financeiro", "Estoque e compras", "Cadastros", "Configurações"]) {
    await expect(menu.getByRole("button", { name: grupo, exact: true }), grupo).toHaveCount(0);
  }
  await expect(menu.getByRole("link", { name: "Relatórios" })).toHaveCount(0);
  await expect(menu.getByRole("link", { name: "Ajuda" })).toHaveCount(0);
  await semRolagemHorizontal(page);
});

test("Campo: rotas de dinheiro, cadastros e configurações levam à tela de sem acesso; PDF, CSV e margem dão 403", async ({ page }) => {
  await comoCampo(page);
  for (const rota of ["/propostas", "/funil", "/projetos", "/financeiro", "/financeiro/receber", "/compras", "/produtos", "/fornecedores", "/relatorios", "/relatorios/margem-obras", "/configuracoes/usuarios", "/lixeira"]) {
    await semAcesso(page, rota);
  }
  // Saídas: o PDF da proposta (com valores) não sai para o Campo, nem CSV de dinheiro, nem margem, nem pedido de compra.
  expect((await page.request.get(`/api/propostas/${proposta.propostaId}/pdf`)).status()).toBe(403);
  expect((await page.request.get("/api/exportar/financeiro/receber")).status()).toBe(403);
  expect((await page.request.get("/api/exportar/relatorios/margem-obras")).status()).toBe(403);
  expect((await page.request.get("/api/exportar/relatorios/estoque")).status()).toBe(403);
  expect((await page.request.get("/api/exportar/clientes")).status()).toBe(403); // CPF e e-mail: só quem edita Clientes
  expect((await page.request.get("/api/compras/x1/pdf")).status()).toBe(403);
  // A folha de produção (sem valores) é do trabalho do Campo: não é bloqueada por permissão (aqui só a proposta de teste ainda é rascunho).
  expect((await page.request.get(`/api/propostas/${proposta.propostaId}/producao`)).status()).not.toBe(403);
});

test("Campo não vê NENHUM valor: obra, lista de obras, painel, cliente e assistência", async ({ page }) => {
  await comoCampo(page);
  const semDinheiro = async () => {
    await expect(page.locator("body")).not.toContainText("R$");
    await expect(page.locator("body")).not.toContainText("12.345");
  };

  await page.goto(`/obras/${obraId}`);
  await expect(page.getByRole("heading", { name: "E2E Obra Perfis", level: 1 })).toBeVisible();
  await expect(abas(page)).toBeVisible();
  await expect(abas(page).getByRole("link", { name: "Etapas e prazo" })).toBeVisible();
  await expect(abas(page).getByRole("link", { name: "Parcelas", exact: true })).toHaveCount(0);
  await expect(abas(page).getByRole("link", { name: "Custo e margem" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Ver projeto" })).toHaveCount(0);
  await semDinheiro();
  // Endereço direto das abas proibidas cai no resumo, sem dinheiro.
  await page.goto(`/obras/${obraId}?aba=custo`);
  await expect(page.getByRole("heading", { name: "E2E Obra Perfis", level: 1 })).toBeVisible();
  await semDinheiro();
  await page.goto(`/obras/${obraId}?aba=financeiro`);
  await expect(page.getByRole("heading", { name: "E2E Obra Perfis", level: 1 })).toBeVisible();
  await semDinheiro();
  await page.goto(`/obras/${obraId}?aba=materiais`);
  await expect(abas(page)).toBeVisible();
  await semDinheiro();

  await page.goto("/obras");
  await expect(page.getByRole("link", { name: /E2E Obra Perfis/ }).first()).toBeVisible();
  await semDinheiro();

  await page.goto("/obras/assistencia");
  await expect(page.getByRole("heading", { name: "Assistência e garantia", level: 1 })).toBeVisible();
  await semDinheiro();

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Atenção hoje" })).toBeVisible();
  await expect(page.getByText("Vendido", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Dinheiro" })).toHaveCount(0);
  await semDinheiro();

  await page.goto(`/clientes/${clienteId}`);
  await expect(page.getByRole("heading", { name: "E2E Cliente Perfis", level: 1 })).toBeVisible();
  const abasDoCliente = page.getByRole("navigation", { name: "Seções do cliente" });
  await expect(abasDoCliente.getByRole("link", { name: "Dados" })).toBeVisible();
  for (const aba of ["Financeiro", "Projetos", "Arquivos", "Linha do tempo"]) await expect(abasDoCliente.getByRole("link", { name: aba, exact: true }), aba).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Inativar|Enviar à lixeira/ })).toHaveCount(0);
  await semDinheiro();
  await semRolagemHorizontal(page);
});

test("Campo trabalha: conclui etapa, envia foto da obra e escreve nota de campo, mas não cancela a obra", async ({ page }) => {
  await comoCampo(page);

  await page.goto(`/obras/${obraId}?aba=etapas`);
  await expect(etapa(page, 1, "Medição exata")).toBeVisible();
  await etapa(page, 1, "Medição exata").getByRole("button", { name: "Concluir: Medição exata" }).click();
  await dialogo(page).getByRole("button", { name: "Concluir", exact: true }).click();
  await expect(toast(page, "Etapa concluída")).toBeVisible();
  await aguardarAvisosSumirem(page);
  if (await dialogo(page).isVisible()) await dialogo(page).getByRole("button", { name: "Manter como está" }).click();
  await expect(etapa(page, 1, "Medição exata")).toContainText("Concluída");
  await expect(page.getByRole("button", { name: "Cancelar a obra" })).toHaveCount(0); // ação destrutiva: o Campo não tem

  await page.goto(`/obras/${obraId}?aba=fotos`);
  await expect(page.getByRole("heading", { name: "Fotos da obra" })).toBeVisible();
  const entradaFoto = page.getByTestId("entrada-foto");
  await aguardarHidratado(entradaFoto);
  await entradaFoto.setInputFiles({ name: "campo-fachada.png", mimeType: "image/png", buffer: PNG });
  await expect(toast(page, "Foto enviada.")).toBeVisible({ timeout: 30_000 });
  expect((await idsDasFotosDaObra(obraId)).length).toBeGreaterThanOrEqual(1);

  await page.goto(`/obras/${obraId}?aba=historico`);
  const caixaDaNota = page.locator("#texto-interacao");
  await expect(caixaDaNota).toBeVisible();
  await caixaDaNota.fill("Nota de campo: cliente pediu para começar pela sala.");
  await page.getByRole("button", { name: "Registrar" }).click();
  await expect(page.getByText("Nota de campo: cliente pediu para começar pela sala.")).toBeVisible();
});

test("Campo: agenda uma visita e anota o vão, sem ver o investimento previsto", async ({ page }) => {
  await comoCampo(page);
  await page.goto(`/agenda/novo?projeto=${obraId}&tipo=VISITA_TECNICA&inicio=2030-03-12T10:00`);
  await page.getByRole("button", { name: "Agendar", exact: true }).click();
  await expect(page).toHaveURL(/\/agenda\?vista=semana/);
  await page.getByRole("link", { name: /Visita técnica — E2E Cliente Perfis/ }).first().click();
  await page.getByRole("link", { name: "Medidas e fotos" }).click();
  await expect(page.getByRole("heading", { name: /Visita — E2E Cliente Perfis/ })).toBeVisible();

  const novo = page.getByRole("article", { name: "Novo vão" });
  await novo.getByLabel("Ambiente").fill("Sala");
  await novo.getByLabel("Tipo de esquadria").fill("Janela de correr");
  await novo.getByLabel("Largura (mm)").fill("2000");
  await novo.getByLabel("Altura (mm)").fill("1200");
  await novo.getByLabel("Quantidade").fill("1");
  await novo.getByRole("button", { name: "Adicionar vão" }).click();
  await expect(toast(page, "Medida salva.")).toBeVisible();

  await expect(page.getByRole("heading", { name: "Dados da obra" })).toBeVisible();
  await expect(page.getByText("Investimento previsto")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("R$");
  await semRolagemHorizontal(page);
});

// ------------------------------------------------------------------------------------------------------------------
// Escritório ponta a ponta
// ------------------------------------------------------------------------------------------------------------------

test("Escritório ponta a ponta: envia e aprova a proposta, recebe, estorna e cancela a obra", async ({ page }) => {
  await comoEscritorio(page);

  // Enviar e aprovar (a proposta rascunho foi criada com itens e cronograma pelo preparo do teste).
  await page.goto(`/propostas/${proposta.propostaId}`);
  await page.getByRole("button", { name: "Marcar como enviada" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Marcar como enviada" }).click();
  await expect(toast(page, "marcada como enviada")).toBeVisible();
  await aguardarAvisosSumirem(page);
  await page.getByRole("button", { name: "Aprovar", exact: true }).click();
  await dialogo(page).getByLabel("Forma do aceite").selectOption("WHATSAPP");
  await dialogo(page).getByLabel("Data do aceite").fill("2020-06-10");
  await dialogo(page).getByRole("button", { name: "Aprovar proposta" }).click();
  await expect(toast(page, "aprovada")).toBeVisible();
  await aguardarAvisosSumirem(page);
  expect((await estadoDaObraDeTeste(proposta.projetoId)).status).toBe("APROVADO");

  // Receber o sinal (conta financeira própria do teste).
  await page.goto("/financeiro/contas");
  await page.getByRole("button", { name: /Nova conta|Cadastrar a primeira conta/ }).first().click();
  await page.getByLabel("Nome").fill(NOME_DA_CONTA);
  await page.getByRole("button", { name: "Cadastrar conta" }).click();
  await expect(toast(page, "Conta cadastrada.")).toBeVisible();

  await page.goto(`/financeiro/receber?busca=${encodeURIComponent(proposta.titulo)}`);
  await page.getByRole("link", { name: "Sinal" }).click();
  await page.getByRole("button", { name: "Registrar recebimento" }).click();
  await dialogo(page).getByRole("button", { name: /Receber o saldo todo/ }).click();
  await dialogo(page).getByLabel("Conta onde entrou").selectOption({ label: NOME_DA_CONTA });
  await dialogo(page).getByRole("button", { name: "Registrar recebimento" }).click();
  await expect(toast(page, "parcela quitada")).toBeVisible();
  await aguardarAvisosSumirem(page);

  // Estornar o recebimento.
  await page.getByRole("link", { name: /R\$\s?6\.400,00 em/ }).click();
  await page.getByRole("button", { name: "Estornar" }).click();
  await page.getByLabel("Motivo").fill("Pix devolvido");
  await page.getByRole("button", { name: "Estornar", exact: true }).last().click();
  await expect(toast(page, "Lançamento estornado.")).toBeVisible();
  await expect(page.getByText("Estornado em")).toBeVisible();

  // Cancelar a obra: prévia, motivo obrigatório e a obra vai para "Cancelado" sem anular a venda.
  await page.goto(`/obras/${proposta.projetoId}`);
  await page.getByRole("button", { name: "Cancelar a obra" }).click();
  await expect(dialogo(page).getByText("O que vai mudar")).toBeVisible();
  await expect(dialogo(page).getByText(/parcelas a receber serão canceladas/)).toBeVisible();
  const confirmar = dialogo(page).getByRole("button", { name: "Cancelar a obra" });
  await expect(confirmar).toBeDisabled(); // sem motivo não confirma
  await dialogo(page).getByLabel("Motivo do cancelamento da obra").fill("O cliente desistiu da obra");
  await confirmar.click();
  await expect(toast(page, "cancelada")).toBeVisible();
  await expect(page).toHaveURL(/\/obras$/);
  expect((await estadoDaObraDeTeste(proposta.projetoId)).status).toBe("CANCELADO");

  // A venda continua: o relatório de vendas de junho de 2020 ainda lista a proposta aprovada.
  await page.goto("/relatorios/vendas?mes=2020-06");
  await page.locator('section[aria-label="Resumo das vendas"]').waitFor();
  await expect(page.getByRole("table", { name: "Propostas aprovadas no período" }).getByRole("row").filter({ hasText: proposta.numero })).toHaveCount(1);
});

// ------------------------------------------------------------------------------------------------------------------
// Tela de permissões (como Dono/Gestão, sobre o usuário Campo de teste)
// ------------------------------------------------------------------------------------------------------------------

test("Dono: ajusta o acesso do Campo na tela de permissões (prévia ao vivo, grava, volta ao padrão) e o perfil vira rótulo", async ({ page }) => {
  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
  await page.goto("/configuracoes/usuarios");
  const linhaDoCampo = page.locator("li").filter({ hasText: USUARIO_E2E_CAMPO.nome }).filter({ hasText: /Último acesso|Nunca acessou/ });
  await expect(linhaDoCampo).toContainText("Campo"); // selo do perfil
  await expect(linhaDoCampo).not.toContainText("Ajustes personalizados");

  const abrir = async () => {
    await page.getByRole("button", { name: `Ações de ${USUARIO_E2E_CAMPO.nome}` }).click();
    await page.getByRole("menuitem", { name: "Permissões" }).click();
    await expect(dialogo(page).getByRole("heading", { name: `Permissões de ${USUARIO_E2E_CAMPO.nome}` })).toBeVisible();
  };
  const previa = () => dialogo(page).getByRole("list", { name: "Menu desta pessoa" });

  await abrir();
  // Prévia do perfil Campo: agenda, clientes e obras; sem Financeiro; sem valores.
  await expect(previa()).toContainText("Agenda e tarefas");
  await expect(previa()).toContainText("Obras");
  await expect(previa()).not.toContainText("Financeiro");
  await expect(dialogo(page).getByText("Valores: não vê")).toBeVisible();

  // Ajuste por módulo: Financeiro "Pode ver" + valores; a prévia muda na hora e o custo só liga com valores.
  await expect(dialogo(page).getByLabel("Pode ver custo dos materiais e margem das obras")).toBeDisabled();
  await dialogo(page).getByLabel("Acesso a Financeiro").selectOption("VER");
  await dialogo(page).getByLabel(/^Pode ver valores/).check();
  await expect(previa()).toContainText("Financeiro");
  await expect(dialogo(page).getByText("Valores: vê")).toBeVisible();
  await dialogo(page).getByRole("button", { name: "Salvar permissões" }).click();
  await expect(toast(page, "Permissões atualizadas")).toBeVisible();
  await aguardarAvisosSumirem(page);

  const salvo = await perfilDoUsuario(USUARIO_E2E_CAMPO.login);
  expect(salvo?.papel).toBe("CAMPO");
  expect(salvo?.ajustesPermissao).toEqual({ modulos: { FINANCEIRO: { nivel: "VER", destrutivo: false } }, verValores: true });
  expect(salvo?.versaoSessao).toBeGreaterThan(1); // a sessão da pessoa cai e vale na hora
  await expect(linhaDoCampo).toContainText("Ajustes personalizados");

  // Voltar ao padrão do perfil apaga o ajuste (perfil puro).
  await abrir();
  await dialogo(page).getByRole("button", { name: "Voltar ao padrão do perfil" }).click();
  await expect(previa()).not.toContainText("Financeiro");
  await dialogo(page).getByRole("button", { name: "Salvar permissões" }).click();
  await expect(toast(page, "Permissões atualizadas")).toBeVisible();
  await expect.poll(async () => (await perfilDoUsuario(USUARIO_E2E_CAMPO.login))?.ajustesPermissao ?? null).toBeNull();
  await expect(linhaDoCampo).not.toContainText("Ajustes personalizados");
  await semRolagemHorizontal(page);
});
