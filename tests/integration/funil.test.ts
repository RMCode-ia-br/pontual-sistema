import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { criarClientePrisma } from "@/lib/db/criar-cliente";
import { anoEmSaoPaulo, chaveContadorProjeto } from "@/lib/dominio/codigo-projeto";
import { avaliarMovimento } from "@/lib/dominio/funil";
import { carregarFunil, lerListaProjetos, listarProjetos } from "@/modules/projetos/queries";
import { mudarFaseDoProjeto, proximoCodigoDoProjeto } from "@/modules/projetos/servico";

import { comConexao, criarUsuarioDeTeste } from "./banco-teste";

const PREFIXO = "Int Fun";
const LOGIN = "int-funil";
const prisma = criarClientePrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL);

async function limpar() {
  await comConexao(async (c) => {
    const projetos = `SELECT id FROM "Projeto" WHERE titulo LIKE $1`;
    await c.query(`DELETE FROM "LogAuditoria" WHERE "entidade" = 'Projeto' AND "entidadeId" IN (${projetos})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Interacao" WHERE "projetoId" IN (${projetos})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Tarefa" WHERE "projetoId" IN (${projetos}) OR titulo LIKE $1`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "HistoricoFaseProjeto" WHERE "projetoId" IN (${projetos})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Projeto" WHERE titulo LIKE $1`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Cliente" WHERE nome LIKE $1`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Usuario" WHERE login = $1`, [LOGIN]);
    // Devolve o contador ao maior código que sobrou: os testes não deixam "buracos" na numeração real.
    const ano = anoEmSaoPaulo(new Date());
    await c.query(
      `UPDATE "ContadorSequencia"
          SET "valor" = coalesce((SELECT max(substring("codigo" from 8)::int) FROM "Projeto" WHERE "codigo" LIKE $2), 0)
        WHERE "chave" = $1`,
      [chaveContadorProjeto(ano), `P-${ano}-%`],
    );
  });
}

const lista = (brutos: Record<string, string>) => {
  const { parametros, filtros } = lerListaProjetos(brutos);
  return listarProjetos(parametros, filtros);
};

let usuario: { id: string; nome: string };
let clienteId: string;
let motivoId: string;

async function novoProjeto(titulo: string, extra: Record<string, unknown> = {}) {
  return prisma.$transaction(async (tx) =>
    tx.projeto.create({
      data: { codigo: await proximoCodigoDoProjeto(tx), titulo: `${PREFIXO} ${titulo}`, clienteId, ...extra },
      select: { id: true, codigo: true, titulo: true, clienteId: true, status: true },
    }),
  );
}

beforeAll(async () => {
  await limpar();
  await criarUsuarioDeTeste(LOGIN, "senha-de-teste-123");
  const u = await prisma.usuario.findUniqueOrThrow({ where: { login: LOGIN }, select: { id: true, nome: true } });
  usuario = u;
  clienteId = (await prisma.cliente.create({ data: { nome: `${PREFIXO} Cliente Ação`, tipoPessoa: "PF" } })).id;
  const motivo = await prisma.motivoPerda.findFirst({ where: { ativo: true, deletadoEm: null }, select: { id: true } });
  if (!motivo) throw new Error("Rode o seed: nenhum motivo de perda cadastrado.");
  motivoId = motivo.id;
});

afterAll(async () => {
  await limpar();
  await prisma.$disconnect();
});

describe("código do projeto", () => {
  it("criações simultâneas nunca repetem nem pulam número", async () => {
    const criados = await Promise.all(Array.from({ length: 12 }, (_, i) => novoProjeto(`Concorrente ${i}`)));
    const codigos = criados.map((p) => p.codigo);
    expect(new Set(codigos).size).toBe(12);
    const sequencias = codigos.map((c) => Number(c.slice(-4))).sort((a, b) => a - b);
    for (let i = 1; i < sequencias.length; i++) expect(sequencias[i]).toBe(sequencias[i - 1] + 1);
    expect(codigos.every((c) => /^P-\d{4}-\d{4,}$/.test(c))).toBe(true);
  });
});

