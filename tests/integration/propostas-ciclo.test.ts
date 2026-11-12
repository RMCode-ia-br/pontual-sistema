import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { criarClientePrisma } from "@/lib/db/criar-cliente";
import { datasDeFeriado, somarDiasDoTipo } from "@/lib/dominio/dias-uteis";
import { gerarEtapasDaObra, substituirItensDoModelo } from "@/modules/obras/servico";
import { proximoCodigoDoProjeto } from "@/modules/projetos/servico";
import { aprovarProposta, construirConteudo, copiarProposta, enviarProposta } from "@/modules/propostas/servico-ciclo";
import { reservarNumeroDeProposta } from "@/modules/propostas/servico";

import { comConexao, criarUsuarioDeTeste } from "./banco-teste";

const PREFIXO = "Int Cic";
const LOGIN = "int-ciclo";
const prisma = criarClientePrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL);

let usuario: { id: string; nome: string };
let clienteId: string;
let tipologiaSemEsquadria: string;
let tipologiaComEsquadria: string;
let contador: { proximo: number | null; ano: number | null };

async function limpar() {
  await comConexao(async (c) => {
    const projetos = `SELECT id FROM "Projeto" WHERE titulo LIKE $1`;
    const propostas = `SELECT id FROM "Proposta" WHERE "projetoId" IN (${projetos})`;
    const contas = `SELECT id FROM "ContaReceber" WHERE "projetoId" IN (${projetos})`;
    await c.query(`DELETE FROM "LogAuditoria" WHERE "entidade" IN ('Proposta','Projeto') AND ("entidadeId" IN (${propostas}) OR "entidadeId" IN (${projetos}))`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "LogAuditoria" WHERE "entidade" = 'ContaReceber' AND "entidadeId" IN (${contas})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "LogAuditoria" WHERE "entidade" = 'ModeloEtapas' AND "entidadeId" IN (SELECT id FROM "ModeloEtapas" WHERE nome LIKE $1)`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "ContaReceber" WHERE "projetoId" IN (${projetos})`, [`${PREFIXO}%`]);
    // Fase 4: agenda e etapas da obra apontam para o projeto (e as parcelas para as etapas, já apagadas acima).
    await c.query(`DELETE FROM "EventoAgenda" WHERE "projetoId" IN (${projetos})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "EtapaProjeto" WHERE "projetoId" IN (${projetos})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "ModeloEtapaItem" WHERE "modeloId" IN (SELECT id FROM "ModeloEtapas" WHERE nome LIKE $1)`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "ModeloEtapas" WHERE nome LIKE $1`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "ItemPropostaMedida" WHERE "itemId" IN (SELECT id FROM "ItemProposta" WHERE "propostaId" IN (${propostas}))`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "ItemProposta" WHERE "propostaId" IN (${propostas})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Tipologia" WHERE nome LIKE $1`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "PropostaParcela" WHERE "propostaId" IN (${propostas})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "GrupoProposta" WHERE "propostaId" IN (${propostas})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "OpcaoProposta" WHERE "propostaId" IN (${propostas})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Proposta" WHERE "projetoId" IN (${projetos})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Interacao" WHERE "projetoId" IN (${projetos})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Tarefa" WHERE "projetoId" IN (${projetos})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "HistoricoFaseProjeto" WHERE "projetoId" IN (${projetos})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Projeto" WHERE titulo LIKE $1`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "EnderecoCliente" WHERE "clienteId" IN (SELECT id FROM "Cliente" WHERE nome LIKE $1)`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Cliente" WHERE nome LIKE $1`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Usuario" WHERE login = $1`, [LOGIN]);
    // Devolve o contador de projetos como os outros testes de integração fazem.
    await c.query(`UPDATE "ContadorSequencia" SET "valor" = coalesce((SELECT max(substring("codigo" from 8)::int) FROM "Projeto" WHERE "codigo" LIKE 'P-' || extract(year from now())::text || '-%'), 0) WHERE "chave" LIKE 'projeto:%'`);
  });
}

beforeAll(async () => {
  await limpar();
  const cfg = await prisma.configuracaoEmpresa.findUniqueOrThrow({ where: { id: "singleton" }, select: { proximoNumeroProposta: true, anoNumeracaoProposta: true } });
  contador = { proximo: cfg.proximoNumeroProposta, ano: cfg.anoNumeracaoProposta };
  await criarUsuarioDeTeste(LOGIN, "senha-de-teste-123");
  usuario = await prisma.usuario.findUniqueOrThrow({ where: { login: LOGIN }, select: { id: true, nome: true } });
  clienteId = (await prisma.cliente.create({ data: { nome: `${PREFIXO} Cliente`, tipoPessoa: "PF" } })).id;
  tipologiaSemEsquadria = (await prisma.tipologia.create({ data: { nome: `${PREFIXO} Box (sem esquadria)`, templateDescricao: "BOX", exigeEsquadria: false } })).id;
  tipologiaComEsquadria = (await prisma.tipologia.create({ data: { nome: `${PREFIXO} Janela (com esquadria)`, templateDescricao: "JANELA", exigeEsquadria: true } })).id;
});

