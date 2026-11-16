import "server-only";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { ErroNegocio } from "@/lib/acoes";
import { registrarAuditoria } from "@/lib/auditoria";
import {
  bloqueiosDoDesfazer,
  chaveDeTarefaDesfeita,
  planoDeDesfazer,
  planoDeReabertura,
  rotuloDaRevisao,
  type Bloqueio,
  type FatosDoDesfazer,
  type MudancaDeRevisao,
  type RevisaoBasica,
} from "@/lib/dominio/desfazer-aprovacao";
import { CATEGORIA_FOTO_DE_OBRA } from "@/lib/dominio/portfolio";
import { formatarData, formatarMoeda } from "@/lib/formatadores";
import { registrarInteracao } from "@/modules/interacoes/registrar";
import { mudarFaseDoProjeto } from "@/modules/projetos/servico";

import { aprovarProposta, travarFamiliaDaProposta } from "./servico-ciclo";

type Tx = Prisma.TransactionClient;
type Db = Tx | PrismaClient;
type Usuario = { id: string; nome: string };

const ROTULO_AGENDAMENTO: Record<string, string> = { MEDICAO_EXATA: "medição exata", MEDICAO_VIDROS: "medição dos vidros", INSTALACAO: "instalação", ENTREGA: "entrega" };

/** Lê os fatos que decidem se a aprovação pode ser desfeita. Usado dentro da transação (depois dos locks) e na prévia. */
export async function lerFatosDoDesfazer(db: Db, p: { id: string; status: string; projetoId: string }, projetoStatus: string): Promise<FatosDoDesfazer> {
  const projetoId = p.projetoId;
  const [parcelas, etapas, pausas, fotos, eventos, compras, saidas, retalhos, sucata, pagar, despesas, chamados] = await Promise.all([
    db.contaReceber.findMany({
      where: { propostaId: p.id, deletadoEm: null },
      orderBy: { ordem: "asc" },
      select: { ordem: true, status: true, valorPagoCentavos: true, lancamentos: { where: { estornadoEm: null, deletadoEm: null }, select: { id: true } } },
    }),
    db.etapaProjeto.findMany({ where: { projetoId, deletadoEm: null }, orderBy: { ordem: "asc" }, select: { nome: true, status: true, inicioReal: true, fimReal: true } }),
    db.pausaProjeto.count({ where: { projetoId, deletadoEm: null } }),
    db.anexo.count({ where: { entidadeTipo: "Projeto", entidadeId: projetoId, categoria: CATEGORIA_FOTO_DE_OBRA, deletadoEm: null } }),
    db.eventoAgenda.findMany({
      where: { projetoId, deletadoEm: null, tipo: { in: ["MEDICAO_EXATA", "MEDICAO_VIDROS", "INSTALACAO", "ENTREGA"] }, status: { in: ["AGENDADO", "CONFIRMADO", "REMARCADO", "REALIZADO"] } },
      orderBy: { inicio: "asc" },
      select: { tipo: true, inicio: true },
    }),
    db.compra.count({ where: { projetoId, deletadoEm: null, status: { not: "CANCELADO" } } }),
    // Saída que ainda vale: não é o estorno de outra e ninguém a estornou.
    db.movimentoEstoque.count({ where: { projetoId, deletadoEm: null, estornoDeId: null, estornadoPor: { is: null } } }),
    db.retalho.count({ where: { deletadoEm: null, status: { in: ["DISPONIVEL", "CONSUMIDO"] }, OR: [{ origemProjetoId: projetoId }, { consumidoProjetoId: projetoId }] } }),
    db.movimentoSucata.count({ where: { projetoId, deletadoEm: null } }),
    db.contaPagar.count({ where: { projetoId, deletadoEm: null, status: { not: "CANCELADA" } } }),
    // Despesa lançada direto na obra (a conta a pagar já foi contada acima).
    db.lancamento.count({ where: { projetoId, tipo: "SAIDA", contaPagarId: null, estornadoEm: null, deletadoEm: null } }),
    db.chamado.count({ where: { projetoId, deletadoEm: null, status: { notIn: ["RESOLVIDO", "CANCELADO"] } } }),
  ]);
  return {
    propostaStatus: p.status as FatosDoDesfazer["propostaStatus"],
    projetoStatus,
    parcelas: parcelas.map((x) => ({ ordem: x.ordem, status: x.status, valorPagoCentavos: x.valorPagoCentavos, lancamentosAtivos: x.lancamentos.length })),
    etapas: etapas.map((x) => ({ nome: x.nome, status: x.status, temDataReal: x.inicioReal !== null || x.fimReal !== null })),
    pausasAtivas: pausas,
    fotosDeObra: fotos,
    agendamentos: eventos.map((x) => ({ rotulo: ROTULO_AGENDAMENTO[x.tipo] ?? x.tipo.toLowerCase(), dataBr: formatarData(x.inicio) })),
    compras,
    saidasDeEstoque: saidas,
    retalhos,
    sucata,
    contasAPagar: pagar,
    despesasDaObra: despesas,
    chamados,
  };
}

