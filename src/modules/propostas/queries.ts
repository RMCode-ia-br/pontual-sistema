import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { calcularPaginacao, lerParametrosLista, type ParametrosBrutos } from "@/lib/listas/parametros";
import { STATUS_PROPOSTA } from "./schemas";

export const CONFIG_LISTA_PROPOSTAS = { ordenaveis: ["numero", "data", "enviadaEm"], ordemPadrao: "numero", direcaoPadrao: "desc" } as const;

function um(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function lerListaPropostas(brutos: ParametrosBrutos) {
  const status = um(brutos.status);
  return {
    parametros: lerParametrosLista(brutos, CONFIG_LISTA_PROPOSTAS),
    filtros: {
      status: (STATUS_PROPOSTA as readonly string[]).includes(status ?? "") ? (status as (typeof STATUS_PROPOSTA)[number]) : undefined,
      projeto: um(brutos.projeto)?.slice(0, 64),
      // Por padrão só a revisão mais recente de cada número (as antigas aparecem com "todas as revisões").
      revisoes: um(brutos.revisoes) === "todas" ? ("todas" as const) : ("vigentes" as const),
    },
  };
}

type FiltrosPropostas = ReturnType<typeof lerListaPropostas>["filtros"];

function onde(busca: string, filtros: FiltrosPropostas): Prisma.PropostaWhereInput {
  const e: Prisma.PropostaWhereInput[] = [{ deletadoEm: null }, { projeto: { deletadoEm: null } }];
  if (filtros.status) e.push({ status: filtros.status });
  if (filtros.projeto) e.push({ projetoId: filtros.projeto });
  if (filtros.revisoes === "vigentes") e.push({ status: { not: "SUBSTITUIDA" } });
  if (busca) {
    e.push({ OR: [{ numero: { contains: busca, mode: "insensitive" } }, { clienteNome: { contains: busca, mode: "insensitive" } }, { projeto: { titulo: { contains: busca, mode: "insensitive" } } }, { projeto: { codigo: { contains: busca, mode: "insensitive" } } }] });
  }
  return { AND: e };
}

const selecaoLista = {
  id: true,
  numero: true,
  revisao: true,
  parte: true,
  status: true,
  data: true,
  enviadaEm: true,
  clienteNome: true,
  comNotaFiscal: true,
  valorAprovadoCentavos: true,
  projeto: { select: { id: true, codigo: true, titulo: true } },
  opcoes: { where: { deletadoEm: null }, orderBy: { ordem: "asc" as const }, select: { id: true, nome: true, descontoCentavos: true } },
  itens: { where: { deletadoEm: null }, select: { opcaoId: true, precoTotalCentavos: true } },
  acrescimoNotaPb: true,
} satisfies Prisma.PropostaSelect;

export async function listarPropostas(brutos: ParametrosBrutos) {
  const { parametros, filtros } = lerListaPropostas(brutos);
  const where = onde(parametros.busca, filtros);
  const total = await prisma.proposta.count({ where });
  const paginacao = calcularPaginacao(total, parametros.pagina, parametros.tamanho);
  const orderBy: Prisma.PropostaOrderByWithRelationInput[] =
    parametros.ordem === "data"
      ? [{ data: parametros.direcao }, { numeroSequencial: "desc" }]
      : parametros.ordem === "enviadaEm"
        ? [{ enviadaEm: { sort: parametros.direcao, nulls: "last" } }, { numeroSequencial: "desc" }]
        : [{ numeroSequencial: parametros.direcao }, { revisao: "desc" }];
  const linhas = await prisma.proposta.findMany({ where, orderBy, skip: (paginacao.pagina - 1) * parametros.tamanho, take: parametros.tamanho, select: selecaoLista });
  return { linhas, paginacao, parametros, filtros };
}

export type PropostaDaLista = Awaited<ReturnType<typeof listarPropostas>>["linhas"][number];

export async function listarPropostasDoProjeto(projetoId: string) {
  return prisma.proposta.findMany({
    where: { projetoId, deletadoEm: null },
    orderBy: [{ numeroSequencial: "desc" }, { revisao: "desc" }],
    select: selecaoLista,
  });
}

export async function obterPropostaParaEditor(id: string) {
  return prisma.proposta.findFirst({
    where: { id, deletadoEm: null, projeto: { deletadoEm: null } },
    include: {
      projeto: { select: { id: true, codigo: true, titulo: true, status: true, clienteId: true, cliente: { select: { id: true, nome: true } } } },
      opcoes: { where: { deletadoEm: null }, orderBy: { ordem: "asc" } },
      grupos: { where: { deletadoEm: null }, orderBy: { ordem: "asc" } },
      parcelas: { where: { deletadoEm: null }, orderBy: { ordem: "asc" } },
      itens: {
        where: { deletadoEm: null },
        orderBy: [{ ordem: "asc" }, { id: "asc" }],
        include: {
          medidas: { where: { deletadoEm: null }, orderBy: { ordem: "asc" } },
          tipologia: { select: { id: true, nome: true, tipoDesenho: true } },
          linha: { select: { nome: true } },
          acabamento: { select: { nome: true } },
          tipoVidro: { select: { nome: true } },
        },
      },
    },
  });
}

export type PropostaDoEditor = NonNullable<Awaited<ReturnType<typeof obterPropostaParaEditor>>>;

/** Catálogos e padrões que o editor precisa (tipologias ativas com template, condições, markups de Configurações). */
export async function listarOpcoesDoEditor() {
  const [tipologias, linhas, acabamentos, tiposVidro, espessuras, condicoes, config] = await Promise.all([
    prisma.tipologia.findMany({
      where: { deletadoEm: null, ativo: true },
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      select: { id: true, nome: true, tipoDesenho: true, opcoesFolhas: true, templateDescricao: true, cobrancaPadrao: true, categoriaMarkup: true, exigeEsquadria: true },
    }),
    prisma.linhaAluminio.findMany({ where: { deletadoEm: null, ativo: true }, orderBy: [{ ordem: "asc" }, { nome: "asc" }], select: { id: true, nome: true } }),
    prisma.acabamentoAluminio.findMany({ where: { deletadoEm: null, ativo: true }, orderBy: [{ ordem: "asc" }, { nome: "asc" }], select: { id: true, nome: true } }),
    prisma.tipoVidro.findMany({ where: { deletadoEm: null, ativo: true }, orderBy: [{ ordem: "asc" }, { nome: "asc" }], select: { id: true, nome: true } }),
    prisma.espessuraVidro.findMany({ where: { deletadoEm: null, ativo: true }, orderBy: { mm: "asc" }, select: { mm: true } }),
    prisma.condicaoPagamento.findMany({
      where: { deletadoEm: null, ativo: true },
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      select: { id: true, nome: true, textoLivre: true, parcelas: { where: { deletadoEm: null }, orderBy: { ordem: "asc" }, select: { descricao: true, percentualPb: true, gatilho: true, forma: true, diasApos: true, parcelasCartao: true } } },
    }),
    prisma.configuracaoEmpresa.findUnique({ where: { id: "singleton" }, select: { markupPadraoPb: true, markupVidroTemperadoPb: true, acrescimoNotaPb: true, margemMinimaAlertaPercentual: true } }),
  ]);
  return {
    tipologias,
    linhas,
    acabamentos,
    tiposVidro,
    espessuras: espessuras.map((e) => e.mm),
    condicoes,
    config: {
      markupPadraoPb: config?.markupPadraoPb ?? 8000,
      markupVidroTemperadoPb: config?.markupVidroTemperadoPb ?? 10000,
      acrescimoNotaPb: config?.acrescimoNotaPb ?? 500,
      margemMinimaAlerta: config?.margemMinimaAlertaPercentual === null || config?.margemMinimaAlertaPercentual === undefined ? null : Number(config.margemMinimaAlertaPercentual),
    },
  };
}

export async function listarProjetosParaProposta() {
  return prisma.projeto.findMany({
    where: { deletadoEm: null, status: { in: ["NOVO_LEAD", "VISITA_AGENDADA", "ELABORANDO_PROPOSTA", "PROPOSTA_ENVIADA", "NEGOCIACAO"] }, cliente: { deletadoEm: null } },
    orderBy: { criadoEm: "desc" },
    take: 300,
    select: { id: true, codigo: true, titulo: true, cliente: { select: { nome: true } } },
  });
}

/** Todas as revisões do mesmo número (da mais nova para a mais antiga). */
export async function listarRevisoes(numero: string) {
  return prisma.proposta.findMany({
    where: { numero, deletadoEm: null },
    orderBy: { revisao: "desc" },
    select: { id: true, revisao: true, status: true, enviadaEm: true },
  });
}

/**
 * R13: itens por composição cujo custo de algum insumo mudou DEPOIS de o preço ser calculado
 * ("custo desatualizado desde a emissão"). Só vale para proposta ainda em aberto.
 */
export async function itensComCustoDesatualizado(propostaId: string): Promise<number> {
  const itens = await prisma.itemProposta.findMany({
    where: { propostaId, deletadoEm: null, modoPreco: "COMPOSICAO", calculadoEm: { not: null }, tipologiaId: { not: null } },
    select: { calculadoEm: true, tipologia: { select: { insumos: { where: { deletadoEm: null, produtoId: { not: null } }, select: { produto: { select: { custoAtualizadoEm: true } } } } } } },
  });
  return itens.filter((i) => i.tipologia?.insumos.some((x) => x.produto?.custoAtualizadoEm && i.calculadoEm && x.produto.custoAtualizadoEm > i.calculadoEm)).length;
}

export async function listarMotivosDeRecusa() {
  return prisma.motivoPerda.findMany({ where: { ativo: true, deletadoEm: null }, orderBy: [{ ordem: "asc" }, { nome: "asc" }], select: { id: true, nome: true } });
}

export async function obterMensagemDeEnvio() {
  return prisma.modeloTexto.findFirst({ where: { chave: "whatsapp.envio_proposta", deletadoEm: null }, select: { conteudo: true } });
}
