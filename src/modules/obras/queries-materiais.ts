import "server-only";

import { prisma } from "@/lib/db";
import { numeroDaCompra, type StatusDaCompra } from "@/lib/dominio/compras";
import { agruparMateriais, equivalenciasDoPerfil, faltaNoEstoque, quantidadesDaComposicao, type EquivalenciasDoPerfil, type LinhaDeMaterial } from "@/lib/dominio/lista-materiais";

const num = (d: { toString(): string }): number => Number(d.toString());

export type LinhaDeMaterialDaObra = {
  chave: string;
  produtoId: string | null;
  produto: string;
  codigo: string | null;
  /** Unidade em que a composição calcula a quantidade (M, UN, ...). */
  unidadeFormula: string;
  /** Unidade do produto (estoque); null quando o insumo é só texto. */
  unidadeProduto: string | null;
  necessario: number;
  equivalencias: EquivalenciasDoPerfil | null;
  /** Saldo em estoque, na unidade do produto. */
  saldo: number | null;
  /** O que falta, na unidade do produto; null quando não dá para comparar (insumo só texto ou unidades sem conversão). */
  falta: number | null;
  semCusto: boolean;
};

export type VidroDaObra = {
  proposta: string;
  medidaId: string;
  itemId: string;
  itemNumero: number;
  descricao: string;
  local: string | null;
  tipoVidro: string;
  espessuraMm: number | null;
  vaoLarguraMm: number;
  vaoAlturaMm: number;
  quantidade: number;
  compra: { id: string; numero: string; status: StatusDaCompra } | null;
};

export type MateriaisDaObra = {
  propostas: { numero: string; revisao: number }[];
  linhas: LinhaDeMaterialDaObra[];
  semComposicao: { proposta: string; itemNumero: number; descricao: string; motivo: string }[];
  vidros: VidroDaObra[];
  compras: { id: string; numero: string; fornecedor: string; tipo: "MATERIAL" | "VIDRO"; status: StatusDaCompra; itens: number; recebidoCentavos: number | null }[];
  retalhosGerados: { id: string; produto: string; comprimentoMm: number; status: string }[];
  retalhosUsados: { id: string; produto: string; comprimentoMm: number }[];
};

/** Falta em estoque na UNIDADE DO PRODUTO, convertendo metros/kg em barras quando preciso (sem inventar: sem dado, null). */
function faltaDoProduto(necessario: number, unidadeFormula: string, unidadeProduto: string, saldo: number, equiv: EquivalenciasDoPerfil): number | null {
  if (unidadeFormula === unidadeProduto) return faltaNoEstoque(necessario, saldo);
  if (unidadeProduto === "BARRA" && equiv.barras !== null) return faltaNoEstoque(equiv.barras, saldo);
  if (unidadeProduto === "KG" && equiv.kg !== null) return faltaNoEstoque(equiv.kg, saldo);
  if (unidadeProduto === "M" && equiv.metros !== null) return faltaNoEstoque(equiv.metros, saldo);
  return null;
}

/**
 * Tudo da aba "Materiais e compras" da obra: lista de materiais pela composição das propostas aprovadas (opção aprovada),
 * pedido de vidro, compras e baixas da obra. Tipologia sem composição não gera quantidade (aviso): nada é inventado.
 */