/** Todas as revisões do mesmo número (ativas). */
export async function lerRevisoes(db: Db, numero: string): Promise<RevisaoBasica[]> {
  const todas = await db.proposta.findMany({ where: { numero, deletadoEm: null }, orderBy: { revisao: "asc" }, select: { id: true, revisao: true, status: true, snapshot: true } });
  return todas.map((r) => ({ id: r.id, revisao: r.revisao, status: r.status, temSnapshot: r.snapshot !== null }));
}

function textoDosBloqueios(b: Bloqueio[]): string {
  return `Não dá para desfazer a aprovação ainda. ${b.map((x) => x.texto).join(" ")}`;
}

export type EntradaDesfazer = {
  usuario: Usuario;
  propostaId: string;
  /** Por que está desfazendo (obrigatório; vai para a linha do tempo e a auditoria). */
  motivo: string;
  /** Revisão substituída que passa a valer. Vazio = só a desfeita volta a "enviada". */
  reabrirId?: string | null;
  /** Dentro de uma troca de aprovação: a fase, o valor fechado e a data de fechamento ficam para a aprovação seguinte. */
  emTroca?: boolean;
  ip?: string | null;
  agora?: Date;
};

export type ResultadoDesfazer = {
  numero: string;
  projetoId: string;
  statusDaDesfeita: string;
  reaberta: { id: string; revisao: number; status: string } | null;
  parcelasCanceladas: number;
  etapasRemovidas: number;
  tarefasCanceladas: number;
  valorFechadoCentavos: number | null;
  faseDoProjeto: string;
};

/**
 * Desfaz a aprovação (7A.1), numa transação só e na mesma ordem de locks da aprovação: proposta → projeto → parcelas
 * → etapas. Os bloqueios são LIDOS DEPOIS dos locks (a prévia da tela nunca vale). O que a aprovação criou sai do
 * caminho para a próxima aprovação conseguir recriar tudo (as unicidades não se repetem): parcelas desligadas da
 * proposta, tarefas com a chave aposentada, etapas com exclusão lógica. Nada é apagado de verdade.
 */
