import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { somarDias } from "@/lib/dominio/calendario";
import { situacaoDoTitulo, type ResumoDoTitulo, type StatusDoTitulo } from "@/lib/dominio/titulos";
import { calcularPaginacao, lerParametrosLista, type ParametrosBrutos, type ParametrosLista } from "@/lib/listas/parametros";

const comoData = (texto: string): Date => new Date(`${texto}T00:00:00Z`);
const comoTexto = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

export const ABAS_A_PAGAR = [
  { id: "abertas", rotulo: "Em aberto" },
  { id: "atrasadas", rotulo: "Atrasadas" },
  { id: "hoje", rotulo: "Vencem hoje" },
  { id: "proximos", rotulo: "Próximos dias" },
  { id: "pagas", rotulo: "Pagas" },
  { id: "canceladas", rotulo: "Canceladas" },
  { id: "todas", rotulo: "Todas" },
] as const;

export type AbaAPagar = (typeof ABAS_A_PAGAR)[number]["id"];

export type FiltrosAPagar = {
  aba: AbaAPagar;
  fornecedorId: string | undefined;
  categoriaId: string | undefined;
  projetoId: string | undefined;
  recorrenciaId: string | undefined;
};

const ORDENAVEIS = ["vencimento", "valor", "descricao"] as const;
const primeiro = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const idCurto = (v: string | string[] | undefined) => {
  const t = primeiro(v)?.trim();
  return t && t.length <= 64 ? t : undefined;
};

export function lerListaAPagar(brutos: ParametrosBrutos): { parametros: ParametrosLista; filtros: FiltrosAPagar } {
  const parametros = lerParametrosLista(brutos, { ordenaveis: ORDENAVEIS, ordemPadrao: "vencimento", direcaoPadrao: "asc" });
  const aba = ABAS_A_PAGAR.find((a) => a.id === primeiro(brutos.aba))?.id ?? "abertas";
  return { parametros, filtros: { aba, fornecedorId: idCurto(brutos.fornecedor), categoriaId: idCurto(brutos.categoria), projetoId: idCurto(brutos.obra), recorrenciaId: idCurto(brutos.recorrencia) } };
}

const EM_ABERTO = ["ABERTA", "PARCIAL"] as const;

function condicaoDaAba(aba: AbaAPagar, hoje: string, limite: string): Prisma.ContaPagarWhereInput {
  switch (aba) {
    case "abertas":
      return { status: { in: [...EM_ABERTO] } };
    case "atrasadas":
      return { status: { in: [...EM_ABERTO] }, vencimento: { lt: comoData(hoje) } };
    case "hoje":
      return { status: { in: [...EM_ABERTO] }, vencimento: comoData(hoje) };
    case "proximos":
      return { status: { in: [...EM_ABERTO] }, vencimento: { gt: comoData(hoje), lte: comoData(limite) } };
    case "pagas":
      return { status: "PAGA" };
    case "canceladas":
      return { status: "CANCELADA" };
    case "todas":
      return {};
  }
}

function filtroBase(parametros: ParametrosLista, filtros: FiltrosAPagar): Prisma.ContaPagarWhereInput {
  const e: Prisma.ContaPagarWhereInput[] = [{ deletadoEm: null }];
  if (filtros.fornecedorId) e.push({ fornecedorId: filtros.fornecedorId });
  if (filtros.categoriaId) e.push({ categoriaId: filtros.categoriaId });
  if (filtros.projetoId) e.push({ projetoId: filtros.projetoId });
  if (filtros.recorrenciaId) e.push({ recorrenciaId: filtros.recorrenciaId });
  if (parametros.busca) {
    const contem = { contains: parametros.busca, mode: "insensitive" as const };
    e.push({
      OR: [
        { descricao: contem },
        { favorecido: contem },
        { fornecedor: { razaoSocial: contem } },
        { fornecedor: { nomeFantasia: contem } },
        { funcionario: { nome: contem } },
        { categoria: { nome: contem } },
        { projeto: { titulo: contem } },
      ],
    });
  }
  return { AND: e };
}

