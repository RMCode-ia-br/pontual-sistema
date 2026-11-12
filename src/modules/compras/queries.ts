import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { entregaAtrasada, numeroDaCompra, totalDoPedido, type StatusDaCompra } from "@/lib/dominio/compras";

const comoTexto = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);
const milesimos = (d: { toString(): string }): number => Math.round(Number(d.toString()) * 1000);

export type AbaDeCompras = "abertas" | "recebidas" | "canceladas" | "todas";
export const ABAS_DE_COMPRAS: { id: AbaDeCompras; rotulo: string }[] = [
  { id: "abertas", rotulo: "Em aberto" },
  { id: "recebidas", rotulo: "Recebidas" },
  { id: "canceladas", rotulo: "Canceladas" },
  { id: "todas", rotulo: "Todas" },
];

const STATUS_DA_ABA: Record<AbaDeCompras, StatusDaCompra[] | null> = {
  abertas: ["RASCUNHO", "PEDIDO", "RECEBIDO_PARCIAL"],
  recebidas: ["RECEBIDO"],
  canceladas: ["CANCELADO"],
  todas: null,
};

export function lerFiltroDeCompras(brutos: Record<string, string | string[] | undefined>): { aba: AbaDeCompras; busca: string | undefined } {
  const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const aba = um(brutos.aba);
  return { aba: ABAS_DE_COMPRAS.some((a) => a.id === aba) ? (aba as AbaDeCompras) : "abertas", busca: (um(brutos.busca) ?? "").trim().slice(0, 80) || undefined };
}

export type CompraDaLista = {
  id: string;
  numero: string;
  fornecedor: string;
  tipo: "MATERIAL" | "VIDRO";
  destino: "ESTOQUE" | "OBRA";
  obra: string | null;
  status: StatusDaCompra;
  dataPedido: string | null;
  previsaoEntrega: string | null;
  atrasada: boolean;
  itens: number;
  totalCentavos: number;
  itensSemPreco: number;
};

function filtroDeBusca(busca: string): Prisma.CompraWhereInput {
  const n = /^c?-?0*(\d{1,9})$/i.exec(busca.trim());
  return {
    OR: [
      ...(n ? [{ numero: Number(n[1]) }] : []),
      { fornecedor: { razaoSocial: { contains: busca, mode: "insensitive" as const } } },
      { fornecedor: { nomeFantasia: { contains: busca, mode: "insensitive" as const } } },
      { projeto: { codigo: { contains: busca, mode: "insensitive" as const } } },
      { projeto: { titulo: { contains: busca, mode: "insensitive" as const } } },
    ],
  };
}

export async function listarCompras(f: { aba: AbaDeCompras; busca: string | undefined }, hoje: string, limite = 200): Promise<{ linhas: CompraDaLista[]; temMais: boolean; contagens: Record<AbaDeCompras, number> }> {
  const status = STATUS_DA_ABA[f.aba];
  const base: Prisma.CompraWhereInput = { deletadoEm: null, ...(f.busca ? filtroDeBusca(f.busca) : {}) };
  const [rows, contagensLista] = await Promise.all([
    prisma.compra.findMany({
      where: { ...base, ...(status ? { status: { in: status } } : {}) },
      orderBy: [{ numero: "desc" }],
      take: limite + 1,
      select: {
        id: true,
        numero: true,
        tipo: true,
        destino: true,
        status: true,
        dataPedido: true,
        previsaoEntrega: true,
        fornecedor: { select: { razaoSocial: true, nomeFantasia: true } },
        projeto: { select: { codigo: true, titulo: true } },
        itens: { where: { deletadoEm: null }, select: { quantidade: true, precoUnitarioCentavos: true } },
      },
    }),
    Promise.all(ABAS_DE_COMPRAS.map((a) => prisma.compra.count({ where: { ...base, ...(STATUS_DA_ABA[a.id] ? { status: { in: STATUS_DA_ABA[a.id]! } } : {}) } }))),
  ]);
  const contagens = Object.fromEntries(ABAS_DE_COMPRAS.map((a, i) => [a.id, contagensLista[i]])) as Record<AbaDeCompras, number>;
  return {
    temMais: rows.length > limite,
    contagens,
    linhas: rows.slice(0, limite).map((c) => {
      const t = totalDoPedido(c.itens.map((i) => ({ quantidadeMilesimos: milesimos(i.quantidade), precoUnitarioCentavos: i.precoUnitarioCentavos })));
      const previsao = comoTexto(c.previsaoEntrega);
      return {
        id: c.id,
        numero: numeroDaCompra(c.numero),
        fornecedor: c.fornecedor.nomeFantasia ?? c.fornecedor.razaoSocial,
        tipo: c.tipo,
        destino: c.destino,
        obra: c.projeto ? `${c.projeto.codigo} · ${c.projeto.titulo}` : null,
        status: c.status,
        dataPedido: comoTexto(c.dataPedido),
        previsaoEntrega: previsao,
        atrasada: entregaAtrasada({ status: c.status, previsaoEntrega: previsao }, hoje),
        itens: c.itens.length,
        totalCentavos: t.totalCentavos,
        itensSemPreco: t.itensSemPreco,
      };
    }),
  };
}

