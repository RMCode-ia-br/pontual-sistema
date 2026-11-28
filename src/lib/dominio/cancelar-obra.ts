/**
 * Cancelar uma obra JÁ APROVADA (Fase 7C, decisão 183; regra 13 do dono). Regras puras e testáveis: o servidor lê os fatos
 * do banco (dentro da transação, depois dos locks), chama estas funções e só então muda alguma coisa.
 *
 * Não confundir com "desfazer a aprovação" (7A.1): aquela anula a venda (a proposta deixa de estar aprovada). Cancelar a
 * obra mantém a proposta APROVADA, então a venda do mês da aprovação continua contada e o cancelamento aparece em linha
 * própria, no mês em que aconteceu.
 */
import { formatarMoeda } from "@/lib/formatadores";

import type { Bloqueio, StatusParcelaFato } from "./desfazer-aprovacao";
export type { Bloqueio };
import { ROTULO_STATUS_PROJETO, type StatusProjeto } from "./funil";

export type ParcelaDoCancelamento = {
  ordem: number;
  status: StatusParcelaFato;
  valorCentavos: number;
  valorPagoCentavos: number;
  /** Pagamentos não estornados nem excluídos. */
  lancamentosAtivos: number;
};

export type FatosDoCancelamento = {
  projetoStatus: string;
  /** Há proposta aprovada (viva) neste projeto. */
  temPropostaAprovada: boolean;
  /** Parcelas a receber da proposta (as de cobrança de assistência não entram). */
  parcelas: ParcelaDoCancelamento[];
  tarefasAbertas: number;
  /** Agendamentos ativos e ainda por vir (agendado, confirmado ou remarcado) ligados ao projeto. */
  agendamentos: { rotulo: string; dataBr: string }[];
  compras: number;
  saidasDeEstoque: number;
  retalhos: number;
  sucata: number;
  contasAPagar: number;
  despesasDaObra: number;
  chamadosEmAberto: number;
};

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;


/**
 * O que impede o cancelamento, em palavras simples. Vazio = pode cancelar. Só dá para cancelar obra aprovada ou em
 * execução; concluída, já cancelada ou ainda sem aprovação não.
 */
export function bloqueiosDoCancelamento(f: FatosDoCancelamento): Bloqueio[] {
  if (f.projetoStatus === "CANCELADO") return [{ codigo: "JA_CANCELADA", texto: "Esta obra já está cancelada. Atualize a página." }];
  if (f.projetoStatus === "CONCLUIDO") {
    return [{ codigo: "CONCLUIDA", texto: "A obra já foi concluída: não dá para cancelar. Se houve problema depois da entrega, abra um chamado de assistência." }];
  }
  if (f.projetoStatus !== "APROVADO" && f.projetoStatus !== "EM_EXECUCAO") {
    const fase = (ROTULO_STATUS_PROJETO[f.projetoStatus as StatusProjeto] ?? f.projetoStatus).toLowerCase();
    return [{ codigo: "NAO_APROVADA", texto: `Este projeto ainda não foi aprovado (está em "${fase}"). Antes da aprovação, o caminho é marcá-lo como perdido no funil.` }];
  }
  if (!f.temPropostaAprovada) return [{ codigo: "SEM_PROPOSTA_APROVADA", texto: "Não há proposta aprovada neste projeto para cancelar." }];
  return [];
}

export type PlanoDoCancelamento = {
  /** Parcelas sem nenhum recebimento: ficam CANCELADAS (e a tarefa de cobrança delas é cancelada). */
  parcelasACancelar: { ordem: number; valorCentavos: number }[];
  /** Parcelas que já têm recebimento: NÃO mudam (o dinheiro recebido fica registrado). */
  parcelasQueFicam: { ordem: number; valorPagoCentavos: number }[];
  valorACancelarCentavos: number;
  valorRecebidoCentavos: number;
  tarefasACancelar: number;
  /** Avisos (não bloqueiam): o que o sistema NÃO desfaz e a pessoa precisa tratar à parte. */
  avisos: Bloqueio[];
};

