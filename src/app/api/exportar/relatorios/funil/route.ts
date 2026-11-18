import { NextResponse, type NextRequest } from "next/server";

import { registrarAuditoria } from "@/lib/auditoria";
import { sessaoParaApi } from "@/lib/auth/sessao";
import { csvDoRelatorio, type ColunaDeCsv } from "@/lib/csv/colunas";
import { respostaDeCsv } from "@/lib/csv/resposta";
import { prisma } from "@/lib/db";
import { ROTULO_STATUS_PROJETO } from "@/lib/dominio/funil";
import { valorParaCentavos } from "@/lib/dominio/numeros";
import { lerCortesDeFaixa } from "@/lib/dominio/relatorios-comerciais";
import { dataLocalDoInstante } from "@/lib/formatadores";
import { ROTULO_ORIGEM } from "@/modules/clientes/schemas";
import { tempoVisitaAteProposta } from "@/modules/indicadores/fechamento";
import { ganhasEPerdidasPorFaixa, LIMITE_DE_LINHAS_DE_DECISAO, temposDeDecisao } from "@/modules/indicadores/tempos-e-faixas";
import { carregarRelatorioDoFunil, lerFiltrosDoRelatorio, type RelatorioDoFunil } from "@/modules/relatorios/funil";

export const dynamic = "force-dynamic";

type LinhaDeFase = RelatorioDoFunil["porFase"][number];
type LinhaDeConversao = RelatorioDoFunil["conversao"][number];
type LinhaDeOrigem = RelatorioDoFunil["porOrigem"][number];

const FASES: ColunaDeCsv<LinhaDeFase>[] = [
  { titulo: "Fase atual", tipo: "texto", valor: (f) => ROTULO_STATUS_PROJETO[f.status] },
  { titulo: "Projetos", tipo: "inteiro", valor: (f) => f.quantidade },
  { titulo: "Valor estimado (R$)", tipo: "dinheiro", valor: (f) => (f.valorCentavos > 0 ? f.valorCentavos : null) }, // sem valor estimado em nenhum projeto da fase: vazio (a tela mostra "—"), nunca 0,00
];
const CONVERSAO: ColunaDeCsv<LinhaDeConversao>[] = [
  { titulo: "Fase", tipo: "texto", valor: (c) => ROTULO_STATUS_PROJETO[c.etapa] },
  { titulo: "Chegaram", tipo: "inteiro", valor: (c) => c.chegaram },
  { titulo: "% do total", tipo: "percentual", valor: (c) => c.percentualDoTotal },
  { titulo: "% da fase anterior", tipo: "percentual", valor: (c) => c.percentualDaAnterior },
];
const ORIGEM: ColunaDeCsv<LinhaDeOrigem>[] = [
  { titulo: "Origem", tipo: "texto", valor: (o) => (o.origem ? (ROTULO_ORIGEM[o.origem as keyof typeof ROTULO_ORIGEM] ?? o.origem) : "Não informada") },
  { titulo: "Projetos", tipo: "inteiro", valor: (o) => o.leads },
  { titulo: "Com visita", tipo: "inteiro", valor: (o) => o.comVisita },
  { titulo: "Proposta enviada", tipo: "inteiro", valor: (o) => o.comPropostaEnviada },
  { titulo: "Aprovados", tipo: "inteiro", valor: (o) => o.aprovados },
  { titulo: "Perdidos", tipo: "inteiro", valor: (o) => o.perdidos },
];
const MOTIVOS: ColunaDeCsv<{ nome: string; quantidade: number }>[] = [
  { titulo: "Motivo de perda", tipo: "texto", valor: (m) => m.nome },
  { titulo: "Projetos", tipo: "inteiro", valor: (m) => m.quantidade },
];
type Decisao = { resultado: string; codigo: string; titulo: string; cliente: string; enviadaEm: Date; decididaEm: Date; dias: number; naMedia: boolean };
const DECISOES: ColunaDeCsv<Decisao>[] = [
  { titulo: "Resultado", tipo: "texto", valor: (l) => l.resultado },
  { titulo: "Código da obra", tipo: "texto", valor: (l) => l.codigo },
  { titulo: "Obra", tipo: "texto", valor: (l) => l.titulo },
  { titulo: "Cliente", tipo: "texto", valor: (l) => l.cliente },
  { titulo: "Enviada em", tipo: "dataHora", valor: (l) => l.enviadaEm },
  { titulo: "Decidida em", tipo: "dataHora", valor: (l) => l.decididaEm },
  { titulo: "Dias", tipo: "inteiro", valor: (l) => l.dias },
  { titulo: "Entra na média", tipo: "texto", valor: (l) => (l.naMedia ? "Sim" : "Não: decisão anterior ao envio registrado") },
];
type LinhaDeFaixaCsv = { faixa: string; ganhas: number; perdidas: number; taxa: number | null };
const FAIXAS: ColunaDeCsv<LinhaDeFaixaCsv>[] = [
  { titulo: "Faixa de preço", tipo: "texto", valor: (l) => l.faixa },
  { titulo: "Ganhas", tipo: "inteiro", valor: (l) => l.ganhas },
  { titulo: "Perdidas", tipo: "inteiro", valor: (l) => l.perdidas },
  { titulo: "% ganhas, de todas", tipo: "percentual", valor: (l) => l.taxa },
];

