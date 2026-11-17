import { NextResponse, type NextRequest } from "next/server";

import { registrarAuditoria } from "@/lib/auditoria";
import { sessaoParaApi } from "@/lib/auth/sessao";
import { csvDoRelatorio, type ColunaDeCsv } from "@/lib/csv/colunas";
import { respostaDeCsv } from "@/lib/csv/resposta";
import { prisma } from "@/lib/db";
import { ROTULO_FORMA, type FormaPagamento } from "@/lib/dominio/parcelas";
import { dataLocalDoInstante } from "@/lib/formatadores";
import { lerPeriodoDoExtrato } from "@/modules/financeiro/periodo";
import { extratoDaConta, LIMITE_DE_LINHAS_DO_EXTRATO, obterContaFinanceira, type ExtratoDaConta } from "@/modules/financeiro/queries";

export const dynamic = "force-dynamic";

type Linha = ExtratoDaConta["linhas"][number];

const COLUNAS: ColunaDeCsv<Linha>[] = [
  { titulo: "Data", tipo: "data", valor: (l) => l.lancamento.data },
  { titulo: "Descrição", tipo: "texto", valor: (l) => l.lancamento.descricao },
  { titulo: "Categoria", tipo: "texto", valor: (l) => l.lancamento.categoria ?? (l.lancamento.transferenciaId ? "Transferência" : "Sem categoria") },
  { titulo: "Forma", tipo: "texto", valor: (l) => (l.lancamento.forma ? (ROTULO_FORMA[l.lancamento.forma as FormaPagamento] ?? l.lancamento.forma) : null) },
  { titulo: "Entrada (R$)", tipo: "dinheiro", valor: (l) => (l.lancamento.tipo === "ENTRADA" ? l.lancamento.valorCentavos : null) },
  { titulo: "Saída (R$)", tipo: "dinheiro", valor: (l) => (l.lancamento.tipo === "SAIDA" ? l.lancamento.valorCentavos : null) },
  { titulo: "Saldo (R$)", tipo: "dinheiro", valor: (l) => l.saldoAposCentavos },
  { titulo: "Com nota", tipo: "texto", valor: (l) => (l.lancamento.comNotaFiscal ? "Sim" : null) },
  { titulo: "Conciliado", tipo: "texto", valor: (l) => (l.lancamento.conciliado ? "Sim" : null) },
  { titulo: "Observação", tipo: "texto", valor: (l) => (l.lancamento.estornado ? `Estornado: ${l.lancamento.motivoEstorno ?? ""}` : l.incluidoNoSaldoInicial ? "Já incluído no saldo inicial" : null) },
];

/** Extrato da conta em CSV, no mesmo período da tela. */
export async function GET(requisicao: NextRequest, contexto: { params: Promise<{ id: string }> }) {
  const usuario = await sessaoParaApi();
  if (!usuario) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  const { id } = await contexto.params;
  const hoje = dataLocalDoInstante(new Date());
  const conta = await obterContaFinanceira(id, hoje);
  if (!conta) return NextResponse.json({ erro: "Conta não encontrada." }, { status: 404 });

  const { de, ate } = lerPeriodoDoExtrato(Object.fromEntries(requisicao.nextUrl.searchParams), hoje);
  const extrato = await extratoDaConta(conta, de, ate);
  const avisos = [
    extrato.truncado ? `exportação limitada às primeiras ${LIMITE_DE_LINHAS_DO_EXTRATO} linhas do período. Escolha um período menor.` : null,
    !conta.saldoInicialInformado ? "saldo inicial não informado; o saldo mostra só o movimento registrado." : null,
  ].filter(Boolean);
  await registrarAuditoria(prisma, { usuario, entidade: "ContaFinanceira", entidadeId: conta.id, acao: "EXPORTAR", depois: { linhas: extrato.linhas.length, de, ate } });
  return respostaDeCsv(csvDoRelatorio(COLUNAS, extrato.linhas, { podeVerInterno: false, aviso: avisos.length > 0 ? avisos.join(" ") : null }), `extrato-${de}-${ate}.csv`);
}
