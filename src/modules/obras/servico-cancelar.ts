import "server-only";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { ErroNegocio } from "@/lib/acoes";
import { registrarAuditoria } from "@/lib/auditoria";
import { bloqueiosDoCancelamento, planoDoCancelamento, textoDoCancelamento, type Bloqueio, type FatosDoCancelamento, type PlanoDoCancelamento } from "@/lib/dominio/cancelar-obra";
import { formatarData } from "@/lib/formatadores";
import { registrarInteracao } from "@/modules/interacoes/registrar";
import { mudarFaseDoProjeto } from "@/modules/projetos/servico";

type Tx = Prisma.TransactionClient;
type Db = Tx | PrismaClient;
type Usuario = { id: string; nome: string };

const ROTULO_AGENDAMENTO: Record<string, string> = { MEDICAO_EXATA: "medição exata", MEDICAO_VIDROS: "medição dos vidros", INSTALACAO: "instalação", ENTREGA: "entrega", VISITA_TECNICA: "visita técnica", ASSISTENCIA: "assistência", REUNIAO: "reunião" };

/** Lê os fatos que decidem se a obra pode ser cancelada e o que o cancelamento muda. Usado na transação (depois dos locks) e na prévia. */
export async function lerFatosDoCancelamento(db: Db, projetoId: string, projetoStatus: string, agora: Date): Promise<FatosDoCancelamento & { parcelaIds: string[] }> {
  const [aprovadas, parcelas, tarefas, eventos, compras, saidas, retalhos, sucata, pagar, despesas, chamados] = await Promise.all([
    db.proposta.count({ where: { projetoId, status: "APROVADA", deletadoEm: null } }),
    db.contaReceber.findMany({
      where: { projetoId, propostaId: { not: null }, deletadoEm: null },
      orderBy: [{ ordem: "asc" }, { id: "asc" }],
      select: { id: true, ordem: true, status: true, valorCentavos: true, valorPagoCentavos: true, lancamentos: { where: { estornadoEm: null, deletadoEm: null }, select: { id: true } } },
    }),
    db.tarefa.count({ where: { projetoId, status: "ABERTA", deletadoEm: null } }),
    db.eventoAgenda.findMany({ where: { projetoId, deletadoEm: null, status: { in: ["AGENDADO", "CONFIRMADO", "REMARCADO"] }, inicio: { gte: agora } }, orderBy: { inicio: "asc" }, select: { tipo: true, inicio: true } }),
    db.compra.count({ where: { projetoId, deletadoEm: null, status: { not: "CANCELADO" } } }),
    db.movimentoEstoque.count({ where: { projetoId, deletadoEm: null, estornoDeId: null, estornadoPor: { is: null } } }),
    db.retalho.count({ where: { deletadoEm: null, status: { in: ["DISPONIVEL", "CONSUMIDO"] }, OR: [{ origemProjetoId: projetoId }, { consumidoProjetoId: projetoId }] } }),
    db.movimentoSucata.count({ where: { projetoId, deletadoEm: null } }),
    db.contaPagar.count({ where: { projetoId, deletadoEm: null, status: { not: "CANCELADA" } } }),
    db.lancamento.count({ where: { projetoId, tipo: "SAIDA", contaPagarId: null, estornadoEm: null, deletadoEm: null } }),
    db.chamado.count({ where: { projetoId, deletadoEm: null, status: { notIn: ["RESOLVIDO", "CANCELADO"] } } }),
  ]);
  return {
    projetoStatus,
    temPropostaAprovada: aprovadas > 0,
    parcelaIds: parcelas.map((p) => p.id),
    parcelas: parcelas.map((p) => ({ ordem: p.ordem, status: p.status, valorCentavos: p.valorCentavos, valorPagoCentavos: p.valorPagoCentavos, lancamentosAtivos: p.lancamentos.length })),
    tarefasAbertas: tarefas,
    agendamentos: eventos.map((e) => ({ rotulo: ROTULO_AGENDAMENTO[e.tipo] ?? e.tipo.toLowerCase(), dataBr: formatarData(e.inicio) })),
    compras,
    saidasDeEstoque: saidas,
    retalhos,
    sucata,
    contasAPagar: pagar,
    despesasDaObra: despesas,
    chamadosEmAberto: chamados,
  };
}

export type PreviaDoCancelamento = { projetoId: string; codigo: string; titulo: string; cliente: string; status: string; bloqueios: Bloqueio[]; plano: PlanoDoCancelamento };

/** Prévia (só leitura) do cancelamento. A tela nunca decide: ao cancelar, tudo é lido de novo depois dos locks. */
export async function previaDoCancelamento(db: Db, projetoId: string, agora = new Date()): Promise<PreviaDoCancelamento> {
  const projeto = await db.projeto.findFirst({ where: { id: projetoId, deletadoEm: null }, select: { id: true, codigo: true, titulo: true, status: true, cliente: { select: { nome: true } } } });
  if (!projeto) throw new ErroNegocio("Obra não encontrada.");
  const fatos = await lerFatosDoCancelamento(db, projeto.id, projeto.status, agora);
  return { projetoId: projeto.id, codigo: projeto.codigo, titulo: projeto.titulo, cliente: projeto.cliente.nome, status: projeto.status, bloqueios: bloqueiosDoCancelamento(fatos), plano: planoDoCancelamento(fatos) };
}

export type EntradaCancelarObra = { usuario: Usuario; projetoId: string; motivo: string; ip?: string | null; agora?: Date };
export type ResultadoCancelarObra = { projetoId: string; codigo: string; parcelasCanceladas: number; parcelasQueFicam: number; valorRecebidoCentavos: number; tarefasCanceladas: number; avisos: Bloqueio[] };

