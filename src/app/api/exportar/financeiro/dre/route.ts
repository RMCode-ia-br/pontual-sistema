import { NextResponse, type NextRequest } from "next/server";

import { registrarAuditoria } from "@/lib/auditoria";
import { sessaoParaApi } from "@/lib/auth/sessao";
import { gerarCsv } from "@/lib/csv";
import { prisma } from "@/lib/db";
import { linhasDaDemonstracao, montarDre } from "@/lib/dominio/dre";
import { dataLocalDoInstante, formatarMoeda } from "@/lib/formatadores";
import { carregarMovimentosDoDre, lerPeriodoDoDre } from "@/modules/financeiro/queries-dre";

export const dynamic = "force-dynamic";

const NOMES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloDoMes = (m: string) => `${NOMES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;

/** DRE gerencial em CSV: uma linha por item da demonstração, um valor por mês e o total. */
export async function GET(requisicao: NextRequest) {
  const usuario = await sessaoParaApi();
  if (!usuario) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  const periodo = lerPeriodoDoDre(Object.fromEntries(requisicao.nextUrl.searchParams), dataLocalDoInstante(new Date()));
  const movimentos = await carregarMovimentosDoDre(periodo);
  const linhas = linhasDaDemonstracao(montarDre(movimentos, periodo.meses));

  const registros: unknown[][] = linhas.map((l) => [l.rotulo, ...l.porMesCentavos.map(formatarMoeda), formatarMoeda(l.totalCentavos)]);
  registros.push([`Regime de ${periodo.regime === "caixa" ? "caixa" : "competência"}; DRE gerencial (não contábil).`]);

  const csv = gerarCsv(["Linha", ...periodo.meses.map(rotuloDoMes), "Total"], registros);
  await registrarAuditoria(prisma, { usuario, entidade: "Lancamento", entidadeId: "exportacao-dre", acao: "EXPORTAR", depois: { de: periodo.de, ate: periodo.ate, regime: periodo.regime } });

  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="dre-${periodo.de}-${periodo.ate}.csv"`, "Cache-Control": "no-store" },
  });
}
