import { NextResponse, type NextRequest } from "next/server";

import { registrarAuditoria } from "@/lib/auditoria";
import { sessaoParaApi } from "@/lib/auth/sessao";
import { csvDoRelatorio, type ColunaDeCsv } from "@/lib/csv/colunas";
import { respostaDeCsv } from "@/lib/csv/resposta";
import { prisma } from "@/lib/db";
import { ROTULO_STATUS_PROJETO, type StatusProjeto } from "@/lib/dominio/funil";
import { can } from "@/lib/permissoes";
import { carregarMargemDasObras, lerFiltroDeMargem, type LinhaDeMargem } from "@/modules/relatorios/margem-obras";

export const dynamic = "force-dynamic";

/** Custo e margem são dados internos: todas as colunas de valor saem marcadas `interna`. */
const COLUNAS: ColunaDeCsv<LinhaDeMargem>[] = [
  { titulo: "Código", tipo: "texto", valor: (l) => l.codigo },
  { titulo: "Obra", tipo: "texto", valor: (l) => l.titulo },
  { titulo: "Cliente", tipo: "texto", valor: (l) => l.cliente },
  { titulo: "Situação", tipo: "texto", valor: (l) => ROTULO_STATUS_PROJETO[l.status as StatusProjeto] },
  { titulo: "Receita da margem (R$)", tipo: "dinheiro", valor: (l) => l.receitaDaMargemCentavos, interna: true },
  { titulo: "Repasse de imposto, fora da margem (R$)", tipo: "dinheiro", valor: (l) => l.repasseDeImpostoCentavos, interna: true },
  { titulo: "Custo conhecido (R$)", tipo: "dinheiro", valor: (l) => l.custoConhecidoCentavos, interna: true },
  // Margem incompleta sai como texto "Incompleta" (nunca zero).
  { titulo: "Margem (R$)", tipo: "dinheiro", valor: (l) => (l.incompleto ? "Incompleta" : l.margemCentavos), interna: true },
  { titulo: "Margem (%)", tipo: "percentual", valor: (l) => (l.margemPb === null ? null : l.margemPb / 100), interna: true },
  { titulo: "O que falta", tipo: "texto", valor: (l) => (l.faltando.length > 0 ? l.faltando.join("; ") : null), interna: true },
];

/** Margem por obra em CSV, com o MESMO filtro da tela (situação, busca e período). Exige a permissão de ver custo. */
export async function GET(requisicao: NextRequest) {
  const usuario = await sessaoParaApi();
  if (!usuario) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  if (!can(usuario, "ver", "custo")) return NextResponse.json({ erro: "Sem permissão para ver custo e margem." }, { status: 403 });

  const filtro = lerFiltroDeMargem(Object.fromEntries(requisicao.nextUrl.searchParams));
  const r = await carregarMargemDasObras(filtro);
  const csv = csvDoRelatorio(COLUNAS, r.linhas, { podeVerInterno: true, aviso: r.truncado ? "exportação limitada às 150 primeiras obras. Use a busca ou o período para obter o restante." : null });
  await registrarAuditoria(prisma, { usuario, entidade: "Relatorio", entidadeId: "margem-obras", acao: "EXPORTAR", depois: { linhas: r.linhas.length, filtro } });
  return respostaDeCsv(csv, "margem-por-obra.csv");
}