const selecaoDaLista = {
  id: true,
  descricao: true,
  valorCentavos: true,
  valorPagoCentavos: true,
  vencimento: true,
  status: true,
  favorecido: true,
  parcelaNumero: true,
  parcelaTotal: true,
  recorrenciaId: true,
  fornecedor: { select: { razaoSocial: true, nomeFantasia: true } },
  funcionario: { select: { nome: true } },
  categoria: { select: { nome: true } },
  projeto: { select: { codigo: true, titulo: true } },
} satisfies Prisma.ContaPagarSelect;

type Registro = Prisma.ContaPagarGetPayload<{ select: typeof selecaoDaLista }>;

export type ContaAPagarDaLista = {
  id: string;
  descricao: string;
  /** Para quem se paga: fornecedor, funcionário ou o nome livre. */
  favorecido: string | null;
  categoria: string | null;
  obra: string | null;
  valorCentavos: number;
  valorPagoCentavos: number;
  vencimento: string;
  status: StatusDoTitulo;
  recorrente: boolean;
  resumo: ResumoDoTitulo;
};

function paraLista(r: Registro, hoje: string): ContaAPagarDaLista {
  const vencimento = comoTexto(r.vencimento)!;
  return {
    id: r.id,
    descricao: r.descricao,
    favorecido: r.fornecedor ? r.fornecedor.nomeFantasia?.trim() || r.fornecedor.razaoSocial : (r.funcionario?.nome ?? r.favorecido),
    categoria: r.categoria?.nome ?? null,
    obra: r.projeto ? `${r.projeto.codigo} · ${r.projeto.titulo}` : null,
    valorCentavos: r.valorCentavos,
    valorPagoCentavos: r.valorPagoCentavos,
    vencimento,
    status: r.status,
    recorrente: r.recorrenciaId !== null,
    resumo: situacaoDoTitulo({ status: r.status, vencimento, valorCentavos: r.valorCentavos, valorPagoCentavos: r.valorPagoCentavos }, hoje),
  };
}

function ordenacao(p: ParametrosLista): Prisma.ContaPagarOrderByWithRelationInput[] {
  switch (p.ordem) {
    case "valor":
      return [{ valorCentavos: p.direcao }, { id: "asc" }];
    case "descricao":
      return [{ descricao: p.direcao }, { vencimento: "asc" }, { id: "asc" }];
    default:
      return [{ vencimento: p.direcao }, { descricao: "asc" }, { id: "asc" }];
  }
}

export type ListaAPagar = {
  linhas: ContaAPagarDaLista[];
  paginacao: ReturnType<typeof calcularPaginacao>;
  contagens: Record<AbaAPagar, number>;
  totais: { saldoCentavos: number; atrasadoCentavos: number };
};

export const LIMITE_EXPORTACAO_A_PAGAR = 5000;

export async function listarContasAPagar(parametros: ParametrosLista, filtros: FiltrosAPagar, hoje: string, diasEmBreve: number): Promise<ListaAPagar> {
  const limite = somarDias(hoje, diasEmBreve);
  const base = filtroBase(parametros, filtros);
  const where: Prisma.ContaPagarWhereInput = { AND: [base, condicaoDaAba(filtros.aba, hoje, limite)] };
  const total = await prisma.contaPagar.count({ where });
  const paginacao = calcularPaginacao(total, parametros.pagina, parametros.tamanho);

  const [linhas, contagensLista, somaDaAba, somaAtrasada] = await Promise.all([
    prisma.contaPagar.findMany({ where, orderBy: ordenacao(parametros), skip: paginacao.skip, take: paginacao.take, select: selecaoDaLista }),
    Promise.all(ABAS_A_PAGAR.map((a) => prisma.contaPagar.count({ where: { AND: [base, condicaoDaAba(a.id, hoje, limite)] } }))),
    prisma.contaPagar.aggregate({ where, _sum: { valorCentavos: true, valorPagoCentavos: true } }),
    prisma.contaPagar.aggregate({ where: { AND: [base, condicaoDaAba("atrasadas", hoje, limite)] }, _sum: { valorCentavos: true, valorPagoCentavos: true } }),
  ]);
  const contagens = Object.fromEntries(ABAS_A_PAGAR.map((a, i) => [a.id, contagensLista[i]])) as Record<AbaAPagar, number>;
  const saldo = (s: { _sum: { valorCentavos: number | null; valorPagoCentavos: number | null } }) => (s._sum.valorCentavos ?? 0) - (s._sum.valorPagoCentavos ?? 0);
  return { linhas: linhas.map((r) => paraLista(r, hoje)), paginacao, contagens, totais: { saldoCentavos: saldo(somaDaAba), atrasadoCentavos: saldo(somaAtrasada) } };
}

