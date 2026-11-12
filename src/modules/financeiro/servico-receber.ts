import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { ErroNegocio } from "@/lib/acoes";
import { registrarAuditoria } from "@/lib/auditoria";
import { dataDoLembreteDeCobranca } from "@/lib/dominio/cobranca";
import { ajustarValor, aplicarPagamento, podeCancelar, saldoDoTitulo, statusParaValores, type StatusDoTitulo } from "@/lib/dominio/titulos";
import { dataLocalDoInstante, formatarDataCalendario, formatarMoeda } from "@/lib/formatadores";
import { registrarInteracao } from "@/modules/interacoes/registrar";

import { registrarLancamento, type ContextoFinanceiro } from "./servico-lancamentos";
import { sincronizarTarefaDeCobranca } from "./tarefa-cobranca";

type Tx = Prisma.TransactionClient;

const comoData = (texto: string): Date => new Date(`${texto}T00:00:00Z`);
const comoTexto = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

type Forma = "PIX" | "TRANSFERENCIA" | "ESPECIE" | "CARTAO_CREDITO" | "BOLETO";

/** Trava a linha e devolve a conta a receber com o cliente e a obra (para descrever o lançamento). */
async function travarConta(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "ContaReceber" WHERE "id" = ${id} AND "deletadoEm" IS NULL FOR UPDATE`;
  const conta = await tx.contaReceber.findFirst({
    where: { id, deletadoEm: null },
    include: { cliente: { select: { id: true, nome: true } }, projeto: { select: { id: true, codigo: true, titulo: true } } },
  });
  if (!conta) throw new ErroNegocio("Conta a receber não encontrada.");
  return conta;
}

export type EntradaDeRecebimento = {
  contaReceberId: string;
  data: string;
  valorCentavos: number;
  contaFinanceiraId: string;
  categoriaId: string | null;
  forma: Forma | null;
  comNotaFiscal: boolean;
  observacao: string | null;
};

/**
 * Registra um recebimento (total ou parcial) de uma conta a receber: cria o lançamento de entrada, soma ao valor
 * recebido, recalcula o status, conclui a tarefa de cobrança quando quita e anota na linha do tempo do cliente e da obra.
 * Tudo na mesma transação, com a linha da conta travada: dois recebimentos simultâneos nunca passam do valor.
 */
export async function registrarRecebimento(tx: Tx, e: EntradaDeRecebimento, ctx: ContextoFinanceiro) {
  const conta = await travarConta(tx, e.contaReceberId);
  const r = aplicarPagamento({ status: conta.status, valorCentavos: conta.valorCentavos, valorPagoCentavos: conta.valorPagoCentavos }, e.valorCentavos);
  if (!r.ok) throw new ErroNegocio(r.erro, { valor: r.erro });

  const categoriaId = e.categoriaId ?? conta.categoriaFinanceiraId;
  if (!categoriaId) throw new ErroNegocio("Escolha a categoria da receita.", { categoriaId: "Escolha a categoria da receita." });

  const obra = conta.projeto ? ` (${conta.projeto.codigo})` : "";
  const lancamento = await registrarLancamento(
    tx,
    {
      data: e.data,
      tipo: "ENTRADA",
      valorCentavos: e.valorCentavos,
      contaFinanceiraId: e.contaFinanceiraId,
      categoriaId,
      descricao: `Recebimento: ${conta.descricao}${obra}`,
      forma: e.forma ?? conta.forma,
      comNotaFiscal: e.comNotaFiscal,
      projetoId: conta.projetoId,
      clienteId: conta.clienteId,
      contaReceberId: conta.id,
      observacao: e.observacao,
      vinculoExistente: e.categoriaId === null,
    },
    ctx,
  );

  const agora = ctx.agora ?? new Date();
  const depois = await tx.contaReceber.update({
    where: { id: conta.id },
    data: {
      valorPagoCentavos: r.valorPagoCentavos,
      status: r.status as "PARCIAL" | "PAGA",
      categoriaFinanceiraId: categoriaId,
      comNotaFiscal: e.comNotaFiscal,
      forma: conta.forma ?? e.forma,
      atualizadoPorId: ctx.usuario.id,
    },
  });
  await registrarAuditoria(tx, {
    usuario: ctx.usuario,
    entidade: "ContaReceber",
    entidadeId: conta.id,
    acao: "RECEBER",
    antes: { status: conta.status, valorPagoCentavos: conta.valorPagoCentavos, comNotaFiscal: conta.comNotaFiscal },
    depois: { status: depois.status, valorPagoCentavos: depois.valorPagoCentavos, comNotaFiscal: depois.comNotaFiscal, lancamentoId: lancamento.id },
    ip: ctx.ip,
  });
  await sincronizarTarefaDeCobranca(tx, conta.id, conta.status, r.status, agora);

  const saldo = saldoDoTitulo(conta.valorCentavos, r.valorPagoCentavos);
  await registrarInteracao(tx, {
    tipo: "SISTEMA",
    texto: `Recebido ${formatarMoeda(e.valorCentavos)} de “${conta.descricao}”. ${saldo === 0 ? "Parcela quitada." : `Restam ${formatarMoeda(saldo)}.`}`,
    clienteId: conta.clienteId,
    projetoId: conta.projetoId,
    usuarioId: ctx.usuario.id,
  });
  return { lancamentoId: lancamento.id, status: r.status, saldoCentavos: saldo };
}

/**
 * Ajusta o valor (desconto, correção) e/ou o vencimento, sempre com motivo (auditado). O valor nunca fica abaixo do que
 * já foi recebido; se igualar, a parcela quita. O vencimento só muda em parcela em aberto.
 */
export async function ajustarContaAReceber(tx: Tx, e: { contaReceberId: string; valorCentavos: number | null; vencimento: string | null; motivo: string }, ctx: ContextoFinanceiro): Promise<void> {
  const conta = await travarConta(tx, e.contaReceberId);
  if (conta.status === "CANCELADA") throw new ErroNegocio("Esta conta está cancelada.");
  const agora = ctx.agora ?? new Date();
  const mudancas: Record<string, unknown> = {};
  let status: StatusDoTitulo = conta.status;

  if (e.valorCentavos !== null && e.valorCentavos !== conta.valorCentavos) {
    const r = ajustarValor({ status: conta.status, valorCentavos: conta.valorCentavos, valorPagoCentavos: conta.valorPagoCentavos }, e.valorCentavos);
    if (!r.ok) throw new ErroNegocio(r.erro, { valor: r.erro });
    mudancas.valorCentavos = e.valorCentavos;
    status = r.status;
    mudancas.status = status;
  }
  if (e.vencimento !== null && e.vencimento !== comoTexto(conta.vencimento)) {
    if (conta.status === "AGUARDANDO_GATILHO") throw new ErroNegocio("A parcela ainda aguarda a etapa: libere-a antes de definir o vencimento.", { vencimento: "Libere a parcela primeiro." });
    if (conta.status === "PAGA") throw new ErroNegocio("A parcela já está paga.", { vencimento: "Parcela paga não muda de vencimento." });
    mudancas.vencimento = comoData(e.vencimento);
  }
  if (Object.keys(mudancas).length === 0) throw new ErroNegocio("Nada foi alterado.");

  const depois = await tx.contaReceber.update({ where: { id: conta.id }, data: { ...mudancas, atualizadoPorId: ctx.usuario.id } });
  await registrarAuditoria(tx, {
    usuario: ctx.usuario,
    entidade: "ContaReceber",
    entidadeId: conta.id,
    acao: "AJUSTAR",
    antes: { valorCentavos: conta.valorCentavos, vencimento: comoTexto(conta.vencimento), status: conta.status },
    depois: { valorCentavos: depois.valorCentavos, vencimento: comoTexto(depois.vencimento), status: depois.status, motivo: e.motivo },
    ip: ctx.ip,
  });
  await sincronizarTarefaDeCobranca(tx, conta.id, conta.status, status, agora);

  // A tarefa de cobrança ainda aberta acompanha o novo vencimento.
  if (mudancas.vencimento && depois.vencimento) {
    const dias = (await tx.configuracaoEmpresa.findUnique({ where: { id: "singleton" }, select: { diasLembreteCobranca: true } }))?.diasLembreteCobranca ?? 0;
    await tx.tarefa.updateMany({
      where: { chaveUnica: `cobranca:${conta.id}`, status: "ABERTA", deletadoEm: null },
      data: { vencimento: comoData(dataDoLembreteDeCobranca(comoTexto(depois.vencimento)!, dias, dataLocalDoInstante(agora))) },
    });
  }
  await registrarInteracao(tx, {
    tipo: "SISTEMA",
    texto: `Conta “${conta.descricao}” ajustada. Motivo: ${e.motivo}`,
    clienteId: conta.clienteId,
    projetoId: conta.projetoId,
    usuarioId: ctx.usuario.id,
  });
}

/**
 * "Cliente pediu até o dia X": registra a nova data prometida (histórico + cache) SEM mexer no vencimento original, que
 * continua mandando no atraso, no aging e na inadimplência. A data prometida só alimenta o fluxo projetado. Só em parcela
 * em aberto ou parcial; a data é de hoje em diante e depois do vencimento original. Auditado, com a tarefa de cobrança
 * acompanhando a promessa.
 */
export async function prorrogarContaAReceber(tx: Tx, e: { contaReceberId: string; dataPrometida: string; observacao: string | null }, ctx: ContextoFinanceiro): Promise<void> {
  const conta = await travarConta(tx, e.contaReceberId);
  if (conta.status !== "ABERTA" && conta.status !== "PARCIAL") throw new ErroNegocio("Só se registra prazo extra em parcela em aberto ou parcialmente recebida.");
  const vencimento = comoTexto(conta.vencimento);
  if (!vencimento) throw new ErroNegocio("A parcela não tem vencimento.");
  const agora = ctx.agora ?? new Date();
  const hoje = dataLocalDoInstante(agora);
  if (e.dataPrometida < hoje) throw new ErroNegocio("A data prometida não pode ser anterior a hoje.", { dataPrometida: "Use uma data de hoje em diante." });
  if (e.dataPrometida <= vencimento) throw new ErroNegocio("A data prometida precisa ser depois do vencimento original.", { dataPrometida: "Precisa ser depois do vencimento original." });
  const anterior = comoTexto(conta.dataPrometida);
  if (anterior === e.dataPrometida) throw new ErroNegocio("Essa já é a data prometida.", { dataPrometida: "Essa já é a data prometida." });

  await tx.prorrogacaoReceber.create({
    data: { contaReceberId: conta.id, dataAnterior: conta.dataPrometida, dataPrometida: comoData(e.dataPrometida), observacao: e.observacao, criadoPorId: ctx.usuario.id, atualizadoPorId: ctx.usuario.id },
  });
  await tx.contaReceber.update({ where: { id: conta.id }, data: { dataPrometida: comoData(e.dataPrometida), atualizadoPorId: ctx.usuario.id } });
  await registrarAuditoria(tx, {
    usuario: ctx.usuario,
    entidade: "ContaReceber",
    entidadeId: conta.id,
    acao: "PRORROGAR",
    antes: { dataPrometida: anterior, vencimento },
    depois: { dataPrometida: e.dataPrometida, vencimento, observacao: e.observacao },
    ip: ctx.ip,
  });

  // A tarefa de cobrança ainda aberta passa a lembrar na data prometida (o vencimento original não muda).
  const dias = (await tx.configuracaoEmpresa.findUnique({ where: { id: "singleton" }, select: { diasLembreteCobranca: true } }))?.diasLembreteCobranca ?? 0;
  await tx.tarefa.updateMany({
    where: { chaveUnica: `cobranca:${conta.id}`, status: "ABERTA", deletadoEm: null },
    data: { vencimento: comoData(dataDoLembreteDeCobranca(e.dataPrometida, dias, hoje)) },
  });
  await registrarInteracao(tx, {
    tipo: "SISTEMA",
    texto: `Cliente pediu mais prazo em “${conta.descricao}”: promete pagar até ${formatarDataCalendario(e.dataPrometida)} (vencimento original ${formatarDataCalendario(vencimento)}).${e.observacao ? ` ${e.observacao}` : ""}`,
    clienteId: conta.clienteId,
    projetoId: conta.projetoId,
    usuarioId: ctx.usuario.id,
  });
}

/** Cancela uma conta sem recebimento (com recebimento, estorna-se antes). A tarefa de cobrança é cancelada junto. */
export async function cancelarContaAReceber(tx: Tx, contaReceberId: string, motivo: string, ctx: ContextoFinanceiro): Promise<void> {
  const conta = await travarConta(tx, contaReceberId);
  const pode = podeCancelar({ status: conta.status, valorCentavos: conta.valorCentavos, valorPagoCentavos: conta.valorPagoCentavos });
  if (!pode.ok) throw new ErroNegocio(pode.erro);
  const depois = await tx.contaReceber.update({ where: { id: conta.id }, data: { status: "CANCELADA", atualizadoPorId: ctx.usuario.id } });
  await tx.tarefa.updateMany({ where: { chaveUnica: `cobranca:${conta.id}`, status: "ABERTA", deletadoEm: null }, data: { status: "CANCELADA" } });
  await registrarAuditoria(tx, {
    usuario: ctx.usuario,
    entidade: "ContaReceber",
    entidadeId: conta.id,
    acao: "CANCELAR",
    antes: { status: conta.status },
    depois: { status: depois.status, motivo },
    ip: ctx.ip,
  });
  await registrarInteracao(tx, { tipo: "SISTEMA", texto: `Conta “${conta.descricao}” cancelada. Motivo: ${motivo}`, clienteId: conta.clienteId, projetoId: conta.projetoId, usuarioId: ctx.usuario.id });
}

/** Reabre uma conta cancelada: volta a "aberta" (com vencimento) ou a "aguardando a etapa" (sem vencimento). */
export async function reabrirContaAReceber(tx: Tx, contaReceberId: string, ctx: ContextoFinanceiro): Promise<void> {
  const conta = await travarConta(tx, contaReceberId);
  if (conta.status !== "CANCELADA") throw new ErroNegocio("Só se reabre uma conta cancelada.");
  const status = statusParaValores(conta.valorCentavos, conta.valorPagoCentavos, conta.vencimento ? "ABERTA" : "AGUARDANDO_GATILHO");
  const depois = await tx.contaReceber.update({ where: { id: conta.id }, data: { status: status as "ABERTA" | "AGUARDANDO_GATILHO", atualizadoPorId: ctx.usuario.id } });
  // Só volta a cobrar quando a conta volta a ser cobrável (com vencimento); aguardando a etapa, a tarefa nasce na liberação.
  if (status !== "AGUARDANDO_GATILHO") {
    await tx.tarefa.updateMany({ where: { chaveUnica: `cobranca:${conta.id}`, status: "CANCELADA", deletadoEm: null }, data: { status: "ABERTA", concluidaEm: null } });
  }
  await registrarAuditoria(tx, { usuario: ctx.usuario, entidade: "ContaReceber", entidadeId: conta.id, acao: "REABRIR", antes: { status: "CANCELADA" }, depois: { status: depois.status }, ip: ctx.ip });
}

/**
 * Libera uma parcela que aguarda a etapa sem esperar por ela (ex.: o cliente quer pagar antes). Vira "aberta" com o
 * vencimento escolhido e ganha a tarefa de cobrança. Continua ligada ao gatilho: se a etapa for concluída depois, nada muda.
 */
export async function liberarParcelaAntesDaEtapa(tx: Tx, e: { contaReceberId: string; vencimento: string }, ctx: ContextoFinanceiro): Promise<void> {
  const conta = await travarConta(tx, e.contaReceberId);
  if (conta.status !== "AGUARDANDO_GATILHO") throw new ErroNegocio("Esta parcela não está aguardando uma etapa.");
  const agora = ctx.agora ?? new Date();
  const hoje = dataLocalDoInstante(agora);
  const depois = await tx.contaReceber.update({ where: { id: conta.id }, data: { status: "ABERTA", vencimento: comoData(e.vencimento), atualizadoPorId: ctx.usuario.id } });

  const dias = (await tx.configuracaoEmpresa.findUnique({ where: { id: "singleton" }, select: { diasLembreteCobranca: true } }))?.diasLembreteCobranca ?? 0;
  const projeto = conta.projetoId ? await tx.projeto.findUnique({ where: { id: conta.projetoId }, select: { responsavelId: true } }) : null;
  await tx.tarefa.createMany({
    data: [
      {
        titulo: `Cobrar parcela — ${conta.descricao}`,
        descricao: "Parcela liberada antes de a etapa ser concluída.",
        tipo: "COBRAR_PARCELA",
        responsavelId: projeto?.responsavelId ?? null,
        vencimento: comoData(dataDoLembreteDeCobranca(e.vencimento, dias, hoje)),
        clienteId: conta.clienteId,
        projetoId: conta.projetoId,
        chaveUnica: `cobranca:${conta.id}`,
        criadoPorId: ctx.usuario.id,
        atualizadoPorId: ctx.usuario.id,
      },
    ],
    skipDuplicates: true,
  });
  // Tarefa de uma liberação anterior (cancelada ao reverter): volta a valer com o novo vencimento.
  await tx.tarefa.updateMany({
    where: { chaveUnica: `cobranca:${conta.id}`, status: "CANCELADA", deletadoEm: null },
    data: { status: "ABERTA", concluidaEm: null, vencimento: comoData(dataDoLembreteDeCobranca(e.vencimento, dias, hoje)) },
  });
  await registrarAuditoria(tx, {
    usuario: ctx.usuario,
    entidade: "ContaReceber",
    entidadeId: conta.id,
    acao: "LIBERAR_MANUAL",
    antes: { status: "AGUARDANDO_GATILHO", vencimento: null },
    depois: { status: depois.status, vencimento: e.vencimento },
    ip: ctx.ip,
  });
  await registrarInteracao(tx, { tipo: "SISTEMA", texto: `Parcela “${conta.descricao}” liberada para cobrança antes da etapa.`, clienteId: conta.clienteId, projetoId: conta.projetoId, usuarioId: ctx.usuario.id });
}