describe("mudança de fase", () => {
  it("move, grava histórico, linha do tempo e auditoria na mesma operação", async () => {
    const projeto = await novoProjeto("Mover");
    await prisma.$transaction((tx) => mudarFaseDoProjeto(tx, { usuario, projeto, para: "NEGOCIACAO" }));

    const depois = await prisma.projeto.findUniqueOrThrow({ where: { id: projeto.id } });
    expect(depois.status).toBe("NEGOCIACAO");
    const historico = await prisma.historicoFaseProjeto.findMany({ where: { projetoId: projeto.id } });
    expect(historico).toHaveLength(1);
    expect(historico[0]).toMatchObject({ de: "NOVO_LEAD", para: "NEGOCIACAO", criadoPorId: usuario.id });
    const interacao = await prisma.interacao.findFirstOrThrow({ where: { projetoId: projeto.id } });
    expect(interacao).toMatchObject({ tipo: "SISTEMA", clienteId });
    expect(interacao.texto).toContain("Negociação");
    const auditoria = await prisma.logAuditoria.findFirstOrThrow({ where: { entidade: "Projeto", entidadeId: projeto.id } });
    expect(auditoria.acao).toBe("ATUALIZAR");
  });

  it("perder exige motivo válido; reabrir limpa os dados da perda", async () => {
    const projeto = await novoProjeto("Perder");

    await expect(prisma.$transaction((tx) => mudarFaseDoProjeto(tx, { usuario, projeto, para: "PERDIDO" }))).rejects.toThrow(/motivo/i);
    await expect(prisma.$transaction((tx) => mudarFaseDoProjeto(tx, { usuario, projeto, para: "PERDIDO", perda: { motivoPerdaId: "nao-existe" } }))).rejects.toThrow(/motivo/i);
    // Nada mudou nas tentativas recusadas (a transação desfez tudo).
    expect((await prisma.projeto.findUniqueOrThrow({ where: { id: projeto.id } })).status).toBe("NOVO_LEAD");
    expect(await prisma.historicoFaseProjeto.count({ where: { projetoId: projeto.id } })).toBe(0);

    await prisma.$transaction((tx) => mudarFaseDoProjeto(tx, { usuario, projeto, para: "PERDIDO", perda: { motivoPerdaId: motivoId, detalhe: "Achou caro", concorrente: "Concorrente X" } }));
    const perdido = await prisma.projeto.findUniqueOrThrow({ where: { id: projeto.id } });
    expect(perdido).toMatchObject({ status: "PERDIDO", motivoPerdaId: motivoId, motivoPerdaDetalhe: "Achou caro", concorrente: "Concorrente X" });
    expect(perdido.perdidoEm).not.toBeNull();

    // Reabrir: as regras do domínio permitem e os dados da perda saem.
    expect(avaliarMovimento("PERDIDO", "ELABORANDO_PROPOSTA")).toMatchObject({ ok: true, reabre: true });
    await prisma.$transaction((tx) => mudarFaseDoProjeto(tx, { usuario, projeto: { ...projeto, status: "PERDIDO" }, para: "ELABORANDO_PROPOSTA" }));
    const reaberto = await prisma.projeto.findUniqueOrThrow({ where: { id: projeto.id } });
    expect(reaberto).toMatchObject({ status: "ELABORANDO_PROPOSTA", motivoPerdaId: null, motivoPerdaDetalhe: null, concorrente: null, perdidoEm: null });
    expect(await prisma.historicoFaseProjeto.count({ where: { projetoId: projeto.id } })).toBe(2);
  });
});

describe("integridade", () => {
  it("o banco recusa tarefa e interação de projeto inexistente (chave estrangeira)", async () => {
    await expect(prisma.tarefa.create({ data: { titulo: `${PREFIXO} órfã`, projetoId: "nao-existe" } })).rejects.toThrow();
    await expect(prisma.interacao.create({ data: { tipo: "SISTEMA", texto: "órfã", projetoId: "nao-existe" } })).rejects.toThrow();
  });
});

describe("funil e lista", () => {
  it("o Kanban põe cada projeto na coluna da sua fase, com próxima tarefa e dias parado", async () => {
    const novo = await novoProjeto("Coluna nova");
    const antigo = await novoProjeto("Coluna antiga", { status: "PROPOSTA_ENVIADA", ultimaMovimentacaoEm: new Date(Date.now() - 10 * 86_400_000) });
    await prisma.tarefa.create({ data: { titulo: `${PREFIXO} Ligar`, projetoId: antigo.id, status: "ABERTA", vencimento: new Date("2020-01-01T00:00:00Z") } });

    const todas = await carregarFunil({}, `${PREFIXO}`);
    expect(todas.map((c) => c.status)).toEqual(["NOVO_LEAD", "VISITA_AGENDADA", "ELABORANDO_PROPOSTA", "PROPOSTA_ENVIADA", "NEGOCIACAO", "APROVADO", "PERDIDO"]);
    const emNovo = todas.find((c) => c.status === "NOVO_LEAD")!.cartoes.find((c) => c.id === novo.id);
    const emEnviada = todas.find((c) => c.status === "PROPOSTA_ENVIADA")!.cartoes.find((c) => c.id === antigo.id);
    expect(emNovo).toBeDefined();
    expect(emEnviada?.diasParado).toBeGreaterThanOrEqual(10);
    expect(emEnviada?.proximaTarefa).toMatchObject({ vencida: true });
    expect(emEnviada?.proximaTarefa?.titulo).toBe(`${PREFIXO} Ligar`);
  });

  it("a busca da lista ignora acentos e acha pelo nome do cliente", async () => {
    await novoProjeto("Janelas Ação");
    const porTitulo = await lista({ busca: "int fun janelas acao" });
    expect(porTitulo.linhas.map((p) => p.titulo)).toContain(`${PREFIXO} Janelas Ação`);
    const porCliente = await lista({ busca: "cliente acao" });
    expect(porCliente.linhas.length).toBeGreaterThanOrEqual(1);
    expect(porCliente.linhas.every((p) => p.clienteNome === `${PREFIXO} Cliente Ação`)).toBe(true);
  });

  it("'sem retorno' traz só proposta enviada ou negociação parada além do prazo", async () => {
    const parado = await novoProjeto("Parado", { status: "NEGOCIACAO", ultimaMovimentacaoEm: new Date(Date.now() - 30 * 86_400_000) });
    const recente = await novoProjeto("Recente", { status: "NEGOCIACAO" });
    const velhoMasNovoLead = await novoProjeto("Lead velho", { status: "NOVO_LEAD", ultimaMovimentacaoEm: new Date(Date.now() - 30 * 86_400_000) });

    const { linhas } = await lista({ semRetorno: "1", busca: PREFIXO });
    const ids = linhas.map((p) => p.id);
    expect(ids).toContain(parado.id);
    expect(ids).not.toContain(recente.id);
    expect(ids).not.toContain(velhoMasNovoLead.id);
  });

  it("projetos excluídos não aparecem no funil nem na lista", async () => {
    const p = await novoProjeto("Excluído", { deletadoEm: new Date() });
    expect((await lista({ busca: `${PREFIXO} Excluído` })).linhas.map((x) => x.id)).not.toContain(p.id);
    const colunas = await carregarFunil({}, `${PREFIXO} Excluído`);
    expect(colunas.flatMap((c) => c.cartoes).map((c) => c.id)).not.toContain(p.id);
  });
});
