import { expect, test, type Page } from "@playwright/test";

import { alertaDeFormulario, aguardarAvisosSumirem, entrarEEsperarPainel, semRolagemHorizontal, toast } from "./ajudantes";
import {
  buscarAuditoriaFeitaPeloE2E,
  lerCampoConfiguracao,
  obterModeloTexto,
  prepararUsuarioE2E,
  restaurarConfiguracao,
  restaurarModeloTexto,
  tirarSnapshotConfiguracao,
  type ModeloTextoLinha,
  type SnapshotConfiguracao,
} from "./banco";
import { ipFalso, USUARIO_E2E } from "./dados";

// PNG de 1x1 pixel (logo de teste).
const PNG_1X1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

test.describe("empresa, logo e auditoria", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(61) } });

  let original: SnapshotConfiguracao = null;
  let margemOriginal: unknown = null;

  test.beforeAll(async () => {
    original = await tirarSnapshotConfiguracao();
    margemOriginal = await lerCampoConfiguracao("margemMinimaAlertaPercentual");
    await prepararUsuarioE2E({ senhaDefinitiva: true });
  });

  // Os testes alteram a configuração REAL da empresa: sempre restaura o estado original.
  test.afterAll(async () => {
    await restaurarConfiguracao(original);
  });

  test.beforeEach(async ({ page }) => {
    await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
  });

  test("mostra os valores informados pelo dono e não pede alíquota nem limite do Simples", async ({ page }) => {
    await page.goto("/configuracoes/empresa");
    await expect(page.getByText("Defina a alíquota do Simples")).toHaveCount(0);
    await expect(page.getByLabel("Alíquota efetiva do Simples")).toHaveCount(0);
    await expect(page.getByLabel("Limite anual do Simples Nacional")).toHaveCount(0);
    // Financeiro: parâmetros editáveis com os padrões.
    await expect(page.getByLabel("Vence em breve: próximos")).toHaveValue("7");
    await expect(page.getByLabel("Gerar contas recorrentes para os próximos")).toHaveValue("3");
    // Regra do dono: markup 80%, 100% para vidro temperado/guarda-corpo e 5% de acréscimo com nota.
    await expect(page.getByLabel("Markup padrão sobre o custo")).toHaveValue("80");
    await expect(page.getByLabel("Markup de vidro temperado e guarda-corpo")).toHaveValue("100");
    await expect(page.getByLabel("Acréscimo quando a venda é com nota fiscal")).toHaveValue("5");
    // Dados reais da empresa vêm do seed e do banco, não do código.
    await expect(page.getByLabel("CNPJ")).toHaveValue("37.323.333/0001-61");
  });

  test("valida no servidor: CNPJ inválido e percentuais fora do limite", async ({ page }) => {
    await page.goto("/configuracoes/empresa");
    await page.getByLabel("CNPJ").fill("11.111.111/1111-11");
    await page.getByLabel("Margem mínima de alerta").fill("60");
    await page.getByLabel("Markup padrão sobre o custo").fill("1500");
    await page.getByRole("button", { name: "Salvar configurações" }).click();

    await expect(page.locator("form").getByText("CNPJ inválido.")).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: "Corrija os campos destacados." })).toBeVisible();

    // Regressão: o React 19 limpava os campos após o erro; o que a pessoa digitou tem que permanecer.
    await expect(page.getByLabel("CNPJ")).toHaveValue("11.111.111/1111-11");
    await expect(page.getByLabel("Margem mínima de alerta")).toHaveValue("60");
    await expect(page.getByLabel("Markup padrão sobre o custo")).toHaveValue("1500");

    // Corrigido o CNPJ, o markup acima de 1.000% continua sendo recusado.
    await page.getByLabel("CNPJ").fill("37.323.333/0001-61");
    await page.getByRole("button", { name: "Salvar configurações" }).click();
    await expect(page.locator("#markupPadraoPb-erro")).toContainText("Markup padrão: informe um percentual");
    // Nada foi salvo: a margem mínima segue como estava antes do teste.
    expect(String(await lerCampoConfiguracao("margemMinimaAlertaPercentual"))).toBe(String(margemOriginal));
  });

  test("salva, mostra mensagem de sucesso, persiste e registra a auditoria", async ({ page }) => {
    await page.goto("/configuracoes/empresa");
    await semRolagemHorizontal(page);
    await page.getByLabel("Cargo na assinatura").fill("Cargo E2E");
    await page.getByLabel("Margem mínima de alerta").fill("6,5");
    await page.getByLabel("Vence em breve: próximos").fill("10");
    await page.getByRole("button", { name: "Salvar configurações" }).click();
    await expect(toast(page, "Configurações salvas.")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Cargo na assinatura")).toHaveValue("Cargo E2E");
    await expect(page.getByLabel("Margem mínima de alerta")).toHaveValue("6,5");
    await expect(page.getByLabel("Vence em breve: próximos")).toHaveValue("10");

    // No banco: percentual como decimal, parâmetro do financeiro como inteiro e telefone normalizado em E.164.
    expect(String(await lerCampoConfiguracao("margemMinimaAlertaPercentual"))).toBe("6.50");
    expect(await lerCampoConfiguracao("diasAlertaVencimento")).toBe(10);
    expect(await lerCampoConfiguracao("telefone")).toBe("+5522999583288");

    const logs = await buscarAuditoriaFeitaPeloE2E("ConfiguracaoEmpresa", "ATUALIZAR");
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(logs[0].depois)).toContain("Cargo E2E");
  });

  test("troca o logo: envia a imagem ao Storage privado e passa a exibi-la", async ({ page }) => {
    await page.goto("/configuracoes/empresa");
    await page.getByTestId("entrada-logo").setInputFiles({ name: "logo-e2e.png", mimeType: "image/png", buffer: PNG_1X1 });
    await expect(toast(page, "Logo atualizado.")).toBeVisible({ timeout: 40_000 });
    await expect(page.getByAltText("Logo atual da empresa")).toBeVisible({ timeout: 20_000 });

    const caminho = String(await lerCampoConfiguracao("logoCaminho"));
    expect(caminho).toMatch(/^ConfiguracaoEmpresa\/singleton\/[0-9a-f-]{36}\.png$/);

    // O logo aparece no menu (URL assinada de curta duração do bucket privado).
    const urlDoLogo = await page.getByAltText("Logo atual da empresa").getAttribute("src");
    expect(urlDoLogo).toContain("supabase.co");
    expect(urlDoLogo).toContain("token=");
  });

  test("recusa arquivo que não é imagem como logo", async ({ page }) => {
    await page.goto("/configuracoes/empresa");
    await page.getByTestId("entrada-logo").setInputFiles({ name: "doc.txt", mimeType: "text/plain", buffer: Buffer.from("texto") });
    await expect(toast(page, /imagem|Tipo de arquivo/)).toBeVisible({ timeout: 40_000 });
  });

  test("a auditoria lista a alteração com filtros, detalhes e exportação CSV", async ({ page }) => {
    await page.goto("/configuracoes/auditoria?entidade=ConfiguracaoEmpresa");
    await expect(page.locator("ul li").filter({ hasText: USUARIO_E2E.nome }).first()).toBeVisible();
    await expect(page.getByText(/alterou/).first()).toBeVisible();
    await semRolagemHorizontal(page);

    await page.getByText("Ver alterações").first().click();
    await expect(page.locator("pre").first()).toBeVisible();

    // Filtros: uma ação que não existe para essa entidade mostra o estado vazio com orientação.
    await page.goto("/configuracoes/auditoria?entidade=ConfiguracaoEmpresa&acao=EXCLUIR");
    await expect(page.getByText("Nada encontrado com esses filtros")).toBeVisible();
    await page.getByRole("link", { name: "Limpar filtros" }).click();
    await expect(page).toHaveURL(/\/configuracoes\/auditoria$/);

    // Exportação CSV com os filtros da tela.
    await page.goto("/configuracoes/auditoria?entidade=ConfiguracaoEmpresa");
    const href = await page.getByRole("link", { name: "Exportar CSV" }).getAttribute("href");
    expect(href).toContain("entidade=ConfiguracaoEmpresa");
    const csv = await page.request.get(href!);
    expect(csv.status()).toBe(200);
    expect(csv.headers()["content-type"]).toContain("text/csv");
    expect(csv.headers()["content-disposition"]).toContain("auditoria.csv");
    const texto = await csv.text();
    expect(texto.startsWith("﻿Data e hora;Usuário;Entidade;ID;Ação;Antes;Depois;IP")).toBe(true);
    expect(texto).toContain("ConfiguracaoEmpresa");
    expect(texto).not.toMatch(/\$2[aby]\$/);
  });
});

