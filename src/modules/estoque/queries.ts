import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { inputParaData } from "@/lib/formatadores";
import type { TipoDeMovimento } from "@/lib/dominio/estoque";
import {
  calcularPaginacao,
  lerParametrosLista,
  padraoLike,
  type ParametrosBrutos,
  type ParametrosLista,
} from "@/lib/listas/parametros";

const TIPOS: readonly TipoDeMovimento[] = [
  "INVENTARIO_INICIAL",
  "ENTRADA_COMPRA",
  "SAIDA_OBRA",
  "DEVOLUCAO",
  "AJUSTE",
  "PERDA",
];

const milesimos = (d: { toString(): string }): number =>
  Math.round(Number(d.toString()) * 1000);
const comoTexto = (d: Date): string => d.toISOString().slice(0, 10);

export const CONFIG_LISTA_MOVIMENTOS = {
  ordenaveis: ["data", "produto"],
  ordemPadrao: "data",
  direcaoPadrao: "desc",
} as const;

export type FiltrosMovimentos = {
  tipo?: TipoDeMovimento;
  de?: string;
  ate?: string;
  produtoId?: string;
  projetoId?: string;
};

const um = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;
const dataOuNada = (v: string | undefined): string | undefined =>
  v && /^\d{4}-\d{2}-\d{2}$/.test(v) && inputParaData(v) ? v : undefined;
const idOuNada = (v: string | undefined): string | undefined =>
  v ? v.slice(0, 64) : undefined;

export function lerListaMovimentos(brutos: ParametrosBrutos) {
  const tipo = um(brutos.tipo);
  return {
    parametros: lerParametrosLista(brutos, CONFIG_LISTA_MOVIMENTOS),
    filtros: {
      tipo: TIPOS.includes(tipo as TipoDeMovimento)
        ? (tipo as TipoDeMovimento)
        : undefined,
      de: dataOuNada(um(brutos.de)),
      ate: dataOuNada(um(brutos.ate)),
      produtoId: idOuNada(um(brutos.produto)),
      projetoId: idOuNada(um(brutos.obra)),
    } satisfies FiltrosMovimentos,
  };
}