afterAll(async () => {
  await limpar();
  await comConexao((c) => c.query(`UPDATE "ConfiguracaoEmpresa" SET "proximoNumeroProposta" = $1, "anoNumeracaoProposta" = $2 WHERE id = 'singleton'`, [contador.proximo, contador.ano]));
  await prisma.$disconnect();
});

type Prazo = { modoPrazo: "TOTAL" | "POR_ETAPA"; prazoTotalMinDias?: number; prazoTotalMaxDias?: number; prazoMaterialDias?: number; prazoExecucaoDias?: number; prazoVidrosDias?: number };
type Opcoes = {
  comNota?: boolean;
  condominio?: boolean;
  valores?: number[];
  semParcelas?: boolean;
  prazo?: Prazo;
  /** Tipologia de cada item, na ordem dos valores (vazio = item manual sem tipologia). */
  tipologias?: (string | null)[];
};

/** Projeto + proposta rascunho com uma opção, itens manuais e cronograma 50/25/25. */
async function montar(titulo: string, o: Opcoes = {}) {
  const valores = o.valores ?? [413000, 905000, 665000];
  let enderecoObraId: string | null = null;
  if (o.condominio) {
    enderecoObraId = (await prisma.enderecoCliente.create({ data: { clienteId, tipo: "OBRA", logradouro: "Rua Teste", condominio: true, condominioNome: "Edifício Teste" } })).id;
  }
  return prisma.$transaction(async (tx) => {
    const projeto = await tx.projeto.create({ data: { codigo: await proximoCodigoDoProjeto(tx), titulo: `${PREFIXO} ${titulo}`, clienteId, enderecoObraId, status: "ELABORANDO_PROPOSTA" } });
    const { numero, sequencial, ano } = await reservarNumeroDeProposta(tx);
    const proposta = await tx.proposta.create({
      data: {
        projetoId: projeto.id,
        numero,
        numeroSequencial: sequencial,
        ano,
        data: new Date(),
        clienteNome: `${PREFIXO} Cliente`,
        comNotaFiscal: o.comNota ?? false,
        acrescimoNotaPb: 500,
        ...(o.prazo ?? {}),
        opcoes: { create: [{ nome: "Opção 1", ordem: 0 }] },
        parcelas: o.semParcelas
          ? undefined
          : {
              create: [
                { ordem: 1, descricao: "Sinal", percentualPb: 5000, gatilho: "CONFIRMACAO", forma: "PIX" },
                { ordem: 2, descricao: "Material", percentualPb: 2500, gatilho: "ENTREGA_MATERIAL" },
                { ordem: 3, descricao: "Vidros e instalação", percentualPb: 2500, gatilho: "ENTREGA_E_INSTALACAO" },
              ],
            },
        condicaoTextoLivre: o.semParcelas ? "A combinar" : null,
      },
      include: { opcoes: true },
    });
    for (const [i, v] of valores.entries()) {
      await tx.itemProposta.create({
        data: { propostaId: proposta.id, opcaoId: proposta.opcoes[0].id, ordem: i, tipologiaId: o.tipologias?.[i] ?? null, descricao: `ITEM ${i + 1}`, modoPreco: "MANUAL", valorManualCentavos: v, precoTotalCentavos: v, medidas: { create: [{ larguraMm: 1000, alturaMm: 1000, quantidade: 1 }] } },
      });
    }
    return { projetoId: projeto.id, propostaId: proposta.id, opcaoId: proposta.opcoes[0].id, numero };
  });
}

const aprovar = (propostaId: string, opcaoId: string, extra: { aceitaEm?: string } = {}) =>
  prisma.$transaction((tx) => aprovarProposta(tx, { usuario, propostaId, opcaoId, forma: "WHATSAPP", aceitaEm: extra.aceitaEm ?? "2026-11-13" }), { timeout: 30_000 });