test.describe("catálogos", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(62) } });

  test.beforeAll(async () => {
    await prepararUsuarioE2E({ senhaDefinitiva: true });
  });

  test.beforeEach(async ({ page }) => {
    await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
  });

  const item = (page: Page, nome: string) => page.locator("ul li").filter({ hasText: nome });

  async function adicionar(page: Page, nome: string) {
    await page.getByLabel("Nome").first().fill(nome);
    await page.getByRole("button", { name: "Adicionar" }).click();
  }

  async function adicionarEspessura(page: Page, valor: string) {
    await page.getByLabel(/Espessura/).first().fill(valor);
    await page.getByRole("button", { name: "Adicionar" }).click();
  }

  test("adicionar, ordenar, editar e desativar uma linha de alumínio", async ({ page }) => {
    await page.goto("/configuracoes/catalogos?c=linhas");
    await semRolagemHorizontal(page);
    // As linhas da seed estão presentes.
    await expect(item(page, "Suprema")).toBeVisible();

    await adicionar(page, "E2E Linha A");
    await expect(toast(page, "Item adicionado.")).toBeVisible();
    await expect(item(page, "E2E Linha A")).toBeVisible();
    await adicionar(page, "E2E Linha B");
    await expect(item(page, "E2E Linha B")).toBeVisible();

    // B nasce depois de A; "Subir" troca os dois de lugar.
    const textos = async () => page.locator("ul li").allTextContents();
    let lista = await textos();
    expect(lista.findIndex((t) => t.includes("E2E Linha A"))).toBeLessThan(lista.findIndex((t) => t.includes("E2E Linha B")));
    await page.getByRole("button", { name: "Subir E2E Linha B" }).click();
    await expect.poll(async () => {
      lista = await textos();
      return lista.findIndex((t) => t.includes("E2E Linha B")) < lista.findIndex((t) => t.includes("E2E Linha A"));
    }).toBe(true);

    // Nome repetido é recusado.
    await adicionar(page, "E2E Linha B");
    await expect(alertaDeFormulario(page)).toContainText("Já existe um item com esse nome.");

    // Editar.
    await page.getByRole("button", { name: "Editar E2E Linha A" }).click();
    const dialogo = page.getByRole("dialog");
    await dialogo.getByLabel("Nome").fill("E2E Linha A2");
    await dialogo.getByRole("button", { name: "Salvar" }).click();
    await expect(item(page, "E2E Linha A2")).toBeVisible();

    // Desativar: o item fica na lista como inativo (nada é apagado).
    // No celular os avisos temporários cobrem o fim da lista e interceptam o clique: espera sumirem.
    await aguardarAvisosSumirem(page);
    await page.getByRole("button", { name: "Desativar E2E Linha A2" }).click();
    await expect(item(page, "E2E Linha A2")).toContainText("Inativo");
    await aguardarAvisosSumirem(page);
    await page.getByRole("button", { name: "Ativar E2E Linha A2" }).click();
    await expect(item(page, "E2E Linha A2")).not.toContainText("Inativo");
  });

  test("nome vazio é rejeitado e catálogo inexistente cai no primeiro", async ({ page }) => {
    await page.goto("/configuracoes/catalogos?c=nao-existe");
    await expect(page.getByRole("heading", { name: "Linhas de alumínio" })).toBeVisible();
    await page.getByLabel("Nome").first().fill("   ");
    await page.getByRole("button", { name: "Adicionar" }).click();
    await expect(page.getByText("Informe o nome.").first()).toBeVisible();
  });

  test("espessura de vidro exige número em milímetros", async ({ page }) => {
    await page.goto("/configuracoes/catalogos?c=espessuras-vidro");
    await expect(item(page, "6 mm")).toBeVisible();
    await adicionarEspessura(page, "abc");
    await expect(page.getByText("Informe a espessura em milímetros")).toBeVisible();
    await adicionarEspessura(page, "99");
    await expect(item(page, "99 mm")).toBeVisible();
  });

  test("categoria financeira pede o tipo e mostra receita ou despesa", async ({ page }) => {
    await page.goto("/configuracoes/catalogos?c=categorias-financeiras");
    await page.getByLabel("Nome").first().fill("E2E Categoria");
    await page.getByRole("button", { name: "Adicionar" }).click();
    // O select "Tipo" é obrigatório: o navegador barra o envio antes de chegar ao servidor.
    expect(await page.getByLabel("Tipo").evaluate((el: HTMLSelectElement) => el.validity.valueMissing)).toBe(true);
    await expect(item(page, "E2E Categoria")).toHaveCount(0);

    await page.getByLabel("Nome").first().fill("E2E Categoria");
    await page.getByLabel("Tipo").selectOption("DESPESA");
    // O grupo do DRE é uma lista fixa e acompanha o tipo: despesa não oferece grupo de receita.
    await expect(page.getByLabel("Grupo no DRE").locator("option", { hasText: "Receitas operacionais" })).toHaveCount(0);
    await page.getByLabel("Grupo no DRE").selectOption("DESPESAS_FIXAS");
    await page.getByRole("button", { name: "Adicionar" }).click();
    await expect(item(page, "E2E Categoria")).toContainText("Despesa");
    await expect(item(page, "E2E Categoria")).toContainText("DRE: Despesas fixas");
  });

  test("motivo de bloqueio guarda se é justificado", async ({ page }) => {
    await page.goto("/configuracoes/catalogos?c=motivos-bloqueio");
    await expect(item(page, "Alvenaria não pronta")).toContainText("Justificado");
    await expect(item(page, "Aguardando fornecedor")).not.toContainText("Justificado");
  });
});