/** Busca de produtos sem acento (a mesma expressão do índice trigram), para filtrar movimentos pelo nome ou código. */
export async function idsDeProdutosPorBusca(termo: string): Promise<string[]> {
  const texto = padraoLike(termo.toLowerCase());
  const linhas = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Produto"
     WHERE "deletadoEm" IS NULL
       AND public.f_unaccent(lower("codigo" || ' ' || "descricao")) LIKE public.f_unaccent(${texto})
     LIMIT 3000`;
  return linhas.map((l) => l.id);
}

export type MovimentoDaLista = {
  id: string;
  data: string;
  tipo: TipoDeMovimento;
  produtoId: string;
  produto: string;
  codigo: string;
  unidade: string;
  /** Com sinal, em milésimos. */
  quantidadeMilesimos: number;
  custoUnitarioCentavos: number | null;
  projetoId: string | null;
  obra: string | null;
  justificativa: string | null;
  semSaldoConfirmado: boolean;
  /** Este movimento desfaz outro. */
  ehEstorno: boolean;
  /** Já foi desfeito por outro movimento. */
  estornado: boolean;
  /** Veio do recebimento de uma compra (desfaz-se pelo recebimento). */
  deRecebimento: boolean;
};

const selecao = {
  id: true,
  data: true,
  tipo: true,
  quantidade: true,
  custoUnitarioCentavos: true,
  justificativa: true,
  semSaldoConfirmado: true,
  estornoDeId: true,
  itemRecebimentoId: true,
  projetoId: true,
  produto: {
    select: { id: true, descricao: true, codigo: true, unidade: true },
  },
  projeto: { select: { codigo: true, titulo: true } },
  estornadoPor: { select: { id: true } },
} satisfies Prisma.MovimentoEstoqueSelect;

function paraLinha(
  m: Prisma.MovimentoEstoqueGetPayload<{ select: typeof selecao }>,
): MovimentoDaLista {
  return {
    id: m.id,
    data: comoTexto(m.data),
    tipo: m.tipo,
    produtoId: m.produto.id,
    produto: m.produto.descricao,
    codigo: m.produto.codigo,
    unidade: m.produto.unidade,
    quantidadeMilesimos: milesimos(m.quantidade),
    custoUnitarioCentavos: m.custoUnitarioCentavos,
    projetoId: m.projetoId,
    obra: m.projeto ? `${m.projeto.codigo} · ${m.projeto.titulo}` : null,
    justificativa: m.justificativa,
    semSaldoConfirmado: m.semSaldoConfirmado,
    ehEstorno: m.estornoDeId !== null,
    estornado: m.estornadoPor !== null,
    deRecebimento: m.itemRecebimentoId !== null,
  };
}

async function montarFiltro(
  parametros: ParametrosLista,
  f: FiltrosMovimentos,
): Promise<Prisma.MovimentoEstoqueWhereInput | null> {
  const ids = parametros.busca
    ? await idsDeProdutosPorBusca(parametros.busca)
    : null;
  if (ids && ids.length === 0) return null;
  return {
    deletadoEm: null,
    ...(f.tipo ? { tipo: f.tipo } : {}),
    ...(f.produtoId ? { produtoId: f.produtoId } : {}),
    ...(f.projetoId ? { projetoId: f.projetoId } : {}),
    ...(ids
      ? {
          produtoId: f.produtoId
            ? { in: ids.filter((i) => i === f.produtoId) }
            : { in: ids },
        }
      : {}),
    ...(f.de || f.ate
      ? {
          data: {
            ...(f.de ? { gte: new Date(`${f.de}T00:00:00Z`) } : {}),
            ...(f.ate ? { lte: new Date(`${f.ate}T00:00:00Z`) } : {}),
          },
        }
      : {}),
  };
}

function ordenacao(
  p: ParametrosLista,
): Prisma.MovimentoEstoqueOrderByWithRelationInput[] {
  if (p.ordem === "produto")
    return [
      { produto: { descricao: p.direcao } },
      { data: "desc" },
      { id: "asc" },
    ];
  return [{ data: p.direcao }, { criadoEm: p.direcao }, { id: "asc" }];
}

export async function listarMovimentos(
  parametros: ParametrosLista,
  filtros: FiltrosMovimentos,
) {
  const where = await montarFiltro(parametros, filtros);
  if (!where)
    return {
      linhas: [] as MovimentoDaLista[],
      paginacao: calcularPaginacao(0, 1, parametros.tamanho),
    };
  const total = await prisma.movimentoEstoque.count({ where });
  const paginacao = calcularPaginacao(
    total,
    parametros.pagina,
    parametros.tamanho,
  );
  const linhas = await prisma.movimentoEstoque.findMany({
    where,
    orderBy: ordenacao(parametros),
    skip: paginacao.skip,
    take: paginacao.take,
    select: selecao,
  });
  return { linhas: linhas.map(paraLinha), paginacao };
}

export const LIMITE_EXPORTACAO_MOVIMENTOS = 5000;

export async function listarMovimentosParaExportar(
  parametros: ParametrosLista,
  filtros: FiltrosMovimentos,
) {
  const where = await montarFiltro(parametros, filtros);
  if (!where) return { linhas: [] as MovimentoDaLista[], truncado: false };
  const linhas = await prisma.movimentoEstoque.findMany({
    where,
    orderBy: ordenacao(parametros),
    take: LIMITE_EXPORTACAO_MOVIMENTOS + 1,
    select: selecao,
  });
  return {
    linhas: linhas.slice(0, LIMITE_EXPORTACAO_MOVIMENTOS).map(paraLinha),
    truncado: linhas.length > LIMITE_EXPORTACAO_MOVIMENTOS,
  };
}

/** Saldo (do cache) e os últimos movimentos de um produto, para a aba "Estoque" da ficha. */
export async function estoqueDoProduto(produtoId: string, limite = 30) {
  const [produto, movimentos, total, retalhos] = await Promise.all([
    prisma.produto.findFirst({
      where: { id: produtoId, deletadoEm: null },
      select: { saldoCache: true, estoqueMinimo: true, unidade: true },
    }),
    prisma.movimentoEstoque.findMany({
      where: { produtoId, deletadoEm: null },
      orderBy: [{ data: "desc" }, { criadoEm: "desc" }, { id: "asc" }],
      take: limite,
      select: selecao,
    }),
    prisma.movimentoEstoque.count({ where: { produtoId, deletadoEm: null } }),
    prisma.retalho.count({
      where: { produtoId, status: "DISPONIVEL", deletadoEm: null },
    }),
  ]);
  if (!produto) return null;
  return {
    saldoMilesimos: milesimos(produto.saldoCache),
    minimoMilesimos: produto.estoqueMinimo
      ? milesimos(produto.estoqueMinimo)
      : null,
    totalDeMovimentos: total,
    retalhosDisponiveis: retalhos,
    movimentos: movimentos.map(paraLinha),
  };
}

export type ProdutoParaContagem = {
  id: string;
  codigo: string;
  descricao: string;
  unidade: string;
  custoUnitarioCentavos: number | null;
};

/** Produtos ativos que ainda NÃO têm nenhum movimento (só eles podem ter contagem inicial). */
export async function produtosSemMovimento(
  busca: string | undefined,
  limite = 100,
): Promise<{ produtos: ProdutoParaContagem[]; temMais: boolean }> {
  const ids = busca ? await idsDeProdutosPorBusca(busca) : null;
  if (ids && ids.length === 0) return { produtos: [], temMais: false };
  const linhas = await prisma.produto.findMany({
    where: {
      deletadoEm: null,
      ativo: true,
      movimentosEstoque: { none: { deletadoEm: null } },
      ...(ids ? { id: { in: ids } } : {}),
    },
    orderBy: [{ codigo: "asc" }],
    take: limite + 1,
    select: {
      id: true,
      codigo: true,
      descricao: true,
      unidade: true,
      custoUnitarioCentavos: true,
    },
  });
  return { produtos: linhas.slice(0, limite), temMais: linhas.length > limite };
}