export async function desfazerAprovacao(tx: Tx, e: EntradaDesfazer): Promise<ResultadoDesfazer> {
  const { usuario, propostaId, ip } = e;
  const agora = e.agora ?? new Date();
  const motivo = e.motivo.trim();
  if (motivo.length < 3) throw new ErroNegocio("Conte o motivo de desfazer a aprovação.", { motivo: "Conte o motivo." });

  await travarFamiliaDaProposta(tx, propostaId);
  const p = await tx.proposta.findFirst({
    where: { id: propostaId, deletadoEm: null, projeto: { deletadoEm: null } },
    select: {
      id: true,
      numero: true,
      revisao: true,
      status: true,
      projetoId: true,
      aceitaEm: true,
      formaAceite: true,
      aceiteObservacao: true,
      opcaoAprovadaId: true,
      valorAprovadoCentavos: true,
    },
  });
  if (!p) throw new ErroNegocio("Proposta não encontrada.");
  await tx.$queryRaw`SELECT "id" FROM "Projeto" WHERE "id" = ${p.projetoId} FOR UPDATE`;
  await tx.$queryRaw`SELECT "id" FROM "ContaReceber" WHERE "propostaId" = ${propostaId} FOR UPDATE`;
  await tx.$queryRaw`SELECT "id" FROM "EtapaProjeto" WHERE "projetoId" = ${p.projetoId} AND "deletadoEm" IS NULL FOR UPDATE`;

  // Tudo abaixo lê o estado de DEPOIS dos locks (o projeto também: o status que a tela viu pode ter mudado).
  const projeto = await tx.projeto.findUniqueOrThrow({
    where: { id: p.projetoId },
    select: {
      id: true,
      codigo: true,
      titulo: true,
      clienteId: true,
      status: true,
      valorFechadoCentavos: true,
      dataFechamento: true,
      prazoModo: true,
      prazoDias: true,
      prazoMaterialDias: true,
      prazoExecucaoDias: true,
      prazoVidrosDias: true,
      tipoDiasPrazo: true,
    },
  });
  const fatos = await lerFatosDoDesfazer(tx, { id: propostaId, status: p.status, projetoId: projeto.id }, projeto.status);
  const bloqueios = bloqueiosDoDesfazer(fatos);
  if (bloqueios.length > 0) throw new ErroNegocio(textoDosBloqueios(bloqueios));

  // Revisões do mesmo número: quem fica valendo.
  const revisoes = await lerRevisoes(tx, p.numero);
  const plano = planoDeDesfazer(revisoes, propostaId, e.reabrirId ?? null);
  if ("erro" in plano) throw new ErroNegocio(plano.erro);
  const daDesfeita = plano.mudancas.find((m) => m.id === propostaId)!;

  // 1. A proposta volta (ENVIADA, ou SUBSTITUIDA se a revisão escolhida já tinha sido enviada). Mantém snapshot e enviadaEm.
  const voltou = await tx.proposta.updateMany({
    where: { id: propostaId, status: "APROVADA", deletadoEm: null },
    data: { status: daDesfeita.para, aceitaEm: null, formaAceite: null, aceiteObservacao: null, opcaoAprovadaId: null, valorAprovadoCentavos: null, atualizadoPorId: usuario.id },
  });
  if (voltou.count === 0) throw new ErroNegocio("Esta aprovação já foi desfeita. Atualize a página.");

  // 2. As outras revisões (a escolhida volta; a que valia sai de vigor).
  const outrasMudancas: MudancaDeRevisao[] = plano.mudancas.filter((m) => m.id !== propostaId);
  for (const m of outrasMudancas) {
    const r = await tx.proposta.updateMany({ where: { id: m.id, status: m.de, deletadoEm: null }, data: { status: m.para, atualizadoPorId: usuario.id } });
    if (r.count === 0) throw new ErroNegocio("Uma das revisões mudou enquanto você decidia. Atualize a página.");
  }

  // 3. Parcelas: ficam como histórico (canceladas, excluídas e desligadas da proposta) e a unicidade (proposta + ordem) é liberada.
  const parcelas = await tx.contaReceber.findMany({ where: { propostaId }, orderBy: { ordem: "asc" }, select: { id: true, ordem: true, descricao: true, valorCentavos: true, status: true, vencimento: true, gatilho: true, deletadoEm: true } });
  await tx.tarefa.updateMany({ where: { chaveUnica: { in: parcelas.map((x) => `cobranca:${x.id}`) }, status: "ABERTA", deletadoEm: null }, data: { status: "CANCELADA", atualizadoPorId: usuario.id } });
  await tx.contaReceber.updateMany({ where: { propostaId, deletadoEm: null }, data: { status: "CANCELADA", deletadoEm: agora, atualizadoPorId: usuario.id } });
  await tx.contaReceber.updateMany({ where: { propostaId }, data: { propostaId: null, atualizadoPorId: usuario.id } });

  // 4. Tarefas da aprovação (medição exata e condomínio): canceladas e com a chave aposentada.
  const tarefas = await tx.tarefa.findMany({ where: { chaveUnica: { in: [`medicao-exata:${propostaId}`, `condominio:${propostaId}`] } }, select: { id: true, titulo: true, status: true, chaveUnica: true } });
  let tarefasCanceladas = 0;
  for (const t of tarefas) {
    const cancelar = t.status === "ABERTA";
    await tx.tarefa.update({ where: { id: t.id }, data: { chaveUnica: chaveDeTarefaDesfeita(t.chaveUnica!, t.id), ...(cancelar ? { status: "CANCELADA" as const } : {}), atualizadoPorId: usuario.id } });
    if (cancelar) tarefasCanceladas += 1;
  }

  // 5. Projeto: se não sobra outra proposta aprovada, as etapas e o prazo saem (a próxima aprovação gera de novo com o prazo dela).
  const restantes = await tx.proposta.findMany({ where: { projetoId: projeto.id, id: { not: propostaId }, status: "APROVADA", deletadoEm: null }, select: { valorAprovadoCentavos: true, aceitaEm: true } });
  const semOutraAprovada = restantes.length === 0;
  const etapasAntes = semOutraAprovada ? await tx.etapaProjeto.findMany({ where: { projetoId: projeto.id, deletadoEm: null }, select: { id: true, tipo: true, status: true } }) : [];
  if (semOutraAprovada) {
    await tx.etapaProjeto.updateMany({ where: { projetoId: projeto.id, deletadoEm: null }, data: { deletadoEm: agora, atualizadoPorId: usuario.id } });
    await tx.projeto.update({
      where: { id: projeto.id },
      data: { prazoModo: "NENHUM", prazoDias: null, prazoMaterialDias: null, prazoExecucaoDias: null, prazoVidrosDias: null, tipoDiasPrazo: "UTEIS", atualizadoPorId: usuario.id },
    });
  }

  let valorFechado: number | null = projeto.valorFechadoCentavos;
  let faseDoProjeto: string = projeto.status;
  if (!e.emTroca) {
    if (semOutraAprovada) {
      await tx.projeto.update({ where: { id: projeto.id }, data: { valorFechadoCentavos: null, dataFechamento: null, atualizadoPorId: usuario.id } });
      valorFechado = null;
      // Volta ao funil pela função de fases (histórico, linha do tempo e acompanhamento da proposta).
      const temEnviada = (await tx.proposta.count({ where: { projetoId: projeto.id, status: { in: ["ENVIADA", "EXPIRADA"] }, deletadoEm: null } })) > 0;
      const para = temEnviada ? "PROPOSTA_ENVIADA" : "ELABORANDO_PROPOSTA";
      await mudarFaseDoProjeto(tx, { usuario, projeto: { id: projeto.id, codigo: projeto.codigo, titulo: projeto.titulo, clienteId: projeto.clienteId, status: projeto.status as never }, para, ip, agora });
      faseDoProjeto = para;
    } else {
      valorFechado = restantes.reduce((s, r) => s + (r.valorAprovadoCentavos ?? 0), 0);
      const primeiro = restantes.reduce<Date | null>((m, r) => (r.aceitaEm && (m === null || r.aceitaEm < m) ? r.aceitaEm : m), null);
      await tx.projeto.update({ where: { id: projeto.id }, data: { valorFechadoCentavos: valorFechado, dataFechamento: primeiro, atualizadoPorId: usuario.id } });
    }
  }

  // 6. Linha do tempo e auditoria.
  const rotulo = `${p.numero}${p.revisao > 0 ? ` (Rev. ${p.revisao})` : ""}`;
  const reaberta = outrasMudancas.find((m) => m.para === "ENVIADA" || m.para === "RASCUNHO") ?? null;
  const reabertaInfo = reaberta ? { id: reaberta.id, revisao: revisoes.find((r) => r.id === reaberta.id)!.revisao, status: reaberta.para as string } : null;
  await registrarInteracao(tx, {
    tipo: "SISTEMA",
    texto: `Aprovação da proposta ${rotulo} desfeita${p.valorAprovadoCentavos ? ` (${formatarMoeda(p.valorAprovadoCentavos)})` : ""}. Motivo: ${motivo}.${parcelas.length > 0 ? ` ${parcelas.length} parcela(s) a receber canceladas.` : ""}${semOutraAprovada && etapasAntes.length > 0 ? ` ${etapasAntes.length} etapa(s) da obra removidas.` : ""}${reabertaInfo ? ` A ${rotuloDaRevisao(reabertaInfo.revisao)} voltou como ${reabertaInfo.status === "RASCUNHO" ? "rascunho" : "enviada"}.` : ""}${e.emTroca ? " (troca de aprovação)" : ""}`,
    clienteId: projeto.clienteId,
    projetoId: projeto.id,
    usuarioId: usuario.id,
  });
  await registrarAuditoria(tx, {
    usuario,
    entidade: "Proposta",
    entidadeId: propostaId,
    acao: "DESFAZER_APROVACAO",
    antes: {
      status: "APROVADA",
      aceitaEm: p.aceitaEm,
      formaAceite: p.formaAceite,
      aceiteObservacao: p.aceiteObservacao,
      opcaoAprovadaId: p.opcaoAprovadaId,
      valorAprovadoCentavos: p.valorAprovadoCentavos,
      parcelas: parcelas.map((x) => ({ id: x.id, ordem: x.ordem, descricao: x.descricao, valorCentavos: x.valorCentavos, status: x.status, vencimento: x.vencimento, gatilho: x.gatilho })),
      tarefas: tarefas.map((t) => ({ id: t.id, titulo: t.titulo, status: t.status, chaveUnica: t.chaveUnica })),
      etapas: etapasAntes,
      projeto: {
        status: projeto.status,
        valorFechadoCentavos: projeto.valorFechadoCentavos,
        dataFechamento: projeto.dataFechamento,
        prazo: { modo: projeto.prazoModo, dias: projeto.prazoDias, material: projeto.prazoMaterialDias, execucao: projeto.prazoExecucaoDias, vidros: projeto.prazoVidrosDias, tipoDias: projeto.tipoDiasPrazo },
      },
    },
    depois: {
      status: daDesfeita.para,
      motivo,
      emTroca: e.emTroca ?? false,
      revisoes: plano.mudancas,
      etapasRemovidas: etapasAntes.length,
      projeto: { status: faseDoProjeto, valorFechadoCentavos: valorFechado },
    },
    ip,
  });

  return {
    numero: p.numero,
    projetoId: projeto.id,
    statusDaDesfeita: daDesfeita.para,
    reaberta: reabertaInfo,
    parcelasCanceladas: parcelas.filter((x) => x.deletadoEm === null).length,
    etapasRemovidas: etapasAntes.length,
    tarefasCanceladas,
    valorFechadoCentavos: valorFechado,
    faseDoProjeto,
  };
}

