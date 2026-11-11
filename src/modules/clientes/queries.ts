import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { chavesDeDuplicidade } from "@/lib/dominio/duplicidade";
import { preencherModelo } from "@/lib/dominio/modelos-texto";
import { calcularPaginacao, lerParametrosLista, padraoLike, type ParametrosBrutos, type ParametrosLista } from "@/lib/listas/parametros";
import { somenteDigitos } from "@/lib/validadores";

import { ORIGENS } from "./schemas";

export const CONFIG_LISTA_CLIENTES = { ordenaveis: ["nome", "criadoEm"], ordemPadrao: "nome" } as const;

export const MARCACOES = ["clienteFinal", "arquiteto", "construtora", "empresa"] as const;
export type Marcacao = (typeof MARCACOES)[number];
export const ROTULO_MARCACAO: Record<Marcacao, string> = {
  clienteFinal: "Cliente final",
  arquiteto: "Arquiteto/designer",
  construtora: "Construtora",
  empresa: "Empresa",
};

export type FiltrosClientes = {
  tipo?: "PF" | "PJ";
  marcacao?: Marcacao;
  origem?: (typeof ORIGENS)[number];
  situacao: "ativos" | "inativos" | "todos";
};

function um(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

export function lerFiltrosClientes(brutos: ParametrosBrutos): FiltrosClientes {
  const tipo = um(brutos.tipo);
  const marcacao = um(brutos.marcacao);
  const origem = um(brutos.origem);
  const situacao = um(brutos.situacao);
  return {
    tipo: tipo === "PF" || tipo === "PJ" ? tipo : undefined,
    marcacao: (MARCACOES as readonly string[]).includes(marcacao ?? "") ? (marcacao as Marcacao) : undefined,
    origem: (ORIGENS as readonly string[]).includes(origem ?? "") ? (origem as FiltrosClientes["origem"]) : undefined,
    situacao: situacao === "inativos" || situacao === "todos" ? situacao : "ativos",
  };
}

export function lerListaClientes(brutos: ParametrosBrutos) {
  return { parametros: lerParametrosLista(brutos, CONFIG_LISTA_CLIENTES), filtros: lerFiltrosClientes(brutos) };
}

/**
 * Ids dos clientes que combinam com o texto digitado, sem diferenciar acento nem maiúscula.
 * Usa exatamente a expressão do índice trigram (`f_unaccent(lower(...))`) para a busca ser rápida.
 * Também acha por pedaço de CPF/CNPJ ou telefone (só dígitos) e por e-mail.
 */
async function idsPorBusca(termo: string): Promise<string[]> {
  const texto = padraoLike(termo.toLowerCase());
  const digitos = somenteDigitos(termo);
  const porDigitos = digitos.length >= 3 ? `%${digitos}%` : null;
  const linhas = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Cliente"
     WHERE "deletadoEm" IS NULL
       AND ( public.f_unaccent(lower("nome" || ' ' || coalesce("nomeFantasia", ''))) LIKE public.f_unaccent(${texto})
          OR lower(coalesce("email", '')) LIKE ${texto}
          OR (${porDigitos}::text IS NOT NULL
              AND ("cpfCnpj" LIKE ${porDigitos} OR "telefone" LIKE ${porDigitos} OR "whatsapp" LIKE ${porDigitos})) )
     LIMIT 2000`;
  return linhas.map((l) => l.id);
}

async function montarFiltro(parametros: ParametrosLista, filtros: FiltrosClientes, soParceiros: boolean): Promise<Prisma.ClienteWhereInput | null> {
  const ids = parametros.busca ? await idsPorBusca(parametros.busca) : null;
  if (ids && ids.length === 0) return null; // nada combina: evita consultar à toa
  return {
    deletadoEm: null,
    ...(filtros.situacao === "ativos" ? { ativo: true } : filtros.situacao === "inativos" ? { ativo: false } : {}),
    ...(filtros.tipo ? { tipoPessoa: filtros.tipo } : {}),
    ...(filtros.marcacao ? { [filtros.marcacao]: true } : {}),
    ...(filtros.origem ? { origem: filtros.origem } : {}),
    ...(soParceiros ? { OR: [{ arquiteto: true }, { construtora: true }] } : {}),
    ...(ids ? { id: { in: ids } } : {}),
  };
}

export type ClienteDaLista = {
  id: string;
  nome: string;
  nomeFantasia: string | null;
  tipoPessoa: "PF" | "PJ";
  cpfCnpj: string | null;
  telefone: string | null;
  whatsapp: string | null;
  email: string | null;
  marcacoes: Marcacao[];
  origem: string | null;
  ativo: boolean;
  criadoEm: string;
  /** Quantos clientes este indicou (só na visão de parceiros). */
  indicados: number;
};

const selecaoDaLista = {
  id: true,
  nome: true,
  nomeFantasia: true,
  tipoPessoa: true,
  cpfCnpj: true,
  telefone: true,
  whatsapp: true,
  email: true,
  clienteFinal: true,
  arquiteto: true,
  construtora: true,
  empresa: true,
  origem: true,
  ativo: true,
  criadoEm: true,
  _count: { select: { indicados: { where: { deletadoEm: null } } } },
} satisfies Prisma.ClienteSelect;

type LinhaBruta = Prisma.ClienteGetPayload<{ select: typeof selecaoDaLista }>;

function paraLista(c: LinhaBruta): ClienteDaLista {
  return {
    id: c.id,
    nome: c.nome,
    nomeFantasia: c.nomeFantasia,
    tipoPessoa: c.tipoPessoa,
    cpfCnpj: c.cpfCnpj,
    telefone: c.telefone,
    whatsapp: c.whatsapp,
    email: c.email,
    marcacoes: MARCACOES.filter((m) => c[m]),
    origem: c.origem,
    ativo: c.ativo,
    criadoEm: c.criadoEm.toISOString(),
    indicados: c._count.indicados,
  };
}

export async function listarClientes(parametros: ParametrosLista, filtros: FiltrosClientes, opcoes: { soParceiros?: boolean } = {}) {
  const where = await montarFiltro(parametros, filtros, opcoes.soParceiros ?? false);
  if (!where) return { linhas: [] as ClienteDaLista[], paginacao: calcularPaginacao(0, 1, parametros.tamanho) };

  const total = await prisma.cliente.count({ where });
  const paginacao = calcularPaginacao(total, parametros.pagina, parametros.tamanho);
  const orderBy: Prisma.ClienteOrderByWithRelationInput[] =
    parametros.ordem === "criadoEm" ? [{ criadoEm: parametros.direcao }, { nome: "asc" }] : [{ nome: parametros.direcao }, { criadoEm: "desc" }];

  const linhas = await prisma.cliente.findMany({ where, orderBy, skip: paginacao.skip, take: paginacao.take, select: selecaoDaLista });
  return { linhas: linhas.map(paraLista), paginacao };
}

/** Limite de linhas de uma exportação (o arquivo avisa quando for cortado). */
export const LIMITE_EXPORTACAO_CLIENTES = 5000;

export async function listarClientesParaExportar(parametros: ParametrosLista, filtros: FiltrosClientes, opcoes: { soParceiros?: boolean } = {}) {
  const where = await montarFiltro(parametros, filtros, opcoes.soParceiros ?? false);
  if (!where) return { linhas: [] as ClienteDaLista[], truncado: false };
  const orderBy: Prisma.ClienteOrderByWithRelationInput[] =
    parametros.ordem === "criadoEm" ? [{ criadoEm: parametros.direcao }, { nome: "asc" }] : [{ nome: parametros.direcao }];
  const linhas = await prisma.cliente.findMany({ where, orderBy, take: LIMITE_EXPORTACAO_CLIENTES + 1, select: selecaoDaLista });
  return { linhas: linhas.slice(0, LIMITE_EXPORTACAO_CLIENTES).map(paraLista), truncado: linhas.length > LIMITE_EXPORTACAO_CLIENTES };
}

export type ClienteDetalhe = {
  id: string;
  tipoPessoa: "PF" | "PJ";
  nome: string;
  nomeFantasia: string | null;
  cpfCnpj: string | null;
  telefone: string | null;
  whatsapp: string | null;
  email: string | null;
  marcacoes: Marcacao[];
  origem: (typeof ORIGENS)[number] | null;
  origemDetalhe: string | null;
  indicadoPor: { id: string; nome: string } | null;
  observacoes: string | null;
  ativo: boolean;
  criadoEm: string;
  qtdEnderecos: number;
  qtdContatos: number;
  qtdIndicados: number;
};

export async function obterCliente(id: string): Promise<ClienteDetalhe | null> {
  const c = await prisma.cliente.findFirst({
    where: { id, deletadoEm: null },
    include: {
      indicadoPor: { select: { id: true, nome: true, deletadoEm: true } },
      _count: {
        select: {
          enderecos: { where: { deletadoEm: null } },
          contatos: { where: { deletadoEm: null } },
          indicados: { where: { deletadoEm: null } },
        },
      },
    },
  });
  if (!c) return null;
  return {
    id: c.id,
    tipoPessoa: c.tipoPessoa,
    nome: c.nome,
    nomeFantasia: c.nomeFantasia,
    cpfCnpj: c.cpfCnpj,
    telefone: c.telefone,
    whatsapp: c.whatsapp,
    email: c.email,
    marcacoes: MARCACOES.filter((m) => c[m]),
    origem: c.origem,
    origemDetalhe: c.origemDetalhe,
    indicadoPor: c.indicadoPor && !c.indicadoPor.deletadoEm ? { id: c.indicadoPor.id, nome: c.indicadoPor.nome } : null,
    observacoes: c.observacoes,
    ativo: c.ativo,
    criadoEm: c.criadoEm.toISOString(),
    qtdEnderecos: c._count.enderecos,
    qtdContatos: c._count.contatos,
    qtdIndicados: c._count.indicados,
  };
}

export async function listarEnderecos(clienteId: string) {
  return prisma.enderecoCliente.findMany({
    where: { clienteId, deletadoEm: null },
    orderBy: [{ tipo: "asc" }, { criadoEm: "asc" }],
  });
}

export async function listarContatos(clienteId: string) {
  return prisma.contatoCliente.findMany({ where: { clienteId, deletadoEm: null }, orderBy: { criadoEm: "asc" } });
}

export type InteracaoItem = {
  id: string;
  tipo: string;
  texto: string;
  criadoEm: string;
  autor: string | null;
};

export async function listarInteracoes(clienteId: string, limite = 100): Promise<InteracaoItem[]> {
  const itens = await prisma.interacao.findMany({
    where: { clienteId, deletadoEm: null },
    orderBy: { criadoEm: "desc" },
    take: limite,
  });
  const ids = Array.from(new Set(itens.map((i) => i.criadoPorId).filter((id): id is string => !!id)));
  const usuarios = ids.length ? await prisma.usuario.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } }) : [];
  const nomes = new Map(usuarios.map((u) => [u.id, u.nome]));
  return itens.map((i) => ({
    id: i.id,
    tipo: i.tipo,
    texto: i.texto,
    criadoEm: i.criadoEm.toISOString(),
    autor: i.criadoPorId ? (nomes.get(i.criadoPorId) ?? null) : null,
  }));
}

export type Duplicado = { id: string; nome: string; motivo: string };

/**
 * Clientes (não excluídos) com o mesmo CPF/CNPJ ou o mesmo telefone/WhatsApp. É um aviso, não um
 * bloqueio: a spec manda avisar e oferecer abrir o existente. `exceto` evita achar o próprio cadastro.
 */
export async function buscarDuplicados(dados: { cpfCnpj?: string | null; telefone?: string | null; whatsapp?: string | null }, exceto?: string): Promise<Duplicado[]> {
  const chaves = chavesDeDuplicidade(dados);
  // Na edição, só avisa do que mudou: um cadastro que já nasceu repetido (alguém confirmou "assim mesmo")
  // não pode pedir confirmação a cada vez que o nome ou as observações forem editados.
  if (exceto) {
    const atual = await prisma.cliente.findFirst({ where: { id: exceto }, select: { cpfCnpj: true, telefone: true, whatsapp: true } });
    if (atual) {
      if (chaves.documento && chaves.documento === atual.cpfCnpj) chaves.documento = null;
      chaves.telefones = chaves.telefones.filter((t) => t !== atual.telefone && t !== atual.whatsapp);
    }
  }
  const condicoes: Prisma.ClienteWhereInput[] = [];
  if (chaves.documento) condicoes.push({ cpfCnpj: chaves.documento });
  if (chaves.telefones.length) {
    condicoes.push({ telefone: { in: chaves.telefones } }, { whatsapp: { in: chaves.telefones } });
  }
  if (condicoes.length === 0) return [];

  const achados = await prisma.cliente.findMany({
    where: { deletadoEm: null, ...(exceto ? { id: { not: exceto } } : {}), OR: condicoes },
    select: { id: true, nome: true, cpfCnpj: true, telefone: true, whatsapp: true },
    take: 5,
    orderBy: { criadoEm: "asc" },
  });
  return achados.map((c) => {
    const porDocumento = !!chaves.documento && c.cpfCnpj === chaves.documento;
    const porTelefone = chaves.telefones.some((t) => t === c.telefone || t === c.whatsapp);
    const motivo = porDocumento && porTelefone ? "mesmo CPF/CNPJ e mesmo telefone" : porDocumento ? "mesmo CPF/CNPJ" : "mesmo telefone";
    return { id: c.id, nome: c.nome, motivo };
  });
}

/** Resultado enxuto para o campo "indicado por" (busca enquanto a pessoa digita). */
export async function buscarClientesParaSelecao(termo: string, exceto?: string): Promise<{ id: string; nome: string }[]> {
  const ids = await idsPorBusca(termo);
  if (ids.length === 0) return [];
  return prisma.cliente.findMany({
    where: { id: { in: ids }, deletadoEm: null, ativo: true, ...(exceto ? { NOT: { id: exceto } } : {}) },
    select: { id: true, nome: true },
    orderBy: { nome: "asc" },
    take: 8,
  });
}

/** Modelo de WhatsApp para o botão da ficha do cliente (conteúdo vem de Configurações). */
export async function obterModeloWhatsApp(chave: string): Promise<string | null> {
  const m = await prisma.modeloTexto.findFirst({ where: { chave, ativo: true, deletadoEm: null }, select: { conteudo: true } });
  return m?.conteudo ?? null;
}

/**
 * Mensagens de WhatsApp que já podem sair prontas para este cliente: só os modelos cujas variáveis
 * todas têm valor agora (cliente e empresa). Modelos que pedem proposta, parcela ou visita aparecem
 * nas telas dessas fases, quando houver o dado.
 */
export async function listarMensagensProntas(valores: Record<string, string | undefined>): Promise<{ titulo: string; texto: string }[]> {
  const modelos = await prisma.modeloTexto.findMany({
    where: { categoria: "WHATSAPP", ativo: true, deletadoEm: null },
    orderBy: { ordem: "asc" },
    select: { titulo: true, conteudo: true },
  });
  return modelos.flatMap((m) => {
    const { texto, faltando } = preencherModelo(m.conteudo, valores);
    return faltando.length === 0 ? [{ titulo: m.titulo.replace(/^WhatsApp:\s*/i, ""), texto }] : [];
  });
}
