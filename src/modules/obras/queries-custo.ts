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

// ---------------------------------------------------------------------------------------------------------
// Leitura em LOTE: cada origem de custo é lida com UMA consulta para todas as obras (`projetoId IN (...)`), em vez de
// uma rodada de consultas por obra. A montagem do custo (`montarCustoDaObra`) é a mesma para uma obra ou para cem.
// ---------------------------------------------------------------------------------------------------------

const buscar = {
  projetos: (ids: string[]) => prisma.projeto.findMany({ where: { id: { in: ids }, deletadoEm: null }, select: { id: true, valorFechadoCentavos: true } }),
  propostas: (ids: string[]) =>
    prisma.proposta.findMany({
      where: { projetoId: { in: ids }, status: "APROVADA", deletadoEm: null },
      orderBy: [{ aceitaEm: "asc" }, { id: "asc" }],
      select: { id: true, projetoId: true, numero: true, revisao: true, snapshot: true, opcaoAprovadaId: true, valorAprovadoCentavos: true },
    }),
  opcoes: (ids: string[]) => prisma.opcaoProposta.findMany({ where: { id: { in: ids } }, select: { id: true, custoMaterialInformadoCentavos: true } }),
  itens: (propostaIds: string[], opcaoIds: string[]) =>
    prisma.itemProposta.findMany({
      where: { propostaId: { in: propostaIds }, opcaoId: { in: opcaoIds }, deletadoEm: null },
      select: { propostaId: true, opcaoId: true, custoMaterialInformadoCentavos: true, custoEstimadoCentavos: true },
    }),
  recebimentos: (ids: string[]) =>
    prisma.itemRecebimento.findMany({
      where: { deletadoEm: null, recebimento: { deletadoEm: null }, itemCompra: { compra: { projetoId: { in: ids }, destino: "OBRA", deletadoEm: null, status: { not: "CANCELADO" } } } },
      orderBy: [{ recebimento: { data: "asc" } }, { id: "asc" }],
      select: { id: true, valorCentavos: true, recebimento: { select: { data: true } }, itemCompra: { select: { descricao: true, produto: { select: { descricao: true } }, compra: { select: { id: true, numero: true, projetoId: true } } } } },
    }),
  movimentos: (ids: string[]) =>
    prisma.movimentoEstoque.findMany({
      where: { projetoId: { in: ids }, deletadoEm: null, tipo: { notIn: ["INVENTARIO_INICIAL", "ENTRADA_COMPRA"] } },
      orderBy: [{ data: "asc" }, { criadoEm: "asc" }],
      select: { id: true, projetoId: true, tipo: true, data: true, quantidade: true, custoUnitarioCentavos: true, estornoDeId: true, produto: { select: { id: true, descricao: true, unidade: true } } },
    }),
  retalhos: (ids: string[]) =>
    prisma.retalho.findMany({ where: { consumidoProjetoId: { in: ids }, deletadoEm: null }, select: { id: true, consumidoProjetoId: true, comprimentoMm: true, produto: { select: { id: true, descricao: true } }, origemProjeto: { select: { codigo: true } } } }),
  contas: (ids: string[]) =>
    prisma.contaPagar.findMany({ where: { projetoId: { in: ids }, compraId: null, deletadoEm: null, status: { not: "CANCELADA" } }, orderBy: [{ vencimento: "asc" }, { id: "asc" }], select: { id: true, projetoId: true, descricao: true, valorCentavos: true, vencimento: true } }),
  avulsos: (ids: string[]) =>
    prisma.lancamento.findMany({
      where: { projetoId: { in: ids }, tipo: "SAIDA", contaPagarId: null, contaReceberId: null, transferenciaId: null, estornadoEm: null, deletadoEm: null },
      orderBy: [{ data: "asc" }, { id: "asc" }],
      select: { id: true, projetoId: true, descricao: true, valorCentavos: true, data: true },
    }),
  contasDeCompras: (ids: string[]) =>
    prisma.contaPagar.groupBy({ by: ["projetoId"], where: { projetoId: { in: ids }, compraId: { not: null }, deletadoEm: null, status: { not: "CANCELADA" } }, _sum: { valorCentavos: true }, _count: { _all: true } }),
};