/**
 * CSV do funil, com os MESMOS filtros e a MESMA visão da tela (`?visao=funil|perdas|tempos|faixas`). Na visão do funil,
 * `tabela=conversao|origem` escolhe a tabela (padrão: projetos por fase atual).
 */
export async function GET(requisicao: NextRequest) {
  const usuario = await sessaoParaApi();
  if (!usuario) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  const parametros = requisicao.nextUrl.searchParams;
  const hoje = dataLocalDoInstante(new Date());
  const filtros = lerFiltrosDoRelatorio(Object.fromEntries(parametros), hoje);
  const visao = parametros.get("visao") ?? "funil";
  const opcoes = { podeVerInterno: false } as const;
  const auditar = (id: string, linhas: number) => registrarAuditoria(prisma, { usuario, entidade: "Relatorio", entidadeId: id, acao: "EXPORTAR", depois: { ...filtros, visao, linhas } });

  if (visao === "tempos") {
    const periodo = { de: filtros.de, ate: filtros.ate };
    if (parametros.get("tabela") === "visita") {
      const v = await tempoVisitaAteProposta(periodo);
      await auditar("funil-tempos-visita", v.linhas.length);
      const colunas: ColunaDeCsv<(typeof v.linhas)[number]>[] = [
        { titulo: "Código da obra", tipo: "texto", valor: (l) => l.codigo },
        { titulo: "Obra", tipo: "texto", valor: (l) => l.titulo },
        { titulo: "Cliente", tipo: "texto", valor: (l) => l.cliente },
        { titulo: "Visita realizada em", tipo: "dataHora", valor: (l) => l.visitaEm },
        { titulo: "Primeira proposta enviada em", tipo: "dataHora", valor: (l) => l.propostaEnviadaEm },
        { titulo: "Dias", tipo: "inteiro", valor: (l) => l.dias },
        { titulo: "Entra na média", tipo: "texto", valor: (l) => (l.naMedia ? "Sim" : "Não: visita registrada depois da proposta") },
      ];
      return respostaDeCsv(csvDoRelatorio(colunas, v.linhas, opcoes), "visita-ate-proposta.csv");
    }
    const d = await temposDeDecisao(periodo);
    const linhas: Decisao[] = [...d.aprovadas.linhas.map((l) => ({ ...l, resultado: "Aprovada" })), ...d.perdidas.linhas.map((l) => ({ ...l, resultado: "Perdida" }))];
    await auditar("funil-tempos", linhas.length);
    const cortou = d.aprovadas.totalDeLinhas > d.aprovadas.linhas.length || d.perdidas.totalDeLinhas > d.perdidas.linhas.length;
    const aviso = cortou ? `exportação limitada às ${LIMITE_DE_LINHAS_DE_DECISAO} decisões mais recentes de cada tipo (${d.aprovadas.totalDeLinhas} aprovadas e ${d.perdidas.totalDeLinhas} perdidas no período). Escolha um período menor.` : null;
    return respostaDeCsv(csvDoRelatorio(DECISOES, linhas, { ...opcoes, aviso }), "proposta-ate-decisao.csv");
  }

  if (visao === "faixas") {
    const f = await ganhasEPerdidasPorFaixa(hoje, lerCortesDeFaixa(parametros.get("cortes"), valorParaCentavos));
    const r = f.resultado;
    const linhas: LinhaDeFaixaCsv[] = r.tipo === "unica" ? [{ faixa: "Todos os valores (poucos dados para dividir em faixas)", ganhas: r.ganhas, perdidas: r.perdidas, taxa: r.taxaDeGanhoPercentual }] : r.linhas.map((l) => ({ faixa: l.faixa.rotulo, ganhas: l.ganhas, perdidas: l.perdidas, taxa: l.taxaDeGanhoPercentual }));
    await auditar("funil-faixas", linhas.length);
    const aviso = `a confirmar com o Marcelo; últimos 12 meses até ${hoje}; ${f.perdidasSemProposta} perdida(s) sem proposta enviada e ${f.perdidasSemValor} sem valor ficaram de fora`;
    return respostaDeCsv(csvDoRelatorio(FAIXAS, linhas, { ...opcoes, aviso }), "ganhas-e-perdidas-por-faixa.csv");
  }

  const r = await carregarRelatorioDoFunil(filtros);
  if (visao === "perdas") {
    await auditar("funil-perdas", r.motivos.length);
    return respostaDeCsv(csvDoRelatorio(MOTIVOS, r.motivos, opcoes), "motivos-de-perda.csv");
  }
  const tabela = parametros.get("tabela");
  if (tabela === "conversao") {
    await auditar("funil-conversao", r.conversao.length);
    return respostaDeCsv(csvDoRelatorio(CONVERSAO, r.conversao, opcoes), "funil-conversao.csv");
  }
  if (tabela === "origem") {
    await auditar("funil-origem", r.porOrigem.length);
    return respostaDeCsv(csvDoRelatorio(ORIGEM, r.porOrigem, opcoes), "funil-por-origem.csv");
  }
  await auditar("funil", r.porFase.length);
  return respostaDeCsv(csvDoRelatorio(FASES, r.porFase, opcoes), "funil-por-fase.csv");
}
