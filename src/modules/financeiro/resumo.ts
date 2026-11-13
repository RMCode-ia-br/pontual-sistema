import "server-only";

import { prisma } from "@/lib/db";
import { janelasDeDias, projetarFluxo } from "@/lib/dominio/fluxo-caixa";
import { somarDias } from "@/lib/dominio/calendario";
import { situacaoDoTitulo } from "@/lib/dominio/titulos";
import { dataLocalDoInstante } from "@/lib/formatadores";

import { carregarDadosDoFluxo, type ResumoDeTitulos } from "./queries-fluxo";
import { lerParametrosFinanceiros } from "./queries-receber";

const comoData = (texto: string): Date => new Date(`${texto}T00:00:00Z`);
const comoTexto = (d: Date): string => d.toISOString().slice(0, 10);

export type ContaEmAtencao = { id: string; descricao: string; quem: string; saldoCentavos: number; vencimento: string; diasEmAtraso: number };

export type ResumoFinanceiro = {
  temContas: boolean;
  saldoAtualCentavos: number;
  contasSemSaldo: number;
  receber: ResumoDeTitulos;
  pagar: ResumoDeTitulos;
  projetado: { em30Centavos: number; em60Centavos: number; em90Centavos: number };
  /** Recebido = soma dos recebimentos de contas a receber (lançamentos não estornados) pela data do recebimento. */
  metaMensalCentavos: number;
  diasDeAlerta: number;
  receberEmAtencao: ContaEmAtencao[];
  pagarEmAtencao: ContaEmAtencao[];
};

/**
 * Números financeiros do painel. Definições (mostradas na tela):
 * - saldo: soma dos saldos das contas financeiras ativas hoje (conta sem saldo informado soma só o movimento);
 * - a receber / a pagar: o que falta receber/pagar das contas em aberto, em vencido, vence hoje e próximos N dias (Configurações);
 * - projetado: saldo atual + entradas previstas − saídas previstas em 30, 60 e 90 dias (o a receber vencido entra como esperado
 *   para hoje, ou na data que o cliente prometeu; o a pagar vencido sai já no primeiro período);
 * - recebido no mês: recebimentos de parcelas e cobranças pela data do pagamento, sem estornos.
 */
export async function resumoFinanceiro(agora: Date = new Date()): Promise<ResumoFinanceiro> {
  const hoje = dataLocalDoInstante(agora);
  const config = await lerParametrosFinanceiros();
  const primeiroDoMes = `${hoje.slice(0, 7)}-01`;

  const dados = await carregarDadosDoFluxo(hoje, { desde: primeiroDoMes, ate: somarDias(hoje, 90), diasEmBreve: config.diasAlertaVencimento });
  const proj = projetarFluxo({ hoje, saldoAtualCentavos: dados.saldoAtualCentavos, periodos: janelasDeDias(hoje, [30, 60, 90]), aReceber: dados.aReceber, aPagar: dados.aPagar });

  const [empresa, receber, pagar] = await Promise.all([
    prisma.configuracaoEmpresa.findUnique({ where: { id: "singleton" }, select: { metaFaturamentoMensalCentavos: true } }),
    prisma.contaReceber.findMany({
      where: { deletadoEm: null, status: { in: ["ABERTA", "PARCIAL"] }, vencimento: { lte: comoData(hoje) } },
      orderBy: [{ vencimento: "asc" }, { id: "asc" }],
      take: 5,
      select: { id: true, descricao: true, vencimento: true, valorCentavos: true, valorPagoCentavos: true, status: true, cliente: { select: { nome: true } } },
    }),
    prisma.contaPagar.findMany({
      where: { deletadoEm: null, status: { in: ["ABERTA", "PARCIAL"] }, vencimento: { lte: comoData(hoje) } },
      orderBy: [{ vencimento: "asc" }, { id: "asc" }],
      take: 5,
      select: { id: true, descricao: true, vencimento: true, valorCentavos: true, valorPagoCentavos: true, status: true, favorecido: true, fornecedor: { select: { razaoSocial: true, nomeFantasia: true } }, funcionario: { select: { nome: true } } },
    }),
  ]);

  const emAtencao = (
    t: { id: string; descricao: string; vencimento: Date | null; valorCentavos: number; valorPagoCentavos: number; status: "ABERTA" | "PARCIAL" | "PAGA" | "CANCELADA" | "AGUARDANDO_GATILHO" },
    quem: string,
  ): ContaEmAtencao => {
    const vencimento = comoTexto(t.vencimento!);
    const r = situacaoDoTitulo({ status: t.status, vencimento, valorCentavos: t.valorCentavos, valorPagoCentavos: t.valorPagoCentavos }, hoje);
    return { id: t.id, descricao: t.descricao, quem, saldoCentavos: r.saldoCentavos, vencimento, diasEmAtraso: r.diasEmAtraso };
  };

  return {
    temContas: dados.contas.length > 0,
    saldoAtualCentavos: dados.saldoAtualCentavos,
    contasSemSaldo: dados.contasSemSaldo.length,
    receber: dados.resumoReceber,
    pagar: dados.resumoPagar,
    projetado: { em30Centavos: proj.linhas[0].saldoProjetadoCentavos, em60Centavos: proj.linhas[1].saldoProjetadoCentavos, em90Centavos: proj.linhas[2].saldoProjetadoCentavos },
    metaMensalCentavos: empresa?.metaFaturamentoMensalCentavos ?? 0,
    diasDeAlerta: config.diasAlertaVencimento,
    receberEmAtencao: receber.map((t) => emAtencao(t, t.cliente.nome)),
    pagarEmAtencao: pagar.map((t) => emAtencao(t, t.fornecedor ? t.fornecedor.nomeFantasia?.trim() || t.fornecedor.razaoSocial : (t.funcionario?.nome ?? t.favorecido ?? ""))),
  };
}
