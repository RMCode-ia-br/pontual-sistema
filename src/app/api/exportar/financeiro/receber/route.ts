import { NextResponse, type NextRequest } from "next/server";

import { registrarAuditoria } from "@/lib/auditoria";
import { sessaoParaApi } from "@/lib/auth/sessao";
import { gerarCsv } from "@/lib/csv";
import { prisma } from "@/lib/db";
import { ROTULO_FORMA, type FormaPagamento } from "@/lib/dominio/parcelas";
import { dataLocalDoInstante, formatarMoeda } from "@/lib/formatadores";
import { textoDaSituacao } from "@/modules/financeiro/components/selo-da-situacao";
import { LIMITE_EXPORTACAO_A_RECEBER, lerListaAReceber, lerParametrosFinanceiros, listarContasAReceberParaExportar } from "@/modules/financeiro/queries-receber";

export const dynamic = "force-dynamic";

const data = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "");

/** Contas a receber em CSV, com os MESMOS filtros e a mesma aba da lista. */
export async function GET(requisicao: NextRequest) {
  const usuario = await sessaoParaApi();
  if (!usuario) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  const hoje = dataLocalDoInstante(new Date());
  const { parametros, filtros } = lerListaAReceber(Object.fromEntries(requisicao.nextUrl.searchParams));
  const config = await lerParametrosFinanceiros();
  const { linhas, truncado } = await listarContasAReceberParaExportar(parametros, filtros, hoje, config.diasAlertaVencimento);

  const registros: unknown[][] = linhas.map((c) => [
    c.descricao,
    c.clienteNome,
    c.projetoCodigo ? `${c.projetoCodigo} ${c.projetoTitulo ?? ""}`.trim() : "",
    data(c.vencimento),
    textoDaSituacao(c.resumo),
    formatarMoeda(c.valorCentavos),
    formatarMoeda(c.valorPagoCentavos),
    formatarMoeda(c.resumo.saldoCentavos),
    c.forma ? (ROTULO_FORMA[c.forma as FormaPagamento] ?? c.forma) : "",
    c.comNotaFiscal ? "Com nota" : "Sem nota",
  ]);
  if (truncado) registros.push([`AVISO: exportação limitada às primeiras ${LIMITE_EXPORTACAO_A_RECEBER} contas. Use os filtros para obter o restante.`]);

  const csv = gerarCsv(["Parcela", "Cliente", "Obra", "Vencimento", "Situação", "Valor", "Recebido", "Saldo", "Forma", "Nota fiscal"], registros);
  await registrarAuditoria(prisma, { usuario, entidade: "ContaReceber", entidadeId: "exportacao-receber", acao: "EXPORTAR", depois: { linhas: linhas.length, truncado, filtros } });

  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=\"a-receber.csv\"", "Cache-Control": "no-store" },
  });
}