export type ResultadoReabrir = { numero: string; projetoId: string; revisao: number; status: string; substituidas: number };

/** Reabre uma revisão SUBSTITUÍDA quando nenhuma irmã está aprovada (ação própria, fora do desfazer). */
export async function reabrirRevisao(tx: Tx, e: { usuario: Usuario; propostaId: string; ip?: string | null }): Promise<ResultadoReabrir> {
  const { usuario, propostaId, ip } = e;
  // Trava todas as irmãs (em ordem de id): duas reaberturas ao mesmo tempo nunca deixam duas valendo.
  await travarFamiliaDaProposta(tx, propostaId);
  const p = await tx.proposta.findFirst({ where: { id: propostaId, deletadoEm: null, projeto: { deletadoEm: null } }, select: { id: true, numero: true, revisao: true, status: true, projetoId: true, projeto: { select: { clienteId: true } } } });
  if (!p) throw new ErroNegocio("Proposta não encontrada.");
  await tx.$queryRaw`SELECT "id" FROM "Projeto" WHERE "id" = ${p.projetoId} FOR UPDATE`;
  if ((await tx.projeto.findUniqueOrThrow({ where: { id: p.projetoId }, select: { status: true } })).status === "CANCELADO") throw new ErroNegocio("O projeto está cancelado.");
  const revisoes = await lerRevisoes(tx, p.numero);
  const plano = planoDeReabertura(revisoes, propostaId);
  if ("erro" in plano) throw new ErroNegocio(plano.erro);

  for (const m of plano.mudancas) {
    const r = await tx.proposta.updateMany({ where: { id: m.id, status: m.de, deletadoEm: null }, data: { status: m.para, atualizadoPorId: usuario.id } });
    if (r.count === 0) throw new ErroNegocio("Esta revisão mudou enquanto você decidia. Atualize a página.");
  }
  const meu = plano.mudancas.find((m) => m.id === propostaId)!;
  const substituidas = plano.mudancas.filter((m) => m.id !== propostaId).length;
  await registrarInteracao(tx, {
    tipo: "SISTEMA",
    texto: `A ${rotuloDaRevisao(p.revisao)} da proposta ${p.numero} foi reaberta como ${meu.para === "RASCUNHO" ? "rascunho" : "enviada"}.${substituidas > 0 ? " A revisão que valia saiu de vigor." : ""}`,
    clienteId: p.projeto.clienteId,
    projetoId: p.projetoId,
    usuarioId: usuario.id,
  });
  await registrarAuditoria(tx, { usuario, entidade: "Proposta", entidadeId: propostaId, acao: "REABRIR_REVISAO", antes: { status: "SUBSTITUIDA" }, depois: { status: meu.para, revisoes: plano.mudancas }, ip });
  return { numero: p.numero, projetoId: p.projetoId, revisao: p.revisao, status: meu.para, substituidas };
}

