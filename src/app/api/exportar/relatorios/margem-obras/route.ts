import { NextResponse, type NextRequest } from "next/server";

import { registrarAuditoria } from "@/lib/auditoria";
import { sessaoParaApi } from "@/lib/auth/sessao";
import { gerarCsv } from "@/lib/csv";
import { prisma } from "@/lib/db";
import { ROTULO_STATUS_PROJETO, type StatusProjeto } from "@/lib/dominio/funil";
import { carregarMargemDasObras, lerFiltroDeMargem } from "@/modules/relatorios/margem-obras";

export const dynamic = "force-dynamic";

const reais = (c: number | null) => (c === null ? "" : `${c < 0 ? "-" : ""}${Math.floor(Math.abs(c) / 100)},${String(Math.abs(c) % 100).padStart(2, "0")}`);

/** Margem por obra em CSV, com o MESMO filtro da tela. Margem incompleta sai vazia (nunca zero), com o que falta. */
export async function GET(requisicao: NextRequest) {
  const usuario = await sessaoParaApi();
  if (!usuario) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  const filtro = lerFiltroDeMargem(Object.fromEntries(requisicao.nextUrl.searchParams));
  const r = await carregarMargemDasObras(filtro);
  const registros: unknown[][] = r.linhas.map((l) => [
    l.codigo,
    l.titulo,
    l.cliente,
    ROTULO_STATUS_PROJETO[l.status as StatusProjeto],
    reais(l.receitaDaMargemCentavos),
    reais(l.repasseDeImpostoCentavos),
    reais(l.custoConhecidoCentavos),
    l.incompleto ? "Incompleta" : reais(l.margemCentavos),
    l.margemPb !== null ? (l.margemPb / 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : "",
    l.faltando.join("; "),
  ]);
  if (r.truncado) registros.push(["AVISO: exportação limitada às 150 primeiras obras. Use a busca para obter o restante."]);
  const csv = gerarCsv(["Código", "Obra", "Cliente", "Situação", "Receita da margem (R$)", "Repasse de imposto (R$)", "Custo conhecido (R$)", "Margem (R$)", "Margem (%)", "O que falta"], registros);
  await registrarAuditoria(prisma, { usuario, entidade: "Relatorio", entidadeId: "margem-obras", acao: "EXPORTAR", depois: { linhas: r.linhas.length, filtro } });
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="margem-por-obra.csv"', "Cache-Control": "no-store" } });
}
