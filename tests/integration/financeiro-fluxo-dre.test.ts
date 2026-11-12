import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { UsuarioSessao } from "@/lib/auth/sessao";
import { criarClientePrisma } from "@/lib/db/criar-cliente";
import { linhasDaDemonstracao, montarDre } from "@/lib/dominio/dre";
import { carregarMovimentosDoDre, lerPeriodoDoDre } from "@/modules/financeiro/queries-dre";
import { janelasDeDias, projetarFluxo } from "@/lib/dominio/fluxo-caixa";
import { carregarDadosDoFluxo } from "@/modules/financeiro/queries-fluxo";
import { agingDoPagar, agingDoReceber } from "@/modules/financeiro/queries-aging";
import { criarTransferencia } from "@/modules/financeiro/servico-lancamentos";
import { transferenciaSchema } from "@/modules/financeiro/schemas";

import { comConexao, criarUsuarioDeTeste } from "./banco-teste";

const PREFIXO = "Int FinF";
const LOGIN = "int-fin-fluxo";
const prisma = criarClientePrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL);

let usuario: UsuarioSessao;
let contaA: string;
let contaB: string;
let cat: { receita: string; das: string; custos: string; fixa: string };
let clienteId: string;
let projetoId: string;

const dia = (d: string) => new Date(`${d}T00:00:00Z`);