export type ItemDaCompraDetalhe = {
  id: string;
  ordem: number;
  produtoId: string | null;
  produto: string | null;
  codigoProduto: string | null;
  descricao: string | null;
  unidadeCompra: string;
  unidadeProduto: string | null;
  quantidadeMilesimos: number;
  recebidaMilesimos: number;
  precoUnitarioCentavos: number | null;
  /** Para sugerir as barras ao receber em kg. */
  pesoMilesimosKgPorMetro: number | null;
  comprimentoBarraMm: number | null;
  custoPorKg: boolean;
  acabamentoNome: string | null;
  larguraMm: number | null;
  alturaMm: number | null;
  espessuraMm: number | null;
  tipoVidroId: string | null;
  tipoVidro: string | null;
  beneficiamentos: string | null;
  itemPropostaId: string | null;
  itemPropostaMedidaId: string | null;
};

export type CompraDetalhe = {
  id: string;
  numeroSequencial: number;
  numero: string;
  fornecedorId: string;
  fornecedor: string;
  fornecedorTelefone: string | null;
  tipo: "MATERIAL" | "VIDRO";
  destino: "ESTOQUE" | "OBRA";
  projetoId: string | null;
  obra: string | null;
  status: StatusDaCompra;
  dataPedido: string | null;
  previsaoEntrega: string | null;
  atrasada: boolean;
  condicoes: string | null;
  observacao: string | null;
  itens: ItemDaCompraDetalhe[];
  totalCentavos: number;
  itensSemPreco: number;
  recebimentos: { id: string; data: string; observacao: string | null; valorCentavos: number; itens: { descricao: string; quantidadeCompraMilesimos: number; quantidadeEstoqueMilesimos: number; valorCentavos: number | null }[] }[];
  contasPagar: { id: string; descricao: string; valorCentavos: number; vencimento: string; status: string }[];
};

