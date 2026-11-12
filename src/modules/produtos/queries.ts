import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { calcularPaginacao, lerParametrosLista, padraoLike, type ParametrosBrutos, type ParametrosLista } from "@/lib/listas/parametros";

import { UNIDADES } from "./schemas";

export const DIAS_CUSTO_DESATUALIZADO = 90;

export const CONFIG_LISTA_PRODUTOS = { ordenaveis: ["codigo", "descricao", "custo", "atualizadoEm"], ordemPadrao: "codigo" } as const;

export type FiltrosProdutos = {
  categoria?: string;
  linha?: string;
  fornecedor?: string;
  /** "sem" = sem custo informado; "com" = com custo; "antigo" = custo sem atualização há mais de ${DIAS_CUSTO_DESATUALIZADO} dias. */
  custo?: "sem" | "com" | "antigo";
  situacao: "ativos" | "inativos" | "todos";
};

function um(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

const idOuNada = (v: string | undefined) => (v ? v.slice(0, 64) : undefined);

export function lerListaProdutos(brutos: ParametrosBrutos) {
  const situacao = um(brutos.situacao);
  const custo = um(brutos.custo);
  return {
    parametros: lerParametrosLista(brutos, CONFIG_LISTA_PRODUTOS),
    filtros: {
      categoria: idOuNada(um(brutos.categoria)),
      linha: idOuNada(um(brutos.linha)),
      fornecedor: idOuNada(um(brutos.fornecedor)),
      custo: custo === "sem" || custo === "com" || custo === "antigo" ? custo : undefined,
      situacao: situacao === "inativos" || situacao === "todos" ? situacao : "ativos",
    } satisfies FiltrosProdutos,
  };
}

/** Busca sem acento por código e descrição, usando exatamente a expressão do índice trigram. */
async function idsPorBusca(termo: string): Promise<string[]> {
  const texto = padraoLike(termo.toLowerCase());
  const linhas = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Produto"
     WHERE "deletadoEm" IS NULL
       AND ( public.f_unaccent(lower("codigo" || ' ' || "descricao")) LIKE public.f_unaccent(${texto})
          OR public.f_unaccent(lower(coalesce("localizacao", ''))) LIKE public.f_unaccent(${texto}) )
     LIMIT 3000`;
  return linhas.map((l) => l.id);
}

async function montarFiltro(parametros: ParametrosLista, filtros: FiltrosProdutos): Promise<Prisma.ProdutoWhereInput | null> {
  const ids = parametros.busca ? await idsPorBusca(parametros.busca) : null;
  if (ids && ids.length === 0) return null;
  return {
    deletadoEm: null,
    ...(filtros.situacao === "ativos" ? { ativo: true } : filtros.situacao === "inativos" ? { ativo: false } : {}),
    ...(filtros.categoria ? { categoriaId: filtros.categoria } : {}),
    ...(filtros.linha ? { linhaId: filtros.linha } : {}),
    ...(filtros.fornecedor ? { fornecedorPrincipalId: filtros.fornecedor } : {}),
    ...(filtros.custo === "sem"
      ? { custoUnitarioCentavos: null }
      : filtros.custo === "com"
        ? { custoUnitarioCentavos: { not: null } }
        : filtros.custo === "antigo"
          ? { custoUnitarioCentavos: { not: null }, custoAtualizadoEm: { lt: new Date(Date.now() - DIAS_CUSTO_DESATUALIZADO * 86_400_000) } }
          : {}),
    ...(ids ? { id: { in: ids } } : {}),
  };
}

export type ProdutoDaLista = {
  id: string;
  codigo: string;
  descricao: string;
  unidade: (typeof UNIDADES)[number];
  categoria: string | null;
  linha: string | null;
  acabamento: string | null;
  fornecedor: string | null;
  custoUnitarioCentavos: number | null;
  custoAtualizadoEm: string | null;
  localizacao: string | null;
  /** Saldo em estoque (cache dos movimentos), em milésimos. */
  saldoMilesimos: number;
  /** Mínimo em milésimos; null = sem alerta (campo vazio). */
  minimoMilesimos: number | null;
  ativo: boolean;
  atualizadoEm: string;
};

const selecaoDaLista = {
  id: true,
  codigo: true,
  descricao: true,
  unidade: true,
  custoUnitarioCentavos: true,
  custoAtualizadoEm: true,
  localizacao: true,
  saldoCache: true,
  estoqueMinimo: true,
  ativo: true,
  atualizadoEm: true,
  categoria: { select: { nome: true } },
  linha: { select: { nome: true } },
  acabamento: { select: { nome: true } },
  fornecedorPrincipal: { select: { razaoSocial: true } },
} satisfies Prisma.ProdutoSelect;

function paraLista(p: Prisma.ProdutoGetPayload<{ select: typeof selecaoDaLista }>): ProdutoDaLista {
  return {
    id: p.id,
    codigo: p.codigo,
    descricao: p.descricao,
    unidade: p.unidade,
    categoria: p.categoria?.nome ?? null,
    linha: p.linha?.nome ?? null,
    acabamento: p.acabamento?.nome ?? null,
    fornecedor: p.fornecedorPrincipal?.razaoSocial ?? null,
    custoUnitarioCentavos: p.custoUnitarioCentavos,
    custoAtualizadoEm: p.custoAtualizadoEm?.toISOString() ?? null,
    localizacao: p.localizacao,
    saldoMilesimos: Math.round(Number(p.saldoCache.toString()) * 1000),
    minimoMilesimos: p.estoqueMinimo ? Math.round(Number(p.estoqueMinimo.toString()) * 1000) : null,
    ativo: p.ativo,
    atualizadoEm: p.atualizadoEm.toISOString(),
  };
}

function ordenacao(p: ParametrosLista): Prisma.ProdutoOrderByWithRelationInput[] {
  switch (p.ordem) {
    case "descricao":
      return [{ descricao: p.direcao }, { codigo: "asc" }];
    case "custo":
      return [{ custoUnitarioCentavos: { sort: p.direcao, nulls: "last" } }, { codigo: "asc" }];
    case "atualizadoEm":
      return [{ atualizadoEm: p.direcao }, { codigo: "asc" }];
    default:
      return [{ codigo: p.direcao }];
  }
}

export async function listarProdutos(parametros: ParametrosLista, filtros: FiltrosProdutos) {
  const where = await montarFiltro(parametros, filtros);
  if (!where) return { linhas: [] as ProdutoDaLista[], paginacao: calcularPaginacao(0, 1, parametros.tamanho) };
  const total = await prisma.produto.count({ where });
  const paginacao = calcularPaginacao(total, parametros.pagina, parametros.tamanho);
  const linhas = await prisma.produto.findMany({ where, orderBy: ordenacao(parametros), skip: paginacao.skip, take: paginacao.take, select: selecaoDaLista });
  return { linhas: linhas.map(paraLista), paginacao };
}

export const LIMITE_EXPORTACAO_PRODUTOS = 5000;

export async function listarProdutosParaExportar(parametros: ParametrosLista, filtros: FiltrosProdutos) {
  const where = await montarFiltro(parametros, filtros);
  if (!where) return { linhas: [] as ProdutoDaLista[], truncado: false };
  const linhas = await prisma.produto.findMany({ where, orderBy: ordenacao(parametros), take: LIMITE_EXPORTACAO_PRODUTOS + 1, select: selecaoDaLista });
  return { linhas: linhas.slice(0, LIMITE_EXPORTACAO_PRODUTOS).map(paraLista), truncado: linhas.length > LIMITE_EXPORTACAO_PRODUTOS };
}

export type ProdutoDetalhe = {
  id: string;
  codigo: string;
  descricao: string;
  categoriaId: string | null;
  unidade: (typeof UNIDADES)[number];
  linhaId: string | null;
  acabamentoId: string | null;
  fornecedorPrincipalId: string | null;
  custoUnitarioCentavos: number | null;
  custoAtualizadoEm: string | null;
  custoPorKg: boolean;
  comprimentoBarraMm: number | null;
  pesoKgPorMetro: string | null;
  larguraMm: number | null;
  alturaMm: number | null;
  estoqueMinimo: string | null;
  localizacao: string | null;
  observacoes: string | null;
  ativo: boolean;
  criadoEm: string;
};

export async function obterProduto(id: string): Promise<ProdutoDetalhe | null> {
  const p = await prisma.produto.findFirst({ where: { id, deletadoEm: null } });
  if (!p) return null;
  return {
    id: p.id,
    codigo: p.codigo,
    descricao: p.descricao,
    categoriaId: p.categoriaId,
    unidade: p.unidade,
    linhaId: p.linhaId,
    acabamentoId: p.acabamentoId,
    fornecedorPrincipalId: p.fornecedorPrincipalId,
    custoUnitarioCentavos: p.custoUnitarioCentavos,
    custoAtualizadoEm: p.custoAtualizadoEm?.toISOString() ?? null,
    custoPorKg: p.custoPorKg,
    comprimentoBarraMm: p.comprimentoBarraMm,
    pesoKgPorMetro: p.pesoKgPorMetro?.toString() ?? null,
    larguraMm: p.larguraMm,
    alturaMm: p.alturaMm,
    estoqueMinimo: p.estoqueMinimo?.toString() ?? null,
    localizacao: p.localizacao,
    observacoes: p.observacoes,
    ativo: p.ativo,
    criadoEm: p.criadoEm.toISOString(),
  };
}

export type ItemDoHistorico = {
  id: string;
  quando: string;
  anteriorCentavos: number | null;
  novoCentavos: number;
  origem: "MANUAL" | "REAJUSTE_LOTE" | "IMPORTACAO" | "COMPRA" | "PRECO_KG";
  observacao: string | null;
  fornecedor: string | null;
  autor: string | null;
};

export async function listarHistoricoDePreco(produtoId: string, limite = 100): Promise<ItemDoHistorico[]> {
  const itens = await prisma.historicoPreco.findMany({
    where: { produtoId, deletadoEm: null },
    orderBy: { criadoEm: "desc" },
    take: limite,
    include: { fornecedor: { select: { razaoSocial: true } } },
  });
  const ids = Array.from(new Set(itens.map((i) => i.usuarioId).filter((id): id is string => !!id)));
  const usuarios = ids.length ? await prisma.usuario.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } }) : [];
  const nomes = new Map(usuarios.map((u) => [u.id, u.nome]));
  return itens.map((i) => ({
    id: i.id,
    quando: i.criadoEm.toISOString(),
    anteriorCentavos: i.custoAnteriorCentavos,
    novoCentavos: i.custoNovoCentavos,
    origem: i.origem,
    observacao: i.observacao,
    fornecedor: i.fornecedor?.razaoSocial ?? null,
    autor: i.usuarioId ? (nomes.get(i.usuarioId) ?? null) : null,
  }));
}

/** Opções dos selects do formulário e dos filtros (só cadastros ativos). */
export async function listarOpcoesDeProduto() {
  const [categorias, linhas, acabamentos, fornecedores] = await Promise.all([
    prisma.categoriaProduto.findMany({ where: { ativo: true, deletadoEm: null }, orderBy: [{ ordem: "asc" }, { nome: "asc" }], select: { id: true, nome: true } }),
    prisma.linhaAluminio.findMany({ where: { ativo: true, deletadoEm: null }, orderBy: [{ ordem: "asc" }, { nome: "asc" }], select: { id: true, nome: true } }),
    prisma.acabamentoAluminio.findMany({ where: { ativo: true, deletadoEm: null }, orderBy: [{ ordem: "asc" }, { nome: "asc" }], select: { id: true, nome: true } }),
    prisma.fornecedor.findMany({ where: { ativo: true, deletadoEm: null }, orderBy: { razaoSocial: "asc" }, select: { id: true, razaoSocial: true } }),
  ]);
  return { categorias, linhas, acabamentos, fornecedores: fornecedores.map((f) => ({ id: f.id, nome: f.razaoSocial })) };
}

/** Produto não excluído com o mesmo código (sem diferenciar maiúsculas), para recusar repetição com mensagem clara. */
export async function buscarProdutoPorCodigo(codigo: string, exceto?: string) {
  return prisma.produto.findFirst({
    where: { codigo: { equals: codigo, mode: "insensitive" }, deletadoEm: null, ...(exceto ? { id: { not: exceto } } : {}) },
    select: { id: true, descricao: true },
  });
}
