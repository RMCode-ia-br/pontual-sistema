import { NextResponse, type NextRequest } from "next/server";

import { registrarAuditoria } from "@/lib/auditoria";
import { sessaoParaApi } from "@/lib/auth/sessao";
import { csvDoRelatorio, type ColunaDeCsv } from "@/lib/csv/colunas";
import { respostaDeCsv } from "@/lib/csv/resposta";
import { prisma } from "@/lib/db";
import { linhasDaDemonstracao, montarDre } from "@/lib/dominio/dre";
import { dataLocalDoInstante } from "@/lib/formatadores";
import { carregarMovimentosDoDre, lerPeriodoDoDre } from "@/modules/financeiro/queries-dre";

export const dynamic = "force-dynamic";

const NOMES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloDoMes = (m: string) => `${NOMES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;

type Linha = ReturnType<typeof linhasDaDemonstracao>[number];

/** DRE gerencial em CSV: uma linha por item da demonstração, um valor (R$) por mês e o total. */
export async function GET(requisicao: NextRequest) {
  const usuario = await sessaoParaApi();
  if (!usuario) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  const periodo = lerPeriodoDoDre(Object.fromEntries(requisicao.nextUrl.searchParams), dataLocalDoInstante(new Date()));
  const movimentos = await carregarMovimentosDoDre(periodo);
  const linhas = linhasDaDemonstracao(montarDre(movimentos, periodo.meses));

  const colunas: ColunaDeCsv<Linha>[] = [
    { titulo: "Linha", tipo: "texto", valor: (l) => l.rotulo },
    ...periodo.meses.map((m, i): ColunaDeCsv<Linha> => ({ titulo: `${rotuloDoMes(m)} (R$)`, tipo: "dinheiro", valor: (l) => l.porMesCentavos[i] })),
    { titulo: "Total (R$)", tipo: "dinheiro", valor: (l) => l.totalCentavos },
  ];
  const aviso = `Regime de ${periodo.regime === "caixa" ? "caixa" : "competência"}; DRE gerencial (não contábil).`;
  await registrarAuditoria(prisma, { usuario, entidade: "Lancamento", entidadeId: "exportacao-dre", acao: "EXPORTAR", depois: { de: periodo.de, ate: periodo.ate, regime: periodo.regime } });
  return respostaDeCsv(csvDoRelatorio(colunas, linhas, { podeVerInterno: false, aviso }), `dre-${periodo.de}-${periodo.ate}.csv`);
}
