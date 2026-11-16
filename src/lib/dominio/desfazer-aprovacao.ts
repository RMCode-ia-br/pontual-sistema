/**
 * Desfazer, trocar e reabrir a aprovação de uma proposta (Fase 7A.1). Regras puras e testáveis: o servidor lê os fatos
 * do banco (dentro da transação, depois dos locks), chama estas funções e só então muda alguma coisa.
 */
import { formatarMoeda } from "@/lib/formatadores";

import type { StatusProposta } from "./ciclo-proposta";

// ----- Bloqueios do desfazer -----

export type StatusParcelaFato = "AGUARDANDO_GATILHO" | "ABERTA" | "PARCIAL" | "PAGA" | "CANCELADA";
export type StatusEtapaFato = "PENDENTE" | "EM_ANDAMENTO" | "CONCLUIDA" | "BLOQUEADA" | "DISPENSADA";

export type FatosDoDesfazer = {
  propostaStatus: StatusProposta;
  /** Status do PROJETO (APROVADO, EM_EXECUCAO, CONCLUIDO, CANCELADO...). */
  projetoStatus: string;
  /** Parcelas a receber da proposta (ativas). `lancamentosAtivos` = pagamentos não estornados nem excluídos. */
  parcelas: { ordem: number; status: StatusParcelaFato; valorPagoCentavos: number; lancamentosAtivos: number }[];
  /** Etapas ativas da obra. `temDataReal` = início ou fim real preenchido. */
  etapas: { nome: string; status: StatusEtapaFato; temDataReal: boolean }[];
  pausasAtivas: number;
  fotosDeObra: number;
  /** Agendamentos ativos (agendado, confirmado ou realizado) de medição, instalação ou entrega ligados ao projeto. */
  agendamentos: { rotulo: string; dataBr: string }[];
  compras: number;
  saidasDeEstoque: number;
  retalhos: number;
  sucata: number;
  contasAPagar: number;
  /** Despesas lançadas direto na obra (saída de caixa com o projeto e sem conta a pagar). */
  despesasDaObra: number;
  chamados: number;
};

export type Bloqueio = { codigo: string; texto: string };

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * O que impede desfazer a aprovação, em palavras simples e dizendo o que fazer antes. Vazio = pode desfazer.
 * Se a proposta nem está aprovada (já foi desfeita, duplo clique), esse é o único motivo: o resto não importa.
 */
