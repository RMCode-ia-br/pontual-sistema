import "server-only";

import { prisma } from "@/lib/db";
import { numeroDaCompra } from "@/lib/dominio/compras";
import { calcularCustoDaObra, custoEstimadoDeMaterialDaOpcao, type EntradaDoCustoDaObra, type ResultadoDoCustoDaObra } from "@/lib/dominio/custo-obra";
import { ROTULO_TIPO_DE_MOVIMENTO, formatarQuantidade, type TipoDeMovimento } from "@/lib/dominio/estoque";
import { formatarDataCalendario } from "@/lib/formatadores";
import type { ConteudoProposta } from "@/modules/propostas/conteudo";

const comoTexto = (d: Date): string => d.toISOString().slice(0, 10);
const milesimos = (d: { toString(): string }): number => Math.round(Number(d.toString()) * 1000);

export type LinhaComLink = { grupo: string; descricao: string; valorCentavos: number | null; origem: string; href: string | null; informativo: boolean };

export type CustoDaObra = {
  resultado: ResultadoDoCustoDaObra;
  /** Linhas com o link para o registro de origem. */
  linhas: LinhaComLink[];
  receitaFechadaCentavos: number | null;
  propostas: string[];
  /** Contas a pagar nascidas de compras DESTA obra: ficam fora do custo (a compra já conta), mostradas para a pessoa conferir. */
  contasDeComprasIgnoradas: { quantidade: number; valorCentavos: number };
  areaM2: number | null;
  custoMaoDeObraPorM2Centavos: number | null;
};

/**
 * Custo real e margem de UMA obra (R15). Cada custo vem de UMA origem só:
 *  - compras com destino OBRA → o RECEBIMENTO (valor congelado), nunca a conta a pagar nascida da compra;
 *  - material do estoque → as movimentações da obra (saída − devolução − estorno), ao custo da época;
 *  - outras despesas → contas a pagar da obra SEM compra + lançamentos avulsos de saída (sem conta a pagar e sem estorno);
 *  - mão de obra → m² da opção aprovada × custo por m² de Configurações.
 * Receita da margem = valor fechado − acréscimo de nota (repasse de imposto). Custo desconhecido deixa a margem incompleta.
 */
