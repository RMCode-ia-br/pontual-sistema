import { NextResponse, type NextRequest } from "next/server";

import { registrarAuditoria } from "@/lib/auditoria";
import { sessaoParaApi } from "@/lib/auth/sessao";
import { acessoDoCsv, saidaNegada } from "@/lib/csv/acesso";
import { csvDoRelatorio, type ColunaDeCsv } from "@/lib/csv/colunas";
import { respostaDeCsv } from "@/lib/csv/resposta";
import { prisma } from "@/lib/db";
import { FAIXAS_DE_VENCIMENTO, type ResultadoDeAging } from "@/lib/dominio/aging";
import { dataLocalDoInstante } from "@/lib/formatadores";
import { agingDoPagar, agingDoReceber } from "@/modules/financeiro/queries-aging";

export const dynamic = "force-dynamic";

type Linha = { grupo: string; aging: ResultadoDeAging["linhas"][number] };

const COLUNAS: ColunaDeCsv<Linha>[] = [
  { titulo: "Agrupamento", tipo: "texto", valor: (l) => l.grupo },
  { titulo: "Nome", tipo: "texto", valor: (l) => l.aging.rotulo },
  ...FAIXAS_DE_VENCIMENTO.map((f): ColunaDeCsv<Linha> => ({ titulo: `${f.rotulo} (R$)`, tipo: "dinheiro", valor: (l) => l.aging.porFaixa[f.id] })),
  { titulo: "Total em aberto (R$)", tipo: "dinheiro", valor: (l) => l.aging.totalCentavos },
  { titulo: "Atrasado (R$)", tipo: "dinheiro", valor: (l) => l.aging.atrasadoCentavos },
];

const linhasDe = (grupo: string, aging: ResultadoDeAging): Linha[] => aging.linhas.map((l) => ({ grupo, aging: l }));

/** Contas por idade em CSV: `?tipo=receber` (por cliente) ou `?tipo=pagar` (por fornecedor e por categoria). */
export async function GET(requisicao: NextRequest) {
  const usuario = await sessaoParaApi();
  if (!usuario) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  const negado = saidaNegada(usuario, { recursos: ["contaReceber"], valores: true });
  if (negado) return negado;
  const acesso = acessoDoCsv(usuario);

  const tipo = requisicao.nextUrl.searchParams.get("tipo") === "pagar" ? "pagar" : "receber";
  const hoje = dataLocalDoInstante(new Date());
  let registros: Linha[];
  if (tipo === "receber") {
    registros = linhasDe("Cliente", (await agingDoReceber(hoje)).porCliente);
  } else {
    const r = await agingDoPagar(hoje);
    registros = [...linhasDe("Fornecedor", r.porFornecedor), ...linhasDe("Categoria", r.porCategoria)];
  }
  await registrarAuditoria(prisma, { usuario, entidade: tipo === "receber" ? "ContaReceber" : "ContaPagar", entidadeId: `exportacao-aging-${tipo}`, acao: "EXPORTAR", depois: { linhas: registros.length } });
  return respostaDeCsv(csvDoRelatorio(COLUNAS, registros, { ...acesso }), `${tipo}-por-idade.csv`);
}
