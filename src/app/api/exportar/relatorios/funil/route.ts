import { NextResponse, type NextRequest } from "next/server";

import { registrarAuditoria } from "@/lib/auditoria";
import { sessaoParaApi } from "@/lib/auth/sessao";
import { gerarCsv } from "@/lib/csv";
import { prisma } from "@/lib/db";
import { ROTULO_STATUS_PROJETO } from "@/lib/dominio/funil";
import { formatarMoeda } from "@/lib/formatadores";
import { ROTULO_ORIGEM } from "@/modules/clientes/schemas";
import { carregarRelatorioDoFunil, lerFiltrosDoRelatorio } from "@/modules/relatorios/funil";

export const dynamic = "force-dynamic";

/** CSV do relatório de funil e origem, com os MESMOS filtros da tela (seções separadas por uma linha em branco). */
export async function GET(requisicao: NextRequest) {
  const usuario = await sessaoParaApi();
  if (!usuario) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  const filtros = lerFiltrosDoRelatorio(Object.fromEntries(requisicao.nextUrl.searchParams));
  const r = await carregarRelatorioDoFunil(filtros);

  const secoes = [
    gerarCsv(["Fase atual", "Projetos", "Valor estimado"], r.porFase.map((f) => [ROTULO_STATUS_PROJETO[f.status], f.quantidade, formatarMoeda(f.valorCentavos)])),
    gerarCsv(["Fase", "Chegaram", "% do total", "% da fase anterior"], r.conversao.map((c) => [ROTULO_STATUS_PROJETO[c.etapa], c.chegaram, c.percentualDoTotal ?? "", c.percentualDaAnterior ?? ""])),
    gerarCsv(
      ["Origem", "Projetos", "Com visita", "Proposta enviada", "Aprovados", "Perdidos"],
      r.porOrigem.map((o) => [o.origem ? (ROTULO_ORIGEM[o.origem as keyof typeof ROTULO_ORIGEM] ?? o.origem) : "Não informada", o.leads, o.comVisita, o.comPropostaEnviada, o.aprovados, o.perdidos]),
    ),
    gerarCsv(["Motivo de perda", "Projetos"], r.motivos.map((m) => [m.nome, m.quantidade])),
    gerarCsv(["Período", "Projetos", "Sem retorno hoje", "Dias médios visita a proposta", "Taxa de fechamento %"], [[`${filtros.de} a ${filtros.ate}`, r.total, r.semRetorno, r.tempoVisitaPropostaDias?.media ?? "", r.taxaDeFechamento ?? ""]]),
  ];
  if (r.truncado) secoes.push(gerarCsv(["AVISO: relatório limitado aos 20.000 projetos mais recentes do período."], []));

  await registrarAuditoria(prisma, { usuario, entidade: "Relatorio", entidadeId: "funil", acao: "EXPORTAR", depois: { ...filtros } });

  // Cada seção vem com a marca de codificação (BOM) do Excel; só a primeira deve ficar.
  return new NextResponse(secoes.map((c, i) => (i === 0 ? c : c.replace(/^﻿/, ""))).join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="funil-e-origem.csv"', "Cache-Control": "no-store" },
  });
}