export async function carregarCustoDaObra(projetoId: string): Promise<CustoDaObra> {
  const [projeto, propostas, config] = await Promise.all([
    prisma.projeto.findFirst({ where: { id: projetoId, deletadoEm: null }, select: { valorFechadoCentavos: true } }),
    prisma.proposta.findMany({ where: { projetoId, status: "APROVADA", deletadoEm: null }, orderBy: { aceitaEm: "asc" }, select: { id: true, numero: true, revisao: true, snapshot: true, opcaoAprovadaId: true, valorAprovadoCentavos: true } }),
    prisma.configuracaoEmpresa.findUnique({ where: { id: "singleton" }, select: { custoMaoDeObraPorM2Centavos: true } }),
  ]);

  // Acréscimo de nota e área da opção aprovada (do conteúdo congelado: o que o cliente aprovou).
  let acrescimoNota = 0;
  let areaM2 = 0;
  let temArea = false;
  const estimativas: (number | null)[] = [];
  for (const p of propostas) {
    const snap = p.snapshot as unknown as ConteudoProposta | null;
    const opcao = snap?.opcoes.find((o) => o.id === p.opcaoAprovadaId);
    if (opcao) {
      acrescimoNota += opcao.totais.acrescimoNotaCentavos;
      areaM2 += opcao.totais.areaM2;
      temArea = true;
    }
    if (p.opcaoAprovadaId) {
      const [op, itens] = await Promise.all([
        prisma.opcaoProposta.findUnique({ where: { id: p.opcaoAprovadaId }, select: { custoMaterialInformadoCentavos: true } }),
        prisma.itemProposta.findMany({ where: { propostaId: p.id, opcaoId: p.opcaoAprovadaId, deletadoEm: null }, select: { custoMaterialInformadoCentavos: true, custoEstimadoCentavos: true } }),
      ]);
      estimativas.push(custoEstimadoDeMaterialDaOpcao(op?.custoMaterialInformadoCentavos ?? null, itens.map((i) => ({ custoInformadoCentavos: i.custoMaterialInformadoCentavos, custoCalculadoCentavos: i.custoEstimadoCentavos }))).custoCentavos);
    }
  }
  const estimadoCentavos = estimativas.length > 0 && estimativas.every((e) => e !== null) ? estimativas.reduce<number>((s, e) => s + (e ?? 0), 0) : null;

  const [recebimentos, movimentos, retalhos, contas, avulsos, contasDeCompras] = await Promise.all([
    prisma.itemRecebimento.findMany({
      where: { deletadoEm: null, recebimento: { deletadoEm: null }, itemCompra: { compra: { projetoId, destino: "OBRA", deletadoEm: null, status: { not: "CANCELADO" } } } },
      orderBy: [{ recebimento: { data: "asc" } }, { id: "asc" }],
      select: { id: true, valorCentavos: true, recebimento: { select: { data: true } }, itemCompra: { select: { descricao: true, produto: { select: { descricao: true } }, compra: { select: { id: true, numero: true } } } } },
    }),
    prisma.movimentoEstoque.findMany({
      where: { projetoId, deletadoEm: null, tipo: { notIn: ["INVENTARIO_INICIAL", "ENTRADA_COMPRA"] } },
      orderBy: [{ data: "asc" }, { criadoEm: "asc" }],
      select: { id: true, tipo: true, data: true, quantidade: true, custoUnitarioCentavos: true, estornoDeId: true, produto: { select: { id: true, descricao: true, unidade: true } } },
    }),
    prisma.retalho.findMany({ where: { consumidoProjetoId: projetoId, deletadoEm: null }, select: { id: true, comprimentoMm: true, produto: { select: { id: true, descricao: true } }, origemProjeto: { select: { codigo: true } } } }),
    prisma.contaPagar.findMany({ where: { projetoId, compraId: null, deletadoEm: null, status: { not: "CANCELADA" } }, orderBy: { vencimento: "asc" }, select: { id: true, descricao: true, valorCentavos: true, vencimento: true } }),
    prisma.lancamento.findMany({ where: { projetoId, tipo: "SAIDA", contaPagarId: null, contaReceberId: null, transferenciaId: null, estornadoEm: null, deletadoEm: null }, orderBy: { data: "asc" }, select: { id: true, descricao: true, valorCentavos: true, data: true } }),
    prisma.contaPagar.aggregate({ where: { projetoId, compraId: { not: null }, deletadoEm: null, status: { not: "CANCELADA" } }, _sum: { valorCentavos: true }, _count: { _all: true } }),
  ]);

  const links = new Map<string, string>();
  const entrada: EntradaDoCustoDaObra = {
    receitaFechadaCentavos: propostas.length > 0 ? (projeto?.valorFechadoCentavos ?? propostas.reduce((s, p) => s + (p.valorAprovadoCentavos ?? 0), 0)) : null,
    acrescimoNotaCentavos: acrescimoNota,
    comprasDaObra: recebimentos.map((r) => {
      const id = `rec-${r.id}`;
      links.set(id, `/compras/${r.itemCompra.compra.id}`);
      return { id, descricao: r.itemCompra.produto?.descricao ?? r.itemCompra.descricao ?? "Item", origem: `Compra ${numeroDaCompra(r.itemCompra.compra.numero)} recebida em ${formatarDataCalendario(comoTexto(r.recebimento.data))}`, valorCentavos: r.valorCentavos };
    }),
    movimentosDeEstoque: movimentos.map((m) => {
      const id = `mov-${m.id}`;
      links.set(id, `/produtos/${m.produto.id}?aba=estoque`);
      const rotulo = m.estornoDeId ? "Estorno" : ROTULO_TIPO_DE_MOVIMENTO[m.tipo as TipoDeMovimento];
      const q = milesimos(m.quantidade);
      return { id, produto: m.produto.descricao, origem: `${rotulo} de ${formatarQuantidade(Math.abs(q))} ${m.produto.unidade.toLowerCase()} em ${formatarDataCalendario(comoTexto(m.data))}${m.custoUnitarioCentavos === null ? " (produto sem custo)" : ""}`, quantidadeMilesimos: q, custoUnitarioCentavos: m.custoUnitarioCentavos };
    }),
    retalhosUsados: retalhos.map((r) => {
      const id = `ret-${r.id}`;
      links.set(id, "/estoque/retalhos?status=CONSUMIDO");
      return { id, descricao: `Retalho de ${r.comprimentoMm.toLocaleString("pt-BR")} mm de ${r.produto.descricao}`, origem: r.origemProjeto ? `Retalho da obra ${r.origemProjeto.codigo}` : "Retalho do estoque" };
    }),
    outrasDespesas: [
      ...contas.map((c) => {
        const id = `cp-${c.id}`;
        links.set(id, `/financeiro/pagar/${c.id}`);
        return { id, descricao: c.descricao, origem: `Conta a pagar (vence em ${formatarDataCalendario(comoTexto(c.vencimento))}), sem compra`, valorCentavos: c.valorCentavos };
      }),
      ...avulsos.map((l) => {
        const id = `lc-${l.id}`;
        links.set(id, `/financeiro/lancamentos/${l.id}`);
        return { id, descricao: l.descricao, origem: `Lançamento avulso em ${formatarDataCalendario(comoTexto(l.data))}`, valorCentavos: l.valorCentavos };
      }),
    ],
    maoDeObra: { areaM2: temArea ? areaM2 : null, custoPorM2Centavos: config?.custoMaoDeObraPorM2Centavos ?? null },
    estimadoCentavos,
  };

  const resultado = calcularCustoDaObra(entrada);
  return {
    resultado,
    linhas: resultado.linhas.map((l) => ({ grupo: l.grupo, descricao: l.descricao, valorCentavos: l.valorCentavos, origem: l.origem, href: l.id ? (links.get(l.id) ?? null) : l.grupo === "MAO_DE_OBRA" ? "/configuracoes/empresa" : null, informativo: l.informativo === true })),
    receitaFechadaCentavos: entrada.receitaFechadaCentavos,
    propostas: propostas.map((p) => `${p.numero}${p.revisao > 0 ? ` Rev. ${p.revisao}` : ""}`),
    contasDeComprasIgnoradas: { quantidade: contasDeCompras._count._all, valorCentavos: contasDeCompras._sum.valorCentavos ?? 0 },
    areaM2: temArea ? areaM2 : null,
    custoMaoDeObraPorM2Centavos: config?.custoMaoDeObraPorM2Centavos ?? null,
  };
}
