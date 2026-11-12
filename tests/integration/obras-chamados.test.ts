import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { criarClientePrisma } from "@/lib/db/criar-cliente";
import { gerarEtapasDaObra } from "@/modules/obras/servico";
import { abrirChamado, ajustarChamado, gerarCobrancaDoChamado, mudarStatusDoChamado, type EntradaDeChamado } from "@/modules/obras/servico-chamados";
import { mudarStatusDaEtapa } from "@/modules/obras/servico-execucao";

import { comConexao, criarUsuarioDeTeste } from "./banco-teste";

/** Assistência e garantia (R12): classificação automática, ajuste do gestor, andamento e cobrança da visita. */
const PREFIXO = "Int Cha";
const LOGIN = "int-chamados";
const prisma = criarClientePrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL);

// A instalação dos vidros (marco da garantia) foi concluída em 02/03/2026.
const MARCO = "2026-03-02";
const DENTRO = new Date("2026-03-20T15:00:00Z"); // 18 dias depois
const FORA = new Date("2027-01-15T15:00:00Z"); // quase 10 meses depois

let usuario: { id: string; nome: string };
let clienteId: string;
let outroClienteId: string;
let obra: string; // com a instalação dos vidros concluída
let obraSemInstalacao: string; // etapas geradas, instalação não concluída
let projetoLead: string;

async function limpar() {
  await comConexao(async (c) => {
    const projetos = `SELECT id FROM "Projeto" WHERE titulo LIKE $1`;
    const clientes = `SELECT id FROM "Cliente" WHERE nome LIKE $1`;
    const p = [`${PREFIXO}%`];
    await c.query(`DELETE FROM "LogAuditoria" WHERE "usuarioId" IN (SELECT id FROM "Usuario" WHERE login = $1)`, [LOGIN]);
    await c.query(`DELETE FROM "Chamado" WHERE "clienteId" IN (${clientes})`, p);
    await c.query(`DELETE FROM "Tarefa" WHERE "projetoId" IN (${projetos})`, p);
    await c.query(`DELETE FROM "Interacao" WHERE "projetoId" IN (${projetos}) OR "clienteId" IN (${clientes})`, p);
    await c.query(`DELETE FROM "ContaReceber" WHERE "projetoId" IN (${projetos})`, p);
    await c.query(`DELETE FROM "EtapaProjeto" WHERE "projetoId" IN (${projetos})`, p);
    await c.query(`DELETE FROM "HistoricoFaseProjeto" WHERE "projetoId" IN (${projetos})`, p);
    await c.query(`DELETE FROM "Projeto" WHERE titulo LIKE $1`, p);
    await c.query(`DELETE FROM "Cliente" WHERE nome LIKE $1`, p);
    await c.query(`DELETE FROM "Usuario" WHERE login = $1`, [LOGIN]);
    // Devolve o contador ao maior número que sobrou: os testes não deixam buracos na numeração.
    await c.query(`UPDATE "ContadorSequencia" SET "valor" = coalesce((SELECT max("numero") FROM "Chamado"), 0) WHERE "chave" = 'chamado'`);
  });
}

async function criarObra(nome: string, status: "CONCLUIDO" | "NOVO_LEAD" = "CONCLUIDO") {
  const projeto = await prisma.projeto.create({ data: { codigo: `P-0000-${randomUUID().slice(0, 8)}`, titulo: `${PREFIXO} ${nome}`, clienteId, status } });
  if (status !== "NOVO_LEAD") {
    await prisma.projeto.update({ where: { id: projeto.id }, data: { status: "APROVADO" } });
    await prisma.$transaction((tx) =>
      gerarEtapasDaObra(tx, { projetoId: projeto.id, propostaId: "inexistente", opcaoId: "inexistente", usuario, aceitaEm: "2026-02-02", prazo: { modo: "NENHUM", tipoDias: "UTEIS" } }),
    );
  }
  return projeto.id;
}

beforeAll(async () => {
  await limpar();
  await criarUsuarioDeTeste(LOGIN, "senha-de-teste-123");
  usuario = await prisma.usuario.findUniqueOrThrow({ where: { login: LOGIN }, select: { id: true, nome: true } });
  clienteId = (await prisma.cliente.create({ data: { nome: `${PREFIXO} Cliente`, tipoPessoa: "PF" } })).id;
  outroClienteId = (await prisma.cliente.create({ data: { nome: `${PREFIXO} Outro cliente`, tipoPessoa: "PF" } })).id;
  obra = await criarObra("Obra com instalação");
  obraSemInstalacao = await criarObra("Obra sem instalação");
  projetoLead = await criarObra("Ainda lead", "NOVO_LEAD");
  const instalacao = await prisma.etapaProjeto.findFirstOrThrow({ where: { projetoId: obra, tipo: "INSTALACAO_VIDROS", deletadoEm: null } });
  await prisma.$transaction((tx) => mudarStatusDaEtapa(tx, { etapaId: instalacao.id, para: "CONCLUIDA", usuario, data: MARCO, agora: DENTRO }));
});

