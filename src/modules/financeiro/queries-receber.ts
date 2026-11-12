import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { montarCobranca } from "@/lib/dominio/cobranca";
import { somarDias } from "@/lib/dominio/calendario";
import { situacaoDoTitulo, type ResumoDoTitulo, type StatusDoTitulo } from "@/lib/dominio/titulos";
import { calcularPaginacao, lerParametrosLista, type ParametrosBrutos, type ParametrosLista } from "@/lib/listas/parametros";

const comoData = (texto: string): Date => new Date(`${texto}T00:00:00Z`);
const comoTexto = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

export const ABAS_A_RECEBER = [
  { id: "abertas", rotulo: "Em aberto" },
  { id: "atrasadas", rotulo: "Atrasadas" },
  { id: "hoje", rotulo: "Vencem hoje" },
  { id: "proximos", rotulo: "Próximos dias" },
  { id: "aguardando", rotulo: "Aguardando etapa" },
  { id: "pagas", rotulo: "Pagas" },
  { id: "canceladas", rotulo: "Canceladas" },
  { id: "todas", rotulo: "Todas" },
] as const;

export type AbaAReceber = (typeof ABAS_A_RECEBER)[number]["id"];

export type FiltrosAReceber = {
  aba: AbaAReceber;
  nota: "sim" | "nao" | undefined;
  /** Filtro vindo de links (cliente ou obra). */
  clienteId: string | undefined;
  projetoId: string | undefined;
};

const ORDENAVEIS = ["vencimento", "valor", "cliente", "criadoEm"] as const;

const primeiro = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function lerListaAReceber(brutos: ParametrosBrutos): { parametros: ParametrosLista; filtros: FiltrosAReceber } {
  const parametros = lerParametrosLista(brutos, { ordenaveis: ORDENAVEIS, ordemPadrao: "vencimento", direcaoPadrao: "asc" });
  const aba = ABAS_A_RECEBER.find((a) => a.id === primeiro(brutos.aba))?.id ?? "abertas";
  const nota = primeiro(brutos.nota);
  const id = (v: string | string[] | undefined) => {
    const t = primeiro(v)?.trim();
    return t && t.length <= 64 ? t : undefined;
  };
  return { parametros, filtros: { aba, nota: nota === "sim" || nota === "nao" ? nota : undefined, clienteId: id(brutos.cliente), projetoId: id(brutos.obra) } };
}

const EM_ABERTO = ["ABERTA", "PARCIAL"] as const;

/** Condição de cada aba (datas de calendário; `hoje` e `limite` em "aaaa-mm-dd"). */
function condicaoDaAba(aba: AbaAReceber, hoje: string, limite: string): Prisma.ContaReceberWhereInput {
  switch (aba) {
    case "abertas":
      return { status: { in: [...EM_ABERTO] } };
    case "atrasadas":
      return { status: { in: [...EM_ABERTO] }, vencimento: { lt: comoData(hoje) } };
    case "hoje":
      return { status: { in: [...EM_ABERTO] }, vencimento: comoData(hoje) };
    case "proximos":
      return { status: { in: [...EM_ABERTO] }, vencimento: { gt: comoData(hoje), lte: comoData(limite) } };
    case "aguardando":
      return { status: "AGUARDANDO_GATILHO" };
    case "pagas":
      return { status: "PAGA" };
    case "canceladas":
      return { status: "CANCELADA" };
    case "todas":
      return {};
  }
}

function filtroBase(parametros: ParametrosLista, filtros: FiltrosAReceber): Prisma.ContaReceberWhereInput {
  const e: Prisma.ContaReceberWhereInput[] = [{ deletadoEm: null }];
  if (filtros.nota) e.push({ comNotaFiscal: filtros.nota === "sim" });
  if (filtros.clienteId) e.push({ clienteId: filtros.clienteId });
  if (filtros.projetoId) e.push({ projetoId: filtros.projetoId });
  if (parametros.busca) {
    const contem = { contains: parametros.busca, mode: "insensitive" as const };
    e.push({ OR: [{ descricao: contem }, { cliente: { nome: contem } }, { projeto: { titulo: contem } }, { projeto: { codigo: contem } }] });
  }
  return { AND: e };
}

