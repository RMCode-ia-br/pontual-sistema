import { NextResponse, type NextRequest } from "next/server";

import { registrarAuditoria } from "@/lib/auditoria";
import { sessaoParaApi } from "@/lib/auth/sessao";
import { acessoDoCsv, saidaNegada } from "@/lib/csv/acesso";
import { csvDoRelatorio, type ColunaDeCsv } from "@/lib/csv/colunas";
import { respostaDeCsv } from "@/lib/csv/resposta";
import { prisma } from "@/lib/db";
import { lerCortesAbc } from "@/lib/dominio/relatorio-estoque";
import { carregarRelatorioDeEstoque, LIMITE_DE_FORNECEDORES, lerPeriodoDoRelatorioDeEstoque, type LinhaDoEstoque } from "@/modules/relatorios/estoque";
import { curvaAbcDeSaidas, LIMITE_DE_LINHAS_DE_ESTOQUE, variacaoDeCustoDosInsumos, type ProdutoDaCurva, type VariacaoDeCusto } from "@/modules/relatorios/estoque-analises";
import type { LinhaDaCurva, TotalDoFornecedor } from "@/lib/dominio/relatorio-estoque";

export const dynamic = "force-dynamic";

const milesimos = (m: number | null) => (m === null ? null : m / 1000);

const COLUNAS_POSICAO: ColunaDeCsv<LinhaDoEstoque>[] = [
  { titulo: "Código", tipo: "texto", valor: (l) => l.codigo },
  { titulo: "Produto", tipo: "texto", valor: (l) => l.descricao },
  { titulo: "Unidade", tipo: "texto", valor: (l) => l.unidade },
  { titulo: "Saldo", tipo: "numero", valor: (l) => milesimos(l.saldoMilesimos) },
  { titulo: "Estoque mínimo", tipo: "numero", valor: (l) => milesimos(l.estoqueMinimoMilesimos) },
  { titulo: "Custo unitário (R$)", tipo: "dinheiro", valor: (l) => l.custoUnitarioCentavos, interna: true },
  // Produto com saldo e sem custo sai com a célula vazia na coluna de valor e "Sem custo" na coluna de situação: nunca zero.
  { titulo: "Valor em estoque (R$)", tipo: "dinheiro", valor: (l) => l.valorCentavos, interna: true },
  { titulo: "Situação", tipo: "texto", valor: (l) => [!l.ativo ? "Inativo" : "", l.saldoMilesimos < 0 ? "Saldo negativo" : "", l.abaixoDoMinimo ? "Abaixo do mínimo" : "", l.valorCentavos === null && l.saldoMilesimos > 0 ? "Sem custo" : ""].filter(Boolean).join("; ") || null },
];

const COLUNAS_FORNECEDORES: ColunaDeCsv<TotalDoFornecedor & { nome: string }>[] = [
  { titulo: "Fornecedor", tipo: "texto", valor: (l) => l.nome },
  { titulo: "Itens recebidos", tipo: "inteiro", valor: (l) => l.itens },
  { titulo: "Itens sem preço", tipo: "inteiro", valor: (l) => l.semValor },
  { titulo: "Valor recebido (R$)", tipo: "dinheiro", valor: (l) => l.valorCentavos },
];

const COLUNAS_ABC: ColunaDeCsv<LinhaDaCurva<ProdutoDaCurva>>[] = [
  { titulo: "Classe", tipo: "texto", valor: (l) => l.classe },
  { titulo: "Código", tipo: "texto", valor: (l) => l.codigo },
  { titulo: "Produto", tipo: "texto", valor: (l) => l.descricao },
  { titulo: "Quantidade", tipo: "numero", valor: (l) => milesimos(l.quantidadeMilesimos) },
  { titulo: "Valor das saídas (R$)", tipo: "dinheiro", valor: (l) => l.valorCentavos },
  { titulo: "% do total", tipo: "numero", valor: (l) => l.percentual },
  { titulo: "Acumulado (%)", tipo: "numero", valor: (l) => l.acumulado },
];