type Linha<K extends keyof typeof buscar> = Awaited<ReturnType<(typeof buscar)[K]>>[number];

/** Tudo o que foi lido de UMA obra (já separado por obra), pronto para `montarCustoDaObra`. */
type DadosDaObra = {
  valorFechadoCentavos: number | null | undefined;
  propostas: Linha<"propostas">[];
  opcoes: Map<string, number | null>;
  itens: Map<string, Linha<"itens">[]>;
  recebimentos: Linha<"recebimentos">[];
  movimentos: Linha<"movimentos">[];
  retalhos: Linha<"retalhos">[];
  contas: Linha<"contas">[];
  avulsos: Linha<"avulsos">[];
  contasDeCompras: { quantidade: number; valorCentavos: number };
};

function agrupar<T>(linhas: readonly T[], chave: (l: T) => string | null): Map<string, T[]> {
  const mapa = new Map<string, T[]>();
  for (const l of linhas) {
    const k = chave(l);
    if (k === null) continue;
    const lista = mapa.get(k);
    if (lista) lista.push(l);
    else mapa.set(k, [l]);
  }
  return mapa;
}

async function lerDadosEmLote(ids: string[]): Promise<{ porObra: Map<string, DadosDaObra>; custoPorM2: number | null }> {
  const [projetos, propostas, config] = await Promise.all([
    buscar.projetos(ids),
    buscar.propostas(ids),
    prisma.configuracaoEmpresa.findUnique({ where: { id: "singleton" }, select: { custoMaoDeObraPorM2Centavos: true } }),
  ]);
  const opcaoIds = [...new Set(propostas.map((p) => p.opcaoAprovadaId).filter((i): i is string => !!i))];
  const propostaIds = propostas.filter((p) => p.opcaoAprovadaId).map((p) => p.id);

  const [opcoes, itens, recebimentos, movimentos, retalhos, contas, avulsos, contasDeCompras] = await Promise.all([
    opcaoIds.length ? buscar.opcoes(opcaoIds) : Promise.resolve([]),
    opcaoIds.length ? buscar.itens(propostaIds, opcaoIds) : Promise.resolve([]),
    buscar.recebimentos(ids),
    buscar.movimentos(ids),
    buscar.retalhos(ids),
    buscar.contas(ids),
    buscar.avulsos(ids),
    buscar.contasDeCompras(ids),
  ]);

  const projetoPorId = new Map(projetos.map((p) => [p.id, p]));
  const opcaoPorId = new Map(opcoes.map((o) => [o.id, o.custoMaterialInformadoCentavos]));
  const itensPorPar = agrupar(itens, (i) => `${i.propostaId}|${i.opcaoId}`);
  const propostasPorObra = agrupar(propostas, (p) => p.projetoId);
  const recebimentosPorObra = agrupar(recebimentos, (r) => r.itemCompra.compra.projetoId);
  const movimentosPorObra = agrupar(movimentos, (m) => m.projetoId);
  const retalhosPorObra = agrupar(retalhos, (r) => r.consumidoProjetoId);
  const contasPorObra = agrupar(contas, (c) => c.projetoId);
  const avulsosPorObra = agrupar(avulsos, (l) => l.projetoId);
  const comprasPorObra = new Map(contasDeCompras.map((g) => [g.projetoId, { quantidade: g._count._all, valorCentavos: g._sum.valorCentavos ?? 0 }]));

  const porObra = new Map<string, DadosDaObra>();
  for (const id of ids) {
    const propostasDaObra = propostasPorObra.get(id) ?? [];
    // Só as peças desta obra: os itens da opção aprovada de cada proposta.
    const itensDaObra = new Map<string, Linha<"itens">[]>();
    for (const p of propostasDaObra) if (p.opcaoAprovadaId) itensDaObra.set(`${p.id}|${p.opcaoAprovadaId}`, itensPorPar.get(`${p.id}|${p.opcaoAprovadaId}`) ?? []);
    porObra.set(id, {
      valorFechadoCentavos: projetoPorId.get(id)?.valorFechadoCentavos,
      propostas: propostasDaObra,
      opcoes: opcaoPorId,
      itens: itensDaObra,
      recebimentos: recebimentosPorObra.get(id) ?? [],
      movimentos: movimentosPorObra.get(id) ?? [],
      retalhos: retalhosPorObra.get(id) ?? [],
      contas: contasPorObra.get(id) ?? [],
      avulsos: avulsosPorObra.get(id) ?? [],
      contasDeCompras: comprasPorObra.get(id) ?? { quantidade: 0, valorCentavos: 0 },
    });
  }
  return { porObra, custoPorM2: config?.custoMaoDeObraPorM2Centavos ?? null };
}

