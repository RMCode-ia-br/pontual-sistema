import { NextResponse, type NextRequest } from "next/server";

import { registrarAuditoria } from "@/lib/auditoria";
import { sessaoParaApi } from "@/lib/auth/sessao";
import { acessoDoCsv, saidaNegada } from "@/lib/csv/acesso";
import { csvDoRelatorio, type ColunaDeCsv } from "@/lib/csv/colunas";
import { celulaCsv } from "@/lib/csv";
import { respostaDeCsv } from "@/lib/csv/resposta";
import { prisma } from "@/lib/db";
import { ROTULO_TIPO_PROBLEMA, type TipoDoProblema } from "@/lib/dominio/chamados";
import { ROTULO_TIPO_ETAPA } from "@/lib/dominio/etapas";
import { carregarRelatorioDeObras, lerPeriodoDoRelatorioDeObras } from "@/modules/relatorios/obras";

export const dynamic = "force-dynamic";

const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

/** Uma seção do arquivo: colunas tipadas, sem o BOM (só o começo do arquivo leva). */
function secao<L>(acesso: ReturnType<typeof acessoDoCsv>, colunas: ColunaDeCsv<L>[], linhas: L[]): string {
  return csvDoRelatorio(colunas, linhas, acesso).replace(/^﻿/, "");
}

/** CSV do relatório de obras e assistência, com o MESMO período da tela (seções separadas por uma linha em branco). */
export async function GET(requisicao: NextRequest) {
  const usuario = await sessaoParaApi();
  if (!usuario) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  const negado = saidaNegada(usuario, { recursos: ["relatorio", "obra"] });
  if (negado) return negado;
  const acesso = acessoDoCsv(usuario);

  const periodo = lerPeriodoDoRelatorioDeObras(Object.fromEntries(requisicao.nextUrl.searchParams));
  const r = await carregarRelatorioDeObras(periodo);
  const p = r.pontualidade;
  const a = r.assistencias;

  const secoes = [
    secao(
      acesso,
      [
        { titulo: "Obras avaliadas", tipo: "inteiro", valor: (x: typeof p) => x.concluidas },
        { titulo: "Sem prazo", tipo: "inteiro", valor: (x) => x.semPrazo },
        { titulo: "No prazo", tipo: "inteiro", valor: (x) => x.pontuais },
        { titulo: "Pontualidade %", tipo: "percentual", valor: (x) => x.pontualidadePct },
        { titulo: "Desvio médio (dias)", tipo: "numero", casas: 1, valor: (x) => x.desvioMedioDias },
        { titulo: "No prazo sem pausas", tipo: "inteiro", valor: (x) => x.pontuaisSemPausas },
        { titulo: "Pontualidade sem pausas %", tipo: "percentual", valor: (x) => x.pontualidadeSemPausasPct },
        { titulo: "Desvio médio sem pausas (dias)", tipo: "numero", casas: 1, valor: (x) => x.desvioMedioSemPausasDias },
      ],
      [p],
    ),
    secao(
      acesso,
      [
        { titulo: "Código", tipo: "texto", valor: (o: (typeof r.obrasConcluidas)[number]) => o.codigo },
        { titulo: "Obra", tipo: "texto", valor: (o) => o.titulo },
        { titulo: "Cliente", tipo: "texto", valor: (o) => o.clienteNome },
        { titulo: "Concluída em", tipo: "data", valor: (o) => o.concluidaEm },
        { titulo: "Prazo prometido", tipo: "data", valor: (o) => o.prazoPrometido },
        { titulo: "Desvio (dias; positivo = atraso)", tipo: "inteiro", valor: (o) => o.desvioDias },
      ],
      r.obrasConcluidas,
    ),
    secao(
      acesso,
      [
        { titulo: "Etapa", tipo: "texto", valor: (l: (typeof r.atrasosPorEtapa)[number]) => ROTULO_TIPO_ETAPA[l.tipo] },
        { titulo: "Concluídas no período", tipo: "inteiro", valor: (l) => l.concluidasNoPeriodo },
        { titulo: "Com prazo", tipo: "inteiro", valor: (l) => l.comPrazo },
        { titulo: "Com atraso", tipo: "inteiro", valor: (l) => l.comAtraso },
        { titulo: "Atraso médio (dias)", tipo: "numero", casas: 1, valor: (l) => l.atrasoMedioDias },
        { titulo: "Atrasadas hoje", tipo: "inteiro", valor: (l) => l.abertasAtrasadas },
      ],
      r.atrasosPorEtapa,
    ),
    secao(
      acesso,
      [
        { titulo: "Motivo da pausa", tipo: "texto", valor: (m: (typeof r.pausasPorMotivo)[number]) => m.motivo },
        { titulo: "Pausas", tipo: "inteiro", valor: (m) => m.quantidade },
        { titulo: "Justificadas", tipo: "inteiro", valor: (m) => m.justificadas },
        { titulo: "Dias", tipo: "inteiro", valor: (m) => m.dias },
      ],
      r.pausasPorMotivo,
    ),
    secao(
      acesso,
      [
        { titulo: "Motivo do bloqueio (agora)", tipo: "texto", valor: (b: (typeof r.bloqueadasAgora)[number]) => b.motivo },
        { titulo: "Etapas bloqueadas", tipo: "inteiro", valor: (b) => b.quantidade },
      ],
      r.bloqueadasAgora,
    ),
    secao(
      acesso,
      [
        { titulo: "Chamados no período", tipo: "inteiro", valor: (x: { a: typeof a; abertos: number }) => x.a.total },
        { titulo: "Em garantia", tipo: "inteiro", valor: (x) => x.a.emGarantia },
        { titulo: "Fora da garantia", tipo: "inteiro", valor: (x) => x.a.foraDaGarantia },
        { titulo: "Resolvidos", tipo: "inteiro", valor: (x) => x.a.resolvidos },
        { titulo: "Dias médios para resolver", tipo: "numero", casas: 1, valor: (x) => x.a.diasMedioParaResolver },
        { titulo: "Visitas cobradas", tipo: "inteiro", valor: (x) => x.a.visitasCobradas },
        { titulo: "Valor informado (R$)", tipo: "dinheiro", valor: (x) => x.a.valorCobradoCentavos },
        { titulo: "Cobranças geradas", tipo: "inteiro", valor: (x) => x.a.cobrancasGeradas },
        { titulo: "Em aberto hoje", tipo: "inteiro", valor: (x) => x.abertos },
      ],
      [{ a, abertos: r.chamadosEmAbertoHoje }],
    ),
    secao(
      acesso,
      [
        { titulo: "Tipo do problema", tipo: "texto", valor: (t: (typeof a.porTipo)[number]) => ROTULO_TIPO_PROBLEMA[t.tipo as TipoDoProblema] ?? t.tipo },
        { titulo: "Chamados", tipo: "inteiro", valor: (t) => t.quantidade },
      ],
      a.porTipo,
    ),
  ];
  const aviso = `Período ${br(periodo.de)} a ${br(periodo.ate)}.${r.truncado ? " Relatório limitado aos registros mais recentes do período. Reduza o período." : ""}`;

  await registrarAuditoria(prisma, { usuario, entidade: "Relatorio", entidadeId: "obras", acao: "EXPORTAR", depois: { ...periodo } });
  // O aviso (com o período) abre o arquivo, depois do BOM; as seções vêm separadas por uma linha em branco.
  return respostaDeCsv(`﻿${celulaCsv(`AVISO: ${aviso}`)}\r\n${secoes.join("\r\n")}`, "obras-e-assistencia.csv");
}