const COLUNAS_CUSTOS: ColunaDeCsv<VariacaoDeCusto>[] = [
  { titulo: "Código", tipo: "texto", valor: (l) => l.codigo },
  { titulo: "Produto", tipo: "texto", valor: (l) => l.descricao },
  { titulo: "Custo no começo (R$)", tipo: "dinheiro", valor: (l) => l.custoInicialCentavos },
  { titulo: "Custo no fim (R$)", tipo: "dinheiro", valor: (l) => l.custoFinalCentavos },
  { titulo: "Variação (%)", tipo: "numero", valor: (l) => l.variacaoPercentual },
  { titulo: "Mudanças", tipo: "inteiro", valor: (l) => l.mudancas },
];

/** Estoque e compras em CSV, com o MESMO período e a MESMA visão da tela (`visao=posicao|fornecedores|abc|custos`; abc aceita `a` e `b`). */
export async function GET(requisicao: NextRequest) {
  const usuario = await sessaoParaApi();
  if (!usuario) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  const negado = saidaNegada(usuario, { recursos: ["relatorio", "movimentoEstoque"] });
  if (negado) return negado;
  const acesso = acessoDoCsv(usuario);

  const parametros = requisicao.nextUrl.searchParams;
  const periodo = lerPeriodoDoRelatorioDeEstoque(Object.fromEntries(parametros));
  const visao = parametros.get("visao") ?? "posicao";
  const opcoes = acesso;
  const auditar = (id: string, linhas: number) => registrarAuditoria(prisma, { usuario, entidade: "Relatorio", entidadeId: id, acao: "EXPORTAR", depois: { linhas, periodo, visao } });

  if (visao === "fornecedores") {
    const semCusto = saidaNegada(usuario, { recursos: ["relatorio", "movimentoEstoque"], custo: true });
    if (semCusto) return semCusto;
    const r = await carregarRelatorioDeEstoque(periodo);
    await auditar("estoque-fornecedores", r.fornecedores.length);
    const aviso = r.fornecedoresTruncado ? `exportação limitada aos ${LIMITE_DE_FORNECEDORES} fornecedores com mais valor. Escolha um período menor.` : null;
    return respostaDeCsv(csvDoRelatorio(COLUNAS_FORNECEDORES, r.fornecedores, { ...opcoes, aviso }), "compras-por-fornecedor.csv");
  }
  if (visao === "abc") {
    const semCusto = saidaNegada(usuario, { recursos: ["relatorio", "movimentoEstoque"], custo: true });
    if (semCusto) return semCusto;
    const cortes = lerCortesAbc(parametros.get("a") ?? undefined, parametros.get("b") ?? undefined);
    const c = await curvaAbcDeSaidas(periodo, cortes);
    await auditar("estoque-abc", c.linhas.length);
    const aviso = c.semCusto > 0 ? `${c.semCusto} saída(s) sem custo ficaram fora do valor.` : null;
    return respostaDeCsv(csvDoRelatorio(COLUNAS_ABC, c.linhas, { ...opcoes, aviso }), "curva-abc-das-saidas.csv");
  }
  if (visao === "custos") {
    const semCusto = saidaNegada(usuario, { recursos: ["relatorio", "movimentoEstoque"], custo: true });
    if (semCusto) return semCusto;
    const v = await variacaoDeCustoDosInsumos(periodo);
    await auditar("estoque-custos", v.linhas.length);
    const aviso = v.truncado ? `exportação limitada aos ${LIMITE_DE_LINHAS_DE_ESTOQUE} primeiros produtos. Escolha um período menor.` : null;
    return respostaDeCsv(csvDoRelatorio(COLUNAS_CUSTOS, v.linhas, { ...opcoes, aviso }), "variacao-de-custo.csv");
  }
  const r = await carregarRelatorioDeEstoque(periodo);
  const linhas = r.linhas.filter((l) => l.saldoMilesimos !== 0 || l.abaixoDoMinimo);
  await auditar("estoque", linhas.length);
  return respostaDeCsv(csvDoRelatorio(COLUNAS_POSICAO, linhas, { ...opcoes, aviso: r.truncado ? "exportação limitada aos primeiros produtos." : null }), "posicao-de-estoque.csv");
}
