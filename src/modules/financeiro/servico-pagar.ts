import "server-only";

import { randomUUID } from "node:crypto";

import type { Prisma } from "@/generated/prisma/client";
import { ErroNegocio } from "@/lib/acoes";
import { registrarAuditoria } from "@/lib/auditoria";
import { competenciaDe, gerarParcelamento, horizonteDaRecorrencia, ocorrenciasDaRecorrencia, somarMeses, ultimoDiaDoMes } from "@/lib/dominio/parcelamento";
import { ajustarValor, aplicarPagamento, podeCancelar, statusParaValores } from "@/lib/dominio/titulos";
import { dataLocalDoInstante, formatarMoeda } from "@/lib/formatadores";
import { registrarInteracao } from "@/modules/interacoes/registrar";

import type { DadosDaContaAPagar, DadosDaRecorrencia, DadosDoPagamento } from "./schemas";
import { registrarLancamento, type ContextoFinanceiro } from "./servico-lancamentos";

type Tx = Prisma.TransactionClient;
type Usuario = { id: string; nome: string } | null;

const comoData = (texto: string): Date => new Date(`${texto}T00:00:00Z`);
const comoTexto = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

type Vinculos = { fornecedorId: string | null; funcionarioId: string | null; categoriaId: string | null; projetoId?: string | null };

/** Confere que fornecedor, funcionário, obra e categoria (de despesa, ativa) existem: nunca confiar em ids do cliente. */
async function conferirVinculos(tx: Tx, v: Vinculos) {
  if (v.categoriaId) {
    const categoria = await tx.categoriaFinanceira.findFirst({ where: { id: v.categoriaId, tipo: "DESPESA", ativo: true, deletadoEm: null }, select: { id: true } });
    if (!categoria) throw new ErroNegocio("Escolha uma categoria de despesa ativa.", { categoriaId: "Escolha uma categoria de despesa." });
  }
  if (v.fornecedorId && !(await tx.fornecedor.findFirst({ where: { id: v.fornecedorId, deletadoEm: null }, select: { id: true } }))) {
    throw new ErroNegocio("Fornecedor não encontrado.", { fornecedorId: "Fornecedor inválido." });
  }
  if (v.funcionarioId && !(await tx.funcionario.findFirst({ where: { id: v.funcionarioId, deletadoEm: null }, select: { id: true } }))) {
    throw new ErroNegocio("Funcionário não encontrado.", { funcionarioId: "Funcionário inválido." });
  }
  if (v.projetoId && !(await tx.projeto.findFirst({ where: { id: v.projetoId, deletadoEm: null }, select: { id: true } }))) {
    throw new ErroNegocio("Obra não encontrada.", { projetoId: "Obra inválida." });
  }
}

// ---------------------------------------------------------------------------------------------------------
// Recorrência: gera as ocorrências (idempotente) e é estendida pelo cron
// ---------------------------------------------------------------------------------------------------------

type RecorrenciaRegistro = Awaited<ReturnType<Tx["recorrenciaPagar"]["findFirstOrThrow"]>>;

/**
 * Gera as ocorrências da recorrência com vencimento até `ate`. IDEMPOTENTE: a chave única (recorrência + competência)
 * faz o banco ignorar o que já existe, então rodar de novo (cron atrasado, duas vezes, retry) nunca duplica; uma
 * ocorrência cancelada continua existindo e por isso não é recriada. Devolve quantas criou.
 */