export type ContaAReceberDaLista = {
  id: string;
  descricao: string;
  clienteId: string;
  clienteNome: string;
  projetoId: string | null;
  projetoCodigo: string | null;
  projetoTitulo: string | null;
  valorCentavos: number;
  valorPagoCentavos: number;
  vencimento: string | null;
  status: StatusDoTitulo;
  comNotaFiscal: boolean;
  forma: string | null;
  resumo: ResumoDoTitulo;
};

function ordenacao(p: ParametrosLista): Prisma.ContaReceberOrderByWithRelationInput[] {
  switch (p.ordem) {
    case "valor":
      return [{ valorCentavos: p.direcao }, { id: "asc" }];
    case "cliente":
      return [{ cliente: { nome: p.direcao } }, { vencimento: "asc" }, { id: "asc" }];
    case "criadoEm":
      return [{ criadoEm: p.direcao }, { id: "asc" }];
    default:
      return [{ vencimento: { sort: p.direcao, nulls: "last" } }, { criadoEm: "asc" }, { id: "asc" }];
  }
}

const selecaoDaLista = {
  id: true,
  descricao: true,
  clienteId: true,
  projetoId: true,
  valorCentavos: true,
  valorPagoCentavos: true,
  vencimento: true,
  status: true,
  comNotaFiscal: true,
  forma: true,
  cliente: { select: { nome: true } },
  projeto: { select: { codigo: true, titulo: true } },
} satisfies Prisma.ContaReceberSelect;

type Registro = Prisma.ContaReceberGetPayload<{ select: typeof selecaoDaLista }>;

function paraLista(r: Registro, hoje: string): ContaAReceberDaLista {
  const vencimento = comoTexto(r.vencimento);
  return {
    id: r.id,
    descricao: r.descricao,
    clienteId: r.clienteId,
    clienteNome: r.cliente.nome,
    projetoId: r.projetoId,
    projetoCodigo: r.projeto?.codigo ?? null,
    projetoTitulo: r.projeto?.titulo ?? null,
    valorCentavos: r.valorCentavos,
    valorPagoCentavos: r.valorPagoCentavos,
    vencimento,
    status: r.status,
    comNotaFiscal: r.comNotaFiscal,
    forma: r.forma,
    resumo: situacaoDoTitulo({ status: r.status, vencimento, valorCentavos: r.valorCentavos, valorPagoCentavos: r.valorPagoCentavos }, hoje),
  };
}

/** Janela "próximos N dias" (parâmetro de Configurações: `diasAlertaVencimento`). */
export function limiteDeVencimentoEmBreve(hoje: string, dias: number): string {
  return somarDias(hoje, dias);
}

export type ListaAReceber = {
  linhas: ContaAReceberDaLista[];
  paginacao: ReturnType<typeof calcularPaginacao>;
  contagens: Record<AbaAReceber, number>;
  /** Totais da aba atual (com os mesmos filtros): quanto falta receber e quanto está atrasado. */
  totais: { saldoCentavos: number; atrasadoCentavos: number };
};

export const LIMITE_EXPORTACAO_A_RECEBER = 5000;

