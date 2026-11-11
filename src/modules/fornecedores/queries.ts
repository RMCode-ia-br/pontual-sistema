import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { calcularPaginacao, lerParametrosLista, padraoLike, type ParametrosBrutos, type ParametrosLista } from "@/lib/listas/parametros";
import { somenteDigitos } from "@/lib/validadores";

export const CONFIG_LISTA_FORNECEDORES = { ordenaveis: ["nome", "criadoEm"], ordemPadrao: "nome" } as const;

export type FiltrosFornecedores = { categoria?: string; situacao: "ativos" | "inativos" | "todos" };

function um(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

export function lerListaFornecedores(brutos: ParametrosBrutos) {
  const situacao = um(brutos.situacao);
  const categoria = um(brutos.categoria)?.slice(0, 64);
  return {
    parametros: lerParametrosLista(brutos, CONFIG_LISTA_FORNECEDORES),
    filtros: { categoria: categoria || undefined, situacao: situacao === "inativos" || situacao === "todos" ? situacao : "ativos" } satisfies FiltrosFornecedores,
  };
}

/** Busca sem acento por nome, fantasia, vendedor e e-mail (índice trigram) e por pedaço do CNPJ ou telefone. */
async function idsPorBusca(termo: string): Promise<string[]> {
  const texto = padraoLike(termo.toLowerCase());
  const digitos = somenteDigitos(termo);
  const porDigitos = digitos.length >= 3 ? `%${digitos}%` : null;
  const linhas = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Fornecedor"
     WHERE "deletadoEm" IS NULL
       AND ( public.f_unaccent(lower("razaoSocial" || ' ' || coalesce("nomeFantasia", ''))) LIKE public.f_unaccent(${texto})
          OR public.f_unaccent(lower(coalesce("vendedorNome", ''))) LIKE public.f_unaccent(${texto})
          OR lower(coalesce("email", '')) LIKE ${texto}
          OR (${porDigitos}::text IS NOT NULL AND ("cnpj" LIKE ${porDigitos} OR "telefone" LIKE ${porDigitos})) )
     LIMIT 2000`;
  return linhas.map((l) => l.id);
}

async function montarFiltro(parametros: ParametrosLista, filtros: FiltrosFornecedores): Promise<Prisma.FornecedorWhereInput | null> {
  const ids = parametros.busca ? await idsPorBusca(parametros.busca) : null;
  if (ids && ids.length === 0) return null;
  return {
    deletadoEm: null,
    ...(filtros.situacao === "ativos" ? { ativo: true } : filtros.situacao === "inativos" ? { ativo: false } : {}),
    ...(filtros.categoria ? { categorias: { some: { id: filtros.categoria } } } : {}),
    ...(ids ? { id: { in: ids } } : {}),
  };
}

export type FornecedorDaLista = {
  id: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  cnpj: string | null;
  vendedorNome: string | null;
  telefone: string | null;
  email: string | null;
  prazoEntregaDias: number | null;
  categorias: string[];
  ativo: boolean;
  criadoEm: string;
};

const selecaoDaLista = {
  id: true,
  razaoSocial: true,
  nomeFantasia: true,
  cnpj: true,
  vendedorNome: true,
  telefone: true,
  email: true,
  prazoEntregaDias: true,
  ativo: true,
  criadoEm: true,
  categorias: { select: { nome: true }, orderBy: { nome: "asc" } },
} satisfies Prisma.FornecedorSelect;

function paraLista(f: Prisma.FornecedorGetPayload<{ select: typeof selecaoDaLista }>): FornecedorDaLista {
  return { ...f, categorias: f.categorias.map((c) => c.nome), criadoEm: f.criadoEm.toISOString() };
}

const ordenacao = (p: ParametrosLista): Prisma.FornecedorOrderByWithRelationInput[] =>
  p.ordem === "criadoEm" ? [{ criadoEm: p.direcao }, { razaoSocial: "asc" }] : [{ razaoSocial: p.direcao }, { criadoEm: "desc" }];

export async function listarFornecedores(parametros: ParametrosLista, filtros: FiltrosFornecedores) {
  const where = await montarFiltro(parametros, filtros);
  if (!where) return { linhas: [] as FornecedorDaLista[], paginacao: calcularPaginacao(0, 1, parametros.tamanho) };
  const total = await prisma.fornecedor.count({ where });
  const paginacao = calcularPaginacao(total, parametros.pagina, parametros.tamanho);
  const linhas = await prisma.fornecedor.findMany({ where, orderBy: ordenacao(parametros), skip: paginacao.skip, take: paginacao.take, select: selecaoDaLista });
  return { linhas: linhas.map(paraLista), paginacao };
}

export const LIMITE_EXPORTACAO_FORNECEDORES = 5000;

export async function listarFornecedoresParaExportar(parametros: ParametrosLista, filtros: FiltrosFornecedores) {
  const where = await montarFiltro(parametros, filtros);
  if (!where) return { linhas: [] as FornecedorDaLista[], truncado: false };
  const linhas = await prisma.fornecedor.findMany({ where, orderBy: ordenacao(parametros), take: LIMITE_EXPORTACAO_FORNECEDORES + 1, select: selecaoDaLista });
  return { linhas: linhas.slice(0, LIMITE_EXPORTACAO_FORNECEDORES).map(paraLista), truncado: linhas.length > LIMITE_EXPORTACAO_FORNECEDORES };
}

export type FornecedorDetalhe = {
  id: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  cnpj: string | null;
  categoriaIds: string[];
  vendedorNome: string | null;
  telefone: string | null;
  email: string | null;
  condicoesPagamento: string | null;
  prazoEntregaDias: number | null;
  observacoes: string | null;
  ativo: boolean;
  criadoEm: string;
};

export async function obterFornecedor(id: string): Promise<FornecedorDetalhe | null> {
  const f = await prisma.fornecedor.findFirst({ where: { id, deletadoEm: null }, include: { categorias: { select: { id: true } } } });
  if (!f) return null;
  return {
    id: f.id,
    razaoSocial: f.razaoSocial,
    nomeFantasia: f.nomeFantasia,
    cnpj: f.cnpj,
    categoriaIds: f.categorias.map((c) => c.id),
    vendedorNome: f.vendedorNome,
    telefone: f.telefone,
    email: f.email,
    condicoesPagamento: f.condicoesPagamento,
    prazoEntregaDias: f.prazoEntregaDias,
    observacoes: f.observacoes,
    ativo: f.ativo,
    criadoEm: f.criadoEm.toISOString(),
  };
}

/** Categorias ativas para os checkboxes do formulário e o filtro da lista. */
export async function listarCategoriasAtivas() {
  return prisma.categoriaProduto.findMany({ where: { ativo: true, deletadoEm: null }, orderBy: [{ ordem: "asc" }, { nome: "asc" }], select: { id: true, nome: true } });
}

/** Fornecedor ativo com o mesmo CNPJ (para recusar cadastro repetido). */
export async function buscarFornecedorPorCnpj(cnpj: string, exceto?: string) {
  return prisma.fornecedor.findFirst({
    where: { cnpj, deletadoEm: null, ...(exceto ? { id: { not: exceto } } : {}) },
    select: { id: true, razaoSocial: true },
  });
}
