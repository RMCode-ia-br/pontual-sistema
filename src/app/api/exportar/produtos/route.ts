import { NextResponse, type NextRequest } from "next/server";

import { registrarAuditoria } from "@/lib/auditoria";
import { sessaoParaApi } from "@/lib/auth/sessao";
import { gerarCsv } from "@/lib/csv";
import { prisma } from "@/lib/db";
import { formatarData } from "@/lib/formatadores";
import { LIMITE_EXPORTACAO_PRODUTOS, lerListaProdutos, listarProdutosParaExportar } from "@/modules/produtos/queries";
import { ROTULO_UNIDADE } from "@/modules/produtos/schemas";

export const dynamic = "force-dynamic";

/** Exporta os produtos com os MESMOS filtros e ordem da lista. O custo sai em reais com vírgula (formato da planilha em português). */
export async function GET(requisicao: NextRequest) {
  // Route Handlers checam a sessão por conta própria (não só o proxy).
  const usuario = await sessaoParaApi();
  if (!usuario) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  const { parametros, filtros } = lerListaProdutos(Object.fromEntries(requisicao.nextUrl.searchParams));
  const { linhas, truncado } = await listarProdutosParaExportar(parametros, filtros);

  const reais = (c: number | null) => (c === null ? "" : `${Math.floor(c / 100)},${String(c % 100).padStart(2, "0")}`);
  const registros: unknown[][] = linhas.map((p) => [
    p.codigo,
    p.descricao,
    p.categoria,
    ROTULO_UNIDADE[p.unidade],
    p.fornecedor,
    reais(p.custoUnitarioCentavos),
    p.custoAtualizadoEm ? formatarData(p.custoAtualizadoEm) : "",
    p.linha,
    p.acabamento,
    p.localizacao,
    p.ativo ? "Ativo" : "Inativo",
  ]);
  if (truncado) registros.push([`AVISO: exportação limitada aos primeiros ${LIMITE_EXPORTACAO_PRODUTOS} produtos. Use os filtros para obter o restante.`]);
  const csv = gerarCsv(["Código", "Descrição", "Categoria", "Unidade", "Fornecedor", "Custo unitário (R$)", "Custo atualizado em", "Linha", "Acabamento", "Localização", "Situação"], registros);

  await registrarAuditoria(prisma, { usuario, entidade: "Produto", entidadeId: "exportacao", acao: "EXPORTAR", depois: { linhas: linhas.length, truncado, filtros, busca: parametros.busca } });

  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="produtos.csv"', "Cache-Control": "no-store" },
  });
}
