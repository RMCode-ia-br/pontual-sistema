import { NextResponse, type NextRequest } from "next/server";

import { registrarAuditoria } from "@/lib/auditoria";
import { sessaoParaApi } from "@/lib/auth/sessao";
import { acessoDoCsv, saidaNegada } from "@/lib/csv/acesso";
import { csvDoRelatorio, type ColunaDeCsv } from "@/lib/csv/colunas";
import { respostaDeCsv } from "@/lib/csv/resposta";
import { prisma } from "@/lib/db";
import { dataLocalDoInstante } from "@/lib/formatadores";
import { lerPeriodo, rotuloDoPeriodo } from "@/lib/periodo";
import { ROTULO_ORIGEM } from "@/modules/clientes/schemas";
import { LIMITE_DE_CANCELAMENTOS, listarCancelamentos, type CanceladoDepoisDeAprovado } from "@/modules/indicadores/cancelamentos";
import { LIMITE_DE_LINHAS_DE_VENDAS, listarVendas, type LinhaDeVenda } from "@/modules/indicadores/vendas";
import { desempenhoPorParceiro, sazonalidade, ticketPorPorte, ticketPorTipoDeServico, vendasPorOrigem, type LinhaDeOrigem, type LinhaDeParceiro, type LinhaDeSazonalidade, type LinhaDeTicket } from "@/modules/indicadores/vendas-por-dimensao";
import { ROTULO_PORTE, ROTULO_TIPO_SERVICO } from "@/modules/projetos/schemas";

export const dynamic = "force-dynamic";

const COLUNAS: ColunaDeCsv<LinhaDeVenda>[] = [
  { titulo: "Proposta", tipo: "texto", valor: (l) => l.numero },
  { titulo: "Código da obra", tipo: "texto", valor: (l) => l.projetoCodigo },
  { titulo: "Obra", tipo: "texto", valor: (l) => l.projetoTitulo },
  { titulo: "Cliente", tipo: "texto", valor: (l) => l.cliente },
  { titulo: "Aprovada em", tipo: "dataHora", valor: (l) => l.aceitaEm },
  { titulo: "Nota fiscal", tipo: "texto", valor: (l) => (l.comNotaFiscal ? "Com nota" : "Sem nota") },
  { titulo: "Valor aprovado (R$)", tipo: "dinheiro", valor: (l) => l.valorCentavos },
];

const COLUNAS_CANCELADOS: ColunaDeCsv<CanceladoDepoisDeAprovado>[] = [
  { titulo: "Código da obra", tipo: "texto", valor: (l) => l.codigo },
  { titulo: "Obra", tipo: "texto", valor: (l) => l.titulo },
  { titulo: "Cliente", tipo: "texto", valor: (l) => l.cliente },
  { titulo: "Aprovada em", tipo: "dataHora", valor: (l) => l.aprovadoEm },
  { titulo: "Cancelada em", tipo: "dataHora", valor: (l) => l.canceladoEm },
  { titulo: "Valor que tinha sido vendido (R$)", tipo: "dinheiro", valor: (l) => l.valorAprovadoCentavos },
];

const COLUNAS_ORIGEM: ColunaDeCsv<LinhaDeOrigem>[] = [
  { titulo: "Origem", tipo: "texto", valor: (l) => (l.origem ? (ROTULO_ORIGEM[l.origem as keyof typeof ROTULO_ORIGEM] ?? l.origem) : "Não informada") },
  { titulo: "Projetos novos", tipo: "inteiro", valor: (l) => l.leads },
  { titulo: "Com proposta enviada", tipo: "inteiro", valor: (l) => l.comProposta },
  { titulo: "Fechados", tipo: "inteiro", valor: (l) => l.fechados },
  { titulo: "Vendido (R$)", tipo: "dinheiro", valor: (l) => l.vendidoCentavos },
];

const COLUNAS_PARCEIRO = (papel: string): ColunaDeCsv<LinhaDeParceiro>[] => [
  { titulo: papel, tipo: "texto", valor: (l) => l.nome },
  { titulo: "Indicados", tipo: "inteiro", valor: (l) => l.indicados },
  { titulo: "Com proposta enviada", tipo: "inteiro", valor: (l) => l.comProposta },
  { titulo: "Fechados", tipo: "inteiro", valor: (l) => l.fechados },
  { titulo: "Vendido (R$)", tipo: "dinheiro", valor: (l) => l.vendidoCentavos },
];

const COLUNAS_TICKET = (titulo: string, rotulo: (c: string | null) => string): ColunaDeCsv<LinhaDeTicket>[] => [
  { titulo, tipo: "texto", valor: (l) => rotulo(l.chave) },
  { titulo: "Obras", tipo: "inteiro", valor: (l) => l.projetos },
  { titulo: "Vendido (R$)", tipo: "dinheiro", valor: (l) => l.vendidoCentavos },
  { titulo: "Ticket médio (R$)", tipo: "dinheiro", valor: (l) => l.ticketCentavos },
];

