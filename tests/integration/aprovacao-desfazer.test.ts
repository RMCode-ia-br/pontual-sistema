import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { criarClientePrisma } from "@/lib/db/criar-cliente";
import { proximoCodigoDoProjeto } from "@/modules/projetos/servico";
import { aprovarProposta, copiarProposta, enviarProposta } from "@/modules/propostas/servico-ciclo";
import { reservarNumeroDeProposta } from "@/modules/propostas/servico";

import { comConexao, criarUsuarioDeTeste } from "./banco-teste";

/**
 * Fase 7A.1: desfazer, trocar e reabrir a aprovação de proposta. Só toca registros com o prefixo "Int Desf"
 * (nunca dados reais) e devolve o contador de propostas e de projetos ao que era.
 */
const PREFIXO = "Int Desf";
const LOGIN = "int-desfazer";
const prisma = criarClientePrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL);

let usuario: { id: string; nome: string };
let clienteId: string;
let contador: { proximo: number | null; ano: number | null };

async function limpar() {
  await comConexao(async (c) => {
    const projetos = `SELECT id FROM "Projeto" WHERE titulo LIKE $1`;
    const propostas = `SELECT id FROM "Proposta" WHERE "projetoId" IN (${projetos})`;
    const contas = `SELECT id FROM "ContaReceber" WHERE "projetoId" IN (${projetos})`;
    await c.query(`DELETE FROM "LogAuditoria" WHERE "entidade" IN ('Proposta','Projeto') AND ("entidadeId" IN (${propostas}) OR "entidadeId" IN (${projetos}))`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "LogAuditoria" WHERE "entidade" = 'ContaReceber' AND "entidadeId" IN (${contas})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "ContaReceber" WHERE "projetoId" IN (${projetos})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "EventoAgenda" WHERE "projetoId" IN (${projetos})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "EtapaProjeto" WHERE "projetoId" IN (${projetos})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "ItemPropostaMedida" WHERE "itemId" IN (SELECT id FROM "ItemProposta" WHERE "propostaId" IN (${propostas}))`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "ItemProposta" WHERE "propostaId" IN (${propostas})`, [`${PREFIXO}%`]);
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
});

afterAll(async () => {
  await limpar();
  await comConexao((c) => c.query(`UPDATE "ConfiguracaoEmpresa" SET "proximoNumeroProposta" = $1, "anoNumeracaoProposta" = $2 WHERE id = 'singleton'`, [contador.proximo, contador.ano]));
  await prisma.$disconnect();
});

/** Projeto + proposta rascunho com uma opção, dois itens manuais e cronograma 50% na confirmação / 50% na entrega. */
async function montar(titulo: string, valores: number[] = [1200000, 80000]) {
  return prisma.$transaction(async (tx) => {
    const projeto = await tx.projeto.create({ data: { codigo: await proximoCodigoDoProjeto(tx), titulo: `${PREFIXO} ${titulo}`, clienteId, status: "ELABORANDO_PROPOSTA" } });
    const { numero, sequencial, ano } = await reservarNumeroDeProposta(tx);
    const proposta = await tx.proposta.create({
      data: {
        projetoId: projeto.id,
        numero,
        numeroSequencial: sequencial,
        ano,
        data: new Date(),
        clienteNome: `${PREFIXO} Cliente`,
        modoPrazo: "TOTAL",
        prazoTotalMaxDias: 35,
        opcoes: { create: [{ nome: "Opção 1", ordem: 0 }] },
        parcelas: {
          create: [
            { ordem: 1, descricao: "Sinal", percentualPb: 5000, gatilho: "CONFIRMACAO", forma: "PIX" },
            { ordem: 2, descricao: "Entrega e instalação", percentualPb: 5000, gatilho: "ENTREGA_E_INSTALACAO" },
          ],
        },
      },
      include: { opcoes: true },
    });
    for (const [i, v] of valores.entries()) {
      await tx.itemProposta.create({
        data: { propostaId: proposta.id, opcaoId: proposta.opcoes[0].id, ordem: i, descricao: `ITEM ${i + 1}`, modoPreco: "MANUAL", valorManualCentavos: v, precoTotalCentavos: v, medidas: { create: [{ larguraMm: 1000, alturaMm: 1000, quantidade: 1 }] } },
      });
    }
    return { projetoId: projeto.id, propostaId: proposta.id, opcaoId: proposta.opcoes[0].id, numero };
  });
}

const enviar = (propostaId: string) => prisma.$transaction((tx) => enviarProposta(tx, { usuario, propostaId }));
const revisar = (origemId: string) => prisma.$transaction((tx) => copiarProposta(tx, { usuarioId: usuario.id, origemId, modo: "REVISAO" }));
const aprovar = (propostaId: string, opcaoId: string, aceitaEm = "2026-11-16") =>
  prisma.$transaction((tx) => aprovarProposta(tx, { usuario, propostaId, opcaoId, forma: "WHATSAPP", aceitaEm }), { timeout: 30_000 });

describe("reprodução do caso real 2003-26: aprovar a original com a revisão ainda em rascunho", () => {
  it("o estado final é o relatado: original aprovada, revisão substituída, parcelas e tarefas da original, sem como voltar", async () => {
    const m = await montar("Reproducao");
    await enviar(m.propostaId);
    const rev = await revisar(m.propostaId);
    const revOpcao = (await prisma.opcaoProposta.findFirstOrThrow({ where: { propostaId: rev.id } })).id;
    // A revisão nunca foi enviada: sem snapshot.
    expect((await prisma.proposta.findUniqueOrThrow({ where: { id: rev.id } })).snapshot).toBeNull();

    await aprovar(m.propostaId, m.opcaoId);

    const original = await prisma.proposta.findUniqueOrThrow({ where: { id: m.propostaId } });
    const revisao = await prisma.proposta.findUniqueOrThrow({ where: { id: rev.id } });
    expect(original).toMatchObject({ status: "APROVADA", valorAprovadoCentavos: 1280000, formaAceite: "WHATSAPP" });
    expect(revisao.status).toBe("SUBSTITUIDA");

    const projeto = await prisma.projeto.findUniqueOrThrow({ where: { id: m.projetoId } });
    expect(projeto).toMatchObject({ status: "APROVADO", valorFechadoCentavos: 1280000 });
    expect(projeto.dataFechamento?.toISOString().slice(0, 10)).toBe("2026-11-16");

    const contas = await prisma.contaReceber.findMany({ where: { projetoId: m.projetoId }, orderBy: { ordem: "asc" } });
    expect(contas.map((c) => [c.propostaId, c.ordem, c.valorCentavos, c.status])).toEqual([
      [m.propostaId, 1, 640000, "ABERTA"],
      [m.propostaId, 2, 640000, "AGUARDANDO_GATILHO"],
    ]);
    expect(await prisma.tarefa.count({ where: { projetoId: m.projetoId, tipo: "AGENDAR_MEDICAO", chaveUnica: `medicao-exata:${m.propostaId}`, status: "ABERTA" } })).toBe(1);
    expect(await prisma.tarefa.count({ where: { projetoId: m.projetoId, tipo: "FOLLOW_UP_PROPOSTA", status: "ABERTA" } })).toBe(0);

    // O engano não tem saída: a revisão substituída não pode ser aprovada e a original não pode ser aprovada de novo.
    await expect(aprovar(rev.id, revOpcao)).rejects.toThrow();
    await expect(aprovar(m.propostaId, m.opcaoId)).rejects.toThrow(/já foi aprovada/);
  });
});