export async function gerarOcorrenciasDaRecorrencia(tx: Tx, r: RecorrenciaRegistro, ate: string, usuario: Usuario, hoje: string = dataLocalDoInstante(new Date())): Promise<number> {
  if (!r.ativo || r.deletadoEm) return 0;
  // Sem retroatividade absurda: início digitado no passado (ou com o ano errado) não gera dezenas de contas atrasadas; só
  // nascem as ocorrências do mês anterior em diante. Contas mais antigas, se existirem, entram à mão.
  const primeiraGerada = somarMeses(competenciaDe(hoje), -1);
  const de = comoTexto(r.inicio)! > primeiraGerada ? comoTexto(r.inicio)! : primeiraGerada;
  const ocorrencias = ocorrenciasDaRecorrencia(
    { diaVencimento: r.diaVencimento, periodicidade: r.periodicidade, inicio: comoTexto(r.inicio)!, fim: comoTexto(r.fim) },
    de,
    ate,
  );
  if (ocorrencias.length === 0) return 0;
  const criadas = await tx.contaPagar.createMany({
    data: ocorrencias.map((o) => ({
      descricao: r.descricao,
      fornecedorId: r.fornecedorId,
      funcionarioId: r.funcionarioId,
      favorecido: r.favorecido,
      categoriaId: r.categoriaId,
      valorCentavos: r.valorCentavos,
      vencimento: comoData(o.vencimento),
      competencia: comoData(o.competencia),
      forma: r.forma,
      recorrenciaId: r.id,
      observacao: r.observacao,
      criadoPorId: usuario?.id ?? null,
      atualizadoPorId: usuario?.id ?? null,
    })),
    skipDuplicates: true,
  });
  const ultima = ocorrencias[ocorrencias.length - 1].vencimento;
  if (!r.geradaAte || comoTexto(r.geradaAte)! < ultima) await tx.recorrenciaPagar.update({ where: { id: r.id }, data: { geradaAte: comoData(ultima) } });
  if (criadas.count > 0) {
    await registrarAuditoria(tx, { usuario, entidade: "RecorrenciaPagar", entidadeId: r.id, acao: "GERAR_OCORRENCIAS", depois: { criadas: criadas.count, ate }, ip: null });
  }
  return criadas.count;
}

/** Rotina diária: estende todas as recorrências ativas até o horizonte configurado. Idempotente. (`apenas` serve aos testes.) */
export async function estenderRecorrencias(tx: Tx, hoje: string, opcoes: { apenas?: string[] } = {}): Promise<{ recorrencias: number; ocorrenciasCriadas: number }> {
  const config = await tx.configuracaoEmpresa.findUnique({ where: { id: "singleton" }, select: { mesesRecorrenciaAFrente: true } });
  const ate = horizonteDaRecorrencia(hoje, config?.mesesRecorrenciaAFrente ?? 3);
  const lista = await tx.recorrenciaPagar.findMany({ where: { ativo: true, deletadoEm: null, ...(opcoes.apenas ? { id: { in: opcoes.apenas } } : {}) } });
  let criadas = 0;
  for (const r of lista) criadas += await gerarOcorrenciasDaRecorrencia(tx, r, ate, null, hoje);
  return { recorrencias: lista.length, ocorrenciasCriadas: criadas };
}

// ---------------------------------------------------------------------------------------------------------
// Criação: única, parcelada ou recorrente
// ---------------------------------------------------------------------------------------------------------

