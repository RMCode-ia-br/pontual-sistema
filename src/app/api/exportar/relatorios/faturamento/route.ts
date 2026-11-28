import { NextResponse } from "next/server";

import { registrarAuditoria } from "@/lib/auditoria";
import { sessaoParaApi } from "@/lib/auth/sessao";
import { acessoDoCsv, saidaNegada } from "@/lib/csv/acesso";
import { csvDoRelatorio, type ColunaDeCsv } from "@/lib/csv/colunas";
import { respostaDeCsv } from "@/lib/csv/resposta";
import { prisma } from "@/lib/db";
import { dataLocalDoInstante } from "@/lib/formatadores";
import { ouAviso } from "@/modules/indicadores/dados-do-aceite";
import { faturamentoMensal, type MesDoFaturamento } from "@/modules/indicadores/faturamento-mensal";

export const dynamic = "force-dynamic";

const COLUNAS: ColunaDeCsv<MesDoFaturamento>[] = [
  { titulo: "Mês", tipo: "texto", valor: (m) => `${m.mes.slice(5, 7)}/${m.mes.slice(0, 4)}` },
  { titulo: "Vendido sem nota (R$)", tipo: "dinheiro", valor: (m) => m.vendidoSemNotaCentavos },
  { titulo: "Vendido com nota (R$)", tipo: "dinheiro", valor: (m) => m.vendidoComNotaCentavos },
  { titulo: "Repasse de imposto, fora da margem (R$)", tipo: "dinheiro", valor: (m) => m.repasseDeImpostoCentavos, interna: true },
  { titulo: "Repasse de taxa de cartão, fora da margem (R$)", tipo: "dinheiro", valor: (m) => m.repasseDeCartaoCentavos, interna: true },
  { titulo: "Recebido sem nota (R$)", tipo: "dinheiro", valor: (m) => m.recebidoSemNotaCentavos },
  { titulo: "Recebido com nota (R$)", tipo: "dinheiro", valor: (m) => m.recebidoComNotaCentavos },
];

/** Faturamento dos últimos 12 meses em CSV (com nota e sem nota separados; sem RBT12). */
export async function GET() {
  const usuario = await sessaoParaApi();
  if (!usuario) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  const negado = saidaNegada(usuario, { recursos: ["relatorio", "lancamento"], valores: true });
  if (negado) return negado;
  const acesso = acessoDoCsv(usuario);

  const lido = await ouAviso(() => faturamentoMensal(dataLocalDoInstante(new Date()), 12));
  if (!lido.ok) return NextResponse.json({ erro: lido.mensagem }, { status: 409 });
  const { meses } = lido.dado;
  const csv = csvDoRelatorio(COLUNAS, meses, { ...acesso });
  await registrarAuditoria(prisma, { usuario, entidade: "Relatorio", entidadeId: "faturamento-mensal", acao: "EXPORTAR", depois: { meses: meses.length } });
  return respostaDeCsv(csv, "faturamento-mensal.csv");
}