describe("envio e congelamento (R4)", () => {
  it("enviar congela o conteúdo, move o projeto e cria o acompanhamento", async () => {
    const m = await montar("Envio");
    await prisma.$transaction((tx) => enviarProposta(tx, { usuario, propostaId: m.propostaId }));
    const p = await prisma.proposta.findUniqueOrThrow({ where: { id: m.propostaId } });
    expect(p.status).toBe("ENVIADA");
    expect(p.enviadaEm).not.toBeNull();
    const snap = p.snapshot as { opcoes: { totais: { totalCentavos: number } }[]; cliente: { nome: string } };
    expect(snap.opcoes[0].totais.totalCentavos).toBe(1983000);
    expect(JSON.stringify(snap)).not.toMatch(/custoEstimado|markup|observacoesInternas/);
    const projeto = await prisma.projeto.findUniqueOrThrow({ where: { id: m.projetoId } });
    expect(projeto.status).toBe("PROPOSTA_ENVIADA");
    expect(await prisma.tarefa.count({ where: { projetoId: m.projetoId, tipo: "FOLLOW_UP_PROPOSTA", status: "ABERTA" } })).toBe(1);
    // O snapshot não muda quando alguém mexe nos itens depois.
    await prisma.itemProposta.updateMany({ where: { propostaId: m.propostaId }, data: { precoTotalCentavos: 1 } });
    const depois = await prisma.proposta.findUniqueOrThrow({ where: { id: m.propostaId }, select: { snapshot: true } });
    expect((depois.snapshot as { opcoes: { totais: { totalCentavos: number } }[] }).opcoes[0].totais.totalCentavos).toBe(1983000);
  });

  it("recusa enviar proposta incompleta e enviar duas vezes", async () => {
    const m = await montar("Incompleta", { valores: [0] });
    await expect(prisma.$transaction((tx) => enviarProposta(tx, { usuario, propostaId: m.propostaId }))).rejects.toThrow(/sem valor/);
    expect((await prisma.proposta.findUniqueOrThrow({ where: { id: m.propostaId } })).status).toBe("RASCUNHO");
    const ok = await montar("Duas vezes");
    await prisma.$transaction((tx) => enviarProposta(tx, { usuario, propostaId: ok.propostaId }));
    await expect(prisma.$transaction((tx) => enviarProposta(tx, { usuario, propostaId: ok.propostaId }))).rejects.toThrow(/já foi enviada/);
  });

  it("revisão: mesmo número, Rev. 1; a anterior vira substituída só quando a nova é enviada", async () => {
    const m = await montar("Revisão");
    await prisma.$transaction((tx) => enviarProposta(tx, { usuario, propostaId: m.propostaId }));
    const rev = await prisma.$transaction((tx) => copiarProposta(tx, { usuarioId: usuario.id, origemId: m.propostaId, modo: "REVISAO" }));
    expect(rev.numero).toBe(m.numero);
    expect(rev.revisao).toBe(1);
    expect((await prisma.proposta.findUniqueOrThrow({ where: { id: m.propostaId } })).status).toBe("ENVIADA");
    const nova = await prisma.proposta.findUniqueOrThrow({ where: { id: rev.id }, include: { itens: true, opcoes: true, parcelas: true } });
    expect(nova.status).toBe("RASCUNHO");
    expect(nova.itens).toHaveLength(3);
    expect(nova.parcelas).toHaveLength(3);
    expect(nova.revisaoDeId).toBe(m.propostaId);
    await prisma.$transaction((tx) => enviarProposta(tx, { usuario, propostaId: rev.id }));
    expect((await prisma.proposta.findUniqueOrThrow({ where: { id: m.propostaId } })).status).toBe("SUBSTITUIDA");
    expect((await prisma.proposta.findUniqueOrThrow({ where: { id: rev.id } })).status).toBe("ENVIADA");
  });

  it("copiar como base gera outro número", async () => {
    const m = await montar("Cópia");
    const c = await prisma.$transaction((tx) => copiarProposta(tx, { usuarioId: usuario.id, origemId: m.propostaId, modo: "NOVA" }));
    expect(c.numero).not.toBe(m.numero);
    expect(c.revisao).toBe(0);
  });
});