export async function listarContasAReceber(parametros: ParametrosLista, filtros: FiltrosAReceber, hoje: string, diasEmBreve: number): Promise<ListaAReceber> {
  const limite = limiteDeVencimentoEmBreve(hoje, diasEmBreve);
  const base = filtroBase(parametros, filtros);
  const where: Prisma.ContaReceberWhereInput = { AND: [base, condicaoDaAba(filtros.aba, hoje, limite)] };

  const total = await prisma.contaReceber.count({ where });
  const paginacao = calcularPaginacao(total, parametros.pagina, parametros.tamanho);

  const [linhas, contagensLista, somaDaAba, somaAtrasada] = await Promise.all([
    prisma.contaReceber.findMany({ where, orderBy: ordenacao(parametros), skip: paginacao.skip, take: paginacao.take, select: selecaoDaLista }),
    Promise.all(ABAS_A_RECEBER.map((a) => prisma.contaReceber.count({ where: { AND: [base, condicaoDaAba(a.id, hoje, limite)] } }))),
    // Conta cancelada não é dinheiro a receber: fica fora dos totais (em qualquer aba).
    prisma.contaReceber.aggregate({ where: { AND: [where, { status: { not: "CANCELADA" } }] }, _sum: { valorCentavos: true, valorPagoCentavos: true } }),
    prisma.contaReceber.aggregate({ where: { AND: [base, condicaoDaAba("atrasadas", hoje, limite)] }, _sum: { valorCentavos: true, valorPagoCentavos: true } }),
  ]);
  const contagens = Object.fromEntries(ABAS_A_RECEBER.map((a, i) => [a.id, contagensLista[i]])) as Record<AbaAReceber, number>;
  const saldo = (s: { _sum: { valorCentavos: number | null; valorPagoCentavos: number | null } }) => (s._sum.valorCentavos ?? 0) - (s._sum.valorPagoCentavos ?? 0);
  return { linhas: linhas.map((r) => paraLista(r, hoje)), paginacao, contagens, totais: { saldoCentavos: saldo(somaDaAba), atrasadoCentavos: saldo(somaAtrasada) } };
}

export async function listarContasAReceberParaExportar(parametros: ParametrosLista, filtros: FiltrosAReceber, hoje: string, diasEmBreve: number) {
  const where: Prisma.ContaReceberWhereInput = { AND: [filtroBase(parametros, filtros), condicaoDaAba(filtros.aba, hoje, limiteDeVencimentoEmBreve(hoje, diasEmBreve))] };
  const linhas = await prisma.contaReceber.findMany({ where, orderBy: ordenacao(parametros), take: LIMITE_EXPORTACAO_A_RECEBER + 1, select: selecaoDaLista });
  return { linhas: linhas.slice(0, LIMITE_EXPORTACAO_A_RECEBER).map((r) => paraLista(r, hoje)), truncado: linhas.length > LIMITE_EXPORTACAO_A_RECEBER };
}

export type RecebimentoDaConta = {
  id: string;
  data: string;
  valorCentavos: number;
  contaNome: string;
  forma: string | null;
  comNotaFiscal: boolean;
  estornadoEm: Date | null;
  motivoEstorno: string | null;
};

export type ContaAReceberDetalhe = ContaAReceberDaLista & {
  ordem: number;
  percentualPb: number | null;
  gatilho: string | null;
  observacao: string | null;
  categoriaFinanceiraId: string | null;
  cliente: { id: string; nome: string; nomeFantasia: string | null; telefone: string | null; whatsapp: string | null };
  /** Etapa cuja conclusão libera esta parcela (quando aguarda ou foi liberada por ela). */
  etapa: { id: string; nome: string; status: string; fimPrevisto: string | null } | null;
  chamadoId: string | null;
  recebimentos: RecebimentoDaConta[];
};

