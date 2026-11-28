import { NextResponse, type NextRequest } from "next/server";

import { registrarAuditoria } from "@/lib/auditoria";
import { sessaoParaApi } from "@/lib/auth/sessao";
import { acessoDoCsv, saidaNegada } from "@/lib/csv/acesso";
import { csvDoRelatorio, type ColunaDeCsv } from "@/lib/csv/colunas";
import { respostaDeCsv } from "@/lib/csv/resposta";
import { prisma } from "@/lib/db";
import { dataLocalDoInstante } from "@/lib/formatadores";
import { lerPeriodo } from "@/lib/periodo";
import { janelaDeFechamento, LIMITE_DE_DECISOES, listarDecisoes, tempoVisitaAteProposta, type DecisaoDeProjeto, type VisitaAteProposta } from "@/modules/indicadores/fechamento";

export const dynamic = "force-dynamic";

const DECISOES: ColunaDeCsv<DecisaoDeProjeto>[] = [
  { titulo: "Resultado", tipo: "texto", valor: (d) => (d.resultado === "APROVADO" ? "Aprovado" : "Perdido") },
  { titulo: "Código da obra", tipo: "texto", valor: (d) => d.codigo },
  { titulo: "Obra", tipo: "texto", valor: (d) => d.titulo },
  { titulo: "Cliente", tipo: "texto", valor: (d) => d.cliente },
  { titulo: "Data da decisão", tipo: "dataHora", valor: (d) => d.decididoEm },
  { titulo: "Valor fechado (R$)", tipo: "dinheiro", valor: (d) => d.valorCentavos },
];

const TEMPOS: ColunaDeCsv<VisitaAteProposta>[] = [
  { titulo: "Código da obra", tipo: "texto", valor: (l) => l.codigo },
  { titulo: "Obra", tipo: "texto", valor: (l) => l.titulo },
  { titulo: "Cliente", tipo: "texto", valor: (l) => l.cliente },
  { titulo: "Visita realizada em", tipo: "dataHora", valor: (l) => l.visitaEm },
  { titulo: "Primeira proposta enviada em", tipo: "dataHora", valor: (l) => l.propostaEnviadaEm },
  // Negativo = a visita foi registrada depois da proposta; essa linha fica fora da média.
  { titulo: "Dias", tipo: "inteiro", valor: (l) => l.dias },
  { titulo: "Entra na média", tipo: "texto", valor: (l) => (l.naMedia ? "Sim" : "Não: visita registrada depois da proposta") },
];

/** `?tabela=tempo` exporta o tempo visita → proposta; sem ela, as decisões (aprovados e perdidos) da janela de 90 dias. */
export async function GET(requisicao: NextRequest) {
  const usuario = await sessaoParaApi();
  if (!usuario) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  const negado = saidaNegada(usuario, { recursos: ["relatorio", "proposta"], valores: true });
  if (negado) return negado;
  const acesso = acessoDoCsv(usuario);

  const parametros = Object.fromEntries(requisicao.nextUrl.searchParams);
  const hoje = dataLocalDoInstante(new Date());
  const { periodo } = lerPeriodo(parametros, hoje);

  if (parametros.tabela === "tempo") {
    const t = await tempoVisitaAteProposta(periodo);
    await registrarAuditoria(prisma, { usuario, entidade: "Relatorio", entidadeId: "fechamento-tempo", acao: "EXPORTAR", depois: { linhas: t.linhas.length, periodo } });
    return respostaDeCsv(csvDoRelatorio(TEMPOS, t.linhas, { ...acesso }), "visita-ate-proposta.csv");
  }

  const janela = janelaDeFechamento(periodo, hoje);
  const { linhas, truncado } = await listarDecisoes(janela);
  const csv = csvDoRelatorio(DECISOES, linhas, { ...acesso, aviso: truncado ? `exportação limitada às ${LIMITE_DE_DECISOES} decisões mais recentes.` : null });
  await registrarAuditoria(prisma, { usuario, entidade: "Relatorio", entidadeId: "fechamento", acao: "EXPORTAR", depois: { linhas: linhas.length, janela } });
  return respostaDeCsv(csv, "fechamento.csv");
}
