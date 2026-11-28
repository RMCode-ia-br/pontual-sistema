import { NextResponse, type NextRequest } from "next/server";

import { registrarAuditoria } from "@/lib/auditoria";
import { sessaoParaApi } from "@/lib/auth/sessao";
import { acessoDoCsv, saidaNegada } from "@/lib/csv/acesso";
import { csvDoRelatorio, type ColunaDeCsv } from "@/lib/csv/colunas";
import { respostaDeCsv } from "@/lib/csv/resposta";
import { prisma } from "@/lib/db";
import { dataLocalDoInstante } from "@/lib/formatadores";
import { lerPeriodo } from "@/lib/periodo";
import { avaliacoesDoGoogle, LIMITE_DE_ENTREGAS_NA_LISTA, type EntregaParaAvaliar } from "@/modules/indicadores/operacional";

export const dynamic = "force-dynamic";

const SITUACAO = { FEITO: "Pedido feito", ABERTO: "Pedido a fazer", CANCELADO: "Pedido cancelado", SEM_TAREFA: "Sem pedido" } as const;
const COLUNAS: ColunaDeCsv<EntregaParaAvaliar>[] = [
  { titulo: "Código", tipo: "texto", valor: (l) => l.codigo },
  { titulo: "Obra", tipo: "texto", valor: (l) => l.titulo },
  { titulo: "Cliente", tipo: "texto", valor: (l) => l.cliente },
  { titulo: "Entregue em", tipo: "data", valor: (l) => l.entregueEm },
  { titulo: "Pedido", tipo: "texto", valor: (l) => SITUACAO[l.situacao] },
  { titulo: "Pedido feito em", tipo: "dataHora", valor: (l) => l.pedidoFeitoEm },
];

/** Obras entregues e o pedido de avaliação de cada uma, no MESMO período da tela. */
export async function GET(requisicao: NextRequest) {
  const usuario = await sessaoParaApi();
  if (!usuario) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  const negado = saidaNegada(usuario, { recursos: ["relatorio", "obra"] });
  if (negado) return negado;
  const acesso = acessoDoCsv(usuario);
  const hoje = dataLocalDoInstante(new Date());
  const { periodo } = lerPeriodo(Object.fromEntries(requisicao.nextUrl.searchParams), hoje);
  const a = await avaliacoesDoGoogle(periodo, hoje);
  await registrarAuditoria(prisma, { usuario, entidade: "Relatorio", entidadeId: "avaliacoes", acao: "EXPORTAR", depois: { linhas: a.linhas.length, periodo } });
  const aviso = a.truncado ? `exportação limitada às ${LIMITE_DE_ENTREGAS_NA_LISTA} entregas mais recentes. Escolha um período menor.` : null;
  return respostaDeCsv(csvDoRelatorio(COLUNAS, a.linhas, { ...acesso, aviso }), "avaliacoes-no-google.csv");
}
