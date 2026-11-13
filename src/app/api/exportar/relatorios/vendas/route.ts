import { NextResponse, type NextRequest } from "next/server";

import { registrarAuditoria } from "@/lib/auditoria";
import { sessaoParaApi } from "@/lib/auth/sessao";
import { csvDoRelatorio, type ColunaDeCsv } from "@/lib/csv/colunas";
import { respostaDeCsv } from "@/lib/csv/resposta";
import { prisma } from "@/lib/db";
import { dataLocalDoInstante } from "@/lib/formatadores";
import { lerPeriodo, rotuloDoPeriodo } from "@/lib/periodo";
import { LIMITE_DE_LINHAS_DE_VENDAS, listarVendas, type LinhaDeVenda } from "@/modules/indicadores/vendas";

export const dynamic = "force-dynamic";

const COLUNAS: ColunaDeCsv<LinhaDeVenda>[] = [
  { titulo: "Proposta", tipo: "texto", valor: (l) => l.numero },
  { titulo: "Código da obra", tipo: "texto", valor: (l) => l.projetoCodigo },
  { titulo: "Obra", tipo: "texto", valor: (l) => l.projetoTitulo },
  { titulo: "Cliente", tipo: "texto", valor: (l) => l.cliente },
  { titulo: "Aprovada em", tipo: "dataHora", valor: (l) => l.aceitaEm },
  { titulo: "Nota fiscal", tipo: "texto", valor: (l) => (l.comNotaFiscal ? "Com nota" : "Sem nota") },
  { titulo: "Valor aprovado (R$)", tipo: "dinheiro", valor: (l) => l.valorCentavos },
];

/** Vendas do período em CSV, com o MESMO período da tela. */
export async function GET(requisicao: NextRequest) {
  const usuario = await sessaoParaApi();
  if (!usuario) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  const { periodo } = lerPeriodo(Object.fromEntries(requisicao.nextUrl.searchParams), dataLocalDoInstante(new Date()));
  const { linhas, truncado } = await listarVendas(periodo);
  // Valor aprovado não é custo: vai inteiro. Nenhuma coluna interna aqui.
  const csv = csvDoRelatorio(COLUNAS, linhas, { podeVerInterno: false, aviso: truncado ? `exportação limitada às ${LIMITE_DE_LINHAS_DE_VENDAS} aprovações mais recentes de ${rotuloDoPeriodo(periodo)}. Escolha um período menor.` : null });
  await registrarAuditoria(prisma, { usuario, entidade: "Relatorio", entidadeId: "vendas", acao: "EXPORTAR", depois: { linhas: linhas.length, periodo } });
  return respostaDeCsv(csv, "vendas-por-periodo.csv");
}
