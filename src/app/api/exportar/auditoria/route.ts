import { NextResponse, type NextRequest } from "next/server";

import { registrarAuditoria } from "@/lib/auditoria";
import { sessaoParaApi } from "@/lib/auth/sessao";
import { gerarCsv } from "@/lib/csv";
import { prisma } from "@/lib/db";
import { formatarDataHora } from "@/lib/formatadores";
import { buscarAuditoriaParaExportar, LIMITE_EXPORTACAO, lerFiltrosAuditoria } from "@/modules/auditoria/queries";

export const dynamic = "force-dynamic";

export async function GET(requisicao: NextRequest) {
  // Route Handlers checam a sessão por conta própria (não só o proxy).
  const usuario = await sessaoParaApi();
  if (!usuario) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  const filtros = lerFiltrosAuditoria(Object.fromEntries(requisicao.nextUrl.searchParams));
  const { linhas, truncado } = await buscarAuditoriaParaExportar(filtros);

  const registros: unknown[][] = linhas.map((l) => [formatarDataHora(l.criadoEm), l.usuarioNome, l.entidade, l.entidadeId, l.acao, l.antes, l.depois, l.ip]);
  // Arquivo incompleto precisa dizer que está incompleto (senão parece o histórico inteiro).
  if (truncado) {
    registros.push([`AVISO: exportação limitada às ${LIMITE_EXPORTACAO} linhas mais recentes. Use os filtros de período para obter o restante.`]);
  }
  const csv = gerarCsv(["Data e hora", "Usuário", "Entidade", "ID", "Ação", "Antes", "Depois", "IP"], registros);

  // Exportar dados também é um evento auditável.
  await registrarAuditoria(prisma, {
    usuario,
    entidade: "LogAuditoria",
    entidadeId: "exportacao",
    acao: "EXPORTAR",
    depois: { linhas: linhas.length, truncado, filtros },
  });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="auditoria.csv"',
      "Cache-Control": "no-store",
    },
  });
}
