import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { limitesDoDia } from "@/lib/dominio/agenda";
import { somarDias } from "@/lib/dominio/calendario";
import { COLUNAS_DO_FUNIL, diasParado, FASES_ABERTAS, TODOS_OS_STATUS, type StatusProjeto } from "@/lib/dominio/funil";
import { dataLocalDoInstante, hojeCalendario, dataParaInput, inputParaData, instanteDeDataHoraLocal } from "@/lib/formatadores";
import { calcularPaginacao, lerParametrosLista, padraoLike, type ParametrosBrutos, type ParametrosLista } from "@/lib/listas/parametros";
import { ORIGENS } from "@/modules/clientes/schemas";
import { obterConfiguracao } from "@/modules/configuracoes/queries";

import { PORTES, TEMPERATURAS } from "./schemas";

export const CONFIG_LISTA_PROJETOS = { ordenaveis: ["codigo", "titulo", "cliente", "valor", "movimentacao", "criadoEm"], ordemPadrao: "movimentacao", direcaoPadrao: "desc" } as const;

export type FiltrosProjetos = {
  /** Uma fase específica, ou "abertos" (as 5 fases do funil comercial). */
  status?: StatusProjeto | "abertos";
  responsavelId?: string;
  origem?: (typeof ORIGENS)[number];
  porte?: (typeof PORTES)[number];
  temperatura?: (typeof TEMPERATURAS)[number];
  clienteId?: string;
  /** Datas de calendário (inclusive) sobre a data de criação. */
  de?: string;
  ate?: string;
  /** Só os que estão em "Proposta enviada"/"Negociação" parados além do prazo de "sem retorno". */
  semRetorno?: boolean;
};