afterAll(async () => {
  await limpar();
  await prisma.$disconnect();
});

const abrir = (parte: Partial<EntradaDeChamado> = {}) =>
  prisma.$transaction((tx) => abrirChamado(tx, { clienteId, projetoId: obra, tipoProblema: "REGULAGEM", descricao: "Janela da sala arrastando", usuario, agora: DENTRO, ...parte }));
const chamadoDe = (id: string) => prisma.chamado.findUniqueOrThrow({ where: { id } });
const ajustar = (id: string, parte: object) => prisma.$transaction((tx) => ajustarChamado(tx, { id, usuario, ...parte }));
const mudar = (id: string, para: "ABERTO" | "AGENDADO" | "EM_ATENDIMENTO" | "RESOLVIDO" | "CANCELADO", solucao?: string) => prisma.$transaction((tx) => mudarStatusDoChamado(tx, { id, para, solucao, usuario }));

describe("classificação ao abrir o chamado", () => {
  it("regulagem dentro da garantia: em garantia, sem cobrar visita, com o motivo e na linha do tempo", async () => {
    const r = await abrir();
    expect(r).toMatchObject({ classificacao: "EM_GARANTIA" });
    expect(r.motivo).toContain("02/03/2026");
    const c = await chamadoDe(r.id);
    expect(c).toMatchObject({ classificacaoSugerida: "EM_GARANTIA", classificacao: "EM_GARANTIA", cobrarVisita: false, status: "ABERTO", numero: r.numero, projetoId: obra, clienteId });
    expect(c.motivoClassificacao).toBe(r.motivo);

    const interacao = await prisma.interacao.findFirstOrThrow({ where: { projetoId: obra, texto: { contains: "Chamado de assistência" } } });
    expect(interacao.clienteId).toBe(clienteId); // aparece na linha do tempo do cliente E da obra
    expect(interacao.texto).toContain("em garantia");
    expect(await prisma.logAuditoria.count({ where: { entidade: "Chamado", entidadeId: r.id, acao: "CRIAR" } })).toBe(1);
  });

  it("regulagem depois do prazo: fora da garantia e a sugestão é cobrar a visita", async () => {
    const r = await abrir({ agora: FORA });
    expect(r.classificacao).toBe("FORA_DA_GARANTIA");
    expect(r.motivo).toContain("Passou da garantia de regulagem");
    expect(await chamadoDe(r.id)).toMatchObject({ cobrarVisita: true, classificacao: "FORA_DA_GARANTIA" });
  });

  it("vidro depois da instalação: fora da garantia mesmo dentro dos 90 dias (vidro só até a instalação)", async () => {
    const r = await abrir({ tipoProblema: "VIDRO" });
    expect(r.classificacao).toBe("FORA_DA_GARANTIA");
    expect(r.motivo).toContain("vidros");
  });

  it("sem obra, ou com a instalação ainda não concluída: fora da garantia, para o gestor confirmar", async () => {
    const semObra = await abrir({ projetoId: null });
    expect(semObra.classificacao).toBe("FORA_DA_GARANTIA");
    expect(semObra.motivo).toContain("Sem obra vinculada");

    const semInstalacao = await abrir({ projetoId: obraSemInstalacao });
    expect(semInstalacao.classificacao).toBe("FORA_DA_GARANTIA");
    expect(semInstalacao.motivo).toContain("instalação ainda não foi concluída");
  });

  it("recusa descrição curta ou longa, cliente inexistente, obra de outro cliente e projeto que não é obra", async () => {
    await expect(abrir({ descricao: "  x " })).rejects.toThrow(/Descreva o problema/);
    await expect(abrir({ descricao: "x".repeat(2001) })).rejects.toThrow(/2\.000 caracteres/);
    await expect(abrir({ clienteId: "nao-existe" })).rejects.toThrow(/Cliente não encontrado/);
    await expect(abrir({ clienteId: outroClienteId })).rejects.toThrow(/pertence a outro cliente/);
    await expect(abrir({ projetoId: "nao-existe" })).rejects.toThrow(/Obra não encontrada/);
    await expect(abrir({ projetoId: projetoLead })).rejects.toThrow(/ainda não foi aprovado/);
  });

  it("os números são sequenciais e únicos, mesmo com aberturas simultâneas", async () => {
    const r = await Promise.all([abrir(), abrir(), abrir()]);
    const numeros = r.map((x) => x.numero).sort((a, b) => a - b);
    expect(new Set(numeros).size).toBe(3);
    expect(numeros[2] - numeros[0]).toBe(2); // consecutivos
  }, 60_000);
});

