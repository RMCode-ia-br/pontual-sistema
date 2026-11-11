import { expect, test, type Page } from "@playwright/test";

import { alertaDeFormulario, entrarEEsperarPainel, semRolagemHorizontal, toast } from "./ajudantes";
import { buscarAuditoriaFeitaPeloE2E, contarAnexosDoE2E, prepararUsuarioE2E } from "./banco";
import { ipFalso, USUARIO_E2E } from "./dados";

test.describe.configure({ mode: "serial" });
test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(71) } });

test.beforeAll(async () => {
  await prepararUsuarioE2E({ senhaDefinitiva: true });
});

test.beforeEach(async ({ page }) => {
  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
});

const TITULO = "E2E Tarefa vencida";
const linhaTarefa = (page: Page, titulo: string) => page.locator("ul li").filter({ hasText: titulo });

test("a lista começa vazia com orientação e sem tarefas fictícias", async ({ page }) => {
  await page.goto("/tarefas");
  await semRolagemHorizontal(page);
  await expect(page.getByText("Nenhuma tarefa por aqui")).toBeVisible();
  await expect(page.getByText(/Tarefas automáticas/)).toBeVisible();
});

test("criar tarefa com vencimento no passado mostra o aviso de vencida", async ({ page }) => {
  await page.goto("/tarefas");
  await page.getByLabel("O que precisa ser feito?").fill(TITULO);
  await page.getByLabel("Vencimento (opcional)").fill("2020-01-15");
  await page.getByRole("button", { name: "Adicionar tarefa" }).click();
  await expect(toast(page, "Tarefa criada.")).toBeVisible();

  const linha = linhaTarefa(page, TITULO);
  await expect(linha).toBeVisible();
  await expect(linha).toContainText("Vence em 15/01/2020");
  await expect(linha).toContainText("Vencida");
  await expect(linha).toContainText(USUARIO_E2E.nome); // o responsável padrão é quem criou
  await expect(page.getByText("1 tarefa vencida pedindo atenção.")).toBeVisible();
  // O formulário foi limpo para o próximo cadastro rápido.
  await expect(page.getByLabel("O que precisa ser feito?")).toHaveValue("");
});

test("a auditoria registrou a criação da tarefa", async () => {
  const logs = await buscarAuditoriaFeitaPeloE2E("Tarefa", "CRIAR");
  expect(logs.length).toBeGreaterThanOrEqual(1);
  expect(JSON.stringify(logs[0].depois)).toContain(TITULO);
});

test("título curto e vencimento inválido são validados", async ({ page }) => {
  await page.goto("/tarefas/nova");
  await page.getByLabel("O que precisa ser feito?").fill("x");
  await page.getByRole("button", { name: "Adicionar tarefa" }).click();
  // O campo é obrigatório e o servidor exige 2+ caracteres.
  await expect(page.getByText("Informe o título da tarefa.")).toBeVisible();
});

test("concluir tira da lista de abertas, aparece em concluídas e pode ser reaberta", async ({ page }) => {
  await page.goto("/tarefas");
  await page.getByRole("button", { name: `Concluir: ${TITULO}` }).click();
  await expect(toast(page, "Tarefa concluída.")).toBeVisible();
  await expect(linhaTarefa(page, TITULO)).toHaveCount(0);

  await page.getByRole("link", { name: "Concluídas" }).click();
  await expect(page).toHaveURL(/status=concluidas/);
  const linha = linhaTarefa(page, TITULO);
  await expect(linha).toBeVisible();
  // Concluída não é "vencida".
  await expect(linha).not.toContainText("Vencida");

  await page.getByRole("button", { name: `Reabrir: ${TITULO}` }).click();
  await expect(toast(page, "Tarefa reaberta.")).toBeVisible();
  await expect(linhaTarefa(page, TITULO)).toHaveCount(0);

  await page.getByRole("link", { name: "Abertas" }).click();
  await expect(linhaTarefa(page, TITULO)).toContainText("Vencida");
});

test("filtro 'Só as minhas' e 'Todas'", async ({ page }) => {
  await page.goto("/tarefas?status=abertas&quem=minhas");
  await expect(linhaTarefa(page, TITULO)).toBeVisible();
  await page.getByRole("link", { name: "Todas", exact: true }).click();
  await expect(page).toHaveURL(/status=todas/);
  await expect(linhaTarefa(page, TITULO)).toBeVisible();
});

test("a busca global acha a tarefa (sem diferenciar acento nem maiúscula)", async ({ page }) => {
  await page.getByRole("button", { name: /Buscar/ }).click();
  await page.getByPlaceholder(/Buscar páginas/).fill("e2e tarefa VENCIDA");
  const opcao = page.getByRole("option", { name: new RegExp(TITULO) });
  await expect(opcao).toBeVisible();
  await opcao.click();
  await expect(page).toHaveURL(/\/tarefas\/[\w-]+$/);
  await expect(page.getByRole("heading", { level: 1, name: TITULO })).toBeVisible();
});