test.describe("feriados e férias", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(63) } });

  test.beforeAll(async () => {
    await prepararUsuarioE2E({ senhaDefinitiva: true });
  });

  test.beforeEach(async ({ page }) => {
    await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
  });

  const item = (page: Page, nome: string) => page.locator("ul li").filter({ hasText: nome });

  test("o seed traz os feriados nacionais do ano", async ({ page }) => {
    await page.goto("/configuracoes/feriados?ano=2026");
    await expect(item(page, "Tiradentes")).toContainText("21/04/2026");
    await expect(item(page, "Natal")).toContainText("25/12/2026");
    // Carnaval é ponto facultativo: aparece como aviso, sem descontar dias úteis.
    await expect(item(page, "Carnaval (terça-feira, ponto facultativo)")).toContainText("17/02/2026");
    await expect(item(page, "Carnaval (terça-feira, ponto facultativo)")).toContainText("Aviso");
    await semRolagemHorizontal(page);
  });

  test("cadastrar feriado, férias coletivas com período, validar, desativar e remover", async ({ page }) => {
    await page.goto("/configuracoes/feriados?ano=2031");
    await expect(page.getByText("Nada cadastrado em 2031")).toBeVisible();

    await page.getByLabel(/^Data/).fill("2031-03-10");
    await page.getByLabel("Nome").fill("E2E Feriado");
    await page.getByRole("button", { name: "Adicionar" }).click();
    await expect(item(page, "E2E Feriado")).toContainText("10/03/2031");

    // Férias coletivas pedem o fim do período.
    await page.getByLabel("Tipo").selectOption("FERIAS_COLETIVA_FORNECEDORES");
    await page.getByLabel("Início").fill("2031-12-20");
    await page.getByLabel("Nome").fill("E2E Férias");
    await page.getByLabel("Fim do período").fill("2031-12-10");
    await page.getByRole("button", { name: "Adicionar" }).click();
    await expect(page.getByText("A data final não pode ser antes da data inicial.")).toBeVisible();
    await page.getByLabel("Fim do período").fill("2031-12-31");
    await page.getByRole("button", { name: "Adicionar" }).click();
    await expect(item(page, "E2E Férias")).toContainText("20/12/2031 a 31/12/2031");
    await expect(item(page, "E2E Férias")).toContainText("Férias coletivas");

    // Duplicado (mesma data e nome) é recusado.
    await page.getByLabel("Tipo").selectOption("FERIADO");
    await page.getByLabel(/^Data/).fill("2031-03-10");
    await page.getByLabel("Nome").fill("E2E Feriado");
    await page.getByRole("button", { name: "Adicionar" }).click();
    await expect(alertaDeFormulario(page)).toContainText("Já existe um feriado com essa data e esse nome.");

    // Desativar e reativar.
    await page.getByRole("button", { name: "Desativar E2E Feriado" }).click();
    await expect(item(page, "E2E Feriado")).toContainText("Inativo");
    await page.getByRole("button", { name: "Ativar E2E Feriado" }).click();
    await expect(item(page, "E2E Feriado")).not.toContainText("Inativo");

    // Remover pede confirmação.
    await page.getByRole("button", { name: "Remover E2E Feriado" }).click();
    await expect(page.getByRole("alertdialog")).toContainText("Remover “E2E Feriado”?");
    await page.getByRole("alertdialog").getByRole("button", { name: "Remover" }).click();
    await expect(item(page, "E2E Feriado")).toHaveCount(0);
  });
});

