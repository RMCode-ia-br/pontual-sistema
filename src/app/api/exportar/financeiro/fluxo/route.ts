import { NextResponse, type NextRequest } from "next/server";

import { registrarAuditoria } from "@/lib/auditoria";
import { sessaoParaApi } from "@/lib/auth/sessao";
import { csvDoRelatorio, type ColunaDeCsv } from "@/lib/csv/colunas";
import { respostaDeCsv } from "@/lib/csv/resposta";
import { prisma } from "@/lib/db";
import { somarDias } from "@/lib/dominio/calendario";
import { janelasDeDias, periodosMensais, projetarFluxo } from "@/lib/dominio/fluxo-caixa";
import { dataLocalDoInstante } from "@/lib/formatadores";
import { carregarDadosDoFluxo } from "@/modules/financeiro/queries-fluxo";
import { lerParametrosFinanceiros } from "@/modules/financeiro/queries-receber";

export const dynamic = "force-dynamic";

const MESES_ADIANTE = 6;

type Linha = { rotulo: string; entradasCentavos: number; saidasCentavos: number; saldoProjetadoCentavos: number };

const COLUNAS: ColunaDeCsv<Linha>[] = [
  { titulo: "Período", tipo: "texto", valor: (l) => l.rotulo },
  { titulo: "Entradas previstas (R$)", tipo: "dinheiro", valor: (l) => l.entradasCentavos },
  { titulo: "Saídas previstas (R$)", tipo: "dinheiro", valor: (l) => l.saidasCentavos },
  { titulo: "Saldo projetado (R$)", tipo: "dinheiro", valor: (l) => l.saldoProjetadoCentavos },
];

/** Fluxo de caixa projetado em CSV (`?visao=dias` para 30/60/90 dias; padrão: por mês), com a mesma conta da tela. */
export async function GET(requisicao: NextRequest) {
  const usuario = await sessaoParaApi();
  if (!usuario) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  const visao = requisicao.nextUrl.searchParams.get("visao") === "dias" ? "dias" : "meses";
  const hoje = dataLocalDoInstante(new Date());
  const config = await lerParametrosFinanceiros();
  const periodosMeses = periodosMensais(hoje, MESES_ADIANTE);
  const fimDosMeses = periodosMeses[periodosMeses.length - 1].fim;
  const ate = fimDosMeses > somarDias(hoje, 90) ? fimDosMeses : somarDias(hoje, 90);
  const dados = await carregarDadosDoFluxo(hoje, { desde: `${hoje.slice(0, 7)}-01`, ate, diasEmBreve: config.diasAlertaVencimento });
  const periodos = visao === "dias" ? janelasDeDias(hoje, [30, 60, 90]) : periodosMeses;
  const projetado = projetarFluxo({ hoje, saldoAtualCentavos: dados.saldoAtualCentavos, periodos, aReceber: dados.aReceber, aPagar: dados.aPagar });

  const aviso = dados.contasSemSaldo.length > 0 ? `há conta(s) com saldo NÃO INFORMADO (${dados.contasSemSaldo.join(", ")}): o saldo projetado mostra só a variação do caixa, não o dinheiro disponível.` : null;
  const csv = csvDoRelatorio(COLUNAS, projetado.linhas, { podeVerInterno: false, aviso });
  await registrarAuditoria(prisma, { usuario, entidade: "Relatorio", entidadeId: "fluxo-de-caixa", acao: "EXPORTAR", depois: { visao, linhas: projetado.linhas.length } });
  return respostaDeCsv(csv, "fluxo-de-caixa.csv");
}