function montarCustoDaObra(d: DadosDaObra, custoPorM2Centavos: number | null): CustoDaObra {
  // Acréscimo de nota e área da opção aprovada (do conteúdo congelado: o que o cliente aprovou).
  let acrescimoNota = 0;
  let areaM2 = 0;
  let temArea = false;
  const estimativas: (number | null)[] = [];
  for (const p of d.propostas) {
    const snap = p.snapshot as unknown as ConteudoProposta | null;
    const opcao = snap?.opcoes.find((o) => o.id === p.opcaoAprovadaId);
    if (opcao) {
      acrescimoNota += opcao.totais.acrescimoNotaCentavos;
      areaM2 += opcao.totais.areaM2;
      temArea = true;
    }
    if (p.opcaoAprovadaId) {
      const itens = d.itens.get(`${p.id}|${p.opcaoAprovadaId}`) ?? [];
      estimativas.push(custoEstimadoDeMaterialDaOpcao(d.opcoes.get(p.opcaoAprovadaId) ?? null, itens.map((i) => ({ custoInformadoCentavos: i.custoMaterialInformadoCentavos, custoCalculadoCentavos: i.custoEstimadoCentavos }))).custoCentavos);
    }
  }
  const estimadoCentavos = estimativas.length > 0 && estimativas.every((e) => e !== null) ? estimativas.reduce<number>((s, e) => s + (e ?? 0), 0) : null;

  const links = new Map<string, string>();
  const entrada: EntradaDoCustoDaObra = {
    receitaFechadaCentavos: d.propostas.length > 0 ? (d.valorFechadoCentavos ?? d.propostas.reduce((s, p) => s + (p.valorAprovadoCentavos ?? 0), 0)) : null,
    acrescimoNotaCentavos: acrescimoNota,
    comprasDaObra: d.recebimentos.map((r) => {
      const id = `rec-${r.id}`;
      links.set(id, `/compras/${r.itemCompra.compra.id}`);
      return { id, descricao: r.itemCompra.produto?.descricao ?? r.itemCompra.descricao ?? "Item", origem: `Compra ${numeroDaCompra(r.itemCompra.compra.numero)} recebida em ${formatarDataCalendario(comoTexto(r.recebimento.data))}`, valorCentavos: r.valorCentavos };
    }),
    movimentosDeEstoque: d.movimentos.map((m) => {
      const id = `mov-${m.id}`;
      links.set(id, `/produtos/${m.produto.id}?aba=estoque`);
      const rotulo = m.estornoDeId ? "Estorno" : ROTULO_TIPO_DE_MOVIMENTO[m.tipo as TipoDeMovimento];
      const q = milesimos(m.quantidade);
      return { id, produto: m.produto.descricao, origem: `${rotulo} de ${formatarQuantidade(Math.abs(q))} ${m.produto.unidade.toLowerCase()} em ${formatarDataCalendario(comoTexto(m.data))}${m.custoUnitarioCentavos === null ? " (produto sem custo)" : ""}`, quantidadeMilesimos: q, custoUnitarioCentavos: m.custoUnitarioCentavos };
    }),
    retalhosUsados: d.retalhos.map((r) => {
      const id = `ret-${r.id}`;
      links.set(id, "/estoque/retalhos?status=CONSUMIDO");
      return { id, descricao: `Retalho de ${r.comprimentoMm.toLocaleString("pt-BR")} mm de ${r.produto.descricao}`, origem: r.origemProjeto ? `Retalho da obra ${r.origemProjeto.codigo}` : "Retalho do estoque" };
    }),
    outrasDespesas: [
      ...d.contas.map((c) => {
        const id = `cp-${c.id}`;
        links.set(id, `/financeiro/pagar/${c.id}`);
        return { id, descricao: c.descricao, origem: `Conta a pagar (vence em ${formatarDataCalendario(comoTexto(c.vencimento))}), sem compra`, valorCentavos: c.valorCentavos };
      }),
      ...d.avulsos.map((l) => {
        const id = `lc-${l.id}`;
        links.set(id, `/financeiro/lancamentos/${l.id}`);
        return { id, descricao: l.descricao, origem: `Lançamento avulso em ${formatarDataCalendario(comoTexto(l.data))}`, valorCentavos: l.valorCentavos };
      }),
    ],
    maoDeObra: { areaM2: temArea ? areaM2 : null, custoPorM2Centavos },
    estimadoCentavos,
  };

  const resultado = calcularCustoDaObra(entrada);
  return {
    resultado,
    linhas: resultado.linhas.map((l) => ({ grupo: l.grupo, descricao: l.descricao, valorCentavos: l.valorCentavos, origem: l.origem, href: l.id ? (links.get(l.id) ?? null) : l.grupo === "MAO_DE_OBRA" ? "/configuracoes/empresa" : null, informativo: l.informativo === true })),
    receitaFechadaCentavos: entrada.receitaFechadaCentavos,
    propostas: d.propostas.map((p) => `${p.numero}${p.revisao > 0 ? ` Rev. ${p.revisao}` : ""}`),
    contasDeComprasIgnoradas: d.contasDeCompras,
    areaM2: temArea ? areaM2 : null,
    custoMaoDeObraPorM2Centavos: custoPorM2Centavos,
  };
}