test.describe("modelos de texto", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(64) } });

  let original: ModeloTextoLinha;

  test.beforeAll(async () => {
    original = await obterModeloTexto("whatsapp.follow_up");
    await prepararUsuarioE2E({ senhaDefinitiva: true });
  });

  test.afterAll(async () => {
    await restaurarModeloTexto(original);
  });

  test("lista os modelos da seed e edita um (com as variáveis em destaque)", async ({ page }) => {
    await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
    await page.goto("/configuracoes/modelos-texto");
    await semRolagemHorizontal(page);
    await expect(page.getByRole("heading", { name: "Notas da proposta" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Mensagens de WhatsApp" })).toBeVisible();

    await page.getByRole("button", { name: `Editar ${original.titulo}` }).click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo.locator("code").filter({ hasText: /cliente/ })).toBeVisible();
    await dialogo.getByLabel("Título").fill("E2E Título novo");
    await dialogo.getByRole("button", { name: "Salvar" }).click();
    await expect(toast(page, "Modelo salvo.")).toBeVisible();
    await expect(page.getByText("E2E Título novo")).toBeVisible();

    // Texto vazio é recusado.
    await page.getByRole("button", { name: "Editar E2E Título novo" }).click();
    await page.getByRole("dialog").locator("#conteudo").fill("   ");
    await page.getByRole("dialog").getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByRole("dialog")).toContainText("O texto não pode ficar vazio.");
  });
});
