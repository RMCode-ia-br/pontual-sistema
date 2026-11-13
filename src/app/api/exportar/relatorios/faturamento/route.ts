import { NextResponse } from "next/server";

import { registrarAuditoria } from "@/lib/auditoria";
import { sessaoParaApi } from "@/lib/auth/sessao";
import { csvDoRelatorio, type ColunaDeCsv } from "@/lib/csv/colunas";
import { respostaDeCsv } from "@/lib/csv/resposta";
import { prisma } from "@/lib/db";
import { dataLocalDoInstante } from "@/lib/formatadores";
import { faturamentoMensal, type MesDoFaturamento } from "@/modules/indicadores/faturamento-mensal";

export const dynamic = "force-dynamic";

const COLUNAS: ColunaDeCsv<MesDoFaturamento>[] = [
  { titulo: "Mês", tipo: "texto", valor: (m) => `${m.mes.slice(5, 7)}/${m.mes.slice(0, 4)}` },
  { titulo: "Vendido sem nota (R$)", tipo: "dinheiro", valor: (m) => m.vendidoSemNotaCentavos },
  { titulo: "Vendido com nota (R$)", tipo: "dinheiro", valor: (m) => m.vendidoComNotaCentavos },
  { titulo: "Repasse de imposto, fora da margem (R$)", tipo: "dinheiro", valor: (m) => m.repasseDeImpostoCentavos },
  { titulo: "Recebido sem nota (R$)", tipo: "dinheiro", valor: (m) => m.recebidoSemNotaCentavos },
  { titulo: "Recebido com nota (R$)", tipo: "dinheiro", valor: (m) => m.recebidoComNotaCentavos },
];

/** Faturamento dos últimos 12 meses em CSV (com nota e sem nota separados; sem RBT12). */
export async function GET() {
  const usuario = await sessaoParaApi();
  if (!usuario) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  const { meses } = await faturamentoMensal(dataLocalDoInstante(new Date()), 12);
  const csv = csvDoRelatorio(COLUNAS, meses, { podeVerInterno: false });
  await registrarAuditoria(prisma, { usuario, entidade: "Relatorio", entidadeId: "faturamento-mensal", acao: "EXPORTAR", depois: { meses: meses.length } });
  return respostaDeCsv(csv, "faturamento-mensal.csv");
}
