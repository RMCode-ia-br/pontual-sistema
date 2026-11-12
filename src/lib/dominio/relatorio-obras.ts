/**
 * Relatórios de obras (Fase 4): atrasos por etapa, pausas por motivo e assistências. Código puro sobre datas de
 * calendário "aaaa-mm-dd". A pontualidade das obras está em `pontualidade.ts`.
 */
import { diferencaEmDias } from "./calendario";
import { TIPOS_DE_ETAPA, type TipoDeEtapa } from "./etapas";
import type { StatusDeEtapa } from "./prazo-obra";
import { etapaAtrasada } from "./semaforo";

/** Uma casa decimal só com inteiros (soma e n positivos). */
function mediaComUmaCasa(soma: number, n: number): number | null {
  return n === 0 ? null : Math.round((soma * 10) / n) / 10;
}

// ---------------------------------------------------------------------------------------------------------
// Atrasos por etapa
// ---------------------------------------------------------------------------------------------------------

export type EtapaDoRelatorio = { tipo: TipoDeEtapa; status: StatusDeEtapa; fimPrevisto: string | null; fimReal: string | null };

export type AtrasoDaEtapa = {
  tipo: TipoDeEtapa;
  /** Concluídas dentro do período (data real de fim entre as duas datas, inclusive). */
  concluidasNoPeriodo: number;
  /** Dessas, as que tinham data prevista (só estas podem ser avaliadas). */
  comPrazo: number;
  /** Das que tinham data prevista, as concluídas depois dela. */
  comAtraso: number;
  /** Média, em dias corridos, só das que atrasaram; `null` se nenhuma atrasou. */
  atrasoMedioDias: number | null;
  /** Etapas abertas e hoje já atrasadas (foto de hoje, não depende do período). */
  abertasAtrasadas: number;
};

/** Uma linha por tipo de etapa que tenha algo a mostrar, na ordem do fluxo. */
export function resumirAtrasosDasEtapas(etapas: readonly EtapaDoRelatorio[], hoje: string, de: string, ate: string): AtrasoDaEtapa[] {
  return TIPOS_DE_ETAPA.map((tipo): AtrasoDaEtapa => {
    const daqui = etapas.filter((e) => e.tipo === tipo);
    const concluidas = daqui.filter((e) => e.status === "CONCLUIDA" && e.fimReal !== null && e.fimReal >= de && e.fimReal <= ate);
    const avaliadas = concluidas.filter((e) => e.fimPrevisto !== null);
    const atrasadas = avaliadas.filter((e) => e.fimReal! > e.fimPrevisto!);
    const soma = atrasadas.reduce((s, e) => s + diferencaEmDias(e.fimPrevisto!, e.fimReal!), 0);
    return {
      tipo,
      concluidasNoPeriodo: concluidas.length,
      comPrazo: avaliadas.length,
      comAtraso: atrasadas.length,
      atrasoMedioDias: mediaComUmaCasa(soma, atrasadas.length),
      abertasAtrasadas: daqui.filter((e) => etapaAtrasada(e, hoje)).length,
    };
  }).filter((l) => l.concluidasNoPeriodo > 0 || l.abertasAtrasadas > 0);
}

// ---------------------------------------------------------------------------------------------------------
// Pausas por motivo
// ---------------------------------------------------------------------------------------------------------

export type PausaDoRelatorio = { motivo: string; inicio: string; fim: string | null; justificada: boolean };
export type PausasDoMotivo = { motivo: string; quantidade: number; justificadas: number; dias: number };

/** Dias corridos da pausa, com o primeiro e o último dia contando; pausa em curso conta até hoje. */
export function diasDaPausa(p: Pick<PausaDoRelatorio, "inicio" | "fim">, hoje: string): number {
  const fim = p.fim ?? hoje;
  return fim < p.inicio ? 0 : diferencaEmDias(p.inicio, fim) + 1;
}

/** Do motivo que mais parou as obras (em dias) para o que menos parou; empate: ordem alfabética. */
export function resumirPausasPorMotivo(pausas: readonly PausaDoRelatorio[], hoje: string): PausasDoMotivo[] {
  const porMotivo = new Map<string, PausasDoMotivo>();
  for (const p of pausas) {
    const atual = porMotivo.get(p.motivo) ?? { motivo: p.motivo, quantidade: 0, justificadas: 0, dias: 0 };
    atual.quantidade += 1;
    atual.justificadas += p.justificada ? 1 : 0;
    atual.dias += diasDaPausa(p, hoje);
    porMotivo.set(p.motivo, atual);
  }
  return [...porMotivo.values()].sort((a, b) => b.dias - a.dias || a.motivo.localeCompare(b.motivo, "pt-BR"));
}

// ---------------------------------------------------------------------------------------------------------
// Assistências
// ---------------------------------------------------------------------------------------------------------

export type ChamadoDoRelatorio = {
  classificacao: "EM_GARANTIA" | "FORA_DA_GARANTIA";
  tipoProblema: string;
  status: string;
  abertoEm: string;
  resolvidoEm: string | null;
  cobrarVisita: boolean;
  valorCobradoCentavos: number | null;
  temCobranca: boolean;
};

export type ResumoDeAssistencias = {
  total: number;
  emGarantia: number;
  foraDaGarantia: number;
  porTipo: { tipo: string; quantidade: number }[];
  resolvidos: number;
  /** Média, em dias corridos da abertura à resolução, dos resolvidos; `null` sem nenhum. */
  diasMedioParaResolver: number | null;
  /** Chamados em que a visita é cobrada e quanto isso soma (só o que já tem valor informado). */
  visitasCobradas: number;
  valorCobradoCentavos: number;
  /** Cobranças que já viraram conta a receber. */
  cobrancasGeradas: number;
};

/** `chamados` = os abertos no período; quem chama decide o recorte. */
export function resumirAssistencias(chamados: readonly ChamadoDoRelatorio[]): ResumoDeAssistencias {
  const tipos = new Map<string, number>();
  for (const c of chamados) tipos.set(c.tipoProblema, (tipos.get(c.tipoProblema) ?? 0) + 1);
  const resolvidos = chamados.filter((c) => c.status === "RESOLVIDO" && c.resolvidoEm !== null);
  const cobradas = chamados.filter((c) => c.cobrarVisita && c.status !== "CANCELADO");
  return {
    total: chamados.length,
    emGarantia: chamados.filter((c) => c.classificacao === "EM_GARANTIA").length,
    foraDaGarantia: chamados.filter((c) => c.classificacao === "FORA_DA_GARANTIA").length,
    porTipo: [...tipos.entries()].map(([tipo, quantidade]) => ({ tipo, quantidade })).sort((a, b) => b.quantidade - a.quantidade || a.tipo.localeCompare(b.tipo)),
    resolvidos: resolvidos.length,
    diasMedioParaResolver: mediaComUmaCasa(
      resolvidos.reduce((s, c) => s + Math.max(0, diferencaEmDias(c.abertoEm, c.resolvidoEm!)), 0),
      resolvidos.length,
    ),
    visitasCobradas: cobradas.length,
    valorCobradoCentavos: cobradas.reduce((s, c) => s + (c.valorCobradoCentavos ?? 0), 0),
    cobrancasGeradas: chamados.filter((c) => c.temCobranca).length,
  };
}
