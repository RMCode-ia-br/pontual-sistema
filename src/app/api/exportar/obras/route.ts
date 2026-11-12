import { NextResponse, type NextRequest } from "next/server";

import { registrarAuditoria } from "@/lib/auditoria";
import { sessaoParaApi } from "@/lib/auth/sessao";
import { gerarCsv } from "@/lib/csv";
import { prisma } from "@/lib/db";
import { ROTULO_STATUS_PROJETO, type StatusProjeto } from "@/lib/dominio/funil";
import { ROTULO_SEMAFORO } from "@/lib/dominio/semaforo";
import { formatarMoeda } from "@/lib/formatadores";
import { LIMITE_DE_OBRAS, lerFiltrosDeObras, listarObras } from "@/modules/obras/queries-lista";

export const dynamic = "force-dynamic";

const data = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "");

/** Exporta as obras com os MESMOS filtros da lista. */
export async function GET(requisicao: NextRequest) {
  // Route Handlers checam a sessão por conta própria (não só o proxy).
  const usuario = await sessaoParaApi();
  if (!usuario) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  const filtros = lerFiltrosDeObras(Object.fromEntries(requisicao.nextUrl.searchParams));
  const { linhas, truncado } = await listarObras(filtros);

  const registros: unknown[][] = linhas.map((o) => [
    o.codigo,
    o.titulo,
    o.clienteNome,
    o.responsavelNome ?? "",
    ROTULO_STATUS_PROJETO[o.status as StatusProjeto] ?? o.status,
    o.etapaAtual?.nome ?? "",
    `${o.etapasConcluidas} de ${o.etapasTotal}`,
    data(o.prazo.comPausas),
    o.prazo.diasRestantes ?? "",
    o.semaforo ? ROTULO_SEMAFORO[o.semaforo] : "",
    o.atrasadas,
    data(o.dataConclusao),
    o.prazo.pontualidade?.avaliavel ? (o.prazo.pontualidade.pontual ? "Pontual" : `Atrasada ${o.prazo.pontualidade.desvioDias} dias`) : "",
    o.valorFechadoCentavos !== null ? formatarMoeda(o.valorFechadoCentavos) : "",
  ]);
  // Arquivo incompleto precisa dizer que está incompleto.
  if (truncado) registros.push([`AVISO: exportação limitada às primeiras ${LIMITE_DE_OBRAS} obras. Use os filtros para obter o restante.`]);

  const csv = gerarCsv(
    ["Código", "Obra", "Cliente", "Responsável", "Situação", "Etapa atual", "Etapas concluídas", "Prazo prometido", "Dias restantes", "Prazo (semáforo)", "Etapas atrasadas", "Concluída em", "Pontualidade", "Valor fechado"],
    registros,
  );

  await registrarAuditoria(prisma, { usuario, entidade: "Projeto", entidadeId: "exportacao-obras", acao: "EXPORTAR", depois: { linhas: linhas.length, truncado, filtros } });

  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=\"obras.csv\"", "Cache-Control": "no-store" },
  });
}
