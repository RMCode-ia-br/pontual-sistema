import { NextResponse, type NextRequest } from "next/server";

import { registrarAuditoria } from "@/lib/auditoria";
import { sessaoParaApi } from "@/lib/auth/sessao";
import { csvDoRelatorio, type ColunaDeCsv } from "@/lib/csv/colunas";
import { respostaDeCsv } from "@/lib/csv/resposta";
import { prisma } from "@/lib/db";
import { dataLocalDoInstante } from "@/lib/formatadores";
import { lerPeriodo } from "@/lib/periodo";
import { mixPorTipologia, precoMedioPorM2, ROTULO_DA_DIMENSAO, type DimensaoDePreco, type LinhaDePrecoPorM2 } from "@/modules/indicadores/clientes-e-produtos";

export const dynamic = "force-dynamic";

type LinhaDoMixCsv = { nome: string; itens: number | null; m2: number | null; valorCentavos: number };

const COLUNAS_MIX: ColunaDeCsv<LinhaDoMixCsv>[] = [
  { titulo: "Tipologia", tipo: "texto", valor: (l) => l.nome },
  { titulo: "Itens", tipo: "inteiro", valor: (l) => l.itens },
  { titulo: "Área (m²)", tipo: "numero", valor: (l) => l.m2 },
  { titulo: "Valor dos itens (R$)", tipo: "dinheiro", valor: (l) => l.valorCentavos },
];

const COLUNAS_PRECO = (dimensao: string): ColunaDeCsv<LinhaDePrecoPorM2>[] => [
  { titulo: "Mês", tipo: "texto", valor: (l) => `${l.mes.slice(5)}/${l.mes.slice(0, 4)}` },
  { titulo: dimensao, tipo: "texto", valor: (l) => l.nome },
  { titulo: "Área (m²)", tipo: "numero", valor: (l) => l.m2 },
  { titulo: "Valor (R$)", tipo: "dinheiro", valor: (l) => l.valorCentavos },
  { titulo: "Preço por m² (R$)", tipo: "dinheiro", valor: (l) => l.precoPorM2Centavos },
];

/** Produtos e preços em CSV, com o MESMO período e a MESMA visão da tela (`visao=mix|preco`; preço aceita `por=tipologia|linha|acabamento`). */
export async function GET(requisicao: NextRequest) {
  const usuario = await sessaoParaApi();
  if (!usuario) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  const hoje = dataLocalDoInstante(new Date());
  const parametros = requisicao.nextUrl.searchParams;
  const { periodo } = lerPeriodo(Object.fromEntries(parametros), hoje);
  const opcoes = { podeVerInterno: false } as const;
  const auditar = (entidadeId: string, linhas: number) => registrarAuditoria(prisma, { usuario, entidade: "Relatorio", entidadeId, acao: "EXPORTAR", depois: { linhas, periodo } });

  if (parametros.get("visao") === "preco") {
    const bruto = parametros.get("por");
    const por: DimensaoDePreco = bruto === "linha" || bruto === "acabamento" ? bruto : "tipologia";
    const r = await precoMedioPorM2(periodo, por);
    await auditar("produtos-preco", r.linhas.length);
    return respostaDeCsv(csvDoRelatorio(COLUNAS_PRECO(ROTULO_DA_DIMENSAO[por]), r.linhas, opcoes), `preco-por-m2-por-${por}.csv`);
  }
  const mix = await mixPorTipologia(periodo);
  const linhas: LinhaDoMixCsv[] = [...mix.linhas];
  if (mix.outrosCentavos !== 0) linhas.push({ nome: "Outros e ajustes", itens: null, m2: null, valorCentavos: mix.outrosCentavos });
  await auditar("produtos-mix", linhas.length);
  return respostaDeCsv(csvDoRelatorio(COLUNAS_MIX, linhas, opcoes), "mix-por-tipologia.csv");
}