function um(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

function dataValida(valor: string | undefined): string | undefined {
  return valor && inputParaData(valor) ? valor : undefined;
}

export function lerFiltrosProjetos(brutos: ParametrosBrutos): FiltrosProjetos {
  const status = um(brutos.status);
  const origem = um(brutos.origem);
  const porte = um(brutos.porte);
  const temperatura = um(brutos.temperatura);
  const responsavel = um(brutos.responsavel);
  const cliente = um(brutos.cliente);
  return {
    status: status === "abertos" ? "abertos" : (TODOS_OS_STATUS as readonly string[]).includes(status ?? "") ? (status as StatusProjeto) : undefined,
    responsavelId: responsavel && /^[\w-]{1,64}$/.test(responsavel) ? responsavel : undefined,
    origem: (ORIGENS as readonly string[]).includes(origem ?? "") ? (origem as FiltrosProjetos["origem"]) : undefined,
    porte: (PORTES as readonly string[]).includes(porte ?? "") ? (porte as FiltrosProjetos["porte"]) : undefined,
    temperatura: (TEMPERATURAS as readonly string[]).includes(temperatura ?? "") ? (temperatura as FiltrosProjetos["temperatura"]) : undefined,
    clienteId: cliente && /^[\w-]{1,64}$/.test(cliente) ? cliente : undefined,
    de: dataValida(um(brutos.de)),
    ate: dataValida(um(brutos.ate)),
    semRetorno: um(brutos.semRetorno) === "1" ? true : undefined,
  };
}

export function lerListaProjetos(brutos: ParametrosBrutos) {
  return { parametros: lerParametrosLista(brutos, CONFIG_LISTA_PROJETOS), filtros: lerFiltrosProjetos(brutos) };
}

/** Ids dos projetos cujo código, título ou cliente combinam com o texto (sem diferenciar acento nem maiúscula). */
async function idsPorBusca(termo: string): Promise<string[]> {
  const texto = padraoLike(termo.toLowerCase());
  const linhas = await prisma.$queryRaw<{ id: string }[]>`
    SELECT p.id FROM "Projeto" p
      JOIN "Cliente" c ON c.id = p."clienteId"
     WHERE p."deletadoEm" IS NULL
       AND ( public.f_unaccent(lower(p."codigo" || ' ' || p."titulo")) LIKE public.f_unaccent(${texto})
          OR public.f_unaccent(lower(c."nome" || ' ' || coalesce(c."nomeFantasia", ''))) LIKE public.f_unaccent(${texto}) )
     LIMIT 2000`;
  return linhas.map((l) => l.id);
}

/** Limite de "sem retorno": parado há MAIS de `dias` dias de calendário ⇔ última movimentação antes da meia-noite de (hoje − dias). */
export function limiteSemRetorno(dias: number, agora: Date = new Date()): Date {
  const hoje = dataLocalDoInstante(agora);
  return instanteDeDataHoraLocal(somarDias(hoje, -dias), "00:00") ?? agora;
}

export async function filtroDeProjetos(
  parametros: Pick<ParametrosLista, "busca">,
  filtros: FiltrosProjetos,
  opcoes: { ignorarStatus?: boolean } = {},
): Promise<Prisma.ProjetoWhereInput | null> {
  const ids = parametros.busca ? await idsPorBusca(parametros.busca) : null;
  if (ids && ids.length === 0) return null; // nada combina: evita consultar à toa

  const criadoEm: Prisma.DateTimeFilter = {};
  if (filtros.de) criadoEm.gte = limitesDoDia(filtros.de).inicio;
  if (filtros.ate) criadoEm.lt = limitesDoDia(filtros.ate).fim;

  const config = filtros.semRetorno ? await obterConfiguracao() : null;
  const dias = config?.diasSemRetornoProposta ?? 7;

  const status = opcoes.ignorarStatus ? undefined : filtros.status;
  return {
    deletadoEm: null,
    ...(status === "abertos" ? { status: { in: [...FASES_ABERTAS] } } : status ? { status } : {}),
    ...(filtros.semRetorno ? { status: { in: ["PROPOSTA_ENVIADA", "NEGOCIACAO"] as StatusProjeto[] }, ultimaMovimentacaoEm: { lt: limiteSemRetorno(dias) } } : {}),
    ...(filtros.responsavelId ? { responsavelId: filtros.responsavelId } : {}),
    ...(filtros.origem ? { origem: filtros.origem } : {}),
    ...(filtros.porte ? { porte: filtros.porte } : {}),
    ...(filtros.temperatura ? { temperatura: filtros.temperatura } : {}),
    ...(filtros.clienteId ? { clienteId: filtros.clienteId } : {}),
    ...(Object.keys(criadoEm).length ? { criadoEm } : {}),
    ...(ids ? { id: { in: ids } } : {}),
  };
}

export type ProjetoDaLista = {
  id: string;
  codigo: string;
  titulo: string;
  status: StatusProjeto;
  clienteId: string;
  clienteNome: string;
  responsavelNome: string | null;
  origem: string | null;
  porte: string | null;
  temperatura: string | null;
  valorEstimadoCentavos: number | null;
  diasParado: number;
  criadoEm: string;
};

const selecaoDaLista = {
  id: true,
  codigo: true,
  titulo: true,
  status: true,
  clienteId: true,
  origem: true,
  porte: true,
  temperatura: true,
  valorEstimadoCentavos: true,
  ultimaMovimentacaoEm: true,
  criadoEm: true,
  cliente: { select: { nome: true } },
  responsavel: { select: { nome: true } },
} satisfies Prisma.ProjetoSelect;

type LinhaBruta = Prisma.ProjetoGetPayload<{ select: typeof selecaoDaLista }>;

function paraLista(p: LinhaBruta, agora: Date): ProjetoDaLista {
  return {
    id: p.id,
    codigo: p.codigo,
    titulo: p.titulo,
    status: p.status,
    clienteId: p.clienteId,
    clienteNome: p.cliente.nome,
    responsavelNome: p.responsavel?.nome ?? null,
    origem: p.origem,
    porte: p.porte,
    temperatura: p.temperatura,
    valorEstimadoCentavos: p.valorEstimadoCentavos,
    diasParado: diasParado(p.ultimaMovimentacaoEm, agora),
    criadoEm: p.criadoEm.toISOString(),
  };
}

function ordenacao(parametros: ParametrosLista): Prisma.ProjetoOrderByWithRelationInput[] {
  const d = parametros.direcao;
  switch (parametros.ordem) {
    case "codigo":
      return [{ codigo: d }];
    case "titulo":
      return [{ titulo: d }, { codigo: "asc" }];
    case "cliente":
      return [{ cliente: { nome: d } }, { codigo: "asc" }];
    case "valor":
      return [{ valorEstimadoCentavos: { sort: d, nulls: "last" } }, { codigo: "asc" }];
    case "criadoEm":
      return [{ criadoEm: d }, { codigo: "asc" }];
    default:
      return [{ ultimaMovimentacaoEm: d }, { codigo: "asc" }];
  }
}

export async function listarProjetos(parametros: ParametrosLista, filtros: FiltrosProjetos) {
  const where = await filtroDeProjetos(parametros, filtros);
  if (!where) return { linhas: [] as ProjetoDaLista[], paginacao: calcularPaginacao(0, 1, parametros.tamanho) };

  const total = await prisma.projeto.count({ where });
  const paginacao = calcularPaginacao(total, parametros.pagina, parametros.tamanho);
  const agora = new Date();
  const linhas = await prisma.projeto.findMany({ where, orderBy: ordenacao(parametros), skip: paginacao.skip, take: paginacao.take, select: selecaoDaLista });
  return { linhas: linhas.map((p) => paraLista(p, agora)), paginacao };
}

export const LIMITE_EXPORTACAO_PROJETOS = 5000;

export async function listarProjetosParaExportar(parametros: ParametrosLista, filtros: FiltrosProjetos) {
  const where = await filtroDeProjetos(parametros, filtros);
  if (!where) return { linhas: [] as ProjetoDaLista[], truncado: false };
  const agora = new Date();
  const linhas = await prisma.projeto.findMany({ where, orderBy: ordenacao(parametros), take: LIMITE_EXPORTACAO_PROJETOS + 1, select: selecaoDaLista });
  return { linhas: linhas.slice(0, LIMITE_EXPORTACAO_PROJETOS).map((p) => paraLista(p, agora)), truncado: linhas.length > LIMITE_EXPORTACAO_PROJETOS };
}

// ---------------------------------------------------------------- Kanban

export type CartaoDoFunil = {
  id: string;
  codigo: string;
  titulo: string;
  status: StatusProjeto;
  clienteNome: string;
  responsavelNome: string | null;
  valorEstimadoCentavos: number | null;
  porte: string | null;
  temperatura: string | null;
  diasParado: number;
  proximaTarefa: { titulo: string; vencimento: string | null; vencida: boolean } | null;
};

export type ColunaDoFunil = {
  status: StatusProjeto;
  /** Quantos projetos há na coluna (podem ser mais do que os cartões mostrados). */
  total: number;
  valorEstimadoCentavos: number;
  cartoes: CartaoDoFunil[];
};

/** Quantos cartões mostrar em colunas que crescem sem parar (Aprovado e Perdidos). */
const CARTOES_DE_COLUNA_FECHADA = 20;
const CARTOES_DE_COLUNAS_ABERTAS = 400;

export async function carregarFunil(filtros: FiltrosProjetos, busca = ""): Promise<ColunaDoFunil[]> {
  // O funil mostra todas as colunas: o filtro de fase não se aplica.
  const base = await filtroDeProjetos({ busca }, filtros, { ignorarStatus: true });
  const vazio: ColunaDoFunil[] = COLUNAS_DO_FUNIL.map((status) => ({ status, total: 0, valorEstimadoCentavos: 0, cartoes: [] }));
  if (!base) return vazio;

  const noFunil = { ...base, status: { in: [...COLUNAS_DO_FUNIL] as StatusProjeto[] } };
  const ordem: Prisma.ProjetoOrderByWithRelationInput[] = [{ ultimaMovimentacaoEm: "desc" }, { codigo: "asc" }];
  const [totais, abertos, aprovados, perdidos] = await Promise.all([
    prisma.projeto.groupBy({ by: ["status"], where: noFunil, _count: { _all: true }, _sum: { valorEstimadoCentavos: true } }),
    prisma.projeto.findMany({ where: { ...base, status: { in: [...FASES_ABERTAS] } }, orderBy: ordem, take: CARTOES_DE_COLUNAS_ABERTAS, select: selecaoDaLista }),
    prisma.projeto.findMany({ where: { ...base, status: "APROVADO" }, orderBy: ordem, take: CARTOES_DE_COLUNA_FECHADA, select: selecaoDaLista }),
    prisma.projeto.findMany({ where: { ...base, status: "PERDIDO" }, orderBy: ordem, take: CARTOES_DE_COLUNA_FECHADA, select: selecaoDaLista }),
  ]);

  const projetos = [...abertos, ...aprovados, ...perdidos];
  const hoje = hojeCalendario();
  // A próxima tarefa de cada projeto: a aberta de vencimento mais próximo (sem data por último).
  const tarefas = projetos.length
    ? await prisma.tarefa.findMany({
        where: { projetoId: { in: projetos.map((p) => p.id) }, status: "ABERTA", deletadoEm: null },
        orderBy: [{ vencimento: { sort: "asc", nulls: "last" } }, { criadoEm: "asc" }],
        distinct: ["projetoId"],
        select: { projetoId: true, titulo: true, vencimento: true },
      })
    : [];
  const proximas = new Map(tarefas.map((t) => [t.projetoId, t]));
  const agora = new Date();

  const cartao = (p: LinhaBruta): CartaoDoFunil => {
    const t = proximas.get(p.id);
    return {
      id: p.id,
      codigo: p.codigo,
      titulo: p.titulo,
      status: p.status,
      clienteNome: p.cliente.nome,
      responsavelNome: p.responsavel?.nome ?? null,
      valorEstimadoCentavos: p.valorEstimadoCentavos,
      porte: p.porte,
      temperatura: p.temperatura,
      diasParado: diasParado(p.ultimaMovimentacaoEm, agora),
      proximaTarefa: t ? { titulo: t.titulo, vencimento: t.vencimento ? dataParaInput(t.vencimento) : null, vencida: !!t.vencimento && t.vencimento < hoje } : null,
    };
  };

  return COLUNAS_DO_FUNIL.map((status) => {
    const total = totais.find((t) => t.status === status);
    const origem = status === "APROVADO" ? aprovados : status === "PERDIDO" ? perdidos : abertos.filter((p) => p.status === status);
    return {
      status,
      total: total?._count._all ?? 0,
      valorEstimadoCentavos: total?._sum.valorEstimadoCentavos ?? 0,
      cartoes: origem.map(cartao),
    };
  });
}

// ---------------------------------------------------------------- Ficha

export type ProjetoCompleto = {
  id: string;
  codigo: string;
  titulo: string;
  status: StatusProjeto;
  cliente: { id: string; nome: string; telefone: string | null; whatsapp: string | null; email: string | null };
  enderecoObra: { id: string; texto: string } | null;
  arquiteto: { id: string; nome: string } | null;
  construtora: { id: string; nome: string } | null;
  responsavel: { id: string; nome: string } | null;
  tiposServico: string[];
  origem: string | null;
  origemDetalhe: string | null;
  porte: string | null;
  interesse: string;
  temperatura: string | null;
  faseDaObra: string | null;
  investimentoPrevistoCentavos: number | null;
  valorEstimadoCentavos: number | null;
  /** Soma das propostas aprovadas (R5). */
  valorFechadoCentavos: number | null;
  prazoDesejado: string | null;
  observacoes: string | null;
  motivoPerda: { id: string; nome: string } | null;
  motivoPerdaDetalhe: string | null;
  concorrente: string | null;
  perdidoEm: string | null;
  criadoEm: string;
  diasParado: number;
  qtdTarefasAbertas: number;
  qtdVisitas: number;
};

export async function obterProjeto(id: string): Promise<ProjetoCompleto | null> {
  const p = await prisma.projeto.findFirst({
    where: { id, deletadoEm: null },
    include: {
      cliente: { select: { id: true, nome: true, telefone: true, whatsapp: true, email: true } },
      enderecoObra: { select: { id: true, logradouro: true, numero: true, bairro: true, cidade: true, uf: true, apelido: true } },
      arquiteto: { select: { id: true, nome: true } },
      construtora: { select: { id: true, nome: true } },
      responsavel: { select: { id: true, nome: true } },
      motivoPerda: { select: { id: true, nome: true } },
      _count: { select: { tarefas: { where: { status: "ABERTA", deletadoEm: null } }, eventos: { where: { deletadoEm: null, tipo: "VISITA_TECNICA" } } } },
    },
  });
  if (!p) return null;
  const e = p.enderecoObra;
  const textoEndereco = e ? [e.apelido, [[e.logradouro, e.numero].filter(Boolean).join(", "), e.bairro, [e.cidade, e.uf].filter(Boolean).join("/")].filter(Boolean).join(" — ")].filter(Boolean).join(" · ") : "";
  return {
    id: p.id,
    codigo: p.codigo,
    titulo: p.titulo,
    status: p.status,
    cliente: p.cliente,
    enderecoObra: e ? { id: e.id, texto: textoEndereco || "Endereço sem detalhes" } : null,
    arquiteto: p.arquiteto,
    construtora: p.construtora,
    responsavel: p.responsavel,
    tiposServico: p.tiposServico,
    origem: p.origem,
    origemDetalhe: p.origemDetalhe,
    porte: p.porte,
    interesse: p.interesse,
    temperatura: p.temperatura,
    faseDaObra: p.faseDaObra,
    investimentoPrevistoCentavos: p.investimentoPrevistoCentavos,
    valorEstimadoCentavos: p.valorEstimadoCentavos,
    valorFechadoCentavos: p.valorFechadoCentavos,
    prazoDesejado: p.prazoDesejado,
    observacoes: p.observacoes,
    motivoPerda: p.motivoPerda,
    motivoPerdaDetalhe: p.motivoPerdaDetalhe,
    concorrente: p.concorrente,
    perdidoEm: p.perdidoEm?.toISOString() ?? null,
    criadoEm: p.criadoEm.toISOString(),
    diasParado: diasParado(p.ultimaMovimentacaoEm),
    qtdTarefasAbertas: p._count.tarefas,
    qtdVisitas: p._count.eventos,
  };
}

export async function listarMotivosPerda() {
  return prisma.motivoPerda.findMany({ where: { ativo: true, deletadoEm: null }, orderBy: [{ ordem: "asc" }, { nome: "asc" }], select: { id: true, nome: true } });
}

export type ProjetoDoCliente = { id: string; codigo: string; titulo: string; status: StatusProjeto; valorEstimadoCentavos: number | null; criadoEm: string };

export async function listarProjetosDoCliente(clienteId: string): Promise<ProjetoDoCliente[]> {
  const projetos = await prisma.projeto.findMany({
    where: { clienteId, deletadoEm: null },
    orderBy: { criadoEm: "desc" },
    take: 100,
    select: { id: true, codigo: true, titulo: true, status: true, valorEstimadoCentavos: true, criadoEm: true },
  });
  return projetos.map((p) => ({ ...p, criadoEm: p.criadoEm.toISOString() }));
}

/** Quantos projetos o cliente tem (para o número na aba da ficha). */
export async function contarProjetosDoCliente(clienteId: string): Promise<number> {
  return prisma.projeto.count({ where: { clienteId, deletadoEm: null } });
}
