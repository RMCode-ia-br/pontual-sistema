import "server-only";

import { randomUUID } from "node:crypto";

import type { Prisma } from "@/generated/prisma/client";
import { ErroNegocio } from "@/lib/acoes";
import { registrarAuditoria } from "@/lib/auditoria";
import type { UsuarioSessao } from "@/lib/auth/sessao";
import { aplicarEstorno, type StatusDoTitulo } from "@/lib/dominio/titulos";
import { dataLocalDoInstante, formatarMoeda } from "@/lib/formatadores";
import { registrarInteracao } from "@/modules/interacoes/registrar";

import type { DadosDaTransferencia, DadosDoLancamento } from "./schemas";
import { sincronizarTarefaDeCobranca } from "./tarefa-cobranca";

type Tx = Prisma.TransactionClient;

export type ContextoFinanceiro = { usuario: UsuarioSessao; ip: string | null; agora?: Date };

const comoData = (texto: string): Date => new Date(`${texto}T00:00:00Z`);

export type EntradaDeLancamento = {
  data: string;
  tipo: "ENTRADA" | "SAIDA";
  valorCentavos: number;
  contaFinanceiraId: string;
  categoriaId: string | null;
  descricao: string;
  forma: "PIX" | "TRANSFERENCIA" | "ESPECIE" | "CARTAO_CREDITO" | "BOLETO" | null;
  comNotaFiscal: boolean;
  fornecedorId?: string | null;
  projetoId?: string | null;
  clienteId?: string | null;
  contaReceberId?: string | null;
  contaPagarId?: string | null;
  observacao?: string | null;
  /** Categoria e fornecedor já vêm do título: ele continua pagável mesmo que a categoria tenha sido inativada depois. */
  vinculoExistente?: boolean;
};

/**
 * Grava um lançamento conferindo o que vem do cliente: conta ativa, categoria ativa e do tipo certo (entrada = receita,
 * saída = despesa), fornecedor existente e data que não seja futura (lançamento é o que JÁ aconteceu).
 * Usado pelo lançamento avulso e, na mesma transação, por pagamentos de contas a receber e a pagar.
 */
export async function registrarLancamento(tx: Tx, e: EntradaDeLancamento, ctx: ContextoFinanceiro) {
  if (e.data > dataLocalDoInstante(ctx.agora ?? new Date())) {
    throw new ErroNegocio("A data não pode ser no futuro: lançamento é o que já aconteceu. Para o que vai acontecer, use contas a receber e a pagar.", { data: "A data não pode ser no futuro." });
  }
  const conta = await tx.contaFinanceira.findFirst({ where: { id: e.contaFinanceiraId, ativo: true, deletadoEm: null }, select: { id: true } });
  if (!conta) throw new ErroNegocio("Conta financeira não encontrada ou inativa.", { contaFinanceiraId: "Escolha uma conta ativa." });

  if (e.categoriaId) {
    const categoria = await tx.categoriaFinanceira.findFirst({ where: { id: e.categoriaId, ...(e.vinculoExistente ? {} : { ativo: true, deletadoEm: null }) }, select: { tipo: true } });
    if (!categoria) throw new ErroNegocio("Categoria não encontrada ou inativa.", { categoriaId: "Escolha uma categoria ativa." });
    const esperado = e.tipo === "ENTRADA" ? "RECEITA" : "DESPESA";
    if (categoria.tipo !== esperado) {
      throw new ErroNegocio(`Uma ${e.tipo === "ENTRADA" ? "entrada" : "saída"} usa categoria de ${esperado === "RECEITA" ? "receita" : "despesa"}.`, {
        categoriaId: `Escolha uma categoria de ${esperado === "RECEITA" ? "receita" : "despesa"}.`,
      });
    }
  }
  if (e.fornecedorId && !e.vinculoExistente) {
    const fornecedor = await tx.fornecedor.findFirst({ where: { id: e.fornecedorId, deletadoEm: null }, select: { id: true } });
    if (!fornecedor) throw new ErroNegocio("Fornecedor não encontrado.", { fornecedorId: "Fornecedor inválido." });
  }

  const lancamento = await tx.lancamento.create({
    data: {
      data: comoData(e.data),
      tipo: e.tipo,
      valorCentavos: e.valorCentavos,
      contaFinanceiraId: e.contaFinanceiraId,
      categoriaId: e.categoriaId,
      descricao: e.descricao,
      forma: e.forma,
      comNotaFiscal: e.comNotaFiscal,
      fornecedorId: e.fornecedorId ?? null,
      projetoId: e.projetoId ?? null,
      clienteId: e.clienteId ?? null,
      contaReceberId: e.contaReceberId ?? null,
      contaPagarId: e.contaPagarId ?? null,
      observacao: e.observacao ?? null,
      criadoPorId: ctx.usuario.id,
      atualizadoPorId: ctx.usuario.id,
    },
  });
  await registrarAuditoria(tx, { usuario: ctx.usuario, entidade: "Lancamento", entidadeId: lancamento.id, acao: "CRIAR", depois: lancamento, ip: ctx.ip });
  return lancamento;
}

