import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { calcularPaginacao, lerParametrosLista, padraoLike, type ParametrosBrutos, type ParametrosLista } from "@/lib/listas/parametros";
import { somenteDigitos } from "@/lib/validadores";

import { FUNCOES } from "./schemas";

export const CONFIG_LISTA_FUNCIONARIOS = { ordenaveis: ["nome", "admissaoEm"], ordemPadrao: "nome" } as const;

export type FiltrosFuncionarios = { funcao?: (typeof FUNCOES)[number]; situacao: "ativos" | "inativos" | "todos" };

function um(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

export function lerListaFuncionarios(brutos: ParametrosBrutos) {
  const funcao = um(brutos.funcao);
  const situacao = um(brutos.situacao);
  return {
    parametros: lerParametrosLista(brutos, CONFIG_LISTA_FUNCIONARIOS),
    filtros: {
      funcao: (FUNCOES as readonly string[]).includes(funcao ?? "") ? (funcao as FiltrosFuncionarios["funcao"]) : undefined,
      situacao: situacao === "inativos" || situacao === "todos" ? situacao : "ativos",
    } satisfies FiltrosFuncionarios,
  };
}

async function idsPorBusca(termo: string): Promise<string[]> {
  const texto = padraoLike(termo.toLowerCase());
  const digitos = somenteDigitos(termo);
  const porDigitos = digitos.length >= 3 ? `%${digitos}%` : null;
  const linhas = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Funcionario"
     WHERE "deletadoEm" IS NULL
       AND ( public.f_unaccent(lower("nome")) LIKE public.f_unaccent(${texto})
          OR public.f_unaccent(lower(coalesce("cargo", ''))) LIKE public.f_unaccent(${texto})
          OR lower(coalesce("email", '')) LIKE ${texto}
          OR (${porDigitos}::text IS NOT NULL AND ("cpf" LIKE ${porDigitos} OR "telefone" LIKE ${porDigitos})) )
     LIMIT 2000`;
  return linhas.map((l) => l.id);
}

async function montarFiltro(parametros: ParametrosLista, filtros: FiltrosFuncionarios): Promise<Prisma.FuncionarioWhereInput | null> {
  const ids = parametros.busca ? await idsPorBusca(parametros.busca) : null;
  if (ids && ids.length === 0) return null;
  return {
    deletadoEm: null,
    ...(filtros.situacao === "ativos" ? { ativo: true } : filtros.situacao === "inativos" ? { ativo: false } : {}),
    ...(filtros.funcao ? { funcao: filtros.funcao } : {}),
    ...(ids ? { id: { in: ids } } : {}),
  };
}

export type FuncionarioDaLista = {
  id: string;
  nome: string;
  cargo: string | null;
  funcao: (typeof FUNCOES)[number];
  telefone: string | null;
  email: string | null;
  admissaoEm: string | null;
  salarioBaseCentavos: number | null;
  equipes: string[];
  ativo: boolean;
};

const selecaoDaLista = {
  id: true,
  nome: true,
  cargo: true,
  funcao: true,
  telefone: true,
  email: true,
  admissaoEm: true,
  salarioBaseCentavos: true,
  ativo: true,
  equipes: { where: { deletadoEm: null, equipe: { deletadoEm: null } }, select: { equipe: { select: { nome: true } } } },
} satisfies Prisma.FuncionarioSelect;

function paraLista(f: Prisma.FuncionarioGetPayload<{ select: typeof selecaoDaLista }>): FuncionarioDaLista {
  return {
    id: f.id,
    nome: f.nome,
    cargo: f.cargo,
    funcao: f.funcao,
    telefone: f.telefone,
    email: f.email,
    admissaoEm: f.admissaoEm?.toISOString() ?? null,
    salarioBaseCentavos: f.salarioBaseCentavos,
    equipes: f.equipes.map((e) => e.equipe.nome).sort((a, b) => a.localeCompare(b, "pt-BR")),
    ativo: f.ativo,
  };
}

const ordenacao = (p: ParametrosLista): Prisma.FuncionarioOrderByWithRelationInput[] =>
  p.ordem === "admissaoEm" ? [{ admissaoEm: { sort: p.direcao, nulls: "last" } }, { nome: "asc" }] : [{ nome: p.direcao }];

export async function listarFuncionarios(parametros: ParametrosLista, filtros: FiltrosFuncionarios) {
  const where = await montarFiltro(parametros, filtros);
  if (!where) return { linhas: [] as FuncionarioDaLista[], paginacao: calcularPaginacao(0, 1, parametros.tamanho) };
  const total = await prisma.funcionario.count({ where });
  const paginacao = calcularPaginacao(total, parametros.pagina, parametros.tamanho);
  const linhas = await prisma.funcionario.findMany({ where, orderBy: ordenacao(parametros), skip: paginacao.skip, take: paginacao.take, select: selecaoDaLista });
  return { linhas: linhas.map(paraLista), paginacao };
}

export const LIMITE_EXPORTACAO_FUNCIONARIOS = 5000;

export async function listarFuncionariosParaExportar(parametros: ParametrosLista, filtros: FiltrosFuncionarios) {
  const where = await montarFiltro(parametros, filtros);
  if (!where) return { linhas: [] as FuncionarioDaLista[], truncado: false };
  const linhas = await prisma.funcionario.findMany({ where, orderBy: ordenacao(parametros), take: LIMITE_EXPORTACAO_FUNCIONARIOS + 1, select: selecaoDaLista });
  return { linhas: linhas.slice(0, LIMITE_EXPORTACAO_FUNCIONARIOS).map(paraLista), truncado: linhas.length > LIMITE_EXPORTACAO_FUNCIONARIOS };
}

export type FuncionarioDetalhe = {
  id: string;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  email: string | null;
  cargo: string | null;
  funcao: (typeof FUNCOES)[number];
  admissaoEm: string | null;
  demissaoEm: string | null;
  salarioBaseCentavos: number | null;
  custoHoraCentavos: number | null;
  usuarioId: string | null;
  observacoes: string | null;
  ativo: boolean;
  criadoEm: string;
};

export async function obterFuncionario(id: string): Promise<FuncionarioDetalhe | null> {
  const f = await prisma.funcionario.findFirst({ where: { id, deletadoEm: null } });
  if (!f) return null;
  return {
    id: f.id,
    nome: f.nome,
    cpf: f.cpf,
    telefone: f.telefone,
    email: f.email,
    cargo: f.cargo,
    funcao: f.funcao,
    admissaoEm: f.admissaoEm?.toISOString() ?? null,
    demissaoEm: f.demissaoEm?.toISOString() ?? null,
    salarioBaseCentavos: f.salarioBaseCentavos,
    custoHoraCentavos: f.custoHoraCentavos,
    usuarioId: f.usuarioId,
    observacoes: f.observacoes,
    ativo: f.ativo,
    criadoEm: f.criadoEm.toISOString(),
  };
}

/** Usuários que ainda não têm funcionário vinculado (mais o já vinculado a este, na edição). */
export async function listarUsuariosParaVinculo(funcionarioId?: string) {
  return prisma.usuario.findMany({
    where: {
      ativo: true,
      deletadoEm: null,
      OR: [{ funcionario: null }, ...(funcionarioId ? [{ funcionario: { id: funcionarioId } }] : [])],
    },
    select: { id: true, nome: true, login: true },
    orderBy: { nome: "asc" },
  });
}

/** Funcionário ativo com o mesmo CPF (aviso/recusa de cadastro repetido). */
export async function buscarFuncionarioPorCpf(cpf: string, exceto?: string) {
  return prisma.funcionario.findFirst({
    where: { cpf, deletadoEm: null, ...(exceto ? { id: { not: exceto } } : {}) },
    select: { id: true, nome: true },
  });
}

// ----- Equipes -----

export type EquipeDaLista = {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  membros: { id: string; nome: string; lider: boolean }[];
};

export async function listarEquipes(): Promise<EquipeDaLista[]> {
  const equipes = await prisma.equipe.findMany({
    where: { deletadoEm: null },
    orderBy: [{ ativo: "desc" }, { nome: "asc" }],
    include: {
      membros: {
        where: { deletadoEm: null, funcionario: { deletadoEm: null } },
        include: { funcionario: { select: { nome: true } } },
      },
    },
  });
  return equipes.map((e) => ({
    id: e.id,
    nome: e.nome,
    descricao: e.descricao,
    ativo: e.ativo,
    membros: e.membros
      .map((m) => ({ id: m.id, nome: m.funcionario.nome, lider: m.lider }))
      .sort((a, b) => Number(b.lider) - Number(a.lider) || a.nome.localeCompare(b.nome, "pt-BR")),
  }));
}

export async function obterEquipe(id: string): Promise<EquipeDaLista | null> {
  return (await listarEquipes()).find((e) => e.id === id) ?? null;
}

/** Funcionários ativos que ainda não estão na equipe (para o seletor de "adicionar pessoa"). */
export async function listarFuncionariosForaDaEquipe(equipeId: string) {
  return prisma.funcionario.findMany({
    where: { ativo: true, deletadoEm: null, NOT: { equipes: { some: { equipeId, deletadoEm: null } } } },
    select: { id: true, nome: true, funcao: true },
    orderBy: { nome: "asc" },
  });
}