describe("aprovação transacional (R5/R6)", () => {
  it("sem nota: 50/25/25 de R$ 19.830,00, projeto aprovado, tarefas e linha do tempo", async () => {
    const m = await montar("Aprovação sem nota");
    await prisma.$transaction((tx) => enviarProposta(tx, { usuario, propostaId: m.propostaId }));
    const r = await aprovar(m.propostaId, m.opcaoId);
    expect(r).toMatchObject({ valorAprovadoCentavos: 1983000, parcelasGeradas: 3, valorFechadoCentavos: 1983000, semParcelas: false });

    const contas = await prisma.contaReceber.findMany({ where: { propostaId: m.propostaId }, orderBy: { ordem: "asc" } });
    expect(contas.map((c) => c.valorCentavos)).toEqual([991500, 495750, 495750]);
    expect(contas.map((c) => c.status)).toEqual(["ABERTA", "AGUARDANDO_GATILHO", "AGUARDANDO_GATILHO"]);
    expect(contas[0].vencimento?.toISOString().slice(0, 10)).toBe("2026-11-13");
    expect(contas[1].vencimento).toBeNull();
    expect(contas.every((c) => !c.comNotaFiscal)).toBe(true);

    const projeto = await prisma.projeto.findUniqueOrThrow({ where: { id: m.projetoId } });
    expect(projeto.status).toBe("APROVADO");
    expect(projeto.valorFechadoCentavos).toBe(1983000);
    const p = await prisma.proposta.findUniqueOrThrow({ where: { id: m.propostaId } });
    expect(p).toMatchObject({ status: "APROVADA", formaAceite: "WHATSAPP", valorAprovadoCentavos: 1983000, opcaoAprovadaId: m.opcaoId });

    expect(await prisma.tarefa.count({ where: { projetoId: m.projetoId, tipo: "AGENDAR_MEDICAO", status: "ABERTA" } })).toBe(1);
    expect(await prisma.tarefa.count({ where: { projetoId: m.projetoId, tipo: "CONFIRMAR_CONDOMINIO" } })).toBe(0);
    expect(await prisma.tarefa.count({ where: { projetoId: m.projetoId, tipo: "FOLLOW_UP_PROPOSTA", status: "ABERTA" } })).toBe(0);
    expect(await prisma.interacao.count({ where: { projetoId: m.projetoId, texto: { contains: "aprovada" } } })).toBeGreaterThanOrEqual(1);
  });

  it("com nota fiscal: parcelas somam o total COM o acréscimo de 5% e herdam a nota", async () => {
    const m = await montar("Aprovação com nota", { comNota: true, valores: [100000] });
    const r = await aprovar(m.propostaId, m.opcaoId);
    expect(r.valorAprovadoCentavos).toBe(105000);
    const contas = await prisma.contaReceber.findMany({ where: { propostaId: m.propostaId }, orderBy: { ordem: "asc" } });
    expect(contas.map((c) => c.valorCentavos)).toEqual([52500, 26250, 26250]);
    expect(contas.every((c) => c.comNotaFiscal)).toBe(true);
  });

  it("a última parcela absorve a diferença do arredondamento", async () => {
    const m = await montar("Arredondamento", { valores: [10001] });
    await aprovar(m.propostaId, m.opcaoId);
    const contas = await prisma.contaReceber.findMany({ where: { propostaId: m.propostaId } });
    expect(contas.reduce((s, c) => s + c.valorCentavos, 0)).toBe(10001);
  });

  it("prédio: cria também a tarefa de confirmar a aprovação do condomínio", async () => {
    const m = await montar("Condomínio", { condominio: true });
    await aprovar(m.propostaId, m.opcaoId);
    expect(await prisma.tarefa.count({ where: { projetoId: m.projetoId, tipo: "CONFIRMAR_CONDOMINIO" } })).toBe(1);
  });

  it("condição 'a combinar' não gera parcelas e avisa", async () => {
    const m = await montar("Sem cronograma", { semParcelas: true });
    const r = await aprovar(m.propostaId, m.opcaoId);
    expect(r).toMatchObject({ semParcelas: true, parcelasGeradas: 0 });
    expect(await prisma.contaReceber.count({ where: { propostaId: m.propostaId } })).toBe(0);
  });

  it("aprovar duas vezes é recusado e não duplica parcelas (idempotente)", async () => {
    const m = await montar("Duas aprovações");
    await aprovar(m.propostaId, m.opcaoId);
    await expect(aprovar(m.propostaId, m.opcaoId)).rejects.toThrow(/já foi aprovada/);
    expect(await prisma.contaReceber.count({ where: { propostaId: m.propostaId } })).toBe(3);
  });

  it("aprovações simultâneas: só uma vence, sem parcelas em dobro", async () => {
    const m = await montar("Concorrência");
    const resultados = await Promise.allSettled([aprovar(m.propostaId, m.opcaoId), aprovar(m.propostaId, m.opcaoId), aprovar(m.propostaId, m.opcaoId)]);
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.contaReceber.count({ where: { propostaId: m.propostaId } })).toBe(3);
  }, 60_000);

  it("rejeita opção de outra proposta e é atômica (nada gravado se falhar)", async () => {
    const a = await montar("Atômica A");
    const b = await montar("Atômica B");
    await expect(aprovar(a.propostaId, b.opcaoId)).rejects.toThrow(/não pertence/);
    const p = await prisma.proposta.findUniqueOrThrow({ where: { id: a.propostaId } });
    expect(p.status).toBe("RASCUNHO");
    expect(await prisma.contaReceber.count({ where: { propostaId: a.propostaId } })).toBe(0);
  });

  it("duas 'partes' no mesmo projeto: o valor fechado soma as propostas aprovadas", async () => {
    const m = await montar("Partes", { valores: [100000] });
    const outra = await prisma.$transaction(async (tx) => {
      const { numero, sequencial, ano } = await reservarNumeroDeProposta(tx);
      const p = await tx.proposta.create({
        data: {
          projetoId: m.projetoId,
          numero,
          numeroSequencial: sequencial,
          ano,
          data: new Date(),
          clienteNome: `${PREFIXO} Cliente`,
          parte: "Parte 02",
          opcoes: { create: [{ nome: "Opção 1" }] },
          parcelas: { create: [{ ordem: 1, descricao: "À vista", percentualPb: 10000, gatilho: "CONFIRMACAO" }] },
        },
        include: { opcoes: true },
      });
      await tx.itemProposta.create({ data: { propostaId: p.id, opcaoId: p.opcoes[0].id, descricao: "X", modoPreco: "MANUAL", valorManualCentavos: 50000, precoTotalCentavos: 50000, medidas: { create: [{ larguraMm: 1, alturaMm: 1, quantidade: 1 }] } } });
      return { propostaId: p.id, opcaoId: p.opcoes[0].id };
    });
    await aprovar(m.propostaId, m.opcaoId);
    const r = await aprovar(outra.propostaId, outra.opcaoId);
    expect(r.valorFechadoCentavos).toBe(150000);
    expect((await prisma.projeto.findUniqueOrThrow({ where: { id: m.projetoId } })).valorFechadoCentavos).toBe(150000);
  });
});

