import { NextResponse, type NextRequest } from "next/server";

import { registrarAuditoria } from "@/lib/auditoria";
import { sessaoParaApi } from "@/lib/auth/sessao";
import { csvDoRelatorio, type ColunaDeCsv } from "@/lib/csv/colunas";
import { respostaDeCsv } from "@/lib/csv/resposta";
import { prisma } from "@/lib/db";
import { dataLocalDoInstante } from "@/lib/formatadores";
import { textoDaSituacao } from "@/modules/financeiro/components/selo-da-situacao";
import { LIMITE_EXPORTACAO_A_PAGAR, lerListaAPagar, listarContasAPagarParaExportar } from "@/modules/financeiro/queries-pagar";
import { lerParametrosFinanceiros } from "@/modules/financeiro/queries-receber";

export const dynamic = "force-dynamic";

type Conta = Awaited<ReturnType<typeof listarContasAPagarParaExportar>>["linhas"][number];
const COLUNAS: ColunaDeCsv<Conta>[] = [
  { titulo: "Conta", tipo: "texto", valor: (c) => c.descricao },
  { titulo: "Favorecido", tipo: "texto", valor: (c) => c.favorecido },
  { titulo: "Categoria", tipo: "texto", valor: (c) => c.categoria },
  { titulo: "Obra", tipo: "texto", valor: (c) => c.obra },
  { titulo: "Vencimento", tipo: "data", valor: (c) => c.vencimento },
  { titulo: "Situação", tipo: "texto", valor: (c) => textoDaSituacao(c.resumo) },
  { titulo: "Valor (R$)", tipo: "dinheiro", valor: (c) => c.valorCentavos },
  { titulo: "Pago (R$)", tipo: "dinheiro", valor: (c) => c.valorPagoCentavos },
  { titulo: "Saldo (R$)", tipo: "dinheiro", valor: (c) => c.resumo.saldoCentavos },
  { titulo: "Recorrente", tipo: "texto", valor: (c) => (c.recorrente ? "Sim" : null) },
];

/** Contas a pagar em CSV, com os MESMOS filtros e a mesma aba da lista. */
export async function GET(requisicao: NextRequest) {
  const usuario = await sessaoParaApi();
  if (!usuario) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  const hoje = dataLocalDoInstante(new Date());
  const { parametros, filtros } = lerListaAPagar(Object.fromEntries(requisicao.nextUrl.searchParams));
  const config = await lerParametrosFinanceiros();
  const { linhas, truncado } = await listarContasAPagarParaExportar(parametros, filtros, hoje, config.diasAlertaVencimento);

  const aviso = truncado ? `exportação limitada às primeiras ${LIMITE_EXPORTACAO_A_PAGAR} contas. Use os filtros para obter o restante.` : null;
  const csv = csvDoRelatorio(COLUNAS, linhas, { podeVerInterno: false, aviso });
  await registrarAuditoria(prisma, { usuario, entidade: "ContaPagar", entidadeId: "exportacao-pagar", acao: "EXPORTAR", depois: { linhas: linhas.length, truncado, filtros } });

  return respostaDeCsv(csv, "a-pagar.csv");
}