export function bloqueiosDoDesfazer(f: FatosDoDesfazer): Bloqueio[] {
  if (f.propostaStatus !== "APROVADA") {
    return [{ codigo: "NAO_APROVADA", texto: "Esta proposta não está aprovada (a aprovação já foi desfeita?). Atualize a página." }];
  }
  const b: Bloqueio[] = [];

  if (f.projetoStatus === "EM_EXECUCAO") b.push({ codigo: "OBRA_EM_EXECUCAO", texto: "A obra já está em execução; não dá para desfazer a aprovação." });
  else if (f.projetoStatus === "CONCLUIDO") b.push({ codigo: "OBRA_CONCLUIDA", texto: "A obra já foi concluída; não dá para desfazer a aprovação." });
  else if (f.projetoStatus === "CANCELADO") b.push({ codigo: "PROJETO_CANCELADO", texto: "O projeto está cancelado; não dá para desfazer a aprovação." });

  for (const p of f.parcelas) {
    if (p.status === "PAGA" || p.status === "PARCIAL" || p.valorPagoCentavos > 0 || p.lancamentosAtivos > 0) {
      b.push({ codigo: "RECEBIMENTO", texto: `A parcela ${p.ordem} já tem recebimento. Estorne o recebimento em Financeiro antes de desfazer.` });
    }
  }

  for (const e of f.etapas) {
    if (e.status !== "PENDENTE" && e.status !== "DISPENSADA") {
      b.push({ codigo: "ETAPA_ANDOU", texto: `A etapa "${e.nome}" já andou (${rotuloDaEtapa(e.status)}). Volte-a para pendente na obra antes de desfazer.` });
    } else if (e.temDataReal) {
      b.push({ codigo: "ETAPA_ANDOU", texto: `A etapa "${e.nome}" tem data real registrada. Limpe as datas reais na obra antes de desfazer.` });
    }
  }
  if (f.pausasAtivas > 0) b.push({ codigo: "PAUSA", texto: `A obra tem ${plural(f.pausasAtivas, "pausa registrada", "pausas registradas")}. Exclua-${f.pausasAtivas === 1 ? "a" : "as"} na obra antes de desfazer.` });
  if (f.fotosDeObra > 0) b.push({ codigo: "FOTOS", texto: `A obra tem ${plural(f.fotosDeObra, "foto", "fotos")}. Exclua ${f.fotosDeObra === 1 ? "a foto" : "as fotos"} antes de desfazer.` });

  for (const a of f.agendamentos) b.push({ codigo: "AGENDAMENTO", texto: `Há um agendamento de ${a.rotulo} em ${a.dataBr}. Cancele o agendamento antes de desfazer.` });

  if (f.compras > 0) b.push({ codigo: "COMPRA", texto: `A obra tem ${plural(f.compras, "compra", "compras")}. Cancele ${f.compras === 1 ? "a compra" : "as compras"} antes de desfazer.` });
  if (f.saidasDeEstoque > 0) b.push({ codigo: "ESTOQUE", texto: `Saiu material do estoque para esta obra (${plural(f.saidasDeEstoque, "movimento", "movimentos")}). Estorne a saída antes de desfazer.` });
  if (f.retalhos > 0) b.push({ codigo: "RETALHO", texto: `Há ${plural(f.retalhos, "retalho", "retalhos")} ligado(s) a esta obra. Resolva no estoque antes de desfazer.` });
  if (f.sucata > 0) b.push({ codigo: "SUCATA", texto: `Há ${plural(f.sucata, "registro de sucata", "registros de sucata")} desta obra. Estorne no estoque antes de desfazer.` });
  if (f.contasAPagar > 0) b.push({ codigo: "CONTA_A_PAGAR", texto: `A obra tem ${plural(f.contasAPagar, "conta a pagar", "contas a pagar")}. Cancele ${f.contasAPagar === 1 ? "a conta" : "as contas"} antes de desfazer.` });
  if (f.despesasDaObra > 0) b.push({ codigo: "DESPESA", texto: `A obra tem ${plural(f.despesasDaObra, "despesa lançada", "despesas lançadas")}. Estorne ${f.despesasDaObra === 1 ? "a despesa" : "as despesas"} antes de desfazer.` });
  if (f.chamados > 0) b.push({ codigo: "CHAMADO", texto: `A obra tem ${plural(f.chamados, "chamado de assistência", "chamados de assistência")}. Cancele ${f.chamados === 1 ? "o chamado" : "os chamados"} antes de desfazer.` });

  return b;
}

function rotuloDaEtapa(s: StatusEtapaFato): string {
  return s === "EM_ANDAMENTO" ? "em andamento" : s === "CONCLUIDA" ? "concluída" : s === "BLOQUEADA" ? "bloqueada" : s.toLowerCase();
}

// ----- Revisões do mesmo número -----

export type RevisaoBasica = { id: string; revisao: number; status: StatusProposta; temSnapshot: boolean };

const rotuloRev = (r: number) => (r === 0 ? "original" : `Rev. ${r}`);
export { rotuloRev as rotuloDaRevisao };

/**
 * Qual revisão vale. Vigente = a aprovada; senão a enviada (ou expirada) de maior revisão; senão o rascunho de maior
 * revisão. "Mais recente" = a de maior revisão que não esteja cancelada. O chamador já tira as excluídas.
 */
export function situacaoDasRevisoes(revs: RevisaoBasica[]): { vigenteId: string | null; maisRecenteId: string | null } {
  const maior = (lista: RevisaoBasica[]) => lista.reduce<RevisaoBasica | null>((a, r) => (a === null || r.revisao > a.revisao ? r : a), null);
  const aprovada = revs.find((r) => r.status === "APROVADA");
  const vigente = aprovada ?? maior(revs.filter((r) => r.status === "ENVIADA" || r.status === "EXPIRADA")) ?? maior(revs.filter((r) => r.status === "RASCUNHO"));
  const recente = maior(revs.filter((r) => r.status !== "CANCELADA"));
  return { vigenteId: vigente?.id ?? null, maisRecenteId: recente?.id ?? null };
}

