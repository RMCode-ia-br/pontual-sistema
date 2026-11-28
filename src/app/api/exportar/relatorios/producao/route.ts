import { NextResponse, type NextRequest } from "next/server";

import { registrarAuditoria } from "@/lib/auditoria";
import { sessaoParaApi } from "@/lib/auth/sessao";
import { acessoDoCsv, saidaNegada } from "@/lib/csv/acesso";
import { csvDoRelatorio, type ColunaDeCsv } from "@/lib/csv/colunas";
import { respostaDeCsv } from "@/lib/csv/resposta";
import { prisma } from "@/lib/db";
import { dataLocalDoInstante } from "@/lib/formatadores";
import { lerPeriodo } from "@/lib/periodo";
import { LIMITE_DE_OBRAS_EM_ANDAMENTO, obrasEmAndamento, producaoPorMes, type MesDeProducao, type ObraEmAndamento } from "@/modules/indicadores/operacional";

export const dynamic = "force-dynamic";

const COLUNAS_MES: ColunaDeCsv<MesDeProducao>[] = [
  { titulo: "Mês", tipo: "texto", valor: (l) => `${l.mes.slice(5)}/${l.mes.slice(0, 4)}` },
  { titulo: "Obras concluídas", tipo: "inteiro", valor: (l) => l.obras },
  { titulo: "Área (m²)", tipo: "numero", valor: (l) => l.m2 },
  { titulo: "Da capacidade (%)", tipo: "numero", valor: (l) => l.ocupacaoPercentual },
];

const COLUNAS_ANDAMENTO: ColunaDeCsv<ObraEmAndamento>[] = [
  { titulo: "Código", tipo: "texto", valor: (l) => l.codigo },
  { titulo: "Obra", tipo: "texto", valor: (l) => l.titulo },
  { titulo: "Cliente", tipo: "texto", valor: (l) => l.cliente },
  { titulo: "Situação", tipo: "texto", valor: (l) => (l.status === "EM_EXECUCAO" ? "Em execução" : "Aprovada") },
  { titulo: "Etapa atual", tipo: "texto", valor: (l) => (l.etapaAtual ? `${l.etapaAtual}${l.etapaBloqueada ? " (bloqueada)" : ""}` : null) },
  { titulo: "Fim previsto da etapa", tipo: "data", valor: (l) => l.fimPrevistoDaEtapa },
  { titulo: "Etapas prontas", tipo: "inteiro", valor: (l) => l.etapasConcluidas },
  { titulo: "Etapas no total", tipo: "inteiro", valor: (l) => l.etapasTotal },
];

/** Produção em CSV: `visao=mes` (com o período da tela) ou `visao=andamento` (obras em andamento hoje). */
export async function GET(requisicao: NextRequest) {
  const usuario = await sessaoParaApi();
  if (!usuario) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  const negado = saidaNegada(usuario, { recursos: ["relatorio", "obra"] });
  if (negado) return negado;
  const acesso = acessoDoCsv(usuario);
  const parametros = requisicao.nextUrl.searchParams;
  const opcoes = { ...acesso } as const;
  const auditar = (id: string, linhas: number, extra: object = {}) => registrarAuditoria(prisma, { usuario, entidade: "Relatorio", entidadeId: id, acao: "EXPORTAR", depois: { linhas, ...extra } });

  if (parametros.get("visao") === "mes") {
    const { periodo } = lerPeriodo(Object.fromEntries(parametros), dataLocalDoInstante(new Date()));
    const r = await producaoPorMes(periodo);
    await auditar("producao-mes", r.meses.length, { periodo });
    return respostaDeCsv(csvDoRelatorio(COLUNAS_MES, r.meses, opcoes), "producao-por-mes.csv");
  }
  const r = await obrasEmAndamento();
  await auditar("obras-em-andamento", r.linhas.length);
  const aviso = r.truncado ? `exportação limitada às primeiras ${LIMITE_DE_OBRAS_EM_ANDAMENTO} obras.` : null;
  return respostaDeCsv(csvDoRelatorio(COLUNAS_ANDAMENTO, r.linhas, { ...opcoes, aviso }), "obras-em-andamento.csv");
}