/** Cria a(s) conta(s) a pagar. Parcelada: o valor é o TOTAL (a última parcela absorve a diferença). Recorrente: o valor é o de cada ocorrência. */
export async function criarContasAPagar(tx: Tx, d: DadosDaContaAPagar & { compraId?: string | null }, ctx: ContextoFinanceiro): Promise<{ criadas: number; recorrenciaId: string | null; primeiraId: string }> {
  await conferirVinculos(tx, { fornecedorId: d.fornecedorId, funcionarioId: d.funcionarioId, categoriaId: d.categoriaId, projetoId: d.projetoId });
  const agora = ctx.agora ?? new Date();
  const base = {
    fornecedorId: d.fornecedorId,
    funcionarioId: d.funcionarioId,
    favorecido: d.favorecido,
    categoriaId: d.categoriaId,
    projetoId: d.projetoId,
    // Conta nascida de uma compra (Fase 6): o custo real da obra lê a COMPRA recebida, nunca esta conta (não contar em dobro).
    compraId: d.compraId ?? null,
    forma: d.forma,
    observacao: d.observacao,
    criadoPorId: ctx.usuario.id,
    atualizadoPorId: ctx.usuario.id,
  };

  if (d.modo === "RECORRENTE") {
    const dia = Number(d.vencimento.slice(8, 10));
    const r = await tx.recorrenciaPagar.create({
      data: {
        descricao: d.descricao,
        fornecedorId: d.fornecedorId,
        funcionarioId: d.funcionarioId,
        favorecido: d.favorecido,
        categoriaId: d.categoriaId,
        valorCentavos: d.valor,
        diaVencimento: dia,
        periodicidade: d.periodicidade,
        inicio: comoData(d.vencimento),
        fim: d.fimRecorrencia ? comoData(d.fimRecorrencia) : null,
        forma: d.forma,
        observacao: d.observacao,
        criadoPorId: ctx.usuario.id,
        atualizadoPorId: ctx.usuario.id,
      },
    });
    await registrarAuditoria(tx, { usuario: ctx.usuario, entidade: "RecorrenciaPagar", entidadeId: r.id, acao: "CRIAR", depois: r, ip: ctx.ip });
    const meses = (await tx.configuracaoEmpresa.findUnique({ where: { id: "singleton" }, select: { mesesRecorrenciaAFrente: true } }))?.mesesRecorrenciaAFrente ?? 3;
    // Gera ao menos até o primeiro vencimento (mesmo que ele esteja além do horizonte).
    const horizonte = horizonteDaRecorrencia(dataLocalDoInstante(agora), meses);
    const criadas = await gerarOcorrenciasDaRecorrencia(tx, r, horizonte > d.vencimento ? horizonte : d.vencimento, ctx.usuario);
    const primeira = await tx.contaPagar.findFirstOrThrow({ where: { recorrenciaId: r.id }, orderBy: { vencimento: "asc" }, select: { id: true } });
    return { criadas, recorrenciaId: r.id, primeiraId: primeira.id };
  }

  if (d.modo === "PARCELADA") {
    const parcelamentoId = randomUUID();
    const parcelas = gerarParcelamento(d.valor, d.parcelas, d.vencimento);
    const ids: string[] = [];
    for (const p of parcelas) {
      const c = await tx.contaPagar.create({
        data: {
          ...base,
          descricao: `${d.descricao} (${p.numero}/${p.total})`,
          valorCentavos: p.valorCentavos,
          vencimento: comoData(p.vencimento),
          competencia: comoData(p.competencia),
          parcelamentoId,
          parcelaNumero: p.numero,
          parcelaTotal: p.total,
        },
      });
      ids.push(c.id);
      await registrarAuditoria(tx, { usuario: ctx.usuario, entidade: "ContaPagar", entidadeId: c.id, acao: "CRIAR", depois: c, ip: ctx.ip });
    }
    return { criadas: ids.length, recorrenciaId: null, primeiraId: ids[0] };
  }

  const c = await tx.contaPagar.create({
    data: { ...base, descricao: d.descricao, valorCentavos: d.valor, vencimento: comoData(d.vencimento), competencia: comoData(competenciaDe(d.vencimento)) },
  });
  await registrarAuditoria(tx, { usuario: ctx.usuario, entidade: "ContaPagar", entidadeId: c.id, acao: "CRIAR", depois: c, ip: ctx.ip });
  return { criadas: 1, recorrenciaId: null, primeiraId: c.id };
}

// ---------------------------------------------------------------------------------------------------------
// Pagamento, ajuste, cancelamento
// ---------------------------------------------------------------------------------------------------------