describe("ajuste do gestor", () => {
  it("sobrescreve a classificação (a sugestão fica guardada), decide a cobrança e registra o valor", async () => {
    const { id } = await abrir({ agora: FORA }); // fora da garantia, cobrar sugerido
    await ajustar(id, { classificacao: "EM_GARANTIA", cobrarVisita: true, valorCobradoCentavos: 15000 });
    expect(await chamadoDe(id)).toMatchObject({ classificacao: "EM_GARANTIA", classificacaoSugerida: "FORA_DA_GARANTIA", cobrarVisita: true, valorCobradoCentavos: 15000 });
    expect(await prisma.interacao.count({ where: { projetoId: obra, texto: { contains: "classificação ajustada" } } })).toBeGreaterThanOrEqual(1);
    expect(await prisma.logAuditoria.count({ where: { entidade: "Chamado", entidadeId: id, acao: "ATUALIZAR" } })).toBe(1);

    // Sem cobrar a visita, o valor se apaga (não fica número solto).
    await ajustar(id, { cobrarVisita: false });
    expect(await chamadoDe(id)).toMatchObject({ cobrarVisita: false, valorCobradoCentavos: null });
  });

  it("recusa valor inválido, descrição fora do tamanho e chamado inexistente", async () => {
    const { id } = await abrir({ agora: FORA });
    await expect(ajustar(id, { valorCobradoCentavos: -1 })).rejects.toThrow(/valor válido/);
    await expect(ajustar(id, { valorCobradoCentavos: 1.5 })).rejects.toThrow(/valor válido/);
    await expect(ajustar(id, { valorCobradoCentavos: 3_000_000_000 })).rejects.toThrow(/valor válido/);
    await expect(ajustar(id, { descricao: "ab" })).rejects.toThrow(/3 a 2\.000/);
    await expect(ajustar("nao-existe", { cobrarVisita: true })).rejects.toThrow(/Chamado não encontrado/);
  });
});

describe("andamento do chamado", () => {
  it("segue o fluxo, exige a solução para resolver e reabrir limpa a data da resolução", async () => {
    const { id } = await abrir();
    await mudar(id, "EM_ATENDIMENTO");
    await expect(mudar(id, "RESOLVIDO")).rejects.toThrow(/Diga o que foi feito/);
    await expect(mudar(id, "RESOLVIDO", "  ab ")).rejects.toThrow(/Diga o que foi feito/);
    await mudar(id, "RESOLVIDO", "Trocamos as roldanas da folha");
    const resolvido = await chamadoDe(id);
    expect(resolvido).toMatchObject({ status: "RESOLVIDO", solucao: "Trocamos as roldanas da folha" });
    expect(resolvido.resolvidoEm).not.toBeNull();
    expect(await prisma.interacao.count({ where: { projetoId: obra, texto: { contains: "Trocamos as roldanas" } } })).toBe(1);

    await mudar(id, "ABERTO");
    expect(await chamadoDe(id)).toMatchObject({ status: "ABERTO", resolvidoEm: null, solucao: "Trocamos as roldanas da folha" }); // a solução anterior fica no histórico
  });

  it("recusa transições inválidas e a de um estado para ele mesmo", async () => {
    const { id } = await abrir();
    await mudar(id, "CANCELADO");
    await expect(mudar(id, "EM_ATENDIMENTO")).rejects.toThrow(/Não dá para passar/);
    await expect(mudar(id, "CANCELADO")).rejects.toThrow(/Não dá para passar/);
    await mudar(id, "ABERTO"); // reabrir é a saída de um cancelado
    await expect(mudar(id, "ABERTO")).rejects.toThrow(/Não dá para passar/);
  });
});

