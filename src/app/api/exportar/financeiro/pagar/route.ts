import { NextResponse, type NextRequest } from "next/server";

import { registrarAuditoria } from "@/lib/auditoria";
import { sessaoParaApi } from "@/lib/auth/sessao";
import { gerarCsv } from "@/lib/csv";
import { prisma } from "@/lib/db";
import { dataLocalDoInstante, formatarMoeda } from "@/lib/formatadores";
import { textoDaSituacao } from "@/modules/financeiro/components/selo-da-situacao";
import { LIMITE_EXPORTACAO_A_PAGAR, lerListaAPagar, listarContasAPagarParaExportar } from "@/modules/financeiro/queries-pagar";
import { lerParametrosFinanceiros } from "@/modules/financeiro/queries-receber";

export const dynamic = "force-dynamic";

const data = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

/** Contas a pagar em CSV, com os MESMOS filtros e a mesma aba da lista. */
export async function GET(requisicao: NextRequest) {
  const usuario = await sessaoParaApi();
  if (!usuario) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  const hoje = dataLocalDoInstante(new Date());
  const { parametros, filtros } = lerListaAPagar(Object.fromEntries(requisicao.nextUrl.searchParams));
  const config = await lerParametrosFinanceiros();
  const { linhas, truncado } = await listarContasAPagarParaExportar(parametros, filtros, hoje, config.diasAlertaVencimento);

  const registros: unknown[][] = linhas.map((c) => [
    c.descricao,
    c.favorecido ?? "",
    c.categoria ?? "",
    c.obra ?? "",
    data(c.vencimento),
    textoDaSituacao(c.resumo),
    formatarMoeda(c.valorCentavos),
    formatarMoeda(c.valorPagoCentavos),
    formatarMoeda(c.resumo.saldoCentavos),
    c.recorrente ? "Sim" : "",
  ]);
  if (truncado) registros.push([`AVISO: exportação limitada às primeiras ${LIMITE_EXPORTACAO_A_PAGAR} contas. Use os filtros para obter o restante.`]);

  const csv = gerarCsv(["Conta", "Favorecido", "Categoria", "Obra", "Vencimento", "Situação", "Valor", "Pago", "Saldo", "Recorrente"], registros);
  await registrarAuditoria(prisma, { usuario, entidade: "ContaPagar", entidadeId: "exportacao-pagar", acao: "EXPORTAR", depois: { linhas: linhas.length, truncado, filtros } });

  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=\"a-pagar.csv\"", "Cache-Control": "no-store" },
  });
}
