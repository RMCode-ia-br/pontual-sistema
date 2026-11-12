import { NextResponse, type NextRequest } from "next/server";

import { registrarAuditoria } from "@/lib/auditoria";
import { sessaoParaApi } from "@/lib/auth/sessao";
import { gerarCsv } from "@/lib/csv";
import { prisma } from "@/lib/db";
import { ROTULO_FORMA, type FormaPagamento } from "@/lib/dominio/parcelas";
import { dataLocalDoInstante, formatarMoeda } from "@/lib/formatadores";
import { lerPeriodoDoExtrato } from "@/modules/financeiro/periodo";
import { extratoDaConta, obterContaFinanceira } from "@/modules/financeiro/queries";

export const dynamic = "force-dynamic";

const data = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

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

  const registros: unknown[][] = extrato.linhas.map(({ lancamento: l, saldoAposCentavos, incluidoNoSaldoInicial }) => [
    data(l.data),
    l.descricao,
    l.categoria ?? (l.transferenciaId ? "Transferência" : "Sem categoria"),
    l.forma ? (ROTULO_FORMA[l.forma as FormaPagamento] ?? l.forma) : "",
    l.tipo === "ENTRADA" ? formatarMoeda(l.valorCentavos) : "",
    l.tipo === "SAIDA" ? formatarMoeda(l.valorCentavos) : "",
    formatarMoeda(saldoAposCentavos),
    l.comNotaFiscal ? "Sim" : "",
    l.conciliado ? "Sim" : "",
    l.estornado ? `Estornado: ${l.motivoEstorno ?? ""}` : incluidoNoSaldoInicial ? "Já incluído no saldo inicial" : "",
  ]);
  if (!conta.saldoInicialInformado) registros.push(["AVISO: saldo inicial não informado; o saldo mostra só o movimento registrado."]);

  const csv = gerarCsv(["Data", "Descrição", "Categoria", "Forma", "Entrada", "Saída", "Saldo", "Com nota", "Conciliado", "Observação"], registros);
  await registrarAuditoria(prisma, { usuario, entidade: "ContaFinanceira", entidadeId: conta.id, acao: "EXPORTAR", depois: { linhas: extrato.linhas.length, de, ate } });

  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="extrato-${de}-${ate}.csv"`, "Cache-Control": "no-store" },
  });
}