/** O que muda e o que fica, calculado só dos fatos (a prévia da tela e a ação usam a MESMA função). */
export function planoDoCancelamento(f: FatosDoCancelamento): PlanoDoCancelamento {
  const vivas = f.parcelas.filter((p) => p.status !== "CANCELADA");
  const temRecebimento = (p: ParcelaDoCancelamento) => p.status === "PAGA" || p.status === "PARCIAL" || p.valorPagoCentavos > 0 || p.lancamentosAtivos > 0;
  const aCancelar = vivas.filter((p) => !temRecebimento(p));
  const ficam = vivas.filter(temRecebimento);
  const valorRecebido = ficam.reduce((s, p) => s + p.valorPagoCentavos, 0);

  const avisos: Bloqueio[] = [];
  if (ficam.length > 0) {
    avisos.push({
      codigo: "RECEBIDO",
      texto: `Já foram recebidos ${formatarMoeda(valorRecebido)} (${plural(ficam.length, "parcela", "parcelas")}). O sistema NÃO devolve dinheiro: se for devolver ao cliente, faça o estorno em Financeiro, separado.`,
    });
  }
  for (const a of f.agendamentos) avisos.push({ codigo: "AGENDAMENTO", texto: `Há um agendamento de ${a.rotulo} em ${a.dataBr}. Ele NÃO é cancelado: cancele na agenda.` });
  if (f.compras > 0) avisos.push({ codigo: "COMPRA", texto: `A obra tem ${plural(f.compras, "compra", "compras")}. ${f.compras === 1 ? "Ela" : "Elas"} NÃO ${f.compras === 1 ? "é cancelada" : "são canceladas"}: decida em Estoque e compras.` });
  if (f.saidasDeEstoque > 0) avisos.push({ codigo: "ESTOQUE", texto: `Saiu material do estoque para esta obra (${plural(f.saidasDeEstoque, "movimento", "movimentos")}). A saída NÃO é estornada: devolva ou estorne em Estoque.` });
  if (f.retalhos > 0) avisos.push({ codigo: "RETALHO", texto: `Há ${plural(f.retalhos, "retalho", "retalhos")} ligado(s) a esta obra. Fica(m) como está(ão): resolva no estoque.` });
  if (f.sucata > 0) avisos.push({ codigo: "SUCATA", texto: `Há ${plural(f.sucata, "registro de sucata", "registros de sucata")} desta obra. Fica(m) como está(ão).` });
  if (f.contasAPagar > 0) avisos.push({ codigo: "CONTA_A_PAGAR", texto: `A obra tem ${plural(f.contasAPagar, "conta a pagar", "contas a pagar")}. ${f.contasAPagar === 1 ? "Ela" : "Elas"} NÃO ${f.contasAPagar === 1 ? "é cancelada" : "são canceladas"}: trate em Financeiro.` });
  if (f.despesasDaObra > 0) avisos.push({ codigo: "DESPESA", texto: `A obra tem ${plural(f.despesasDaObra, "despesa lançada", "despesas lançadas")}. ${f.despesasDaObra === 1 ? "Ela" : "Elas"} NÃO ${f.despesasDaObra === 1 ? "é estornada" : "são estornadas"}.` });
  if (f.chamadosEmAberto > 0) avisos.push({ codigo: "CHAMADO", texto: `A obra tem ${plural(f.chamadosEmAberto, "chamado de assistência em aberto", "chamados de assistência em aberto")}. ${f.chamadosEmAberto === 1 ? "Ele continua" : "Eles continuam"} aberto(s): encerre em Assistência.` });

  return {
    parcelasACancelar: aCancelar.map((p) => ({ ordem: p.ordem, valorCentavos: p.valorCentavos })),
    parcelasQueFicam: ficam.map((p) => ({ ordem: p.ordem, valorPagoCentavos: p.valorPagoCentavos })),
    valorACancelarCentavos: aCancelar.reduce((s, p) => s + p.valorCentavos, 0),
    valorRecebidoCentavos: valorRecebido,
    tarefasACancelar: f.tarefasAbertas,
    avisos,
  };
}

/** Frase que vai para a linha do tempo da obra. */
export function textoDoCancelamento(p: { codigo: string; motivo: string; plano: PlanoDoCancelamento }): string {
  const { plano } = p;
  const partes = [`Obra ${p.codigo} cancelada. Motivo: ${p.motivo}.`];
  if (plano.parcelasACancelar.length > 0) partes.push(`${plural(plano.parcelasACancelar.length, "parcela a receber cancelada", "parcelas a receber canceladas")} (${formatarMoeda(plano.valorACancelarCentavos)}).`);
  if (plano.parcelasQueFicam.length > 0) partes.push(`${formatarMoeda(plano.valorRecebidoCentavos)} já recebido(s) ficam registrados (devolução, se houver, é estorno à parte).`);
  if (plano.tarefasACancelar > 0) partes.push(`${plural(plano.tarefasACancelar, "tarefa aberta cancelada", "tarefas abertas canceladas")}.`);
  return partes.join(" ");
}
