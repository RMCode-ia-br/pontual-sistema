import { NextResponse, type NextRequest } from "next/server";

import { registrarAuditoria } from "@/lib/auditoria";
import { sessaoParaApi } from "@/lib/auth/sessao";
import { gerarCsv } from "@/lib/csv";
import { prisma } from "@/lib/db";
import { ROTULO_STATUS_DA_COMPRA } from "@/lib/dominio/compras";
import { dataLocalDoInstante } from "@/lib/formatadores";
import { lerFiltroDeCompras, listarCompras } from "@/modules/compras/queries";

export const dynamic = "force-dynamic";

const data = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "");
const reais = (c: number) => `${Math.floor(c / 100)},${String(c % 100).padStart(2, "0")}`;

/** Compras em CSV, com a MESMA aba e busca da lista. */
export async function GET(requisicao: NextRequest) {
  const usuario = await sessaoParaApi();
  if (!usuario) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  const filtro = lerFiltroDeCompras(Object.fromEntries(requisicao.nextUrl.searchParams));
  const { linhas, temMais } = await listarCompras(filtro, dataLocalDoInstante(new Date()), 5000);

  const registros: unknown[][] = linhas.map((c) => [
    c.numero,
    c.fornecedor,
    c.tipo === "VIDRO" ? "Vidro" : "Material",
    c.destino === "OBRA" ? "Obra" : "Estoque",
    c.obra ?? "",
    ROTULO_STATUS_DA_COMPRA[c.status],
    data(c.dataPedido),
    data(c.previsaoEntrega),
    c.atrasada ? "Sim" : "Não",
    c.itens,
    reais(c.totalCentavos),
    c.itensSemPreco,
  ]);
  if (temMais) registros.push(["AVISO: exportação limitada às 5.000 compras mais recentes. Use a busca para obter o restante."]);
  const csv = gerarCsv(["Número", "Fornecedor", "Tipo", "Destino", "Obra", "Situação", "Pedido em", "Previsão", "Entrega atrasada", "Itens", "Total (R$)", "Itens sem preço"], registros);
  await registrarAuditoria(prisma, { usuario, entidade: "Compra", entidadeId: "exportacao", acao: "EXPORTAR", depois: { linhas: linhas.length, truncado: temMais, filtro } });

  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="compras.csv"', "Cache-Control": "no-store" } });
}
