import { expect, test, type Page } from "@playwright/test";

import { aguardarAvisosSumirem, capturar, entrarEEsperarPainel, semRolagemHorizontal, toast } from "./ajudantes";
import { concluirEtapasAnterioresDaObra, criarMotivoDeBloqueioDeTeste, criarObraDeTeste, parcelasDaObra, prepararUsuarioE2E, tarefasDaObra } from "./banco";
import { ipFalso, USUARIO_E2E } from "./dados";

test.describe.configure({ mode: "serial" });
test.use({ extraHTTPHeaders: { "x-forwarded-for": ipFalso(94) } });

// Motivos de bloqueio do próprio teste (o dono pode renomear ou excluir os do catálogo); ambos justificados.
const MOTIVO_BLOQUEIO = "E2E Clima";
const MOTIVO_PAUSA = "E2E Alvenaria não pronta";

let obraId: string;
let obraSemEtapasId: string;

test.beforeAll(async () => {
  await prepararUsuarioE2E({ senhaDefinitiva: true });
  await criarMotivoDeBloqueioDeTeste(MOTIVO_BLOQUEIO, true);
  await criarMotivoDeBloqueioDeTeste(MOTIVO_PAUSA, true);
  obraId = await criarObraDeTeste("Fluxo");
  obraSemEtapasId = await criarObraDeTeste("Sem etapas", { semEtapas: true });
});

test.beforeEach(async ({ page }) => {
  await entrarEEsperarPainel(page, USUARIO_E2E.login, USUARIO_E2E.senhaNova);
});

const etapa = (page: Page, ordem: number, nome: string) => page.getByRole("listitem", { name: `Etapa ${ordem}: ${nome}` });
const dialogo = (page: Page) => page.getByRole("dialog");

