import "server-only";

import type { Periodo } from "@/lib/periodo";
import { resumoDeCadastros } from "@/modules/cadastros/resumo";
import { resumoComercial } from "@/modules/comercial/resumo";
import { resumoDeEstoque } from "@/modules/estoque/resumo";
import { resumoFinanceiro } from "@/modules/financeiro/resumo";
import { ocupacaoAtualDaFabrica } from "@/modules/indicadores/fabrica";
import { fechamentoNaJanela, tempoVisitaAteProposta } from "@/modules/indicadores/fechamento";
import { faturamentoComNota, recebidoNoPeriodo } from "@/modules/indicadores/recebimentos";
import { ouAviso } from "@/modules/indicadores/dados-do-aceite";
import { vendidoNoPeriodo } from "@/modules/indicadores/vendas";
import { resumoDeObras } from "@/modules/obras/resumo";
import { resumoDePropostas } from "@/modules/propostas/resumo";
import { listarTarefas, resumoDeTarefas } from "@/modules/tarefas/queries";

/**
 * Quantos carregadores do painel rodam ao mesmo tempo. Cada carga faz ~84 consultas SQL e o pool de conexões do app é de
 * 5, então a fila é do pool de qualquer jeito. Medido em 2026-11-17 com `scripts/medir-painel.ts` (15 repetições, p50 / p95
 * em ms): 18 → 356 / 371; 9 → 359 / 376; 6 → 358 / 389; 3 → 399 / 433; 1 (em série) → 696 / 743. De 6 a 18 não muda o
 * tempo; 6 (perto do pool) limita quantas consultas ficam esperando de uma vez no plano gratuito. Abaixo de 6 piora.
 */
export const CONCORRENCIA_DO_PAINEL = 6;

export type EntradaDoPainel = {
  usuarioId: string;
  periodo: Periodo;
  /** Períodos de comparação (mês anterior e mesmo mês do ano passado) e janela da taxa de fechamento. */
  anterior: Periodo;
  anoPassado: Periodo;
  janela: Periodo;
  hoje: string;
  agora: Date;
};

/** Roda os carregadores com no máximo `limite` ao mesmo tempo e devolve o resultado de cada um pelo nome. */
export async function rodarComLimite<T extends Record<string, () => Promise<unknown>>>(carregadores: T, limite: number): Promise<{ [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  const chaves = Object.keys(carregadores) as (keyof T)[];
  const resultado = {} as { [K in keyof T]: Awaited<ReturnType<T[K]>> };
  let proximo = 0;
  async function trabalhador() {
    while (proximo < chaves.length) {
      const chave = chaves[proximo++];
      resultado[chave] = (await carregadores[chave]()) as never;
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limite, chaves.length)) }, trabalhador));
  return resultado;
}

/** Os 18 carregadores do painel (só leitura), na ordem em que são iniciados. */
export function carregadoresDoPainel(e: EntradaDoPainel) {
  return {
    // Número bloqueado por valor do aceite faltando vira aviso no cartão (ouAviso), não erro da página inteira.
    vendido: () => ouAviso(() => vendidoNoPeriodo(e.periodo)),
    vendidoAnterior: () => ouAviso(() => vendidoNoPeriodo(e.anterior)),
    vendidoAnoPassado: () => ouAviso(() => vendidoNoPeriodo(e.anoPassado)),
    recebido: () => recebidoNoPeriodo(e.periodo),
    recebidoAnterior: () => recebidoNoPeriodo(e.anterior),
    recebidoAnoPassado: () => recebidoNoPeriodo(e.anoPassado),
    comNota: () => faturamentoComNota(e.hoje),
    fechamento: () => fechamentoNaJanela(e.janela),
    tempo: () => tempoVisitaAteProposta(e.periodo),
    fabrica: () => ocupacaoAtualDaFabrica(e.hoje),
    resumo: () => resumoDeTarefas(e.usuarioId),
    proximas: () => listarTarefas({ status: "abertas" }),
    cadastros: () => resumoDeCadastros(),
    comercial: () => resumoComercial(e.periodo),
    propostas: () => resumoDePropostas(),
    obras: () => resumoDeObras(e.agora, e.periodo),
    fin: () => resumoFinanceiro(),
    estoque: () => resumoDeEstoque(e.hoje),
  };
}

export type DadosDoPainel = Awaited<ReturnType<typeof carregarDadosDoPainel>>;

export function carregarDadosDoPainel(e: EntradaDoPainel, concorrencia: number = CONCORRENCIA_DO_PAINEL) {
  return rodarComLimite(carregadoresDoPainel(e), concorrencia);
}
