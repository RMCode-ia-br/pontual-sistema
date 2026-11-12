import { NextResponse, type NextRequest } from "next/server";

import { registrarAuditoria } from "@/lib/auditoria";
import { sessaoParaApi } from "@/lib/auth/sessao";
import { gerarCsv } from "@/lib/csv";
import { prisma } from "@/lib/db";
import { formatarNumeroDoChamado, ROTULO_STATUS_CHAMADO, ROTULO_TIPO_PROBLEMA } from "@/lib/dominio/chamados";
import { ROTULO_CLASSIFICACAO } from "@/lib/dominio/garantia";
import { formatarData, formatarMoeda } from "@/lib/formatadores";
import { LIMITE_DE_CHAMADOS, lerFiltrosDeChamados, listarChamados } from "@/modules/obras/queries-chamados";

export const dynamic = "force-dynamic";

/** Exporta os chamados com os MESMOS filtros da lista. */
export async function GET(requisicao: NextRequest) {
  // Route Handlers checam a sessão por conta própria (não só o proxy).
  const usuario = await sessaoParaApi();
  if (!usuario) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  const filtros = lerFiltrosDeChamados(Object.fromEntries(requisicao.nextUrl.searchParams));
  const { linhas, truncado } = await listarChamados(filtros);

  const registros: unknown[][] = linhas.map((c) => [
    formatarNumeroDoChamado(c.numero),
    c.clienteNome,
    c.projetoTitulo ?? "",
    ROTULO_TIPO_PROBLEMA[c.tipoProblema],
    c.descricao,
    ROTULO_CLASSIFICACAO[c.classificacao],
    ROTULO_STATUS_CHAMADO[c.status],
    formatarData(c.abertoEm),
    c.resolvidoEm ? formatarData(c.resolvidoEm) : "",
    c.diasEmAberto,
    c.cobrarVisita ? "Sim" : "Não",
    c.valorCobradoCentavos !== null ? formatarMoeda(c.valorCobradoCentavos) : "",
    c.temCobranca ? "Sim" : "Não",
  ]);
  // Arquivo incompleto precisa dizer que está incompleto.
  if (truncado) registros.push([`AVISO: exportação limitada aos primeiros ${LIMITE_DE_CHAMADOS} chamados. Use os filtros para obter o restante.`]);

  const csv = gerarCsv(
    ["Número", "Cliente", "Obra", "Tipo do problema", "Descrição", "Garantia", "Situação", "Aberto em", "Resolvido em", "Dias (em aberto ou até resolver)", "Visita cobrada", "Valor da visita", "Cobrança gerada"],
    registros,
  );

  await registrarAuditoria(prisma, { usuario, entidade: "Chamado", entidadeId: "exportacao-chamados", acao: "EXPORTAR", depois: { linhas: linhas.length, truncado, filtros } });

  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=\"chamados.csv\"", "Cache-Control": "no-store" },
  });
}