/** Lançamento avulso (sem conta a receber nem a pagar): ex.: venda de sucata, tarifa do banco, DAS pago na hora. */
export async function criarLancamentoAvulso(tx: Tx, dados: DadosDoLancamento, ctx: ContextoFinanceiro): Promise<{ id: string }> {
  const l = await registrarLancamento(
    tx,
    {
      data: dados.data,
      tipo: dados.tipo,
      valorCentavos: dados.valor,
      contaFinanceiraId: dados.contaFinanceiraId,
      categoriaId: dados.categoriaId,
      descricao: dados.descricao,
      forma: dados.forma,
      comNotaFiscal: dados.comNotaFiscal,
      fornecedorId: dados.fornecedorId,
      observacao: dados.observacao,
    },
    ctx,
  );
  return { id: l.id };
}

/** Transferência entre contas: dois lançamentos ligados pelo mesmo `transferenciaId`, sem categoria (ficam fora do DRE). */
export async function criarTransferencia(tx: Tx, dados: DadosDaTransferencia, ctx: ContextoFinanceiro): Promise<{ transferenciaId: string }> {
  if (dados.data > dataLocalDoInstante(ctx.agora ?? new Date())) {
    throw new ErroNegocio("A data não pode ser no futuro.", { data: "A data não pode ser no futuro." });
  }
  const contas = await tx.contaFinanceira.findMany({
    where: { id: { in: [dados.contaOrigemId, dados.contaDestinoId] }, ativo: true, deletadoEm: null },
    select: { id: true, nome: true },
  });
  const origem = contas.find((c) => c.id === dados.contaOrigemId);
  const destino = contas.find((c) => c.id === dados.contaDestinoId);
  if (!origem) throw new ErroNegocio("Conta de origem não encontrada ou inativa.", { contaOrigemId: "Escolha uma conta ativa." });
  if (!destino) throw new ErroNegocio("Conta de destino não encontrada ou inativa.", { contaDestinoId: "Escolha uma conta ativa." });

  const transferenciaId = randomUUID();
  const base = { data: comoData(dados.data), valorCentavos: dados.valor, transferenciaId, comNotaFiscal: false, criadoPorId: ctx.usuario.id, atualizadoPorId: ctx.usuario.id };
  const saida = await tx.lancamento.create({
    data: { ...base, tipo: "SAIDA", contaFinanceiraId: origem.id, descricao: dados.descricao ?? `Transferência para ${destino.nome}` },
  });
  const entrada = await tx.lancamento.create({
    data: { ...base, tipo: "ENTRADA", contaFinanceiraId: destino.id, descricao: dados.descricao ?? `Transferência de ${origem.nome}` },
  });
  for (const l of [saida, entrada]) {
    await registrarAuditoria(tx, { usuario: ctx.usuario, entidade: "Lancamento", entidadeId: l.id, acao: "CRIAR", depois: l, ip: ctx.ip });
  }
  return { transferenciaId };
}

/** Marca ou desmarca "conciliado" (conferência manual com o extrato do banco). */
export async function conciliarLancamento(tx: Tx, lancamentoId: string, conciliado: boolean, ctx: ContextoFinanceiro): Promise<void> {
  const antes = await tx.lancamento.findFirst({ where: { id: lancamentoId, deletadoEm: null } });
  if (!antes) throw new ErroNegocio("Lançamento não encontrado.");
  if (antes.estornadoEm) throw new ErroNegocio("Lançamento estornado não se concilia.");
  if (antes.conciliado === conciliado) return;
  const depois = await tx.lancamento.update({
    where: { id: lancamentoId },
    data: { conciliado, conciliadoEm: conciliado ? (ctx.agora ?? new Date()) : null, atualizadoPorId: ctx.usuario.id },
  });
  await registrarAuditoria(tx, { usuario: ctx.usuario, entidade: "Lancamento", entidadeId: lancamentoId, acao: conciliado ? "CONCILIAR" : "DESCONCILIAR", antes, depois, ip: ctx.ip });
}

/**
 * Estorna um lançamento: ele NÃO é apagado; fica marcado (quando, quem e por quê) e sai de saldo, fluxo e DRE.
 * - Transferência: as duas pontas são estornadas juntas.
 * - Pagamento de conta a receber ou a pagar: o valor pago e o status do título são recalculados na mesma transação
 *   (a linha do título fica travada, então dois estornos ou um estorno e um pagamento simultâneos não se atropelam).
 */