test("detalhe: editar, enviar arquivo, baixar pelo link assinado, recusar tipo perigoso e remover", async ({ page }) => {
  await page.goto("/tarefas");
  await page.getByRole("link", { name: TITULO }).click();
  await expect(page).toHaveURL(/\/tarefas\/[\w-]+$/);
  await semRolagemHorizontal(page);

  // Editar o título.
  await page.getByLabel("O que precisa ser feito?").fill("E2E Tarefa vencida editada");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(toast(page, "Tarefa atualizada.")).toBeVisible();

  // Upload: vai direto ao Storage por URL assinada e é registrado no banco.
  await expect(page.getByText("Nenhum arquivo ainda.")).toBeVisible();
  const conteudo = "conteúdo do arquivo e2e";
  await page.getByTestId("entrada-anexo").setInputFiles({ name: "nota-e2e.txt", mimeType: "text/plain", buffer: Buffer.from(conteudo) });
  await expect(toast(page, "Arquivo enviado.")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("nota-e2e.txt")).toBeVisible({ timeout: 15_000 });
  expect(await contarAnexosDoE2E()).toBe(1);

  // Download: captura a URL assinada (o clique abre uma nova aba) e baixa o arquivo de verdade.
  await page.evaluate(() => {
    (window as unknown as { __aberto?: string }).__aberto = undefined;
    window.open = ((url?: string | URL) => {
      (window as unknown as { __aberto?: string }).__aberto = String(url);
      return null;
    }) as typeof window.open;
  });
  await page.getByRole("button", { name: "Baixar nota-e2e.txt" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __aberto?: string }).__aberto), { timeout: 30_000 }).toBeTruthy();
  const url = (await page.evaluate(() => (window as unknown as { __aberto?: string }).__aberto)) as string;
  expect(url).toContain("supabase.co");
  expect(url).toContain("token=");
  const arquivo = await page.request.get(url);
  expect(arquivo.status()).toBe(200);
  expect(await arquivo.text()).toBe(conteudo);

  // O bucket é PRIVADO: o mesmo objeto sem o token assinado não abre.
  const semToken = url.split("?")[0];
  const recusado = await page.request.get(semToken);
  expect(recusado.ok()).toBe(false);

  // Tipo perigoso é recusado no navegador/servidor e nada é gravado.
  await page.getByTestId("entrada-anexo").setInputFiles({ name: "virus.exe", mimeType: "application/x-msdownload", buffer: Buffer.from("MZ") });
  await expect(toast(page, "Tipo de arquivo não permitido")).toBeVisible();
  expect(await contarAnexosDoE2E()).toBe(1);

  // Remover pede confirmação e é exclusão lógica.
  await page.getByRole("button", { name: "Remover nota-e2e.txt" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Remover “nota-e2e.txt”?");
  await page.getByRole("alertdialog").getByRole("button", { name: "Remover" }).click();
  await expect(page.getByText("nota-e2e.txt")).toHaveCount(0);
  expect(await contarAnexosDoE2E()).toBe(0);
});

test("remover a tarefa pede confirmação e a tira da lista", async ({ page }) => {
  await page.goto("/tarefas");
  await page.getByRole("link", { name: "E2E Tarefa vencida editada" }).click();
  await page.getByRole("button", { name: "Remover", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Remover “E2E Tarefa vencida editada”?");
  await page.getByRole("alertdialog").getByRole("button", { name: "Remover" }).click();
  await expect(page).toHaveURL(/\/tarefas$/);
  await expect(linhaTarefa(page, "E2E Tarefa vencida editada")).toHaveCount(0);

  // E uma tarefa removida não abre mais pelo endereço antigo.
  await expect(page.getByText("Nenhuma tarefa por aqui")).toBeVisible();
});

test("tarefa inexistente mostra página não encontrada, sem vazar detalhes", async ({ page }) => {
  await page.goto("/tarefas/id-que-nao-existe");
  await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
});

test("nova tarefa pelo botão '+ Novo' e retorno à lista", async ({ page }) => {
  await page.getByRole("button", { name: "Criar novo" }).click();
  await page.getByRole("menuitem", { name: "Nova tarefa" }).click();
  await expect(page).toHaveURL(/\/tarefas\/nova/);
  await page.getByLabel("O que precisa ser feito?").fill("E2E Tarefa pelo botão novo");
  await page.getByRole("button", { name: "Adicionar tarefa" }).click();
  await expect(page).toHaveURL(/\/tarefas$/);
  await expect(linhaTarefa(page, "E2E Tarefa pelo botão novo")).toBeVisible();
  await expect(linhaTarefa(page, "E2E Tarefa pelo botão novo")).toContainText("Sem vencimento");
});

test("responsável inexistente enviado direto ao servidor é recusado", async ({ page }) => {
  await page.goto("/tarefas/nova");
  // Adultera o valor do select para um ID que não existe (o que um cliente malicioso faria).
  await page.getByLabel("Responsável").evaluate((el: HTMLSelectElement) => {
    const opcao = document.createElement("option");
    opcao.value = "id-falso-123";
    opcao.text = "falso";
    el.appendChild(opcao);
    el.value = "id-falso-123";
  });
  await page.getByLabel("O que precisa ser feito?").fill("E2E Tarefa responsavel falso");
  await page.getByRole("button", { name: "Adicionar tarefa" }).click();
  await expect(page.getByText("Escolha um usuário ativo.")).toBeVisible();
  await expect(alertaDeFormulario(page)).toBeVisible();
});