const COLUNAS_ANO: ColunaDeCsv<LinhaDeSazonalidade>[] = [
  { titulo: "Mês", tipo: "texto", valor: (l) => `${l.mes.slice(5)}/${l.mes.slice(0, 4)}` },
  { titulo: "Vendido (R$)", tipo: "dinheiro", valor: (l) => l.atual.vendidoCentavos },
  { titulo: "Vendido um ano antes (R$)", tipo: "dinheiro", valor: (l) => l.anoAnterior.vendidoCentavos },
  { titulo: "Propostas enviadas", tipo: "inteiro", valor: (l) => l.atual.propostasEnviadas },
  { titulo: "Propostas enviadas um ano antes", tipo: "inteiro", valor: (l) => l.anoAnterior.propostasEnviadas },
  { titulo: "Novos contatos", tipo: "inteiro", valor: (l) => l.atual.novosContatos },
  { titulo: "Novos contatos um ano antes", tipo: "inteiro", valor: (l) => l.anoAnterior.novosContatos },
];

const rotuloTipo = (c: string | null) => (c ? (ROTULO_TIPO_SERVICO[c as keyof typeof ROTULO_TIPO_SERVICO] ?? c) : "Não informado");
const rotuloPorte = (c: string | null) => (c ? (ROTULO_PORTE[c as keyof typeof ROTULO_PORTE] ?? c) : "Não informado");

/**
 * Vendas em CSV, com o MESMO período e a MESMA visão da tela (`?visao=periodo|origem|parceiros|ticket|ano`; parceiros aceita
 * `papel=arquiteto|construtora`; ticket aceita `tabela=porte`). `?tabela=cancelados` exporta as obras canceladas depois de aprovadas.
 */
export async function GET(requisicao: NextRequest) {
  const usuario = await sessaoParaApi();
  if (!usuario) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  const negado = saidaNegada(usuario, { recursos: ["relatorio", "proposta"], valores: true });
  if (negado) return negado;
  const acesso = acessoDoCsv(usuario);

  const hoje = dataLocalDoInstante(new Date());
  const parametros = requisicao.nextUrl.searchParams;
  const { periodo } = lerPeriodo(Object.fromEntries(parametros), hoje);
  const visao = parametros.get("visao") ?? "periodo";
  const auditar = (entidadeId: string, linhas: number) => registrarAuditoria(prisma, { usuario, entidade: "Relatorio", entidadeId, acao: "EXPORTAR", depois: { linhas, periodo, visao } });
  const opcoes = { ...acesso } as const;

  if (visao === "origem") {
    const l = await vendasPorOrigem(periodo);
    await auditar("vendas-origem", l.length);
    return respostaDeCsv(csvDoRelatorio(COLUNAS_ORIGEM, l, opcoes), "vendas-por-origem.csv");
  }
  if (visao === "parceiros") {
    const papel = parametros.get("papel") === "construtora" ? "construtora" : "arquiteto";
    const l = await desempenhoPorParceiro(periodo, papel);
    await auditar("vendas-parceiros", l.length);
    return respostaDeCsv(csvDoRelatorio(COLUNAS_PARCEIRO(papel === "arquiteto" ? "Arquiteto" : "Construtora"), l, opcoes), `vendas-por-${papel}.csv`);
  }
  if (visao === "ticket") {
    const porPorte = parametros.get("tabela") === "porte";
    const l = porPorte ? await ticketPorPorte(periodo) : await ticketPorTipoDeServico(periodo);
    await auditar("vendas-ticket", l.length);
    return respostaDeCsv(csvDoRelatorio(COLUNAS_TICKET(porPorte ? "Porte" : "Tipo de serviço", porPorte ? rotuloPorte : rotuloTipo), l, opcoes), `ticket-medio-por-${porPorte ? "porte" : "tipo"}.csv`);
  }
  if (visao === "ano") {
    const { meses } = await sazonalidade(hoje);
    await auditar("vendas-ano", meses.length);
    return respostaDeCsv(csvDoRelatorio(COLUNAS_ANO, meses, opcoes), "vendas-ano-contra-ano.csv");
  }
  if (parametros.get("tabela") === "cancelados") {
    const c = await listarCancelamentos(periodo);
    await auditar("vendas-cancelados", c.linhas.length);
    const aviso = c.truncado ? `exportação limitada a ${LIMITE_DE_CANCELAMENTOS} obras de ${rotuloDoPeriodo(periodo)}. Escolha um período menor.` : null;
    return respostaDeCsv(csvDoRelatorio(COLUNAS_CANCELADOS, c.linhas, { ...opcoes, aviso }), "cancelado-depois-de-aprovado.csv");
  }
  const { linhas, truncado } = await listarVendas(periodo);
  // Valor aprovado não é custo: vai inteiro. Nenhuma coluna interna aqui.
  const csv = csvDoRelatorio(COLUNAS, linhas, { ...opcoes, aviso: truncado ? `exportação limitada às ${LIMITE_DE_LINHAS_DE_VENDAS} aprovações mais recentes de ${rotuloDoPeriodo(periodo)}. Escolha um período menor.` : null });
  await auditar("vendas", linhas.length);
  return respostaDeCsv(csv, "vendas-por-periodo.csv");
}