/**
 * Cancela uma obra já aprovada (decisão 183), numa transação só. Ordem de locks: projeto → parcelas (a mesma da aprovação, do
 * desfazer e do recebimento). Os bloqueios são LIDOS DEPOIS dos locks. O que muda: o projeto vai para CANCELADO pela função de
 * fases (histórico, que alimenta a linha "cancelado depois de aprovado"); parcelas SEM recebimento ficam canceladas; tarefas
 * abertas são canceladas. O que NÃO muda: a proposta continua aprovada (a venda do mês da aprovação não some), parcelas com
 * recebimento, etapas (histórico), compras, estoque, contas a pagar, despesas e chamados (só avisados).
 */
export async function cancelarObraAprovada(tx: Tx, e: EntradaCancelarObra): Promise<ResultadoCancelarObra> {
  const { usuario, projetoId, ip } = e;
  const agora = e.agora ?? new Date();
  const motivo = e.motivo.trim();
  if (motivo.length < 3) throw new ErroNegocio("Conte o motivo do cancelamento.", { motivo: "Conte o motivo." });

  await tx.$queryRaw`SELECT "id" FROM "Projeto" WHERE "id" = ${projetoId} FOR UPDATE`;
  await tx.$queryRaw`SELECT "id" FROM "ContaReceber" WHERE "projetoId" = ${projetoId} FOR UPDATE`;

  const projeto = await tx.projeto.findFirst({ where: { id: projetoId, deletadoEm: null }, select: { id: true, codigo: true, titulo: true, clienteId: true, status: true } });
  if (!projeto) throw new ErroNegocio("Obra não encontrada.");

  const fatos = await lerFatosDoCancelamento(tx, projetoId, projeto.status, agora);
  const bloqueios = bloqueiosDoCancelamento(fatos);
  if (bloqueios.length > 0) throw new ErroNegocio(`Não dá para cancelar esta obra. ${bloqueios.map((b) => b.texto).join(" ")}`);
  const plano = planoDoCancelamento(fatos);

  // 1. Parcelas sem nenhum recebimento: canceladas (a linha continua visível como cancelada; nada é apagado).
  const parcelas = await tx.contaReceber.findMany({
    where: { projetoId, propostaId: { not: null }, deletadoEm: null, status: { in: ["AGUARDANDO_GATILHO", "ABERTA"] }, valorPagoCentavos: 0, lancamentos: { none: { estornadoEm: null, deletadoEm: null } } },
    select: { id: true, ordem: true, descricao: true, valorCentavos: true, status: true, observacao: true },
  });
  const nota = `Cancelada com a obra: ${motivo}`;
  for (const p of parcelas) {
    await tx.contaReceber.update({ where: { id: p.id }, data: { status: "CANCELADA", observacao: [p.observacao, nota].filter(Boolean).join(" · "), atualizadoPorId: usuario.id } });
  }
  // A tarefa de cobrança de cada parcela cancelada vai junto.
  await tx.tarefa.updateMany({ where: { chaveUnica: { in: parcelas.map((p) => `cobranca:${p.id}`) }, status: "ABERTA", deletadoEm: null }, data: { status: "CANCELADA", atualizadoPorId: usuario.id } });

  // 2. Demais tarefas abertas da obra.
  const tarefas = await tx.tarefa.findMany({ where: { projetoId, status: "ABERTA", deletadoEm: null }, select: { id: true, titulo: true } });
  if (tarefas.length > 0) await tx.tarefa.updateMany({ where: { id: { in: tarefas.map((t) => t.id) } }, data: { status: "CANCELADA", atualizadoPorId: usuario.id } });

  // 3. Projeto para CANCELADO pela função de fases (histórico, linha do tempo e acompanhamento).
  await mudarFaseDoProjeto(tx, {
    usuario,
    projeto: { id: projeto.id, codigo: projeto.codigo, titulo: projeto.titulo, clienteId: projeto.clienteId, status: projeto.status as never },
    para: "CANCELADO",
    ip,
    agora,
  });

  // 4. Linha do tempo (com o motivo) e auditoria (com o que mudou).
  await registrarInteracao(tx, {
    tipo: "SISTEMA",
    texto: textoDoCancelamento({ codigo: projeto.codigo, motivo, plano: { ...plano, tarefasACancelar: tarefas.length, parcelasACancelar: parcelas.map((p) => ({ ordem: p.ordem, valorCentavos: p.valorCentavos })), valorACancelarCentavos: parcelas.reduce((s, p) => s + p.valorCentavos, 0) } }),
    clienteId: projeto.clienteId,
    projetoId: projeto.id,
    usuarioId: usuario.id,
  });
  await registrarAuditoria(tx, {
    usuario,
    entidade: "Projeto",
    entidadeId: projeto.id,
    acao: "CANCELAR_OBRA",
    antes: { status: projeto.status, parcelas: fatos.parcelas, tarefasAbertas: fatos.tarefasAbertas },
    depois: {
      status: "CANCELADO",
      motivo,
      parcelasCanceladas: parcelas.map((p) => ({ id: p.id, ordem: p.ordem, valorCentavos: p.valorCentavos, statusAntes: p.status })),
      parcelasQueFicam: plano.parcelasQueFicam,
      tarefasCanceladas: tarefas.map((t) => ({ id: t.id, titulo: t.titulo })),
      avisos: plano.avisos.map((a) => a.codigo),
    },
    ip,
  });

  return {
    projetoId: projeto.id,
    codigo: projeto.codigo,
    parcelasCanceladas: parcelas.length,
    parcelasQueFicam: plano.parcelasQueFicam.length,
    valorRecebidoCentavos: plano.valorRecebidoCentavos,
    tarefasCanceladas: tarefas.length,
    avisos: plano.avisos,
  };
}
