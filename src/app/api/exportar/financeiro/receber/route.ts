import { NextResponse, type NextRequest } from "next/server";

import { registrarAuditoria } from "@/lib/auditoria";
import { sessaoParaApi } from "@/lib/auth/sessao";
import { acessoDoCsv, saidaNegada } from "@/lib/csv/acesso";
import { csvDoRelatorio, type ColunaDeCsv } from "@/lib/csv/colunas";
import { respostaDeCsv } from "@/lib/csv/resposta";
import { prisma } from "@/lib/db";
import { ROTULO_FORMA, type FormaPagamento } from "@/lib/dominio/parcelas";
import { dataLocalDoInstante } from "@/lib/formatadores";
import { textoDaSituacao } from "@/modules/financeiro/components/selo-da-situacao";
import { LIMITE_EXPORTACAO_A_RECEBER, lerListaAReceber, lerParametrosFinanceiros, listarContasAReceberParaExportar } from "@/modules/financeiro/queries-receber";

export const dynamic = "force-dynamic";

type Conta = Awaited<ReturnType<typeof listarContasAReceberParaExportar>>["linhas"][number];
const COLUNAS: ColunaDeCsv<Conta>[] = [
  { titulo: "Parcela", tipo: "texto", valor: (c) => c.descricao },
  { titulo: "Cliente", tipo: "texto", valor: (c) => c.clienteNome },
  { titulo: "Obra", tipo: "texto", valor: (c) => (c.projetoCodigo ? `${c.projetoCodigo} ${c.projetoTitulo ?? ""}`.trim() : null) },
  { titulo: "Vencimento", tipo: "data", valor: (c) => c.vencimento },
  { titulo: "Prometido para", tipo: "data", valor: (c) => c.dataPrometida },
  { titulo: "Situação", tipo: "texto", valor: (c) => textoDaSituacao(c.resumo) },
  { titulo: "Valor (R$)", tipo: "dinheiro", valor: (c) => c.valorCentavos },
  { titulo: "Recebido (R$)", tipo: "dinheiro", valor: (c) => c.valorPagoCentavos },
  { titulo: "Saldo (R$)", tipo: "dinheiro", valor: (c) => c.resumo.saldoCentavos },
  { titulo: "Forma", tipo: "texto", valor: (c) => (c.forma ? (ROTULO_FORMA[c.forma as FormaPagamento] ?? c.forma) : null) },
  { titulo: "Nota fiscal", tipo: "texto", valor: (c) => (c.comNotaFiscal ? "Com nota" : "Sem nota") },
];

/** Contas a receber em CSV, com os MESMOS filtros e a mesma aba da lista. */
export async function GET(requisicao: NextRequest) {
  const usuario = await sessaoParaApi();
  if (!usuario) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  const negado = saidaNegada(usuario, { recursos: ["contaReceber"], valores: true });
  if (negado) return negado;
  const acesso = acessoDoCsv(usuario);

  const hoje = dataLocalDoInstante(new Date());
  const { parametros, filtros } = lerListaAReceber(Object.fromEntries(requisicao.nextUrl.searchParams));
  const config = await lerParametrosFinanceiros();
  const { linhas, truncado } = await listarContasAReceberParaExportar(parametros, filtros, hoje, config.diasAlertaVencimento);

  const aviso = truncado ? `exportação limitada às primeiras ${LIMITE_EXPORTACAO_A_RECEBER} contas. Use os filtros para obter o restante.` : null;
  const csv = csvDoRelatorio(COLUNAS, linhas, { ...acesso, aviso });
  await registrarAuditoria(prisma, { usuario, entidade: "ContaReceber", entidadeId: "exportacao-receber", acao: "EXPORTAR", depois: { linhas: linhas.length, truncado, filtros } });

  return respostaDeCsv(csv, "a-receber.csv");
}