test("obra sem prazo: avisa, mostra as 9 etapas pendentes e não rola na horizontal", async ({ page }) => {
  await page.goto(`/obras/${obraId}`);
  await expect(page.getByRole("heading", { name: "E2E Obra Fluxo", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Atenção" })).toBeVisible();
  await expect(page.getByText(/Defina o prazo da obra/).first()).toBeVisible();
  await semRolagemHorizontal(page);

  await page.getByRole("navigation", { name: "Seções da obra" }).getByRole("link", { name: "Etapas e prazo" }).click();
  await expect(page).toHaveURL(/aba=etapas/);
  await expect(page.getByRole("listitem", { name: /^Etapa \d: / })).toHaveCount(9);
  await expect(etapa(page, 1, "Medição exata")).toContainText("Pendente");
  await expect(etapa(page, 3, "Fabricação")).toContainText("Libera: Entrega do material (esquadrias)");
  await expect(etapa(page, 7, "Instalação dos vidros")).toContainText("Inicia a garantia");
  await expect(page.getByText("Sem prazo definido.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Recalcular datas" })).toHaveCount(0); // sem prazo, nada a calcular
  await semRolagemHorizontal(page);
  await capturar(page, "obra-etapas-sem-prazo");
});

test("definir o prazo sugere as datas e só aplica quando o gestor confirma", async ({ page }) => {
  await page.goto(`/obras/${obraId}?aba=etapas`);
  await page.getByRole("button", { name: "Definir prazo" }).click();
  await dialogo(page).getByLabel("Prazo total (dias)").fill("0");
  await dialogo(page).getByRole("button", { name: "Salvar prazo" }).click();
  await expect(dialogo(page).getByRole("alert")).toContainText("Use ao menos 1 dia.");

  await dialogo(page).getByLabel("Prazo total (dias)").fill("10");
  await dialogo(page).getByRole("button", { name: "Salvar prazo" }).click();
  await expect(toast(page, "Prazo da obra salvo")).toBeVisible();
  await aguardarAvisosSumirem(page);

  // As datas são SUGERIDAS: nada muda até aplicar.
  await expect(dialogo(page).getByRole("heading", { name: "Datas sugeridas" })).toBeVisible();
  await expect(dialogo(page).getByRole("listitem").filter({ hasText: "Fabricação" })).toContainText("sem data"); // de "sem data" para as datas novas
  await dialogo(page).getByRole("button", { name: "Aplicar datas" }).click();
  await expect(toast(page, "etapa(s) atualizadas")).toBeVisible();
  await aguardarAvisosSumirem(page);

  await expect(etapa(page, 3, "Fabricação")).toContainText("Previsto (provisório)");
  await expect(etapa(page, 3, "Fabricação")).not.toContainText("Sem data");
  await expect(page.getByText(/O prazo ainda não começou a contar/).first()).toBeVisible();
  await semRolagemHorizontal(page);
});

test("concluir a medição exata inicia o relógio; concluir a fabricação libera a parcela do material", async ({ page }) => {
  await page.goto(`/obras/${obraId}?aba=etapas`);

  await etapa(page, 1, "Medição exata").getByRole("button", { name: "Concluir: Medição exata" }).click();
  await expect(dialogo(page).getByText("O prazo da obra começa a contar a partir desta data.")).toBeVisible();
  await dialogo(page).getByRole("button", { name: "Concluir", exact: true }).click();
  await expect(toast(page, "Etapa concluída")).toBeVisible();
  await aguardarAvisosSumirem(page);
  // Se o sistema tiver datas definitivas diferentes das provisórias, sugere; o gestor mantém como está.
  if (await dialogo(page).isVisible()) await dialogo(page).getByRole("button", { name: "Manter como está" }).click();

  await expect(page.getByText("Começou a contar em")).toBeVisible();
  await expect(page.getByText("Prazo prometido", { exact: true })).toBeVisible();
  await expect(etapa(page, 1, "Medição exata")).toContainText("Concluída");

  // Parcelas por gatilho ainda aguardam.
  expect((await parcelasDaObra(obraId)).map((p) => p.status)).toEqual(["ABERTA", "AGUARDANDO_GATILHO", "AGUARDANDO_GATILHO"]);

  await etapa(page, 3, "Fabricação").getByRole("button", { name: "Concluir: Fabricação" }).click();
  await expect(dialogo(page).getByLabel("Vencimento da parcela liberada")).toBeVisible();
  await dialogo(page).getByRole("button", { name: "Concluir", exact: true }).click();
  await expect(toast(page, /1 parcela\(s\) liberada\(s\) para cobrança/)).toBeVisible();
  await aguardarAvisosSumirem(page);
  if (await dialogo(page).isVisible()) await dialogo(page).getByRole("button", { name: "Manter como está" }).click();

  const parcelas = await parcelasDaObra(obraId);
  expect(parcelas.map((p) => p.status)).toEqual(["ABERTA", "ABERTA", "AGUARDANDO_GATILHO"]);
  expect(parcelas[1].etapaId).not.toBeNull();
  expect((await tarefasDaObra(obraId)).filter((t) => t.tipo === "COBRAR_PARCELA")).toHaveLength(1);

  await page.getByRole("navigation", { name: "Seções da obra" }).getByRole("link", { name: "Parcelas", exact: true }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Entrega do material" })).toContainText("Em aberto");
  await expect(page.getByRole("listitem").filter({ hasText: "Vidros e instalação" })).toContainText("Aguarda a etapa “Instalação dos vidros”");
  await semRolagemHorizontal(page);
  await capturar(page, "obra-parcelas");

  // Reabrir a fabricação devolve a parcela ao aguardando.
  await page.goto(`/obras/${obraId}?aba=etapas`);
  await etapa(page, 3, "Fabricação").getByRole("button", { name: "Reabrir: Fabricação" }).click();
  await dialogo(page).getByRole("button", { name: "Reabrir", exact: true }).click();
  await expect(toast(page, /voltaram a aguardar a etapa/)).toBeVisible();
  await aguardarAvisosSumirem(page);
  expect((await parcelasDaObra(obraId)).map((p) => p.status)).toEqual(["ABERTA", "AGUARDANDO_GATILHO", "AGUARDANDO_GATILHO"]);
});

test("bloquear exige motivo; desbloquear limpa; a etapa não pode ser concluída bloqueada", async ({ page }) => {
  await page.goto(`/obras/${obraId}?aba=etapas`);
  const pedido = etapa(page, 2, "Pedido de material");

  await pedido.getByRole("button", { name: "Bloquear: Pedido de material" }).click();
  await dialogo(page).getByRole("button", { name: "Bloquear", exact: true }).click();
  await expect(dialogo(page).getByText("Escolha o motivo.").first()).toBeVisible(); // exige o motivo da lista
  await dialogo(page).getByLabel("Motivo do bloqueio").selectOption({ label: MOTIVO_BLOQUEIO });
  await dialogo(page).getByLabel("Detalhes (opcional)").fill("Chuva forte na semana");
  await dialogo(page).getByRole("button", { name: "Bloquear", exact: true }).click();
  await expect(toast(page, "Etapa bloqueada")).toBeVisible();
  await aguardarAvisosSumirem(page);

  await expect(pedido).toContainText(`Bloqueada: ${MOTIVO_BLOQUEIO} — Chuva forte na semana`);
  await expect(pedido.getByRole("button", { name: "Concluir: Pedido de material" })).toHaveCount(0); // desbloquear primeiro
  await expect(pedido.getByRole("button", { name: "Desbloquear: Pedido de material" })).toBeVisible();
  await capturar(page, "obra-etapa-bloqueada");

  await pedido.getByRole("button", { name: "Desbloquear: Pedido de material" }).click();
  await dialogo(page).getByRole("button", { name: "Desbloquear", exact: true }).click();
  await expect(toast(page, /Etapa/)).toBeVisible();
  await aguardarAvisosSumirem(page);
  await expect(pedido).not.toContainText("Bloqueada");
});

test("editar a etapa: datas incoerentes são recusadas e a equipe fica registrada", async ({ page }) => {
  await page.goto(`/obras/${obraId}?aba=etapas`);
  const instalacao = etapa(page, 4, "Instalação das esquadrias");
  await instalacao.getByRole("button", { name: "Editar: Instalação das esquadrias" }).click();
  await dialogo(page).getByLabel("Início previsto").fill("2030-05-10");
  await dialogo(page).getByLabel("Término previsto").fill("2030-05-01");
  await dialogo(page).getByRole("button", { name: "Salvar" }).click();
  await expect(dialogo(page).getByText("Use uma data a partir do início.")).toBeVisible();

  await dialogo(page).getByLabel("Término previsto").fill("2030-05-15");
  await dialogo(page).getByLabel("Observação (opcional)").fill("Levar andaime");
  await dialogo(page).getByRole("button", { name: "Salvar" }).click();
  await expect(toast(page, "Etapa atualizada")).toBeVisible();
  await aguardarAvisosSumirem(page);
  await expect(instalacao).toContainText("10/05/2030 a 15/05/2030");
  await expect(instalacao).toContainText("Levar andaime");
});

test("pausa: abrir, ver o efeito no prazo e encerrar; entrega só com a pausa encerrada", async ({ page }) => {
  await page.goto(`/obras/${obraId}?aba=etapas`);
  await page.getByRole("button", { name: "Pausar obra", exact: true }).click();
  await dialogo(page).getByLabel("Motivo").selectOption({ label: MOTIVO_PAUSA }); // o rótulo traz o asterisco de obrigatório
  await expect(dialogo(page).getByText("Pausa justificada: estende o prazo prometido.")).toBeVisible();
  await dialogo(page).getByRole("button", { name: "Pausar obra", exact: true }).click();
  await expect(toast(page, "Obra pausada")).toBeVisible();
  await aguardarAvisosSumirem(page);

  await expect(page.getByText("Em curso", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pausar obra", exact: true })).toBeDisabled(); // uma pausa por vez
  await capturar(page, "obra-pausa");

  // Não conclui a entrega com pausa em curso.
  await etapa(page, 9, "Entrega").getByRole("button", { name: "Concluir: Entrega" }).click();
  await dialogo(page).getByRole("button", { name: "Concluir", exact: true }).click();
  await expect(dialogo(page).getByRole("alert")).toContainText("Encerre a pausa em curso");
  await dialogo(page).getByRole("button", { name: "Cancelar" }).click();

  await page.getByRole("button", { name: "Encerrar pausa" }).click();
  await dialogo(page).getByRole("button", { name: "Encerrar pausa" }).click();
  await expect(toast(page, "Pausa encerrada")).toBeVisible();
  await aguardarAvisosSumirem(page);
  await expect(page.getByText("Em curso", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Pausar obra", exact: true })).toBeEnabled();
});

test("concluir a entrega conclui a obra, mostra a pontualidade e cria o pedido de avaliação", async ({ page }) => {
  await page.goto(`/obras/${obraId}?aba=etapas`);
  // Com etapas anteriores abertas, a entrega é recusada: cada uma é concluída ou dispensada de propósito.
  await etapa(page, 9, "Entrega").getByRole("button", { name: "Concluir: Entrega" }).click();
  await dialogo(page).getByRole("button", { name: "Concluir", exact: true }).click();
  await expect(dialogo(page).getByRole("alert")).toContainText("Antes de concluir a entrega, conclua ou dispense:");
  await dialogo(page).getByRole("button", { name: "Cancelar" }).click();

  await concluirEtapasAnterioresDaObra(obraId);
  await page.reload();
  await etapa(page, 9, "Entrega").getByRole("button", { name: "Concluir: Entrega" }).click();
  await dialogo(page).getByRole("button", { name: "Concluir", exact: true }).click();
  await expect(toast(page, "Obra concluída")).toBeVisible();
  await aguardarAvisosSumirem(page);

  await page.goto(`/obras/${obraId}`);
  await expect(page.getByText("Concluído", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Concluída em/)).toBeVisible();
  await expect(page.getByText(/^(Pontual|Atrasada): /).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Avaliação no Google" })).toBeVisible();
  await semRolagemHorizontal(page);
  await capturar(page, "obra-concluida");

  const tarefas = await tarefasDaObra(obraId);
  expect(tarefas.filter((t) => t.tipo === "PEDIR_AVALIACAO" && t.status === "ABERTA")).toHaveLength(1);

  // Reabrir a entrega volta a obra para Em execução e cancela o pedido de avaliação.
  await page.goto(`/obras/${obraId}?aba=etapas`);
  await etapa(page, 9, "Entrega").getByRole("button", { name: "Reabrir: Entrega" }).click();
  await dialogo(page).getByRole("button", { name: "Reabrir", exact: true }).click();
  await expect(toast(page, "Etapa em andamento")).toBeVisible();
  await aguardarAvisosSumirem(page);
  expect((await tarefasDaObra(obraId)).filter((t) => t.tipo === "PEDIR_AVALIACAO").map((t) => t.status)).toEqual(["CANCELADA"]);
});

test("a linha do tempo da obra registra o que aconteceu (e aceita anotação do diário)", async ({ page }) => {
  await page.goto(`/obras/${obraId}?aba=historico`);
  await expect(page.getByText(/Etapa "Medição exata" concluída/)).toBeVisible();
  await expect(page.getByText(/Obra pausada desde/)).toBeVisible();
  await semRolagemHorizontal(page);
});

test("obra sem etapas oferece gerar, e avisa quando não há proposta aprovada", async ({ page }) => {
  await page.goto(`/obras/${obraSemEtapasId}?aba=etapas`);
  await expect(page.getByText("Esta obra ainda não tem etapas")).toBeVisible();
  await page.getByRole("button", { name: "Gerar etapas" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Nenhuma proposta aprovada neste projeto." })).toBeVisible();
});

test("projeto ainda não aprovado não é obra: vai para a ficha comercial; o aprovado tem o atalho para a obra", async ({ page }) => {
  const leadId = await criarObraDeTeste("Ainda lead", { semEtapas: true, status: "NOVO_LEAD" });
  await page.goto(`/obras/${leadId}`);
  await expect(page).toHaveURL(new RegExp(`/projetos/${leadId}$`));
  await expect(page.getByRole("link", { name: "Acompanhar obra" })).toHaveCount(0);

  await page.goto(`/projetos/${obraId}`);
  await page.getByRole("link", { name: "Acompanhar obra" }).click();
  await expect(page).toHaveURL(new RegExp(`/obras/${obraId}$`));
});

test("obra que não existe mostra a página de não encontrado", async ({ page }) => {
  await page.goto("/obras/id-que-nao-existe");
  await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
});