/** Itens ativos do modelo de etapas padrão (o que a aprovação usa), na ordem. */
const itensDoModeloPadrao = () =>
  prisma.modeloEtapaItem.findMany({ where: { deletadoEm: null, ativo: true, modelo: { padrao: true, deletadoEm: null } }, orderBy: { ordem: "asc" } });
const etapasDaObra = (projetoId: string) => prisma.etapaProjeto.findMany({ where: { projetoId, deletadoEm: null }, orderBy: { ordem: "asc" } });
const dia = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;

describe("etapas da obra geradas na aprovação (R5 → R7)", () => {
  it("gera as etapas do modelo padrão na ordem, pendentes, e só o marco recebe data quando não há prazo", async () => {
    const m = await montar("Etapas sem prazo");
    await aprovar(m.propostaId, m.opcaoId);

    const modelo = await itensDoModeloPadrao();
    const etapas = await etapasDaObra(m.projetoId);
    expect(modelo.length).toBeGreaterThan(0);
    expect(etapas.map((e) => e.tipo)).toEqual(modelo.map((i) => i.tipo));
    expect(etapas.map((e) => e.ordem)).toEqual(modelo.map((_, i) => i + 1));
    // O item é manual (sem tipologia): não dá para saber que dispensa esquadria, então nada é dispensado.
    expect(etapas.every((e) => e.status === "PENDENTE")).toBe(true);

    const medicao = etapas.find((e) => e.tipo === "MEDICAO_EXATA")!;
    expect(dia(medicao.fimPrevisto)).toBe("2026-11-13"); // sem medição agendada: parte do aceite
    expect(medicao.provisoria).toBe(true);
    for (const e of etapas.filter((x) => x.tipo !== "MEDICAO_EXATA")) {
      expect([e.inicioPrevisto, e.fimPrevisto], e.tipo).toEqual([null, null]); // sem prazo, nada de data inventada
    }

    const projeto = await prisma.projeto.findUniqueOrThrow({ where: { id: m.projetoId } });
    expect(projeto).toMatchObject({ prazoModo: "NENHUM", prazoDias: null, dataInicioPrazo: null, prazoFinalPrometido: null });
    expect(await prisma.interacao.count({ where: { projetoId: m.projetoId, texto: { contains: "etapa(s) da obra geradas" } } })).toBe(1);
  });

  it("copia o prazo da proposta para a obra e propõe datas provisórias em sequência", async () => {
    const m = await montar("Etapas com prazo", { prazo: { modoPrazo: "POR_ETAPA", prazoMaterialDias: 4, prazoExecucaoDias: 3, prazoVidrosDias: 5 } });
    await aprovar(m.propostaId, m.opcaoId);

    const cfg = await prisma.configuracaoEmpresa.findUniqueOrThrow({ where: { id: "singleton" }, select: { tipoDias: true } });
    const projeto = await prisma.projeto.findUniqueOrThrow({ where: { id: m.projetoId } });
    expect(projeto).toMatchObject({ prazoModo: "POR_ETAPA", prazoDias: 12, prazoMaterialDias: 4, prazoExecucaoDias: 3, prazoVidrosDias: 5, tipoDiasPrazo: cfg.tipoDias });
    expect(projeto.dataInicioPrazo).toBeNull(); // o relógio só começa quando a medição exata for concluída

    const feriados = datasDeFeriado((await prisma.feriado.findMany({ where: { ativo: true, deletadoEm: null } })).map((f) => ({ data: dia(f.data)!, dataFim: dia(f.dataFim), tipo: f.tipo })));
    const etapas = await etapasDaObra(m.projetoId);
    expect(dia(etapas[0].fimPrevisto)).toBe("2026-11-13");
    expect(etapas.every((e) => e.provisoria)).toBe(true);

    // As datas seguem em sequência e a última coincide com o prazo total contado da medição.
    let anterior = "2026-11-13";
    for (const e of etapas.slice(1)) {
      expect(dia(e.inicioPrevisto)! >= anterior, e.tipo).toBe(true);
      expect(dia(e.fimPrevisto)! >= dia(e.inicioPrevisto)!, e.tipo).toBe(true);
      anterior = dia(e.fimPrevisto)!;
    }
    expect(anterior).toBe(somarDiasDoTipo("2026-11-13", 12, cfg.tipoDias, feriados));
  });

  it("prazo total simples guarda o máximo (20 a 35 dias = 35)", async () => {
    const m = await montar("Etapas total", { prazo: { modoPrazo: "TOTAL", prazoTotalMinDias: 20, prazoTotalMaxDias: 35 } });
    await aprovar(m.propostaId, m.opcaoId);
    const projeto = await prisma.projeto.findUniqueOrThrow({ where: { id: m.projetoId } });
    expect(projeto).toMatchObject({ prazoModo: "TOTAL", prazoDias: 35, prazoMaterialDias: null });
    const cfg = await prisma.configuracaoEmpresa.findUniqueOrThrow({ where: { id: "singleton" }, select: { tipoDias: true } });
    const feriados = datasDeFeriado((await prisma.feriado.findMany({ where: { ativo: true, deletadoEm: null } })).map((f) => ({ data: dia(f.data)!, dataFim: dia(f.dataFim), tipo: f.tipo })));
    const etapas = await etapasDaObra(m.projetoId);
    expect(dia(etapas[etapas.length - 1].fimPrevisto)).toBe(somarDiasDoTipo("2026-11-13", 35, cfg.tipoDias, feriados));
  });

  it("a medição exata agendada (e não cancelada) é a base das datas provisórias", async () => {
    const m = await montar("Etapas medição agendada");
    // Uma medição cancelada antes e outra agendada depois: vale a agendada.
    await prisma.eventoAgenda.createMany({
      data: [
        { tipo: "MEDICAO_EXATA", inicio: new Date("2026-11-20T13:00:00Z"), fim: new Date("2026-11-20T14:00:00Z"), projetoId: m.projetoId, status: "CANCELADO" },
        { tipo: "MEDICAO_EXATA", inicio: new Date("2026-12-01T13:00:00Z"), fim: new Date("2026-12-01T14:00:00Z"), projetoId: m.projetoId, status: "AGENDADO" },
      ],
    });
    await aprovar(m.propostaId, m.opcaoId);
    const etapas = await etapasDaObra(m.projetoId);
    expect(dia(etapas.find((e) => e.tipo === "MEDICAO_EXATA")!.fimPrevisto)).toBe("2026-12-01");
  });

  it("obra só com box e guarda-corpo: etapas de esquadria dispensadas e a parcela do material liberada no aceite", async () => {
    const m = await montar("Etapas sem esquadria", { tipologias: [tipologiaSemEsquadria, tipologiaSemEsquadria, tipologiaSemEsquadria] });
    await aprovar(m.propostaId, m.opcaoId);

    const modelo = await itensDoModeloPadrao();
    const etapas = await etapasDaObra(m.projetoId);
    for (const e of etapas) {
      const item = modelo.find((i) => i.tipo === e.tipo)!;
      expect(e.status, e.tipo).toBe(item.exigeEsquadria ? "DISPENSADA" : "PENDENTE");
      if (e.status === "DISPENSADA") expect([e.inicioPrevisto, e.fimPrevisto], e.tipo).toEqual([null, null]);
    }
    const dispensadas = etapas.filter((e) => e.status === "DISPENSADA");
    expect(dispensadas.length).toBeGreaterThan(0);

    // Parcela por gatilho: se a etapa que a libera foi dispensada, abre no aceite; senão continua aguardando.
    const contas = await prisma.contaReceber.findMany({ where: { propostaId: m.propostaId }, orderBy: { ordem: "asc" } });
    let liberadas = 0;
    for (const c of contas) {
      if (c.gatilho !== "ENTREGA_MATERIAL" && c.gatilho !== "ENTREGA_E_INSTALACAO") continue;
      const etapa = etapas.find((e) => e.liberaGatilho === c.gatilho);
      if (etapa?.status === "DISPENSADA") {
        liberadas++;
        expect(c).toMatchObject({ status: "ABERTA", etapaProjetoId: etapa.id });
        expect(dia(c.vencimento)).toBe("2026-11-13");
      } else {
        expect(c.status).toBe("AGUARDANDO_GATILHO");
      }
    }
    expect(liberadas).toBeGreaterThanOrEqual(1);
    expect(await prisma.tarefa.count({ where: { projetoId: m.projetoId, tipo: "COBRAR_PARCELA", status: "ABERTA" } })).toBe(liberadas);
    expect(await prisma.logAuditoria.count({ where: { entidade: "ContaReceber", acao: "LIBERAR_POR_ETAPA", entidadeId: { in: contas.map((c) => c.id) } } })).toBe(liberadas);
  });

  it("basta um item com esquadria para a obra ter as etapas de esquadria", async () => {
    const m = await montar("Etapas mistas", { tipologias: [tipologiaSemEsquadria, tipologiaComEsquadria, tipologiaSemEsquadria] });
    await aprovar(m.propostaId, m.opcaoId);
    expect((await etapasDaObra(m.projetoId)).every((e) => e.status === "PENDENTE")).toBe(true);
  });

  it("é idempotente por obra: gerar de novo não duplica as etapas (segunda 'parte')", async () => {
    const m = await montar("Etapas idempotente");
    await aprovar(m.propostaId, m.opcaoId);
    const antes = await etapasDaObra(m.projetoId);
    const r = await prisma.$transaction((tx) =>
      gerarEtapasDaObra(tx, { projetoId: m.projetoId, propostaId: m.propostaId, opcaoId: m.opcaoId, usuario, aceitaEm: "2026-11-13", prazo: { modo: "NENHUM", tipoDias: "UTEIS" } }),
    );
    expect(r).toMatchObject({ jaExistiam: true, criadas: 0 });
    expect((await etapasDaObra(m.projetoId)).map((e) => e.id)).toEqual(antes.map((e) => e.id));
  });

  it("a segunda parte completa o prazo da obra se a primeira não tinha, sem recriar nem mexer nas datas", async () => {
    const m = await montar("Etapas segunda parte");
    await aprovar(m.propostaId, m.opcaoId);
    const antes = await etapasDaObra(m.projetoId);
    await prisma.$transaction((tx) =>
      gerarEtapasDaObra(tx, {
        projetoId: m.projetoId,
        propostaId: m.propostaId,
        opcaoId: m.opcaoId,
        usuario,
        aceitaEm: "2026-11-20",
        prazo: { modo: "TOTAL", totalMinDias: 20, totalMaxDias: 35, materialDias: null, execucaoDias: null, vidrosDias: null, tipoDias: "CORRIDOS" },
      }),
    );
    expect(await prisma.projeto.findUniqueOrThrow({ where: { id: m.projetoId } })).toMatchObject({ prazoModo: "TOTAL", prazoDias: 35, tipoDiasPrazo: "CORRIDOS" });
    const depois = await etapasDaObra(m.projetoId);
    expect(depois.map((e) => [e.id, dia(e.fimPrevisto)])).toEqual(antes.map((e) => [e.id, dia(e.fimPrevisto)]));

    // Já com prazo, uma terceira parte não o sobrescreve.
    await prisma.$transaction((tx) =>
      gerarEtapasDaObra(tx, { projetoId: m.projetoId, propostaId: m.propostaId, opcaoId: m.opcaoId, usuario, aceitaEm: "2026-11-25", prazo: { modo: "TOTAL", totalMaxDias: 99, tipoDias: "UTEIS" } }),
    );
    expect(await prisma.projeto.findUniqueOrThrow({ where: { id: m.projetoId } })).toMatchObject({ prazoDias: 35, tipoDiasPrazo: "CORRIDOS" });
  });

  it("aprovações simultâneas não geram etapas em duplicidade", async () => {
    const m = await montar("Etapas concorrência");
    await Promise.allSettled([aprovar(m.propostaId, m.opcaoId), aprovar(m.propostaId, m.opcaoId), aprovar(m.propostaId, m.opcaoId)]);
    const modelo = await itensDoModeloPadrao();
    expect(await etapasDaObra(m.projetoId)).toHaveLength(modelo.length);
  }, 60_000);

  it("se a aprovação falhar, nenhuma etapa fica gravada (mesma transação)", async () => {
    const a = await montar("Etapas atômica A");
    const b = await montar("Etapas atômica B");
    await expect(aprovar(a.propostaId, b.opcaoId)).rejects.toThrow(/não pertence/);
    expect(await etapasDaObra(a.projetoId)).toHaveLength(0);
  });
});