export async function obterCompra(id: string, hoje: string): Promise<CompraDetalhe | null> {
  const c = await prisma.compra.findFirst({
    where: { id, deletadoEm: null },
    include: {
      fornecedor: { select: { id: true, razaoSocial: true, nomeFantasia: true, telefone: true } },
      projeto: { select: { id: true, codigo: true, titulo: true } },
      itens: {
        where: { deletadoEm: null },
        orderBy: { ordem: "asc" },
        include: { produto: { select: { id: true, codigo: true, descricao: true, unidade: true, pesoKgPorMetro: true, comprimentoBarraMm: true, custoPorKg: true, acabamento: { select: { nome: true } } } }, tipoVidro: { select: { nome: true } } },
      },
      recebimentos: { where: { deletadoEm: null }, orderBy: [{ data: "desc" }, { criadoEm: "desc" }], include: { itens: { where: { deletadoEm: null }, include: { itemCompra: { select: { descricao: true, produto: { select: { descricao: true } } } } } } } },
      contasPagar: { where: { deletadoEm: null }, orderBy: { vencimento: "asc" }, select: { id: true, descricao: true, valorCentavos: true, vencimento: true, status: true } },
    },
  });
  if (!c) return null;
  const itens: ItemDaCompraDetalhe[] = c.itens.map((i) => ({
    id: i.id,
    ordem: i.ordem,
    produtoId: i.produtoId,
    produto: i.produto?.descricao ?? null,
    codigoProduto: i.produto?.codigo ?? null,
    descricao: i.descricao,
    unidadeCompra: i.unidadeCompra,
    unidadeProduto: i.produto?.unidade ?? null,
    quantidadeMilesimos: milesimos(i.quantidade),
    recebidaMilesimos: milesimos(i.quantidadeRecebida),
    precoUnitarioCentavos: i.precoUnitarioCentavos,
    pesoMilesimosKgPorMetro: i.produto?.pesoKgPorMetro ? Math.round(Number(i.produto.pesoKgPorMetro.toString()) * 1000) : null,
    comprimentoBarraMm: i.produto?.comprimentoBarraMm ?? null,
    custoPorKg: i.produto?.custoPorKg ?? false,
    acabamentoNome: i.produto?.acabamento?.nome ?? null,
    larguraMm: i.larguraMm,
    alturaMm: i.alturaMm,
    espessuraMm: i.espessuraMm,
    tipoVidroId: i.tipoVidroId,
    tipoVidro: i.tipoVidro?.nome ?? null,
    beneficiamentos: i.beneficiamentos,
    itemPropostaId: i.itemPropostaId,
    itemPropostaMedidaId: i.itemPropostaMedidaId,
  }));
  const t = totalDoPedido(itens.map((i) => ({ quantidadeMilesimos: i.quantidadeMilesimos, precoUnitarioCentavos: i.precoUnitarioCentavos })));
  const previsao = comoTexto(c.previsaoEntrega);
  return {
    id: c.id,
    numeroSequencial: c.numero,
    numero: numeroDaCompra(c.numero),
    fornecedorId: c.fornecedor.id,
    fornecedor: c.fornecedor.nomeFantasia ?? c.fornecedor.razaoSocial,
    fornecedorTelefone: c.fornecedor.telefone,
    tipo: c.tipo,
    destino: c.destino,
    projetoId: c.projetoId,
    obra: c.projeto ? `${c.projeto.codigo} · ${c.projeto.titulo}` : null,
    status: c.status,
    dataPedido: comoTexto(c.dataPedido),
    previsaoEntrega: previsao,
    atrasada: entregaAtrasada({ status: c.status, previsaoEntrega: previsao }, hoje),
    condicoes: c.condicoes,
    observacao: c.observacao,
    itens,
    totalCentavos: t.totalCentavos,
    itensSemPreco: t.itensSemPreco,
    recebimentos: c.recebimentos.map((r) => ({
      id: r.id,
      data: comoTexto(r.data)!,
      observacao: r.observacao,
      valorCentavos: r.itens.reduce((s, x) => s + (x.valorCentavos ?? 0), 0),
      itens: r.itens.map((x) => ({ descricao: x.itemCompra.produto?.descricao ?? x.itemCompra.descricao ?? "Item", quantidadeCompraMilesimos: milesimos(x.quantidadeCompra), quantidadeEstoqueMilesimos: milesimos(x.quantidadeEstoque), valorCentavos: x.valorCentavos })),
    })),
    contasPagar: c.contasPagar.map((x) => ({ id: x.id, descricao: x.descricao, valorCentavos: x.valorCentavos, vencimento: comoTexto(x.vencimento)!, status: x.status })),
  };
}

/** Listas dos formulários: tipos de vidro e categorias de despesa ativas. */
export async function opcoesDeCompra() {
  const [tiposDeVidro, categoriasDeDespesa] = await Promise.all([
    prisma.tipoVidro.findMany({ where: { ativo: true, deletadoEm: null }, orderBy: [{ ordem: "asc" }, { nome: "asc" }], select: { id: true, nome: true } }),
    prisma.categoriaFinanceira.findMany({ where: { tipo: "DESPESA", ativo: true, deletadoEm: null }, orderBy: [{ ordem: "asc" }, { nome: "asc" }], select: { id: true, nome: true } }),
  ]);
  return { tiposDeVidro, categoriasDeDespesa };
}
