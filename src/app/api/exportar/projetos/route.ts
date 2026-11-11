import { NextResponse, type NextRequest } from "next/server";

import { registrarAuditoria } from "@/lib/auditoria";
import { sessaoParaApi } from "@/lib/auth/sessao";
import { gerarCsv } from "@/lib/csv";
import { prisma } from "@/lib/db";
import { ROTULO_STATUS_PROJETO } from "@/lib/dominio/funil";
import { formatarData, formatarMoeda } from "@/lib/formatadores";
import { ROTULO_ORIGEM } from "@/modules/clientes/schemas";
import { LIMITE_EXPORTACAO_PROJETOS, lerListaProjetos, listarProjetosParaExportar } from "@/modules/projetos/queries";
import { ROTULO_PORTE, ROTULO_TEMPERATURA } from "@/modules/projetos/schemas";

export const dynamic = "force-dynamic";

/** Exporta os projetos com os MESMOS filtros e ordem da lista. */
export async function GET(requisicao: NextRequest) {
  // Route Handlers checam a sessão por conta própria (não só o proxy).
  const usuario = await sessaoParaApi();
  if (!usuario) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  const brutos = Object.fromEntries(requisicao.nextUrl.searchParams);
  const { parametros, filtros } = lerListaProjetos(brutos);
  const { linhas, truncado } = await listarProjetosParaExportar(parametros, filtros);

  const registros: unknown[][] = linhas.map((p) => [
    p.codigo,
    p.titulo,
    p.clienteNome,
    ROTULO_STATUS_PROJETO[p.status],
    p.responsavelNome,
    p.origem ? (ROTULO_ORIGEM[p.origem as keyof typeof ROTULO_ORIGEM] ?? p.origem) : "",
    p.porte ? (ROTULO_PORTE[p.porte as keyof typeof ROTULO_PORTE] ?? p.porte) : "",
    p.temperatura ? (ROTULO_TEMPERATURA[p.temperatura as keyof typeof ROTULO_TEMPERATURA] ?? p.temperatura) : "",
    p.valorEstimadoCentavos !== null ? formatarMoeda(p.valorEstimadoCentavos) : "",
    p.diasParado,
    formatarData(p.criadoEm),
  ]);
  // Arquivo incompleto precisa dizer que está incompleto.
  if (truncado) registros.push([`AVISO: exportação limitada aos primeiros ${LIMITE_EXPORTACAO_PROJETOS} projetos. Use os filtros para obter o restante.`]);

  const csv = gerarCsv(["Código", "Projeto", "Cliente", "Fase", "Responsável", "Origem", "Porte", "Temperatura", "Valor estimado", "Dias parado", "Criado em"], registros);

  await registrarAuditoria(prisma, {
    usuario,
    entidade: "Projeto",
    entidadeId: "exportacao",
    acao: "EXPORTAR",
    depois: { linhas: linhas.length, truncado, filtros, busca: parametros.busca },
  });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"projetos.csv\"",
      "Cache-Control": "no-store",
    },
  });
}
