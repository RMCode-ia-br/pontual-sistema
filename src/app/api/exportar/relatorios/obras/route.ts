import { NextResponse, type NextRequest } from "next/server";

import { registrarAuditoria } from "@/lib/auditoria";
import { sessaoParaApi } from "@/lib/auth/sessao";
import { gerarCsv } from "@/lib/csv";
import { prisma } from "@/lib/db";
import { ROTULO_TIPO_PROBLEMA, type TipoDoProblema } from "@/lib/dominio/chamados";
import { ROTULO_TIPO_ETAPA } from "@/lib/dominio/etapas";
import { carregarRelatorioDeObras, lerPeriodoDoRelatorioDeObras } from "@/modules/relatorios/obras";

export const dynamic = "force-dynamic";

const data = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "");

/** CSV do relatório de obras e assistência, com o MESMO período da tela (seções separadas por uma linha em branco). */
export async function GET(requisicao: NextRequest) {
  const usuario = await sessaoParaApi();
  if (!usuario) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  const periodo = lerPeriodoDoRelatorioDeObras(Object.fromEntries(requisicao.nextUrl.searchParams));
  const r = await carregarRelatorioDeObras(periodo);
  const p = r.pontualidade;
  const a = r.assistencias;

  const secoes = [
    gerarCsv(
      ["Período", "Obras avaliadas", "Sem prazo", "No prazo", "Pontualidade %", "Desvio médio (dias)", "No prazo sem pausas", "Pontualidade sem pausas %", "Desvio médio sem pausas (dias)"],
      [[`${data(periodo.de)} a ${data(periodo.ate)}`, p.concluidas, p.semPrazo, p.pontuais, p.pontualidadePct ?? "", p.desvioMedioDias ?? "", p.pontuaisSemPausas, p.pontualidadeSemPausasPct ?? "", p.desvioMedioSemPausasDias ?? ""]],
    ),
    gerarCsv(
      ["Código", "Obra", "Cliente", "Concluída em", "Prazo prometido", "Desvio (dias; positivo = atraso)"],
      r.obrasConcluidas.map((o) => [o.codigo, o.titulo, o.clienteNome, data(o.concluidaEm), data(o.prazoPrometido), o.desvioDias ?? ""]),
    ),
    gerarCsv(
      ["Etapa", "Concluídas no período", "Com prazo", "Com atraso", "Atraso médio (dias)", "Atrasadas hoje"],
      r.atrasosPorEtapa.map((l) => [ROTULO_TIPO_ETAPA[l.tipo], l.concluidasNoPeriodo, l.comPrazo, l.comAtraso, l.atrasoMedioDias ?? "", l.abertasAtrasadas]),
    ),
    gerarCsv(
      ["Motivo da pausa", "Pausas", "Justificadas", "Dias"],
      r.pausasPorMotivo.map((m) => [m.motivo, m.quantidade, m.justificadas, m.dias]),
    ),
    gerarCsv(
      ["Motivo do bloqueio (agora)", "Etapas bloqueadas"],
      r.bloqueadasAgora.map((b) => [b.motivo, b.quantidade]),
    ),
    gerarCsv(
      ["Chamados no período", "Em garantia", "Fora da garantia", "Resolvidos", "Dias médios para resolver", "Visitas cobradas", "Valor informado (centavos)", "Cobranças geradas", "Em aberto hoje"],
      [[a.total, a.emGarantia, a.foraDaGarantia, a.resolvidos, a.diasMedioParaResolver ?? "", a.visitasCobradas, a.valorCobradoCentavos, a.cobrancasGeradas, r.chamadosEmAbertoHoje]],
    ),
    gerarCsv(
      ["Tipo do problema", "Chamados"],
      a.porTipo.map((t) => [ROTULO_TIPO_PROBLEMA[t.tipo as TipoDoProblema] ?? t.tipo, t.quantidade]),
    ),
  ];
  if (r.truncado) secoes.push(gerarCsv(["AVISO: relatório limitado aos registros mais recentes do período. Reduza o período."], []));

  await registrarAuditoria(prisma, { usuario, entidade: "Relatorio", entidadeId: "obras", acao: "EXPORTAR", depois: { ...periodo } });

  // Cada seção vem com a marca de codificação (BOM) do Excel; só a primeira deve ficar.
  return new NextResponse(secoes.map((c, i) => (i === 0 ? c : c.replace(/^﻿/, ""))).join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="obras-e-assistencia.csv"', "Cache-Control": "no-store" },
  });
}
