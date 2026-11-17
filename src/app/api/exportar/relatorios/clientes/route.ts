import { NextResponse, type NextRequest } from "next/server";

import { registrarAuditoria } from "@/lib/auditoria";
import { sessaoParaApi } from "@/lib/auth/sessao";
import { csvDoRelatorio, type ColunaDeCsv } from "@/lib/csv/colunas";
import { respostaDeCsv } from "@/lib/csv/resposta";
import { prisma } from "@/lib/db";
import { dataLocalDoInstante } from "@/lib/formatadores";
import { lerPeriodo } from "@/lib/periodo";
import { clientesParaReativar, clientesPorCidade, LIMITE_DE_CLIENTES_NA_REATIVACAO, MESES_PADRAO_DE_REATIVACAO, type ClienteParaReativar, type LinhaDeCidade } from "@/modules/indicadores/clientes-e-produtos";

export const dynamic = "force-dynamic";

const COLUNAS_REATIVACAO: ColunaDeCsv<ClienteParaReativar>[] = [
  { titulo: "Cliente", tipo: "texto", valor: (l) => l.nome },
  { titulo: "Telefone", tipo: "texto", valor: (l) => l.whatsapp ?? l.telefone },
  { titulo: "Última aprovação", tipo: "dataHora", valor: (l) => l.ultimaAprovacaoEm },
  { titulo: "Obras", tipo: "inteiro", valor: (l) => l.obras },
  { titulo: "Total aprovado (R$)", tipo: "dinheiro", valor: (l) => l.totalAprovadoCentavos },
  { titulo: "Situação", tipo: "texto", valor: (l) => (l.temPropostaEmAberto ? "Proposta em aberto" : "Sem proposta em aberto") },
];

const COLUNAS_CIDADE: ColunaDeCsv<LinhaDeCidade>[] = [
  { titulo: "Cidade da obra", tipo: "texto", valor: (l) => (l.cidade ? `${l.cidade}${l.uf ? `/${l.uf}` : ""}` : "Não informada") },
  { titulo: "Clientes", tipo: "inteiro", valor: (l) => l.clientes },
  { titulo: "Obras", tipo: "inteiro", valor: (l) => l.obras },
  { titulo: "Vendido (R$)", tipo: "dinheiro", valor: (l) => l.vendidoCentavos },
];

/** Clientes em CSV, com a MESMA visão e os MESMOS parâmetros da tela (`visao=reativacao&meses=N` | `visao=cidade` + período). */
export async function GET(requisicao: NextRequest) {
  const usuario = await sessaoParaApi();
  if (!usuario) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  const hoje = dataLocalDoInstante(new Date());
  const parametros = requisicao.nextUrl.searchParams;
  const opcoes = { podeVerInterno: false } as const;
  const auditar = (entidadeId: string, linhas: number, extra: object) => registrarAuditoria(prisma, { usuario, entidade: "Relatorio", entidadeId, acao: "EXPORTAR", depois: { linhas, ...extra } });

  if (parametros.get("visao") === "cidade") {
    const { periodo } = lerPeriodo(Object.fromEntries(parametros), hoje);
    const l = await clientesPorCidade(periodo);
    await auditar("clientes-cidade", l.length, { periodo });
    return respostaDeCsv(csvDoRelatorio(COLUNAS_CIDADE, l, opcoes), "clientes-por-cidade.csv");
  }
  const bruto = Number(parametros.get("meses"));
  const meses = Number.isInteger(bruto) && bruto >= 1 && bruto <= 120 ? bruto : MESES_PADRAO_DE_REATIVACAO;
  const r = await clientesParaReativar(hoje, meses);
  await auditar("clientes-reativacao", r.linhas.length, { meses });
  const aviso = r.total > r.linhas.length ? `exportação limitada aos ${LIMITE_DE_CLIENTES_NA_REATIVACAO} clientes mais antigos de ${r.total}.` : null;
  return respostaDeCsv(csvDoRelatorio(COLUNAS_REATIVACAO, r.linhas, { ...opcoes, aviso }), "clientes-para-reativar.csv");
}
