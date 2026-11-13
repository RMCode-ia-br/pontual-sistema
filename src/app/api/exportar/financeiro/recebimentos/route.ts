import { NextResponse, type NextRequest } from "next/server";

import { registrarAuditoria } from "@/lib/auditoria";
import { sessaoParaApi } from "@/lib/auth/sessao";
import { csvDoRelatorio, type ColunaDeCsv } from "@/lib/csv/colunas";
import { respostaDeCsv } from "@/lib/csv/resposta";
import { prisma } from "@/lib/db";
import { ROTULO_FORMA, type FormaPagamento } from "@/lib/dominio/parcelas";
import { dataLocalDoInstante } from "@/lib/formatadores";
import { lerPeriodo, rotuloDoPeriodo } from "@/lib/periodo";
import { LIMITE_DO_CSV_DE_RECEBIMENTOS, lerFiltroDeNota, recebimentosParaCsv, type LinhaDeRecebimento } from "@/modules/indicadores/lista-de-recebimentos";

export const dynamic = "force-dynamic";

const COLUNAS: ColunaDeCsv<LinhaDeRecebimento>[] = [
  { titulo: "Data do pagamento", tipo: "data", valor: (l) => l.data },
  { titulo: "Cliente", tipo: "texto", valor: (l) => l.cliente },
  { titulo: "Obra", tipo: "texto", valor: (l) => l.obra },
  { titulo: "Conta a receber", tipo: "texto", valor: (l) => l.descricao.replace(/^Recebimento: /, "") },
  { titulo: "Forma", tipo: "texto", valor: (l) => (l.forma ? (ROTULO_FORMA[l.forma as FormaPagamento] ?? l.forma) : null) },
  { titulo: "Conta financeira", tipo: "texto", valor: (l) => l.conta },
  { titulo: "Nota fiscal", tipo: "texto", valor: (l) => (l.comNotaFiscal ? "Com nota" : "Sem nota") },
  { titulo: "Valor (R$)", tipo: "dinheiro", valor: (l) => l.valorCentavos },
];

/** Recebimentos do período em CSV, com o MESMO período e filtro de nota da tela. */
export async function GET(requisicao: NextRequest) {
  const usuario = await sessaoParaApi();
  if (!usuario) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  const parametros = Object.fromEntries(requisicao.nextUrl.searchParams);
  const { periodo } = lerPeriodo(parametros, dataLocalDoInstante(new Date()));
  const nota = lerFiltroDeNota(parametros.nota);
  const { linhas, truncado } = await recebimentosParaCsv(periodo, nota);
  const csv = csvDoRelatorio(COLUNAS, linhas, { podeVerInterno: false, aviso: truncado ? `exportação limitada aos ${LIMITE_DO_CSV_DE_RECEBIMENTOS} recebimentos mais recentes de ${rotuloDoPeriodo(periodo)}. Escolha um período menor.` : null });
  await registrarAuditoria(prisma, { usuario, entidade: "Relatorio", entidadeId: "recebimentos", acao: "EXPORTAR", depois: { linhas: linhas.length, periodo, nota: nota ?? null } });
  return respostaDeCsv(csv, "recebimentos.csv");
}