describe("modelo de etapas: substituição dos itens", () => {
  const item = (tipo: "MEDICAO_EXATA" | "ENTREGA" | "OUTRA", nome: string, ordem: number) => ({
    tipo,
    nome,
    ordem,
    grupoPrazo: tipo === "MEDICAO_EXATA" ? null : ("VIDROS_FINALIZACAO" as const),
    peso: 1,
    liberaGatilho: null,
    marcoGarantia: false,
    exigeEsquadria: false,
    ativo: true,
  });

  it("troca os itens (antigos saem por exclusão lógica), renumera e audita", async () => {
    const modelo = await prisma.modeloEtapas.create({ data: { nome: `${PREFIXO} Modelo`, itens: { create: [item("MEDICAO_EXATA", "Antiga 1", 1), item("ENTREGA", "Antiga 2", 2)] } } });
    await prisma.$transaction((tx) =>
      substituirItensDoModelo(tx, { modeloId: modelo.id, usuario, itens: [item("MEDICAO_EXATA", "Nova 1", 7), item("OUTRA", "Nova 2", 3), item("ENTREGA", "Nova 3", 9)] }),
    );

    const todos = await prisma.modeloEtapaItem.findMany({ where: { modeloId: modelo.id }, orderBy: [{ criadoEm: "asc" }, { ordem: "asc" }] });
    expect(todos.filter((i) => i.deletadoEm).map((i) => i.nome).sort()).toEqual(["Antiga 1", "Antiga 2"]);
    const ativos = todos.filter((i) => !i.deletadoEm).sort((a, b) => a.ordem - b.ordem);
    expect(ativos.map((i) => [i.nome, i.ordem])).toEqual([["Nova 1", 1], ["Nova 2", 2], ["Nova 3", 3]]); // mesma ordem informada, renumerada

    const log = await prisma.logAuditoria.findFirst({ where: { entidade: "ModeloEtapas", entidadeId: modelo.id, acao: "ATUALIZAR" } });
    expect(log).toBeTruthy();
    expect(log!.usuarioNome).toBe(usuario.nome);
  });

  it("recusa modelo que não existe", async () => {
    await expect(prisma.$transaction((tx) => substituirItensDoModelo(tx, { modeloId: "nao-existe", usuario, itens: [item("MEDICAO_EXATA", "X", 1)] }))).rejects.toThrow(/não encontrado/);
  });
});

