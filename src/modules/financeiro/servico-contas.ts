import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { ErroNegocio } from "@/lib/acoes";
import { registrarAuditoria } from "@/lib/auditoria";
import type { UsuarioSessao } from "@/lib/auth/sessao";
import { dataLocalDoInstante } from "@/lib/formatadores";

import type { DadosDaConta } from "./schemas";

type Tx = Prisma.TransactionClient;

type Contexto = { usuario: UsuarioSessao; ip: string | null; agora?: Date };

const comoData = (texto: string | null): Date | null => (texto ? new Date(`${texto}T00:00:00Z`) : null);

function conferirDataDoSaldo(dados: DadosDaConta, agora: Date) {
  if (dados.saldoInformado && dados.dataSaldoInicial && dados.dataSaldoInicial > dataLocalDoInstante(agora)) {
    throw new ErroNegocio("A data do saldo não pode ser no futuro.", { dataSaldoInicial: "A data do saldo não pode ser no futuro." });
  }
}

/** Cria a conta. O saldo só vale se foi informado; senão fica zero com a marca "não informado". */
export async function criarContaFinanceira(tx: Tx, dados: DadosDaConta, ctx: Contexto): Promise<{ id: string }> {
  conferirDataDoSaldo(dados, ctx.agora ?? new Date());
  const ultima = await tx.contaFinanceira.findFirst({ where: { deletadoEm: null }, orderBy: { ordem: "desc" }, select: { ordem: true } });
  const conta = await tx.contaFinanceira.create({
    data: {
      nome: dados.nome,
      tipo: dados.tipo,
      saldoInicialCentavos: dados.saldoInicialCentavos,
      saldoInicialInformado: dados.saldoInformado,
      dataSaldoInicial: comoData(dados.dataSaldoInicial),
      observacao: dados.observacao,
      ordem: (ultima?.ordem ?? -1) + 1,
      criadoPorId: ctx.usuario.id,
      atualizadoPorId: ctx.usuario.id,
    },
  });
  await registrarAuditoria(tx, { usuario: ctx.usuario, entidade: "ContaFinanceira", entidadeId: conta.id, acao: "CRIAR", depois: conta, ip: ctx.ip });
  return { id: conta.id };
}

/**
 * Edita a conta. Informar ou corrigir o saldo inicial NÃO apaga nem recusa lançamentos: os anteriores à data do
 * saldo passam a aparecer no extrato como "já incluídos no saldo inicial". A mudança do saldo fica na auditoria.
 */
export async function editarContaFinanceira(tx: Tx, contaId: string, dados: DadosDaConta, ctx: Contexto): Promise<void> {
  conferirDataDoSaldo(dados, ctx.agora ?? new Date());
  const antes = await tx.contaFinanceira.findFirst({ where: { id: contaId, deletadoEm: null } });
  if (!antes) throw new ErroNegocio("Conta não encontrada.");
  const depois = await tx.contaFinanceira.update({
    where: { id: contaId },
    data: {
      nome: dados.nome,
      tipo: dados.tipo,
      saldoInicialCentavos: dados.saldoInicialCentavos,
      saldoInicialInformado: dados.saldoInformado,
      dataSaldoInicial: comoData(dados.dataSaldoInicial),
      observacao: dados.observacao,
      atualizadoPorId: ctx.usuario.id,
    },
  });
  await registrarAuditoria(tx, { usuario: ctx.usuario, entidade: "ContaFinanceira", entidadeId: contaId, acao: "ATUALIZAR", antes, depois, ip: ctx.ip });
}

/** Inativa ou reativa. A conta inativa some das escolhas, mas o histórico e o saldo continuam. */
export async function alternarContaAtiva(tx: Tx, contaId: string, ativo: boolean, ctx: Contexto): Promise<void> {
  const antes = await tx.contaFinanceira.findFirst({ where: { id: contaId, deletadoEm: null } });
  if (!antes) throw new ErroNegocio("Conta não encontrada.");
  if (antes.ativo === ativo) return;
  const depois = await tx.contaFinanceira.update({ where: { id: contaId }, data: { ativo, atualizadoPorId: ctx.usuario.id } });
  await registrarAuditoria(tx, { usuario: ctx.usuario, entidade: "ContaFinanceira", entidadeId: contaId, acao: ativo ? "ATIVAR" : "DESATIVAR", antes, depois, ip: ctx.ip });
}