async function limpar() {
  await comConexao(async (c) => {
    await c.query(`DELETE FROM "LogAuditoria" WHERE "usuarioId" IN (SELECT id FROM "Usuario" WHERE login = $1)`, [LOGIN]);
    await c.query(`DELETE FROM "Lancamento" WHERE "contaFinanceiraId" IN (SELECT id FROM "ContaFinanceira" WHERE nome LIKE $1)`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "ContaPagar" WHERE descricao LIKE $1`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "RecorrenciaPagar" WHERE descricao LIKE $1`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "ContaReceber" WHERE descricao LIKE $1`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Projeto" WHERE titulo LIKE $1`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Cliente" WHERE nome LIKE $1`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "ContaFinanceira" WHERE nome LIKE $1`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "CategoriaFinanceira" WHERE nome LIKE $1`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Usuario" WHERE login = $1`, [LOGIN]);
  });
}

beforeAll(async () => {
  await limpar();
  await criarUsuarioDeTeste(LOGIN, "senha-de-teste-123");
  const u = await prisma.usuario.findUniqueOrThrow({ where: { login: LOGIN } });
  usuario = { id: u.id, nome: u.nome, login: u.login, email: u.email, papel: "ADMIN", precisaTrocarSenha: false };
  contaA = (await prisma.contaFinanceira.create({ data: { nome: `${PREFIXO} Banco A`, saldoInicialInformado: true, saldoInicialCentavos: 100000, dataSaldoInicial: dia("2031-03-01") } })).id;
  contaB = (await prisma.contaFinanceira.create({ data: { nome: `${PREFIXO} Banco B` } })).id;
  const nova = async (nome: string, tipo: "RECEITA" | "DESPESA", grupo: "RECEITAS_OPERACIONAIS" | "IMPOSTOS" | "CUSTOS_DIRETOS" | "DESPESAS_FIXAS") =>
    (await prisma.categoriaFinanceira.create({ data: { nome: `${PREFIXO} ${nome}`, tipo, grupo, grupoDre: nome } })).id;
  cat = {
    receita: await nova("Receita", "RECEITA", "RECEITAS_OPERACIONAIS"),
    das: await nova("DAS", "DESPESA", "IMPOSTOS"),
    custos: await nova("Custos", "DESPESA", "CUSTOS_DIRETOS"),
    fixa: await nova("Aluguel", "DESPESA", "DESPESAS_FIXAS"),
  };
  clienteId = (await prisma.cliente.create({ data: { nome: `${PREFIXO} Cliente`, tipoPessoa: "PF" } })).id;
  projetoId = (await prisma.projeto.create({ data: { codigo: `P-0000-${randomUUID().slice(0, 8)}`, titulo: `${PREFIXO} Obra`, clienteId, status: "APROVADO" } })).id;
});

afterAll(async () => {
  await limpar();
  await prisma.$disconnect();
});

const lanc = (extra: { data: string; tipo: "ENTRADA" | "SAIDA"; valor: number; categoriaId: string | null; contaReceberId?: string; estornado?: boolean; contaId?: string }) =>
  prisma.lancamento.create({
    data: {
      data: dia(extra.data),
      tipo: extra.tipo,
      valorCentavos: extra.valor,
      contaFinanceiraId: extra.contaId ?? contaA,
      categoriaId: extra.categoriaId,
      descricao: `${PREFIXO} lançamento`,
      contaReceberId: extra.contaReceberId ?? null,
      projetoId: extra.contaReceberId ? projetoId : null,
      clienteId: extra.contaReceberId ? clienteId : null,
      estornadoEm: extra.estornado ? new Date() : null,
      motivoEstorno: extra.estornado ? "teste" : null,
    },
  });

describe("DRE bate com os lançamentos (critério de aceite)", () => {
  let receberId: string;

  beforeAll(async () => {
    await lanc({ data: "2031-03-10", tipo: "ENTRADA", valor: 100000, categoriaId: cat.receita });
    await lanc({ data: "2031-03-20", tipo: "ENTRADA", valor: 20000, categoriaId: cat.receita });
    await lanc({ data: "2031-03-15", tipo: "SAIDA", valor: 15000, categoriaId: cat.das });
    await lanc({ data: "2031-03-16", tipo: "SAIDA", valor: 40000, categoriaId: cat.custos });
    await lanc({ data: "2031-04-05", tipo: "SAIDA", valor: 8000, categoriaId: cat.fixa });
    await lanc({ data: "2031-04-06", tipo: "SAIDA", valor: 500, categoriaId: null }); // sem categoria
    await lanc({ data: "2031-04-07", tipo: "SAIDA", valor: 9999, categoriaId: cat.fixa, estornado: true }); // estornado: fora
    await prisma.$transaction((tx) => criarTransferencia(tx, transferenciaSchema.parse({ contaOrigemId: contaA, contaDestinoId: contaB, data: "2031-03-18", valor: "300,00" }), { usuario, ip: null, agora: new Date("2031-12-31T12:00:00Z") }));

    // Competência: uma parcela de 50.000 (20.000 já recebidos: o recebimento NÃO pode contar de novo) e uma conta a pagar.
    const parcela = await prisma.contaReceber.create({
      data: { projetoId, clienteId, ordem: 1, descricao: `${PREFIXO} Parcela`, valorCentavos: 50000, valorPagoCentavos: 20000, status: "PARCIAL", vencimento: dia("2031-03-25"), categoriaFinanceiraId: cat.receita },
    });
    receberId = parcela.id;
    await lanc({ data: "2031-03-26", tipo: "ENTRADA", valor: 20000, categoriaId: cat.receita, contaReceberId: receberId });
    await prisma.contaPagar.create({ data: { descricao: `${PREFIXO} Aluguel abril`, valorCentavos: 7000, vencimento: dia("2031-05-05"), competencia: dia("2031-04-01"), categoriaId: cat.fixa } });
    await prisma.contaPagar.create({ data: { descricao: `${PREFIXO} Cancelada`, valorCentavos: 9000, vencimento: dia("2031-04-05"), competencia: dia("2031-04-01"), categoriaId: cat.fixa, status: "CANCELADA" } });
  });

  it("caixa: março e abril conferidos à mão", async () => {
    const periodo = lerPeriodoDoDre({ de: "2031-03", ate: "2031-04", regime: "caixa" }, "2031-12-31");
    const dre = montarDre(await carregarMovimentosDoDre(periodo), periodo.meses);
    const [mar, abr] = dre.meses;
    // Março: receita 100.000 + 20.000 + o recebimento de 20.000 da parcela = 140.000; DAS 15.000; custos 40.000.
    expect(mar.receitaOperacionalCentavos).toBe(140000);
    expect(mar.impostosCentavos).toBe(15000);
    expect(mar.custosDiretosCentavos).toBe(40000);
    expect(mar.resultadoCentavos).toBe(140000 - 15000 - 40000);
    // Abril: aluguel 8.000 e 500 sem categoria; o estornado e a transferência não entram.
    expect(abr.despesasPorGrupoCentavos.DESPESAS_FIXAS).toBe(8000);
    expect(abr.semCategoriaCentavos).toBe(-500);
    expect(abr.resultadoCentavos).toBe(-8000 - 500);
  });

  it("caixa: o resultado do período é exatamente entradas − saídas dos lançamentos não estornados e sem transferência", async () => {
    const periodo = lerPeriodoDoDre({ de: "2031-03", ate: "2031-04", regime: "caixa" }, "2031-12-31");
    const dre = montarDre(await carregarMovimentosDoDre(periodo), periodo.meses);
    const soma = await comConexao(async (c) => {
      const r = await c.query(
        `SELECT COALESCE(SUM(CASE WHEN tipo = 'ENTRADA' THEN "valorCentavos" ELSE -"valorCentavos" END), 0)::int AS total
           FROM "Lancamento" WHERE "estornadoEm" IS NULL AND "deletadoEm" IS NULL AND "transferenciaId" IS NULL AND data BETWEEN '2031-03-01' AND '2031-04-30'`,
      );
      return r.rows[0].total as number;
    });
    expect(dre.total.resultadoCentavos).toBe(soma);
    // E a última linha da demonstração é esse mesmo número.
    expect(linhasDaDemonstracao(dre).at(-1)!.totalCentavos).toBe(soma);
  });

  it("competência: a parcela entra pelo valor cheio (sem contar o recebimento de novo); a conta cancelada fica de fora", async () => {
    const periodo = lerPeriodoDoDre({ de: "2031-03", ate: "2031-04", regime: "competencia" }, "2031-12-31");
    const dre = montarDre(await carregarMovimentosDoDre(periodo), periodo.meses);
    const [mar, abr] = dre.meses;
    // Março: avulsos (100.000 + 20.000) + a parcela de 50.000 pelo vencimento (o recebimento de 20.000 já está nela).
    expect(mar.receitaOperacionalCentavos).toBe(100000 + 20000 + 50000);
    // Abril: aluguel por competência 7.000 (a conta de maio de vencimento) + o aluguel avulso de 8.000; 500 sem categoria; a cancelada não entra.
    expect(abr.despesasPorGrupoCentavos.DESPESAS_FIXAS).toBe(7000 + 8000);
    expect(abr.semCategoriaCentavos).toBe(-500);
  });

  it("período padrão: 6 meses até o mês de hoje; datas inválidas voltam ao padrão", () => {
    const p = lerPeriodoDoDre({}, "2026-11-20");
    expect(p.meses).toEqual(["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]);
    expect(p.regime).toBe("caixa");
    expect(lerPeriodoDoDre({ de: "abc", ate: "2026-13" }, "2026-11-20").meses).toHaveLength(6);
    expect(lerPeriodoDoDre({ de: "2026-05", ate: "2026-03" }, "2026-11-20").meses).toEqual(["2026-03", "2026-04", "2026-05"]);
  });
});

describe("fluxo de caixa projetado (comparado antes e depois, para não depender dos dados reais)", () => {
  const HOJE = "2026-11-20";
  const opcoes = { desde: "2026-08-01", ate: "2027-02-28", diasEmBreve: 7 };
  const soma = (m: { valorCentavos: number }[]) => m.reduce((s, x) => s + x.valorCentavos, 0);

  it("títulos em aberto, parcela sem previsão e recorrência ainda não gerada entram; o gerado não conta duas vezes", async () => {
    const antes = await carregarDadosDoFluxo(HOJE, opcoes);

    await prisma.contaReceber.create({ data: { projetoId, clienteId, ordem: 2, descricao: `${PREFIXO} Receber aberta`, valorCentavos: 30000, vencimento: dia("2026-11-25"), status: "ABERTA" } });
    await prisma.contaReceber.create({ data: { projetoId, clienteId, ordem: 3, descricao: `${PREFIXO} Aguardando`, valorCentavos: 20000, status: "AGUARDANDO_GATILHO", gatilho: "ENTREGA_MATERIAL" } });
    await prisma.contaPagar.create({ data: { descricao: `${PREFIXO} Pagar aberta`, valorCentavos: 10000, vencimento: dia("2026-12-20"), competencia: dia("2026-12-01"), categoriaId: cat.fixa } });
    const rec = await prisma.recorrenciaPagar.create({ data: { descricao: `${PREFIXO} Recorrência`, valorCentavos: 5000, diaVencimento: 10, inicio: dia("2026-12-10"), categoriaId: cat.fixa } });

    const depois = await carregarDadosDoFluxo(HOJE, opcoes);
    expect(soma(depois.aReceber) - soma(antes.aReceber)).toBe(30000 + 20000);
    expect(depois.aReceber.filter((m) => m.data === null).length - antes.aReceber.filter((m) => m.data === null).length).toBe(1); // a parcela sem etapa não tem previsão
    expect(depois.resumoReceber.proximosCentavos - antes.resumoReceber.proximosCentavos).toBe(30000); // 25/11 está dentro dos 7 dias
    // Pagar: a conta de 10.000 + 3 ocorrências virtuais da recorrência (dez, jan e fev) de 5.000.
    expect(soma(depois.aPagar) - soma(antes.aPagar)).toBe(10000 + 3 * 5000);
    expect(depois.recorrenciasVirtuais - antes.recorrenciasVirtuais).toBe(3);

    // Gerar a de dezembro: ela passa a ser conta de verdade e a virtual correspondente some (nada em dobro).
    await prisma.contaPagar.create({ data: { descricao: `${PREFIXO} Recorrência`, valorCentavos: 5000, vencimento: dia("2026-12-10"), competencia: dia("2026-12-01"), categoriaId: cat.fixa, recorrenciaId: rec.id } });
    const gerada = await carregarDadosDoFluxo(HOJE, opcoes);
    expect(soma(gerada.aPagar) - soma(antes.aPagar)).toBe(10000 + 5000 + 2 * 5000);
    expect(gerada.recorrenciasVirtuais - antes.recorrenciasVirtuais).toBe(2);

    // Cancelada não é "ressuscitada" como virtual.
    await prisma.contaPagar.updateMany({ where: { recorrenciaId: rec.id }, data: { status: "CANCELADA" } });
    const cancelada = await carregarDadosDoFluxo(HOJE, opcoes);
    expect(cancelada.recorrenciasVirtuais - antes.recorrenciasVirtuais).toBe(2);
    expect(soma(cancelada.aPagar) - soma(antes.aPagar)).toBe(10000 + 2 * 5000);
  });

  it("a receber VENCIDO entra no primeiro período; com promessa do cliente, entra na data prometida; o atraso (resumo) segue o vencimento original", async () => {
    const janelas = janelasDeDias(HOJE, [30, 60]);
    const projetar = (d: Awaited<ReturnType<typeof carregarDadosDoFluxo>>) => projetarFluxo({ hoje: HOJE, saldoAtualCentavos: d.saldoAtualCentavos, periodos: janelas, aReceber: d.aReceber, aPagar: d.aPagar });
    const antes = await carregarDadosDoFluxo(HOJE, opcoes);
    const fAntes = projetar(antes);

    // 3.000 vencidos sem promessa; 5.000 vencidos com promessa para 05/01 (2º período, até 19/01); 700 vencidos com promessa já vencida (volta para hoje).
    await prisma.contaReceber.create({ data: { projetoId, clienteId, ordem: 11, descricao: `${PREFIXO} Vencida sem promessa`, valorCentavos: 3000, vencimento: dia("2026-11-05"), status: "ABERTA" } });
    await prisma.contaReceber.create({ data: { projetoId, clienteId, ordem: 12, descricao: `${PREFIXO} Vencida prometida`, valorCentavos: 5000, vencimento: dia("2026-11-05"), dataPrometida: dia("2027-01-05"), status: "ABERTA" } });
    await prisma.contaReceber.create({ data: { projetoId, clienteId, ordem: 13, descricao: `${PREFIXO} Promessa vencida`, valorCentavos: 700, vencimento: dia("2026-11-05"), dataPrometida: dia("2026-11-10"), status: "ABERTA" } });

    const depois = await carregarDadosDoFluxo(HOJE, opcoes);
    const fDepois = projetar(depois);
    expect(fDepois.linhas[0].entradasCentavos - fAntes.linhas[0].entradasCentavos).toBe(3000 + 700); // hoje
    expect(fDepois.linhas[0].entradasVencidasCentavos - fAntes.linhas[0].entradasVencidasCentavos).toBe(3000 + 700);
    expect(fDepois.linhas[1].entradasCentavos - fAntes.linhas[1].entradasCentavos).toBe(5000); // na data prometida
    expect(fDepois.vencidos.aReceberCentavos - fAntes.vencidos.aReceberCentavos).toBe(3000 + 5000 + 700);
    expect(fDepois.vencidos.aReceberPrometidoCentavos - fAntes.vencidos.aReceberPrometidoCentavos).toBe(5000);
    // Atraso e inadimplência (resumo do a receber) ignoram a promessa: as três continuam vencidas no original.
    expect(depois.resumoReceber.vencidoCentavos - antes.resumoReceber.vencidoCentavos).toBe(3000 + 5000 + 700);
  });

  it("as contas ativas sem saldo informado são listadas (aviso no fluxo e no DRE)", async () => {
    const d = await carregarDadosDoFluxo(HOJE, opcoes);
    expect(d.contasSemSaldo).toContain(`${PREFIXO} Banco B`);
    expect(d.contasSemSaldo).not.toContain(`${PREFIXO} Banco A`);
  });
});

describe("contas por idade", () => {
  it("o aging do receber e do pagar soma o que falta e separa o atrasado", async () => {
    const hoje = "2026-11-20";
    const antesR = await agingDoReceber(hoje);
    const antesP = await agingDoPagar(hoje);
    await prisma.contaReceber.create({ data: { projetoId, clienteId, ordem: 4, descricao: `${PREFIXO} Atrasada 40 dias`, valorCentavos: 10000, valorPagoCentavos: 4000, status: "PARCIAL", vencimento: dia("2026-10-11") } });
    await prisma.contaPagar.create({ data: { descricao: `${PREFIXO} Pagar atrasada`, valorCentavos: 8000, vencimento: dia("2026-11-19"), competencia: dia("2026-11-01"), categoriaId: cat.fixa } });
    const r = await agingDoReceber(hoje);
    const p = await agingDoPagar(hoje);
    expect(r.porCliente.totalCentavos - antesR.porCliente.totalCentavos).toBe(6000); // só a parcial (saldo 6.000 = 10.000 − 4.000 já recebidos)
    expect(r.porCliente.totaisPorFaixa.ATRASO_31_60 - antesR.porCliente.totaisPorFaixa.ATRASO_31_60).toBe(6000);
    expect(p.porFornecedor.atrasadoCentavos - antesP.porFornecedor.atrasadoCentavos).toBe(8000);
    expect(p.porCategoria.totalCentavos).toBe(p.porFornecedor.totalCentavos); // o mesmo total, visto por categoria
  });
});