export async function estornarLancamento(tx: Tx, lancamentoId: string, motivo: string, ctx: ContextoFinanceiro) {
  // Descobre as pontas SEM travar e trava todas de uma vez, em ordem de id: dois estornos das duas pontas da mesma
  // transferência (abas diferentes) pedem os mesmos locks na mesma ordem e nunca se esperam em ciclo.
  const [base] = await tx.$queryRaw<{ id: string; transferenciaId: string | null }[]>`
    SELECT "id", "transferenciaId" FROM "Lancamento" WHERE "id" = ${lancamentoId} AND "deletadoEm" IS NULL`;
  if (!base) throw new ErroNegocio("Lançamento não encontrado.");

  const travadas = base.transferenciaId
    ? await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Lancamento" WHERE "transferenciaId" = ${base.transferenciaId} AND "deletadoEm" IS NULL ORDER BY "id" FOR UPDATE`
    : await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Lancamento" WHERE "id" = ${base.id} AND "deletadoEm" IS NULL FOR UPDATE`;
  const ids = travadas.map((l) => l.id);
  if (ids.length === 0) throw new ErroNegocio("Lançamento não encontrado.");
  const lancamentos = await tx.lancamento.findMany({ where: { id: { in: ids } } });
  if (lancamentos.some((l) => l.estornadoEm)) throw new ErroNegocio("Este lançamento já foi estornado.");

  const agora = ctx.agora ?? new Date();
  const estornados: Awaited<ReturnType<typeof tx.lancamento.update>>[] = [];
  for (const antes of lancamentos) {
    if (antes.contaReceberId) await refazerTituloDeReceber(tx, antes.contaReceberId, antes.valorCentavos, ctx);
    if (antes.contaPagarId) await refazerTituloDePagar(tx, antes.contaPagarId, antes.valorCentavos);
    const depois = await tx.lancamento.update({
      where: { id: antes.id },
      data: { estornadoEm: agora, estornadoPorId: ctx.usuario.id, motivoEstorno: motivo, atualizadoPorId: ctx.usuario.id },
    });
    estornados.push(depois);
    await registrarAuditoria(tx, { usuario: ctx.usuario, entidade: "Lancamento", entidadeId: antes.id, acao: "ESTORNAR", antes, depois, ip: ctx.ip });
  }
  return { lancamentos: estornados };
}

async function refazerTituloDeReceber(tx: Tx, id: string, valorCentavos: number, ctx: ContextoFinanceiro) {
  const [t] = await tx.$queryRaw<{ status: StatusDoTitulo; valorCentavos: number; valorPagoCentavos: number; descricao: string; clienteId: string; projetoId: string | null }[]>`
    SELECT "status", "valorCentavos", "valorPagoCentavos", "descricao", "clienteId", "projetoId" FROM "ContaReceber" WHERE "id" = ${id} FOR UPDATE`;
  if (!t) throw new ErroNegocio("A conta a receber deste lançamento não foi encontrada.");
  const r = aplicarEstorno(t, valorCentavos);
  if (!r.ok) throw new ErroNegocio(r.erro);
  await tx.contaReceber.update({ where: { id }, data: { valorPagoCentavos: r.valorPagoCentavos, status: r.status, atualizadoPorId: ctx.usuario.id } });
  await sincronizarTarefaDeCobranca(tx, id, t.status, r.status, ctx.agora ?? new Date());
  await registrarInteracao(tx, {
    tipo: "SISTEMA",
    texto: `Recebimento de ${formatarMoeda(valorCentavos)} estornado em “${t.descricao}”.`,
    clienteId: t.clienteId,
    projetoId: t.projetoId,
    usuarioId: ctx.usuario.id,
  });
}

async function refazerTituloDePagar(tx: Tx, id: string, valorCentavos: number) {
  const [t] = await tx.$queryRaw<{ status: StatusDoTitulo; valorCentavos: number; valorPagoCentavos: number }[]>`
    SELECT "status", "valorCentavos", "valorPagoCentavos" FROM "ContaPagar" WHERE "id" = ${id} FOR UPDATE`;
  if (!t) throw new ErroNegocio("A conta a pagar deste lançamento não foi encontrada.");
  const r = aplicarEstorno(t, valorCentavos);
  if (!r.ok) throw new ErroNegocio(r.erro);
  // ContaPagar não tem "aguardando etapa": o status volta para ABERTA/PARCIAL/PAGA.
  await tx.contaPagar.update({ where: { id }, data: { valorPagoCentavos: r.valorPagoCentavos, status: r.status as "ABERTA" | "PARCIAL" | "PAGA" } });
}