/**
 * A revisão mais nova que seria DESCARTADA ao aprovar `atual`: maior revisão acima dela que está em rascunho ou
 * enviada. Serve ao aviso do diálogo de aprovar.
 */
export function revisaoMaisNovaEmAberto(atual: { id: string; revisao: number }, revs: RevisaoBasica[]): RevisaoBasica | null {
  const mais = revs.filter((r) => r.id !== atual.id && r.revisao > atual.revisao && (r.status === "RASCUNHO" || r.status === "ENVIADA"));
  return mais.reduce<RevisaoBasica | null>((a, r) => (a === null || r.revisao > a.revisao ? r : a), null);
}

export function textoDoAvisoDeRevisaoMaisNova(atual: { revisao: number }, nova: RevisaoBasica): string {
  const estado = nova.status === "RASCUNHO" ? "rascunho" : "enviada";
  return `A ${rotuloRev(nova.revisao)} é mais recente (${estado}). Aprovar esta, a ${rotuloRev(atual.revisao)}, vai descartar a ${rotuloRev(nova.revisao)}.`;
}

export type MudancaDeRevisao = { id: string; de: StatusProposta; para: StatusProposta };
export type PlanoDeRevisoes = { mudancas: MudancaDeRevisao[] } | { erro: string };

/**
 * Reabre uma revisão SUBSTITUÍDA. Com snapshot (já foi enviada) volta a ENVIADA e a enviada que estava valendo sai de
 * vigor; sem snapshot (era rascunho) volta a RASCUNHO e a enviada continua valendo (decisão 67). Nunca com irmã
 * aprovada e nunca com dois rascunhos do mesmo número.
 */
export function planoDeReabertura(revs: RevisaoBasica[], escolhidaId: string): PlanoDeRevisoes {
  const alvo = revs.find((r) => r.id === escolhidaId);
  if (!alvo) return { erro: "A revisão escolhida não foi encontrada." };
  const aprovada = revs.find((r) => r.status === "APROVADA");
  if (aprovada) return { erro: `A ${rotuloRev(aprovada.revisao)} está aprovada. Desfaça a aprovação (ou use "Trocar pela ${rotuloRev(alvo.revisao)}") antes.` };
  if (alvo.status !== "SUBSTITUIDA") return { erro: `A ${rotuloRev(alvo.revisao)} não está substituída; não há o que reabrir.` };

  if (alvo.temSnapshot) {
    return {
      mudancas: [
        { id: alvo.id, de: "SUBSTITUIDA", para: "ENVIADA" },
        ...revs.filter((r) => r.id !== alvo.id && r.status === "ENVIADA").map((r) => ({ id: r.id, de: r.status, para: "SUBSTITUIDA" as const })),
      ],
    };
  }
  const outroRascunho = revs.find((r) => r.id !== alvo.id && r.status === "RASCUNHO");
  if (outroRascunho) return { erro: `Já existe a ${rotuloRev(outroRascunho.revisao)} em rascunho. Continue nela ou exclua-a antes.` };
  return { mudancas: [{ id: alvo.id, de: "SUBSTITUIDA", para: "RASCUNHO" }] };
}

/**
 * Como ficam as revisões ao desfazer a aprovação de `desfeitaId`. A desfeita volta a ENVIADA; se o usuário escolheu
 * reabrir uma irmã substituída, vale a regra de `planoDeReabertura` sobre o resultado (as demais irmãs continuam
 * substituídas). `escolhidaId` nulo = só a desfeita volta.
 */