export async function listarContasAPagarParaExportar(parametros: ParametrosLista, filtros: FiltrosAPagar, hoje: string, diasEmBreve: number) {
  const where: Prisma.ContaPagarWhereInput = { AND: [filtroBase(parametros, filtros), condicaoDaAba(filtros.aba, hoje, somarDias(hoje, diasEmBreve))] };
  const linhas = await prisma.contaPagar.findMany({ where, orderBy: ordenacao(parametros), take: LIMITE_EXPORTACAO_A_PAGAR + 1, select: selecaoDaLista });
  return { linhas: linhas.slice(0, LIMITE_EXPORTACAO_A_PAGAR).map((r) => paraLista(r, hoje)), truncado: linhas.length > LIMITE_EXPORTACAO_A_PAGAR };
}

export type PagamentoDaConta = {
  id: string;
  data: string;
  valorCentavos: number;
  contaNome: string;
  forma: string | null;
  comNotaFiscal: boolean;
  estornadoEm: Date | null;
  motivoEstorno: string | null;
};

export type ContaAPagarDetalhe = ContaAPagarDaLista & {
  competencia: string;
  forma: string | null;
  observacao: string | null;
  categoriaId: string | null;
  parcela: { numero: number; total: number } | null;
  recorrencia: { id: string; periodicidade: string; diaVencimento: number; ativo: boolean } | null;
  fornecedorId: string | null;
  projetoId: string | null;
  pagamentos: PagamentoDaConta[];
};

export async function obterContaAPagar(id: string, hoje: string): Promise<ContaAPagarDetalhe | null> {
  const r = await prisma.contaPagar.findFirst({
    where: { id, deletadoEm: null },
    include: {
      fornecedor: { select: { razaoSocial: true, nomeFantasia: true } },
      funcionario: { select: { nome: true } },
      categoria: { select: { nome: true } },
      projeto: { select: { codigo: true, titulo: true } },
      recorrencia: { select: { id: true, periodicidade: true, diaVencimento: true, ativo: true } },
      lancamentos: { orderBy: [{ data: "asc" }, { criadoEm: "asc" }], select: { id: true, data: true, valorCentavos: true, forma: true, comNotaFiscal: true, estornadoEm: true, motivoEstorno: true, contaFinanceira: { select: { nome: true } } } },
    },
  });
  if (!r) return null;
  const lista = paraLista(r, hoje);
  return {
    ...lista,
    competencia: comoTexto(r.competencia)!,
    forma: r.forma,
    observacao: r.observacao,
    categoriaId: r.categoriaId,
    parcela: r.parcelaNumero && r.parcelaTotal ? { numero: r.parcelaNumero, total: r.parcelaTotal } : null,
    recorrencia: r.recorrencia,
    fornecedorId: r.fornecedorId,
    projetoId: r.projetoId,
    pagamentos: r.lancamentos.map((l) => ({
      id: l.id,
      data: l.data.toISOString().slice(0, 10),
      valorCentavos: l.valorCentavos,
      contaNome: l.contaFinanceira.nome,
      forma: l.forma,
      comNotaFiscal: l.comNotaFiscal,
      estornadoEm: l.estornadoEm,
      motivoEstorno: l.motivoEstorno,
    })),
  };
}

export type RecorrenciaDaLista = {
  id: string;
  descricao: string;
  valorCentavos: number;
  periodicidade: "MENSAL" | "TRIMESTRAL" | "ANUAL";
  diaVencimento: number;
  inicio: string;
  fim: string | null;
  ativo: boolean;
  favorecido: string | null;
  categoriaId: string | null;
  categoria: string | null;
  fornecedorId: string | null;
  funcionarioId: string | null;
  favorecidoLivre: string | null;
  forma: string | null;
  observacao: string | null;
  proximoVencimento: string | null;
  emAberto: number;
};