export async function carregarMateriaisDaObra(projetoId: string): Promise<MateriaisDaObra> {
  const propostas = await prisma.proposta.findMany({ where: { projetoId, status: "APROVADA", deletadoEm: null }, orderBy: { aceitaEm: "asc" }, select: { id: true, numero: true, revisao: true, opcaoAprovadaId: true } });

  const semComposicao: MateriaisDaObra["semComposicao"] = [];
  const brutas: LinhaDeMaterial[] = [];
  const vidros: VidroDaObra[] = [];
  for (const p of propostas) {
    if (!p.opcaoAprovadaId) continue;
    const itens = await prisma.itemProposta.findMany({
      where: { propostaId: p.id, opcaoId: p.opcaoAprovadaId, deletadoEm: null },
      orderBy: [{ ordem: "asc" }, { id: "asc" }],
      include: {
        medidas: { where: { deletadoEm: null }, orderBy: { ordem: "asc" } },
        tipoVidro: { select: { nome: true } },
        tipologia: {
          select: {
            nome: true,
            insumos: { where: { deletadoEm: null }, orderBy: { ordem: "asc" }, select: { produtoId: true, descricao: true, unidade: true, formulaQuantidade: true, perdaPb: true, produto: { select: { descricao: true } } } },
          },
        },
      },
    });
    for (const it of itens) {
      const numeroItem = it.ordem + 1; // número do item dentro da proposta
      const descricao = it.descricao.length > 70 ? `${it.descricao.slice(0, 67)}...` : it.descricao;
      const medidas = it.medidas.map((m) => ({ larguraMm: m.larguraMm, alturaMm: m.alturaMm, quantidade: m.quantidade }));
      if (!it.tipologia) semComposicao.push({ proposta: p.numero, itemNumero: numeroItem, descricao, motivo: "item sem tipologia" });
      else if (it.tipologia.insumos.length === 0) semComposicao.push({ proposta: p.numero, itemNumero: numeroItem, descricao, motivo: `a tipologia “${it.tipologia.nome}” não tem composição cadastrada` });
      else {
        const r = quantidadesDaComposicao(
          it.tipologia.insumos.map((i) => ({ produtoId: i.produtoId, unidade: i.unidade, descricao: i.produto?.descricao ?? i.descricao ?? "Insumo", formulaQuantidade: i.formulaQuantidade, perdaPb: i.perdaPb, custoUnitarioCentavos: null })),
          medidas,
          { folhas: it.folhas },
        );
        if (r.ok) brutas.push(...r.linhas);
        else semComposicao.push({ proposta: p.numero, itemNumero: numeroItem, descricao, motivo: r.erro });
      }
      // Vidros: itens com tipo de vidro definido; um por medida. O vão é só referência (a medida do vidro se confere depois).
      if (it.tipoVidroId && it.tipoVidro) {
        for (const m of it.medidas) {
          vidros.push({ proposta: p.numero, medidaId: m.id, itemId: it.id, itemNumero: numeroItem, descricao, local: m.local ?? it.local, tipoVidro: it.tipoVidro.nome, espessuraMm: it.espessuraVidroMm, vaoLarguraMm: m.larguraMm, vaoAlturaMm: m.alturaMm, quantidade: m.quantidade, compra: null });
        }
      }
    }
  }

  // Lista de materiais: agrupa por produto e confronta com o estoque.
  const agrupadas = agruparMateriais(brutas);
  const ids = [...new Set(agrupadas.map((l) => l.produtoId).filter((x): x is string => !!x))];
  const produtos = ids.length ? await prisma.produto.findMany({ where: { id: { in: ids } }, select: { id: true, codigo: true, descricao: true, unidade: true, saldoCache: true, comprimentoBarraMm: true, pesoKgPorMetro: true, custoUnitarioCentavos: true } }) : [];
  const porId = new Map(produtos.map((p) => [p.id, p]));
  const linhas: LinhaDeMaterialDaObra[] = agrupadas.map((l, n) => {
    const p = l.produtoId ? porId.get(l.produtoId) : undefined;
    const equiv = p ? equivalenciasDoPerfil(l.quantidade, l.unidade, { comprimentoBarraMm: p.comprimentoBarraMm, pesoMilesimosKgPorMetro: p.pesoKgPorMetro ? Math.round(num(p.pesoKgPorMetro) * 1000) : null }) : null;
    const saldo = p ? num(p.saldoCache) : null;
    return {
      chave: `${l.produtoId ?? "txt"}-${l.unidade}-${n}`,
      produtoId: l.produtoId,
      produto: p?.descricao ?? l.descricao,
      codigo: p?.codigo ?? null,
      unidadeFormula: l.unidade,
      unidadeProduto: p?.unidade ?? null,
      necessario: l.quantidade,
      equivalencias: equiv && (l.unidade === "M" || l.unidade === "BARRA" || l.unidade === "KG") ? equiv : null,
      saldo,
      falta: p && saldo !== null && equiv ? faltaDoProduto(l.quantidade, l.unidade, p.unidade, saldo, equiv) : null,
      semCusto: p ? p.custoUnitarioCentavos === null : false,
    };
  });

  // Vidros já pedidos (item de compra ligado à medida, em compra não cancelada).
  if (vidros.length > 0) {
    const itensDeCompra = await prisma.itemCompra.findMany({
      where: { deletadoEm: null, itemPropostaMedidaId: { in: vidros.map((v) => v.medidaId) }, compra: { deletadoEm: null, status: { not: "CANCELADO" } } },
      select: { itemPropostaMedidaId: true, compra: { select: { id: true, numero: true, status: true } } },
    });
    const porMedida = new Map(itensDeCompra.map((i) => [i.itemPropostaMedidaId!, i.compra]));
    for (const v of vidros) {
      const c = porMedida.get(v.medidaId);
      if (c) v.compra = { id: c.id, numero: numeroDaCompra(c.numero), status: c.status };
    }
  }

  const [compras, geradas, usados] = await Promise.all([
    prisma.compra.findMany({
      where: { projetoId, deletadoEm: null },
      orderBy: { numero: "desc" },
      select: {
        id: true,
        numero: true,
        tipo: true,
        status: true,
        fornecedor: { select: { razaoSocial: true, nomeFantasia: true } },
        itens: { where: { deletadoEm: null }, select: { recebimentos: { where: { deletadoEm: null }, select: { valorCentavos: true } } } },
      },
    }),
    prisma.retalho.findMany({ where: { origemProjetoId: projetoId, deletadoEm: null }, orderBy: { criadoEm: "desc" }, select: { id: true, comprimentoMm: true, status: true, produto: { select: { descricao: true } } } }),
    prisma.retalho.findMany({ where: { consumidoProjetoId: projetoId, deletadoEm: null }, orderBy: { consumidoEm: "desc" }, select: { id: true, comprimentoMm: true, produto: { select: { descricao: true } } } }),
  ]);

  return {
    propostas: propostas.map((p) => ({ numero: p.numero, revisao: p.revisao })),
    linhas,
    semComposicao,
    vidros,
    compras: compras.map((c) => {
      const valores = c.itens.flatMap((i) => i.recebimentos.map((r) => r.valorCentavos));
      return { id: c.id, numero: numeroDaCompra(c.numero), fornecedor: c.fornecedor.nomeFantasia ?? c.fornecedor.razaoSocial, tipo: c.tipo, status: c.status, itens: c.itens.length, recebidoCentavos: valores.length === 0 ? null : valores.reduce<number>((s, v) => s + (v ?? 0), 0) };
    }),
    retalhosGerados: geradas.map((r) => ({ id: r.id, produto: r.produto.descricao, comprimentoMm: r.comprimentoMm, status: r.status })),
    retalhosUsados: usados.map((r) => ({ id: r.id, produto: r.produto.descricao, comprimentoMm: r.comprimentoMm })),
  };
}