async function travarConta(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "ContaPagar" WHERE "id" = ${id} AND "deletadoEm" IS NULL FOR UPDATE`;
  const conta = await tx.contaPagar.findFirst({ where: { id, deletadoEm: null }, include: { projeto: { select: { id: true, clienteId: true, codigo: true } } } });
  if (!conta) throw new ErroNegocio("Conta a pagar não encontrada.");
  return conta;
}

/** Baixa total ou parcial: cria o lançamento de saída, soma ao valor pago e recalcula o status (linha travada: nunca passa do valor). */
export async function registrarPagamento(tx: Tx, e: DadosDoPagamento, ctx: ContextoFinanceiro) {
  const conta = await travarConta(tx, e.contaPagarId);
  const r = aplicarPagamento({ status: conta.status, valorCentavos: conta.valorCentavos, valorPagoCentavos: conta.valorPagoCentavos }, e.valor);
  if (!r.ok) throw new ErroNegocio(r.erro, { valor: r.erro });
  if (!conta.categoriaId) throw new ErroNegocio("Esta conta não tem categoria: edite-a antes de pagar.");

  const lancamento = await registrarLancamento(
    tx,
    {
      data: e.data,
      tipo: "SAIDA",
      valorCentavos: e.valor,
      contaFinanceiraId: e.contaFinanceiraId,
      categoriaId: conta.categoriaId,
      descricao: `Pagamento: ${conta.descricao}`,
      forma: e.forma ?? conta.forma,
      comNotaFiscal: e.comNotaFiscal,
      fornecedorId: conta.fornecedorId,
      projetoId: conta.projetoId,
      contaPagarId: conta.id,
      observacao: e.observacao,
      vinculoExistente: true,
    },
    ctx,
  );
  const depois = await tx.contaPagar.update({
    where: { id: conta.id },
    data: { valorPagoCentavos: r.valorPagoCentavos, status: r.status as "PARCIAL" | "PAGA", forma: conta.forma ?? e.forma, atualizadoPorId: ctx.usuario.id },
  });
  await registrarAuditoria(tx, {
    usuario: ctx.usuario,
    entidade: "ContaPagar",
    entidadeId: conta.id,
    acao: "PAGAR",
    antes: { status: conta.status, valorPagoCentavos: conta.valorPagoCentavos },
    depois: { status: depois.status, valorPagoCentavos: depois.valorPagoCentavos, lancamentoId: lancamento.id },
    ip: ctx.ip,
  });
  if (conta.projeto) {
    await registrarInteracao(tx, {
      tipo: "SISTEMA",
      texto: `Pago ${formatarMoeda(e.valor)} de “${conta.descricao}”${r.status === "PAGA" ? " (conta quitada)" : ""}.`,
      clienteId: conta.projeto.clienteId,
      projetoId: conta.projeto.id,
      usuarioId: ctx.usuario.id,
    });
  }
  return { lancamentoId: lancamento.id, status: r.status };
}

/** Ajusta valor e/ou vencimento (com motivo, auditado). O valor nunca fica abaixo do que já foi pago. */
export async function ajustarContaAPagar(tx: Tx, e: { contaPagarId: string; valorCentavos: number | null; vencimento: string | null; motivo: string }, ctx: ContextoFinanceiro): Promise<void> {
  const conta = await travarConta(tx, e.contaPagarId);
  if (conta.status === "CANCELADA") throw new ErroNegocio("Esta conta está cancelada.");
  const mudancas: Prisma.ContaPagarUncheckedUpdateInput = {};
  if (e.valorCentavos !== null && e.valorCentavos !== conta.valorCentavos) {
    const r = ajustarValor({ status: conta.status, valorCentavos: conta.valorCentavos, valorPagoCentavos: conta.valorPagoCentavos }, e.valorCentavos);
    if (!r.ok) throw new ErroNegocio(r.erro, { valor: r.erro });
    mudancas.valorCentavos = e.valorCentavos;
    mudancas.status = r.status as "ABERTA" | "PARCIAL" | "PAGA";
  }
  if (e.vencimento !== null && e.vencimento !== comoTexto(conta.vencimento)) {
    if (conta.status === "PAGA") throw new ErroNegocio("A conta já está paga.", { vencimento: "Conta paga não muda de vencimento." });
    mudancas.vencimento = comoData(e.vencimento);
  }
  if (Object.keys(mudancas).length === 0) throw new ErroNegocio("Nada foi alterado.");
  const depois = await tx.contaPagar.update({ where: { id: conta.id }, data: { ...mudancas, atualizadoPorId: ctx.usuario.id } });
  await registrarAuditoria(tx, {
    usuario: ctx.usuario,
    entidade: "ContaPagar",
    entidadeId: conta.id,
    acao: "AJUSTAR",
    antes: { valorCentavos: conta.valorCentavos, vencimento: comoTexto(conta.vencimento), status: conta.status },
    depois: { valorCentavos: depois.valorCentavos, vencimento: comoTexto(depois.vencimento), status: depois.status, motivo: e.motivo },
    ip: ctx.ip,
  });
}

export async function cancelarContaAPagar(tx: Tx, contaPagarId: string, motivo: string, ctx: ContextoFinanceiro): Promise<void> {
  const conta = await travarConta(tx, contaPagarId);
  const pode = podeCancelar({ status: conta.status, valorCentavos: conta.valorCentavos, valorPagoCentavos: conta.valorPagoCentavos });
  if (!pode.ok) throw new ErroNegocio(pode.erro);
  const depois = await tx.contaPagar.update({ where: { id: conta.id }, data: { status: "CANCELADA", atualizadoPorId: ctx.usuario.id } });
  await registrarAuditoria(tx, { usuario: ctx.usuario, entidade: "ContaPagar", entidadeId: conta.id, acao: "CANCELAR", antes: { status: conta.status }, depois: { status: depois.status, motivo }, ip: ctx.ip });
}

export async function reabrirContaAPagar(tx: Tx, contaPagarId: string, ctx: ContextoFinanceiro): Promise<void> {
  const conta = await travarConta(tx, contaPagarId);
  if (conta.status !== "CANCELADA") throw new ErroNegocio("Só se reabre uma conta cancelada.");
  const status = statusParaValores(conta.valorCentavos, conta.valorPagoCentavos, "ABERTA") as "ABERTA" | "PARCIAL" | "PAGA";
  await tx.contaPagar.update({ where: { id: conta.id }, data: { status, atualizadoPorId: ctx.usuario.id } });
  await registrarAuditoria(tx, { usuario: ctx.usuario, entidade: "ContaPagar", entidadeId: conta.id, acao: "REABRIR", antes: { status: "CANCELADA" }, depois: { status }, ip: ctx.ip });
}

// ---------------------------------------------------------------------------------------------------------
// Edição e encerramento de recorrência
// ---------------------------------------------------------------------------------------------------------

/** Vencimento de uma ocorrência com outro dia do mês (em mês curto vale o último dia). */
function vencimentoComDia(competencia: string, dia: number): string {
  const [ano, mes] = competencia.split("-").map(Number);
  return `${competencia.slice(0, 8)}${String(Math.min(dia, ultimoDiaDoMes(ano, mes))).padStart(2, "0")}`;
}

/**
 * Edita o modelo da recorrência e propaga SÓ para as ocorrências futuras em aberto (sem pagamento e com vencimento de hoje em
 * diante). O que já venceu, foi pago ou foi cancelado fica como está. Ocorrências além do horizonte são geradas de novo
 * pela rotina com os valores novos.
 */
export async function editarRecorrencia(tx: Tx, d: DadosDaRecorrencia, ctx: ContextoFinanceiro): Promise<{ atualizadas: number }> {
  const antes = await tx.recorrenciaPagar.findFirst({ where: { id: d.recorrenciaId, deletadoEm: null } });
  if (!antes) throw new ErroNegocio("Recorrência não encontrada.");
  await conferirVinculos(tx, { fornecedorId: d.fornecedorId, funcionarioId: d.funcionarioId, categoriaId: d.categoriaId });
  if (d.fim && d.fim < comoTexto(antes.inicio)!) throw new ErroNegocio("O fim não pode ser antes do início.", { fim: "O fim não pode ser antes do início." });

  const depois = await tx.recorrenciaPagar.update({
    where: { id: antes.id },
    data: {
      descricao: d.descricao,
      fornecedorId: d.fornecedorId,
      funcionarioId: d.funcionarioId,
      favorecido: d.favorecido,
      categoriaId: d.categoriaId,
      valorCentavos: d.valor,
      diaVencimento: d.diaVencimento,
      fim: d.fim ? comoData(d.fim) : null,
      forma: d.forma,
      observacao: d.observacao,
      atualizadoPorId: ctx.usuario.id,
    },
  });
  await registrarAuditoria(tx, { usuario: ctx.usuario, entidade: "RecorrenciaPagar", entidadeId: antes.id, acao: "ATUALIZAR", antes, depois, ip: ctx.ip });

  const hoje = dataLocalDoInstante(ctx.agora ?? new Date());
  const futuras = await tx.contaPagar.findMany({
    where: { recorrenciaId: antes.id, status: "ABERTA", valorPagoCentavos: 0, vencimento: { gte: comoData(hoje) }, deletadoEm: null },
    select: { id: true, competencia: true },
  });
  for (const f of futuras) {
    await tx.contaPagar.update({
      where: { id: f.id },
      data: {
        descricao: d.descricao,
        fornecedorId: d.fornecedorId,
        funcionarioId: d.funcionarioId,
        favorecido: d.favorecido,
        categoriaId: d.categoriaId,
        valorCentavos: d.valor,
        vencimento: comoData(vencimentoComDia(comoTexto(f.competencia)!, d.diaVencimento)),
        forma: d.forma,
        observacao: d.observacao,
        atualizadoPorId: ctx.usuario.id,
      },
    });
  }
  if (futuras.length > 0) {
    await registrarAuditoria(tx, { usuario: ctx.usuario, entidade: "RecorrenciaPagar", entidadeId: antes.id, acao: "PROPAGAR", depois: { ocorrenciasAtualizadas: futuras.length }, ip: ctx.ip });
  }
  // Fim antecipado: as ocorrências já geradas depois do novo fim, ainda em aberto e sem pagamento, são canceladas.
  if (d.fim) {
    const alemDoFim = await tx.contaPagar.updateMany({
      where: { recorrenciaId: antes.id, status: "ABERTA", valorPagoCentavos: 0, vencimento: { gt: comoData(d.fim) }, deletadoEm: null },
      data: { status: "CANCELADA", atualizadoPorId: ctx.usuario.id },
    });
    if (alemDoFim.count > 0) {
      await registrarAuditoria(tx, { usuario: ctx.usuario, entidade: "RecorrenciaPagar", entidadeId: antes.id, acao: "CANCELAR_APOS_FIM", depois: { ocorrenciasCanceladas: alemDoFim.count, fim: d.fim }, ip: ctx.ip });
    }
  }
  return { atualizadas: futuras.length };
}

/** Encerra a recorrência: não gera mais ocorrências e cancela as futuras ainda em aberto e sem pagamento. As demais ficam como estão. */
export async function encerrarRecorrencia(tx: Tx, recorrenciaId: string, ctx: ContextoFinanceiro): Promise<{ canceladas: number }> {
  const antes = await tx.recorrenciaPagar.findFirst({ where: { id: recorrenciaId, deletadoEm: null } });
  if (!antes) throw new ErroNegocio("Recorrência não encontrada.");
  if (!antes.ativo) throw new ErroNegocio("Esta recorrência já está encerrada.");
  const hoje = dataLocalDoInstante(ctx.agora ?? new Date());
  const canceladas = await tx.contaPagar.updateMany({
    where: { recorrenciaId, status: "ABERTA", valorPagoCentavos: 0, vencimento: { gt: comoData(hoje) }, deletadoEm: null },
    data: { status: "CANCELADA", atualizadoPorId: ctx.usuario.id },
  });
  const depois = await tx.recorrenciaPagar.update({ where: { id: recorrenciaId }, data: { ativo: false, atualizadoPorId: ctx.usuario.id } });
  await registrarAuditoria(tx, { usuario: ctx.usuario, entidade: "RecorrenciaPagar", entidadeId: recorrenciaId, acao: "ENCERRAR", antes, depois: { ...depois, ocorrenciasCanceladas: canceladas.count }, ip: ctx.ip });
  return { canceladas: canceladas.count };
}
