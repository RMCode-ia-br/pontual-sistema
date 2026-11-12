import { NextResponse, type NextRequest } from "next/server";

import { registrarAuditoria } from "@/lib/auditoria";
import { sessaoParaApi } from "@/lib/auth/sessao";
import { gerarCsv } from "@/lib/csv";
import { prisma } from "@/lib/db";
import { ROTULO_TIPO_DE_MOVIMENTO } from "@/lib/dominio/estoque";
import { LIMITE_EXPORTACAO_MOVIMENTOS, lerListaMovimentos, listarMovimentosParaExportar } from "@/modules/estoque/queries";

export const dynamic = "force-dynamic";

const data = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const reais = (c: number | null) => (c === null ? "" : `${Math.floor(c / 100)},${String(c % 100).padStart(2, "0")}`);
const quantidade = (m: number) => (m / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 3 });

/** Movimentações de estoque em CSV, com os MESMOS filtros e a mesma ordem da lista. Custo vazio = "sem custo". */
export async function GET(requisicao: NextRequest) {
  const usuario = await sessaoParaApi();
  if (!usuario) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  const { parametros, filtros } = lerListaMovimentos(Object.fromEntries(requisicao.nextUrl.searchParams));
  const { linhas, truncado } = await listarMovimentosParaExportar(parametros, filtros);

  const registros: unknown[][] = linhas.map((m) => [
    data(m.data),
    ROTULO_TIPO_DE_MOVIMENTO[m.tipo],
    m.codigo,
    m.produto,
    quantidade(m.quantidadeMilesimos),
    reais(m.custoUnitarioCentavos),
    m.obra ?? "",
    m.justificativa ?? "",
    m.ehEstorno ? "Estorno" : m.estornado ? "Estornado" : "",
  ]);
  if (truncado) registros.push([`AVISO: exportação limitada às primeiras ${LIMITE_EXPORTACAO_MOVIMENTOS} movimentações. Use os filtros para obter o restante.`]);
  const csv = gerarCsv(["Data", "Tipo", "Código", "Produto", "Quantidade (com sinal)", "Custo unitário (R$)", "Obra", "Justificativa", "Situação"], registros);

  await registrarAuditoria(prisma, { usuario, entidade: "MovimentoEstoque", entidadeId: "exportacao", acao: "EXPORTAR", depois: { linhas: linhas.length, truncado, filtros, busca: parametros.busca } });

  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="movimentacoes-de-estoque.csv"', "Cache-Control": "no-store" },
  });
}