describe("cobrança da visita", () => {
  async function chamadoParaCobrar(valor = 20000) {
    const { id } = await abrir({ agora: FORA });
    await ajustar(id, { cobrarVisita: true, valorCobradoCentavos: valor });
    return id;
  }

  it("gera a conta a receber da obra uma vez só e trava o valor", async () => {
    const id = await chamadoParaCobrar();
    const antes = await prisma.contaReceber.aggregate({ where: { projetoId: obra }, _max: { ordem: true } });
    const { contaId } = await prisma.$transaction((tx) => gerarCobrancaDoChamado(tx, { id, vencimento: "2027-02-10", usuario }));

    const conta = await prisma.contaReceber.findUniqueOrThrow({ where: { id: contaId } });
    expect(conta).toMatchObject({ projetoId: obra, clienteId, valorCentavos: 20000, status: "ABERTA", ordem: (antes._max.ordem ?? 0) + 1, gatilho: null });
    expect(conta.vencimento?.toISOString().slice(0, 10)).toBe("2027-02-10");
    expect(conta.descricao).toContain("Visita de assistência #");
    expect((await chamadoDe(id)).contaReceberId).toBe(contaId);

    await expect(prisma.$transaction((tx) => gerarCobrancaDoChamado(tx, { id, usuario }))).rejects.toThrow(/já foi gerada/);
    await expect(ajustar(id, { valorCobradoCentavos: 999 })).rejects.toThrow(/já virou conta a receber/);
    await expect(ajustar(id, { cobrarVisita: false })).rejects.toThrow(/já virou conta a receber/);
    await ajustar(id, { classificacao: "EM_GARANTIA" }); // a classificação ainda pode ser corrigida
  });

  it("cancelar o chamado cancela a cobrança da visita; com pagamento, o cancelamento é recusado", async () => {
    const id = await chamadoParaCobrar(15000);
    const { contaId } = await prisma.$transaction((tx) => gerarCobrancaDoChamado(tx, { id, usuario }));
    await mudar(id, "CANCELADO");
    expect((await prisma.contaReceber.findUniqueOrThrow({ where: { id: contaId } })).status).toBe("CANCELADA");
    expect(await prisma.logAuditoria.count({ where: { entidade: "ContaReceber", entidadeId: contaId, acao: "CANCELAR" } })).toBe(1);
    expect(await prisma.interacao.count({ where: { projetoId: obra, texto: { contains: "cobrança da visita foi cancelada junto" } } })).toBeGreaterThanOrEqual(1);

    // Conta com pagamento (parcial ou paga): o chamado não pode ser cancelado e nada muda.
    const outro = await chamadoParaCobrar(9000);
    const { contaId: contaPaga } = await prisma.$transaction((tx) => gerarCobrancaDoChamado(tx, { id: outro, usuario }));
    await prisma.contaReceber.update({ where: { id: contaPaga }, data: { status: "PARCIAL" } });
    await expect(mudar(outro, "CANCELADO")).rejects.toThrow(/já tem pagamento/);
    expect((await chamadoDe(outro)).status).toBe("ABERTO");
    expect((await prisma.contaReceber.findUniqueOrThrow({ where: { id: contaPaga } })).status).toBe("PARCIAL");
  });

  it("três pedidos ao mesmo tempo geram uma única conta", async () => {
    const id = await chamadoParaCobrar(12345);
    const r = await Promise.allSettled([1, 2, 3].map(() => prisma.$transaction((tx) => gerarCobrancaDoChamado(tx, { id, usuario }))));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.contaReceber.count({ where: { descricao: { contains: "Visita de assistência" }, valorCentavos: 12345, projetoId: obra } })).toBe(1);
  }, 60_000);

  it("exige cobrança marcada, valor, obra e chamado não cancelado, e vencimento válido", async () => {
    const semMarca = (await abrir()).id; // em garantia: não cobra
    await expect(prisma.$transaction((tx) => gerarCobrancaDoChamado(tx, { id: semMarca, usuario }))).rejects.toThrow(/Marque que a visita será cobrada/);

    const semValor = (await abrir({ agora: FORA })).id;
    await expect(prisma.$transaction((tx) => gerarCobrancaDoChamado(tx, { id: semValor, usuario }))).rejects.toThrow(/Informe o valor/);

    const semObra = (await abrir({ projetoId: null })).id;
    await ajustar(semObra, { cobrarVisita: true, valorCobradoCentavos: 5000 });
    await expect(prisma.$transaction((tx) => gerarCobrancaDoChamado(tx, { id: semObra, usuario }))).rejects.toThrow(/vincule o chamado a uma obra/);

    const cancelado = await chamadoParaCobrar();
    await mudar(cancelado, "CANCELADO");
    await expect(prisma.$transaction((tx) => gerarCobrancaDoChamado(tx, { id: cancelado, usuario }))).rejects.toThrow(/está cancelado/);

    const dataRuim = await chamadoParaCobrar();
    await expect(prisma.$transaction((tx) => gerarCobrancaDoChamado(tx, { id: dataRuim, vencimento: "2027-13-40", usuario }))).rejects.toThrow(/vencimento válido/);
    expect((await chamadoDe(dataRuim)).contaReceberId).toBeNull(); // nada gravado
  });
});
