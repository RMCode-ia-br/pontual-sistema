import { NextResponse, type NextRequest } from "next/server";

import { registrarAuditoria } from "@/lib/auditoria";
import { sessaoParaApi } from "@/lib/auth/sessao";
import { gerarCsv } from "@/lib/csv";
import { prisma } from "@/lib/db";
import { carregarRelatorioDeEstoque, lerPeriodoDoRelatorioDeEstoque } from "@/modules/relatorios/estoque";

export const dynamic = "force-dynamic";

const reais = (c: number | null) => (c === null ? "" : `${c < 0 ? "-" : ""}${Math.floor(Math.abs(c) / 100)},${String(Math.abs(c) % 100).padStart(2, "0")}`);
const qtd = (m: number | null) => (m === null ? "" : (m / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 3 }));

/** Posição do estoque em CSV (hoje). Produto sem custo sai com "Sem custo" (nunca zero). */
export async function GET(requisicao: NextRequest) {
  const usuario = await sessaoParaApi();
  if (!usuario) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  const periodo = lerPeriodoDoRelatorioDeEstoque(Object.fromEntries(requisicao.nextUrl.searchParams));
  const r = await carregarRelatorioDeEstoque(periodo);
  const registros: unknown[][] = r.linhas
    .filter((l) => l.saldoMilesimos !== 0 || l.abaixoDoMinimo)
    .map((l) => [
      l.codigo,
      l.descricao,
      l.unidade,
      qtd(l.saldoMilesimos),
      qtd(l.estoqueMinimoMilesimos),
      reais(l.custoUnitarioCentavos),
      l.valorCentavos === null && l.saldoMilesimos > 0 ? "Sem custo" : reais(l.valorCentavos),
      l.abaixoDoMinimo ? "Sim" : "",
    ]);
  if (r.truncado) registros.push(["AVISO: exportação limitada aos primeiros produtos."]);
  const csv = gerarCsv(["Código", "Produto", "Unidade", "Saldo", "Estoque mínimo", "Custo unitário (R$)", "Valor em estoque (R$)", "Abaixo do mínimo"], registros);
  await registrarAuditoria(prisma, { usuario, entidade: "Relatorio", entidadeId: "estoque", acao: "EXPORTAR", depois: { linhas: r.linhas.length, periodo } });
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="posicao-de-estoque.csv"', "Cache-Control": "no-store" } });
}