export function planoDeDesfazer(revs: RevisaoBasica[], desfeitaId: string, escolhidaId: string | null): PlanoDeRevisoes {
  const desfeita = revs.find((r) => r.id === desfeitaId);
  if (!desfeita) return { erro: "Proposta não encontrada." };
  if (desfeita.status !== "APROVADA") return { erro: "Esta proposta não está aprovada." };
  const mudancas: MudancaDeRevisao[] = [{ id: desfeitaId, de: "APROVADA", para: "ENVIADA" }];
  if (escolhidaId === null) return { mudancas };
  if (escolhidaId === desfeitaId) return { erro: "Escolha outra revisão para reabrir." };

  const aposDesfazer = revs.map((r) => (r.id === desfeitaId ? { ...r, status: "ENVIADA" as const } : r));
  const reabrir = planoDeReabertura(aposDesfazer, escolhidaId);
  if ("erro" in reabrir) return reabrir;
  // Junta: a desfeita pode ter sido rebaixada (ENVIADA → SUBSTITUIDA) pela reabertura; vale o estado final.
  const finais = new Map(mudancas.map((m) => [m.id, m]));
  for (const m of reabrir.mudancas) {
    if (m.id === desfeitaId) finais.set(m.id, { id: m.id, de: "APROVADA", para: m.para });
    else finais.set(m.id, m);
  }
  return { mudancas: [...finais.values()] };
}

/** Revisão que o padrão da tela reabre ao desfazer: a SUBSTITUIDA de maior revisão (a mais recente). */
export function reabrirPadrao(revs: RevisaoBasica[], desfeitaId: string): string | null {
  const candidatas = revs.filter((r) => r.id !== desfeitaId && r.status === "SUBSTITUIDA");
  return candidatas.reduce<RevisaoBasica | null>((a, r) => (a === null || r.revisao > a.revisao ? r : a), null)?.id ?? null;
}

// ----- Vendido do mês do aceite -----

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/**
 * Desfazer uma aprovação de mês anterior altera o "Vendido" daquele mês. `aceitaEm` e `hoje` são datas de calendário
 * "aaaa-mm-dd" (hoje no fuso de São Paulo). Devolve o aviso, ou null se o aceite é do mês atual (ou posterior).
 */
export function avisoDeMesDoAceite(entrada: { aceitaEm: string; hoje: string; valorCentavos: number }): string | null {
  const [ay, am] = entrada.aceitaEm.slice(0, 7).split("-").map(Number);
  const [hy, hm] = entrada.hoje.slice(0, 7).split("-").map(Number);
  if (!ay || !am || !hy || !hm) return null;
  if (ay * 12 + am >= hy * 12 + hm) return null;
  const mes = `${MESES[am - 1]}/${ay}`;
  return `A aprovação é de ${mes}: desfazer tira ${formatarMoeda(entrada.valorCentavos)} do Vendido de ${mes}.`;
}

/** Prazo da obra em palavras, para a prévia da troca ("23 dias úteis (material 10 + execução 5 + vidros 8)"). */
export function textoDoPrazo(p: { modo: "NENHUM" | "TOTAL" | "POR_ETAPA"; dias: number | null; material: number | null; execucao: number | null; vidros: number | null; tipoDias: "UTEIS" | "CORRIDOS" }): string {
  if (p.modo === "NENHUM" || !p.dias || p.dias <= 0) return "sem prazo definido";
  const tipo = p.tipoDias === "CORRIDOS" ? (p.dias === 1 ? "corrido" : "corridos") : p.dias === 1 ? "útil" : "úteis";
  const base = `${p.dias} ${p.dias === 1 ? "dia" : "dias"} ${tipo}`;
  if (p.modo === "POR_ETAPA") return `${base} (material ${p.material ?? 0} + execução ${p.execucao ?? 0} + vidros e acabamento ${p.vidros ?? 0})`;
  return base;
}

/**
 * Aposenta a chave única de uma tarefa da aprovação desfeita (a chave é única no banco inteiro, então a aprovação
 * seguinte só consegue recriar a tarefa se a antiga sair do caminho). O id da tarefa garante que nunca repete.
 */
export function chaveDeTarefaDesfeita(chave: string, tarefaId: string): string {
  return `${chave}:desfeita:${tarefaId}`;
}
