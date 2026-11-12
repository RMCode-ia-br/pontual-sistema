// Contas por idade (aging) e por faixa de vencimento: quanto está atrasado há quanto tempo e quanto vence quando.
// Funções puras sobre o resumo derivado de `situacaoDoTitulo` (atraso nunca é gravado).

import type { ResumoDoTitulo } from "./titulos";

export const FAIXAS_DE_VENCIMENTO = [
  { id: "ATRASO_MAIS_90", rotulo: "Atrasada há mais de 90 dias" },
  { id: "ATRASO_61_90", rotulo: "Atrasada de 61 a 90 dias" },
  { id: "ATRASO_31_60", rotulo: "Atrasada de 31 a 60 dias" },
  { id: "ATRASO_1_30", rotulo: "Atrasada de 1 a 30 dias" },
  { id: "HOJE", rotulo: "Vence hoje" },
  { id: "ATE_7", rotulo: "Vence em 1 a 7 dias" },
  { id: "DE_8_A_30", rotulo: "Vence em 8 a 30 dias" },
  { id: "MAIS_30", rotulo: "Vence daqui a mais de 30 dias" },
] as const;

export type FaixaDeVencimento = (typeof FAIXAS_DE_VENCIMENTO)[number]["id"];

/** Faixa de um título em aberto. Título pago, cancelado ou sem vencimento (aguardando etapa) não entra: devolve `null`. */
export function faixaDeVencimento(r: Pick<ResumoDoTitulo, "situacao" | "diasEmAtraso" | "diasParaVencer">): FaixaDeVencimento | null {
  switch (r.situacao) {
    case "ATRASADO":
      if (r.diasEmAtraso > 90) return "ATRASO_MAIS_90";
      if (r.diasEmAtraso > 60) return "ATRASO_61_90";
      if (r.diasEmAtraso > 30) return "ATRASO_31_60";
      return "ATRASO_1_30";
    case "VENCE_HOJE":
      return "HOJE";
    case "A_VENCER": {
      const d = r.diasParaVencer;
      if (d === null) return null;
      if (d <= 7) return "ATE_7";
      if (d <= 30) return "DE_8_A_30";
      return "MAIS_30";
    }
    default:
      return null;
  }
}

export type ItemDeAging = { chave: string; rotulo: string; faixa: FaixaDeVencimento; saldoCentavos: number };

export type LinhaDeAging = { chave: string; rotulo: string; porFaixa: Record<FaixaDeVencimento, number>; totalCentavos: number; atrasadoCentavos: number };

export type ResultadoDeAging = {
  linhas: LinhaDeAging[];
  totaisPorFaixa: Record<FaixaDeVencimento, number>;
  totalCentavos: number;
  atrasadoCentavos: number;
};

const vazio = (): Record<FaixaDeVencimento, number> => Object.fromEntries(FAIXAS_DE_VENCIMENTO.map((f) => [f.id, 0])) as Record<FaixaDeVencimento, number>;

const ehAtraso = (f: FaixaDeVencimento) => f.startsWith("ATRASO");

/** Agrupa por chave (cliente, fornecedor, categoria…), maiores saldos primeiro. */
export function montarAging(itens: readonly ItemDeAging[]): ResultadoDeAging {
  const mapa = new Map<string, LinhaDeAging>();
  const totais = vazio();
  let total = 0;
  let atrasado = 0;
  for (const i of itens) {
    if (i.saldoCentavos <= 0) continue;
    let linha = mapa.get(i.chave);
    if (!linha) {
      linha = { chave: i.chave, rotulo: i.rotulo, porFaixa: vazio(), totalCentavos: 0, atrasadoCentavos: 0 };
      mapa.set(i.chave, linha);
    }
    linha.porFaixa[i.faixa] += i.saldoCentavos;
    linha.totalCentavos += i.saldoCentavos;
    totais[i.faixa] += i.saldoCentavos;
    total += i.saldoCentavos;
    if (ehAtraso(i.faixa)) {
      linha.atrasadoCentavos += i.saldoCentavos;
      atrasado += i.saldoCentavos;
    }
  }
  const linhas = [...mapa.values()].sort((a, b) => b.totalCentavos - a.totalCentavos || a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  return { linhas, totaisPorFaixa: totais, totalCentavos: total, atrasadoCentavos: atrasado };
}