// ---------------------------------------------------------------------------------------------------------
// Trocar a aprovação: desfazer a vigente e aprovar a revisão escolhida, numa transação só
// ---------------------------------------------------------------------------------------------------------

export type EntradaTroca = {
  usuario: Usuario;
  /** A proposta aprovada hoje. */
  deId: string;
  /** A revisão substituída que passa a ser a aprovada. */
  paraId: string;
  opcaoId: string;
  forma: "WHATSAPP" | "EMAIL" | "ASSINATURA" | "VERBAL";
  /** Data do aceite, "aaaa-mm-dd" (a tela já vem com a da aprovação anterior). */
  aceitaEm: string;
  observacao?: string | null;
  motivo: string;
  ip?: string | null;
  agora?: Date;
};

export type ResultadoTroca = { numero: string; projetoId: string; valorAprovadoCentavos: number; parcelasGeradas: number; etapasGeradas: number; valorFechadoCentavos: number; desfeita: ResultadoDesfazer };

/**
 * Sem estado intermediário: tudo ou nada. Desfazer (com etapas e prazo refeitos, mas fase, acompanhamento, valor fechado
 * e data de fechamento deixados para a aprovação) + aprovar a revisão escolhida, que gera parcelas, tarefas e etapas
 * dela, com o prazo dela. Se qualquer passo recusar (bloqueio, revisão incompleta), nada muda.
 */