describe("conteúdo de impressão", () => {
  it("não vaza custo, markup nem observações internas", async () => {
    const m = await montar("Conteúdo");
    await prisma.proposta.update({ where: { id: m.propostaId }, data: { observacoesInternas: "SEGREDO-INTERNO", markupPb: 9999 } });
    await prisma.itemProposta.updateMany({ where: { propostaId: m.propostaId }, data: { custoEstimadoCentavos: 123, markupPb: 8000 } });
    const c = await construirConteudo(prisma, m.propostaId);
    const texto = JSON.stringify(c);
    expect(texto).not.toContain("SEGREDO-INTERNO");
    expect(texto).not.toMatch(/custo|markup|comissao/i);
    expect(c.opcoes[0].secoes[0].itens.map((i) => i.numero)).toEqual([1, 2, 3]);
  });
});

describe("regressões da revisão sênior", () => {
  it("A1: aprovar uma revisão impede aprovar a outra do mesmo número e a outra sai de vigor", async () => {
    const m = await montar("Revisões aprovadas");
    await prisma.$transaction((tx) => enviarProposta(tx, { usuario, propostaId: m.propostaId }));
    const rev = await prisma.$transaction((tx) => copiarProposta(tx, { usuarioId: usuario.id, origemId: m.propostaId, modo: "REVISAO" }));
    const revOpcao = (await prisma.opcaoProposta.findFirstOrThrow({ where: { propostaId: rev.id } })).id;

    await aprovar(m.propostaId, m.opcaoId);
    // A revisão em rascunho foi substituída e não pode mais ser aprovada.
    expect((await prisma.proposta.findUniqueOrThrow({ where: { id: rev.id } })).status).toBe("SUBSTITUIDA");
    await expect(aprovar(rev.id, revOpcao)).rejects.toThrow();
    // Valor fechado e parcelas não duplicam.
    expect((await prisma.projeto.findUniqueOrThrow({ where: { id: m.projetoId } })).valorFechadoCentavos).toBe(1983000);
    expect(await prisma.contaReceber.count({ where: { projetoId: m.projetoId } })).toBe(3);
  });

  it("A1: revisão aprovada primeiro (rascunho direto) substitui a original enviada", async () => {
    const m = await montar("Revisão primeiro");
    await prisma.$transaction((tx) => enviarProposta(tx, { usuario, propostaId: m.propostaId }));
    const rev = await prisma.$transaction((tx) => copiarProposta(tx, { usuarioId: usuario.id, origemId: m.propostaId, modo: "REVISAO" }));
    const revOpcao = (await prisma.opcaoProposta.findFirstOrThrow({ where: { propostaId: rev.id } })).id;
    await aprovar(rev.id, revOpcao);
    expect((await prisma.proposta.findUniqueOrThrow({ where: { id: m.propostaId } })).status).toBe("SUBSTITUIDA");
    await expect(aprovar(m.propostaId, m.opcaoId)).rejects.toThrow();
    expect(await prisma.contaReceber.count({ where: { projetoId: m.projetoId } })).toBe(3);
  });

  it("A2: excluir o rascunho de uma revisão não impede criar outra revisão", async () => {
    const m = await montar("Revisão excluída");
    await prisma.$transaction((tx) => enviarProposta(tx, { usuario, propostaId: m.propostaId }));
    const r1 = await prisma.$transaction((tx) => copiarProposta(tx, { usuarioId: usuario.id, origemId: m.propostaId, modo: "REVISAO" }));
    await prisma.proposta.update({ where: { id: r1.id }, data: { deletadoEm: new Date() } });
    const r2 = await prisma.$transaction((tx) => copiarProposta(tx, { usuarioId: usuario.id, origemId: m.propostaId, modo: "REVISAO" }));
    expect(r2.revisao).toBe(2);
  });

  it("A3: o contador editado para trás nunca gera número já emitido", async () => {
    const m = await montar("Contador");
    const numeroEmitido = Number(m.numero.slice(0, 4));
    // Simula alguém salvando Configurações com o contador antigo.
    await comConexao((c) => c.query(`UPDATE "ConfiguracaoEmpresa" SET "proximoNumeroProposta" = $1 WHERE id = 'singleton'`, [numeroEmitido - 1]));
    const novo = await prisma.$transaction((tx) => reservarNumeroDeProposta(tx));
    expect(novo.sequencial).toBeGreaterThan(numeroEmitido);
  });

  it("M1: aprovar proposta enviada usa o valor CONGELADO, mesmo que os itens mudem depois", async () => {
    const m = await montar("Valor congelado");
    await prisma.$transaction((tx) => enviarProposta(tx, { usuario, propostaId: m.propostaId }));
    await prisma.itemProposta.updateMany({ where: { propostaId: m.propostaId }, data: { precoTotalCentavos: 1 } });
    const r = await aprovar(m.propostaId, m.opcaoId);
    expect(r.valorAprovadoCentavos).toBe(1983000);
  });
});
