import { NextResponse, type NextRequest } from "next/server";

import { registrarAuditoria } from "@/lib/auditoria";
import { sessaoParaApi } from "@/lib/auth/sessao";
import { gerarCsv } from "@/lib/csv";
import { prisma } from "@/lib/db";
import { FAIXAS_DE_VENCIMENTO, type ResultadoDeAging } from "@/lib/dominio/aging";
import { dataLocalDoInstante, formatarMoeda } from "@/lib/formatadores";
import { agingDoPagar, agingDoReceber } from "@/modules/financeiro/queries-aging";

export const dynamic = "force-dynamic";

function linhasDe(grupo: string, aging: ResultadoDeAging): unknown[][] {
  return aging.linhas.map((l) => [grupo, l.rotulo, ...FAIXAS_DE_VENCIMENTO.map((f) => formatarMoeda(l.porFaixa[f.id])), formatarMoeda(l.totalCentavos), formatarMoeda(l.atrasadoCentavos)]);
}

/** Contas por idade em CSV: `?tipo=receber` (por cliente) ou `?tipo=pagar` (por fornecedor e por categoria). */
export async function GET(requisicao: NextRequest) {
  const usuario = await sessaoParaApi();
  if (!usuario) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  const tipo = requisicao.nextUrl.searchParams.get("tipo") === "pagar" ? "pagar" : "receber";
  const hoje = dataLocalDoInstante(new Date());
  let registros: unknown[][];
  if (tipo === "receber") {
    registros = linhasDe("Cliente", (await agingDoReceber(hoje)).porCliente);
  } else {
    const r = await agingDoPagar(hoje);
    registros = [...linhasDe("Fornecedor", r.porFornecedor), ...linhasDe("Categoria", r.porCategoria)];
  }
  const csv = gerarCsv(["Agrupamento", "Nome", ...FAIXAS_DE_VENCIMENTO.map((f) => f.rotulo), "Total em aberto", "Atrasado"], registros);
  await registrarAuditoria(prisma, { usuario, entidade: tipo === "receber" ? "ContaReceber" : "ContaPagar", entidadeId: `exportacao-aging-${tipo}`, acao: "EXPORTAR", depois: { linhas: registros.length } });

  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${tipo}-por-idade.csv"`, "Cache-Control": "no-store" },
  });
}