export async function listarRecorrencias(hoje: string): Promise<RecorrenciaDaLista[]> {
  const lista = await prisma.recorrenciaPagar.findMany({
    where: { deletadoEm: null },
    orderBy: [{ ativo: "desc" }, { descricao: "asc" }],
    include: { fornecedor: { select: { razaoSocial: true, nomeFantasia: true } }, funcionario: { select: { nome: true } }, categoria: { select: { nome: true } } },
  });
  const proximas = await prisma.contaPagar.groupBy({
    by: ["recorrenciaId"],
    where: { recorrenciaId: { in: lista.map((r) => r.id) }, status: { in: ["ABERTA", "PARCIAL"] }, deletadoEm: null, vencimento: { gte: comoData(hoje) } },
    _min: { vencimento: true },
    _count: { _all: true },
  });
  const porId = new Map(proximas.map((p) => [p.recorrenciaId, p]));
  return lista.map((r) => ({
    id: r.id,
    descricao: r.descricao,
    valorCentavos: r.valorCentavos,
    periodicidade: r.periodicidade,
    diaVencimento: r.diaVencimento,
    inicio: comoTexto(r.inicio)!,
    fim: comoTexto(r.fim),
    ativo: r.ativo,
    favorecido: r.fornecedor ? r.fornecedor.nomeFantasia?.trim() || r.fornecedor.razaoSocial : (r.funcionario?.nome ?? r.favorecido),
    categoriaId: r.categoriaId,
    categoria: r.categoria?.nome ?? null,
    fornecedorId: r.fornecedorId,
    funcionarioId: r.funcionarioId,
    favorecidoLivre: r.favorecido,
    forma: r.forma,
    observacao: r.observacao,
    proximoVencimento: comoTexto(porId.get(r.id)?._min.vencimento ?? null),
    emAberto: porId.get(r.id)?._count._all ?? 0,
  }));
}

export type OpcoesDeContaAPagar = {
  contas: { id: string; nome: string }[];
  categoriasDeDespesa: { id: string; nome: string }[];
  fornecedores: { id: string; nome: string }[];
  funcionarios: { id: string; nome: string }[];
  obras: { id: string; nome: string }[];
};

/** Listas para o formulário de conta a pagar (só ativos). Obras: as que podem ter custo (aprovadas até concluídas). */
export async function opcoesDeContaAPagar(): Promise<OpcoesDeContaAPagar> {
  const [contas, categorias, fornecedores, funcionarios, obras] = await Promise.all([
    prisma.contaFinanceira.findMany({ where: { ativo: true, deletadoEm: null }, orderBy: [{ ordem: "asc" }, { nome: "asc" }], select: { id: true, nome: true } }),
    prisma.categoriaFinanceira.findMany({ where: { tipo: "DESPESA", ativo: true, deletadoEm: null }, orderBy: [{ ordem: "asc" }, { nome: "asc" }], select: { id: true, nome: true } }),
    prisma.fornecedor.findMany({ where: { ativo: true, deletadoEm: null }, orderBy: { razaoSocial: "asc" }, select: { id: true, razaoSocial: true, nomeFantasia: true } }),
    prisma.funcionario.findMany({ where: { ativo: true, deletadoEm: null }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.projeto.findMany({ where: { deletadoEm: null, status: { in: ["APROVADO", "EM_EXECUCAO", "CONCLUIDO"] } }, orderBy: { criadoEm: "desc" }, take: 200, select: { id: true, codigo: true, titulo: true } }),
  ]);
  return {
    contas,
    categoriasDeDespesa: categorias,
    fornecedores: fornecedores.map((f) => ({ id: f.id, nome: f.nomeFantasia?.trim() || f.razaoSocial })),
    funcionarios,
    obras: obras.map((o) => ({ id: o.id, nome: `${o.codigo} · ${o.titulo}` })),
  };
}