/**
 * Custo real e margem de UMA obra (R15). Cada custo vem de UMA origem só:
 *  - compras com destino OBRA → o RECEBIMENTO (valor congelado), nunca a conta a pagar nascida da compra;
 *  - material do estoque → as movimentações da obra (saída − devolução − estorno), ao custo da época;
 *  - outras despesas → contas a pagar da obra SEM compra + lançamentos avulsos de saída (sem conta a pagar e sem estorno);
 *  - mão de obra → m² da opção aprovada × custo por m² de Configurações.
 * Receita da margem = valor fechado − acréscimo de nota (repasse de imposto). Custo desconhecido deixa a margem incompleta.
 */
export async function carregarCustoDaObra(projetoId: string): Promise<CustoDaObra> {
  const mapa = await carregarCustosDasObras([projetoId]);
  return mapa.get(projetoId)!;
}

/**
 * O custo de VÁRIAS obras de uma vez: o número de consultas ao banco é o mesmo para 1 ou para 150 obras (cada origem de
 * custo é lida com `projetoId IN (...)`). O resultado de cada obra é idêntico ao de `carregarCustoDaObra` (mesma montagem).
 */
export async function carregarCustosDasObras(projetoIds: readonly string[]): Promise<Map<string, CustoDaObra>> {
  const ids = [...new Set(projetoIds)];
  const resultado = new Map<string, CustoDaObra>();
  if (ids.length === 0) return resultado;
  const { porObra, custoPorM2 } = await lerDadosEmLote(ids);
  for (const id of ids) resultado.set(id, montarCustoDaObra(porObra.get(id)!, custoPorM2));
  return resultado;
}