export async function trocarAprovacao(tx: Tx, e: EntradaTroca): Promise<ResultadoTroca> {
  const { usuario, deId, paraId, ip } = e;
  const agora = e.agora ?? new Date();
  if (deId === paraId) throw new ErroNegocio("Escolha outra revisão para aprovar no lugar desta.");

  await travarFamiliaDaProposta(tx, deId);
  const buscar = (id: string) => tx.proposta.findFirst({ where: { id, deletadoEm: null, projeto: { deletadoEm: null } }, select: { id: true, numero: true, revisao: true, status: true, projetoId: true, projeto: { select: { clienteId: true } } } });
  const de = await buscar(deId);
  const para = await buscar(paraId);
  if (!de || !para) throw new ErroNegocio("Proposta não encontrada.");
  if (de.numero !== para.numero || de.projetoId !== para.projetoId) throw new ErroNegocio("As duas propostas precisam ser revisões do mesmo número.");
  if (de.status !== "APROVADA") throw new ErroNegocio(`A ${rotuloDaRevisao(de.revisao)} não está aprovada (a aprovação já foi desfeita ou trocada?). Atualize a página.`);
  if (para.status !== "SUBSTITUIDA") throw new ErroNegocio(`A ${rotuloDaRevisao(para.revisao)} não ficou de lado; só dá para trocar por uma revisão substituída.`);

  const desfeita = await desfazerAprovacao(tx, { usuario, propostaId: deId, motivo: e.motivo, reabrirId: paraId, emTroca: true, ip, agora });
  const r = await aprovarProposta(tx, { usuario, propostaId: paraId, opcaoId: e.opcaoId, forma: e.forma, aceitaEm: e.aceitaEm, observacao: e.observacao, ip, agora });

  // A data de fechamento é a do primeiro aceite entre as propostas aprovadas (a aprovação, com o projeto já em "Aprovado", só soma o valor).
  const aprovadas = await tx.proposta.findMany({ where: { projetoId: de.projetoId, status: "APROVADA", deletadoEm: null }, select: { aceitaEm: true } });
  const primeiro = aprovadas.reduce<Date | null>((m, x) => (x.aceitaEm && (m === null || x.aceitaEm < m) ? x.aceitaEm : m), null);
  await tx.projeto.update({ where: { id: de.projetoId }, data: { dataFechamento: primeiro, atualizadoPorId: usuario.id } });

  await registrarInteracao(tx, {
    tipo: "SISTEMA",
    texto: `Aprovação trocada: a ${rotuloDaRevisao(de.revisao)} da proposta ${de.numero} deixou de valer e a ${rotuloDaRevisao(para.revisao)} foi aprovada (${formatarMoeda(r.valorAprovadoCentavos)}). Motivo: ${e.motivo.trim()}.`,
    clienteId: de.projeto.clienteId,
    projetoId: de.projetoId,
    usuarioId: usuario.id,
  });
  await registrarAuditoria(tx, {
    usuario,
    entidade: "Proposta",
    entidadeId: paraId,
    acao: "TROCAR_APROVACAO",
    antes: { aprovadaId: deId, revisao: de.revisao },
    depois: { aprovadaId: paraId, revisao: para.revisao, valorAprovadoCentavos: r.valorAprovadoCentavos, parcelas: r.parcelasGeradas, etapas: r.etapasGeradas, motivo: e.motivo.trim() },
    ip,
  });
  return { numero: de.numero, projetoId: de.projetoId, valorAprovadoCentavos: r.valorAprovadoCentavos, parcelasGeradas: r.parcelasGeradas, etapasGeradas: r.etapasGeradas, valorFechadoCentavos: r.valorFechadoCentavos, desfeita };
}