export async function obterContaAReceber(id: string, hoje: string): Promise<ContaAReceberDetalhe | null> {
  const r = await prisma.contaReceber.findFirst({
    where: { id, deletadoEm: null },
    include: {
      cliente: { select: { id: true, nome: true, nomeFantasia: true, telefone: true, whatsapp: true } },
      projeto: { select: { codigo: true, titulo: true } },
      chamado: { select: { id: true } },
      lancamentos: { orderBy: [{ data: "asc" }, { criadoEm: "asc" }], select: { id: true, data: true, valorCentavos: true, forma: true, comNotaFiscal: true, estornadoEm: true, motivoEstorno: true, contaFinanceira: { select: { nome: true } } } },
    },
  });
  if (!r) return null;
  const etapa = r.gatilho && r.projetoId && (r.gatilho === "ENTREGA_MATERIAL" || r.gatilho === "ENTREGA_E_INSTALACAO")
    ? await prisma.etapaProjeto.findFirst({ where: { projetoId: r.projetoId, liberaGatilho: r.gatilho, deletadoEm: null }, select: { id: true, nome: true, status: true, fimPrevisto: true } })
    : null;
  const vencimento = comoTexto(r.vencimento);
  return {
    id: r.id,
    descricao: r.descricao,
    clienteId: r.clienteId,
    clienteNome: r.cliente.nome,
    projetoId: r.projetoId,
    projetoCodigo: r.projeto?.codigo ?? null,
    projetoTitulo: r.projeto?.titulo ?? null,
    valorCentavos: r.valorCentavos,
    valorPagoCentavos: r.valorPagoCentavos,
    vencimento,
    status: r.status,
    comNotaFiscal: r.comNotaFiscal,
    forma: r.forma,
    resumo: situacaoDoTitulo({ status: r.status, vencimento, valorCentavos: r.valorCentavos, valorPagoCentavos: r.valorPagoCentavos }, hoje),
    ordem: r.ordem,
    percentualPb: r.percentualPb,
    gatilho: r.gatilho,
    observacao: r.observacao,
    categoriaFinanceiraId: r.categoriaFinanceiraId,
    cliente: r.cliente,
    etapa: etapa ? { id: etapa.id, nome: etapa.nome, status: etapa.status, fimPrevisto: comoTexto(etapa.fimPrevisto) } : null,
    chamadoId: r.chamado?.id ?? null,
    recebimentos: r.lancamentos.map((l) => ({
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

/** Mensagem de cobrança por WhatsApp (modelo editável `whatsapp.cobranca`): valor = saldo devedor. */
export async function montarCobrancaDaConta(c: ContaAReceberDetalhe, nomeFantasia: string | null): Promise<{ texto: string | null; link: string | null; faltando: string[] }> {
  const modelo = await prisma.modeloTexto.findFirst({ where: { chave: "whatsapp.cobranca", ativo: true, deletadoEm: null }, select: { conteudo: true } });
  if (!modelo) return { texto: null, link: null, faltando: ["modelo de texto (Configurações → Modelos de texto)"] };
  const r = montarCobranca(modelo.conteudo, {
    clienteNome: c.cliente.nome,
    nomeFantasia,
    saldoCentavos: c.resumo.saldoCentavos,
    vencimento: c.vencimento,
    obra: c.projetoTitulo,
    telefone: c.cliente.whatsapp || c.cliente.telefone,
  });
  return { texto: r.texto, link: r.link, faltando: r.faltando };
}

export type ParametrosFinanceiros = { diasAlertaVencimento: number; diasLembreteCobranca: number; mesesRecorrenciaAFrente: number; categoriaReceitaPadraoId: string | null };

export async function lerParametrosFinanceiros(): Promise<ParametrosFinanceiros> {
  const c = await prisma.configuracaoEmpresa.findUnique({
    where: { id: "singleton" },
    select: { diasAlertaVencimento: true, diasLembreteCobranca: true, mesesRecorrenciaAFrente: true, categoriaReceitaPadraoId: true },
  });
  return {
    diasAlertaVencimento: c?.diasAlertaVencimento ?? 7,
    diasLembreteCobranca: c?.diasLembreteCobranca ?? 0,
    mesesRecorrenciaAFrente: c?.mesesRecorrenciaAFrente ?? 3,
    categoriaReceitaPadraoId: c?.categoriaReceitaPadraoId ?? null,
  };
}

export type FinanceiroDoCliente = {
  saldoCentavos: number;
  atrasadoCentavos: number;
  recebidoCentavos: number;
  contas: ContaAReceberDaLista[];
};

/** Resumo para a aba "Financeiro" da ficha do cliente (cancelada não conta nos totais). */
export async function financeiroDoCliente(clienteId: string, hoje: string): Promise<FinanceiroDoCliente> {
  const registros = await prisma.contaReceber.findMany({
    where: { clienteId, deletadoEm: null },
    orderBy: [{ vencimento: { sort: "asc", nulls: "last" } }, { criadoEm: "asc" }],
    select: selecaoDaLista,
  });
  const contas = registros.map((r) => paraLista(r, hoje));
  let saldo = 0;
  let atrasado = 0;
  let recebido = 0;
  for (const c of contas) {
    if (c.status === "CANCELADA") continue;
    recebido += c.valorPagoCentavos;
    saldo += c.resumo.saldoCentavos;
    if (c.resumo.situacao === "ATRASADO") atrasado += c.resumo.saldoCentavos;
  }
  return { saldoCentavos: saldo, atrasadoCentavos: atrasado, recebidoCentavos: recebido, contas };
}
