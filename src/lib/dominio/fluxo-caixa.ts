// Fluxo de caixa: realizado (lançamentos) × projetado (contas a receber e a pagar em aberto, mais as ocorrências
// de recorrências ainda não geradas). Funções puras; datas "aaaa-mm-dd", dinheiro em centavos.
//
// Regras:
// - Realizado: só lançamentos não estornados, sem transferências entre contas (somam zero no total).
// - Projetado: a RECEBER que já venceu e não foi pago NÃO entra nos períodos (ninguém sabe se entra): vai para
//   "vencidos", à parte. A PAGAR vencido é dívida certa: sai no PRIMEIRO período (e é mostrado à parte também), para o saldo
//   projetado nunca ser otimista. Parcela que aguarda etapa usa a data prevista da etapa (marcada como previsão); sem
//   data, vai para "sem previsão". O que cai depois do horizonte fica de fora.

import { somarDias } from "./calendario";
import { somarMeses } from "./parcelamento";

export type PeriodoDoFluxo = { inicio: string; fim: string; rotulo: string };

export type MovimentoDoFluxo = {
  /** `null` = sem data prevista. */
  data: string | null;
  valorCentavos: number;
  /** A data veio da previsão de uma etapa, e não de um vencimento (a tela marca). */
  previsto?: boolean;
};

export type LancamentoDoFluxo = { data: string; tipo: "ENTRADA" | "SAIDA"; valorCentavos: number };

/** Janelas contíguas "próximos N dias": [hoje, hoje+30], [+31, +60], [+61, +90]. O saldo acumulado ao fim de cada uma é o saldo projetado em 30/60/90 dias. */
export function janelasDeDias(hoje: string, cortes: readonly number[]): PeriodoDoFluxo[] {
  const periodos: PeriodoDoFluxo[] = [];
  let inicio = hoje;
  for (const corte of cortes) {
    const fim = somarDias(hoje, corte);
    periodos.push({ inicio, fim, rotulo: `Até ${corte} dias` });
    inicio = somarDias(fim, 1);
  }
  return periodos;
}

const NOMES_DOS_MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** `quantidade` meses seguidos a partir do mês de `de` (o primeiro começa em `de`, os demais no dia 1). */
export function periodosMensais(de: string, quantidade: number): PeriodoDoFluxo[] {
  const primeiroDia = `${de.slice(0, 7)}-01`;
  return Array.from({ length: quantidade }, (_, i) => {
    const inicioDoMes = somarMeses(primeiroDia, i);
    const proximo = somarMeses(primeiroDia, i + 1);
    const fim = somarDias(proximo, -1);
    const [ano, mes] = inicioDoMes.split("-");
    return { inicio: i === 0 ? de : inicioDoMes, fim, rotulo: `${NOMES_DOS_MESES[Number(mes) - 1]}/${ano.slice(2)}` };
  });
}

export type LinhaDoFluxoRealizado = PeriodoDoFluxo & { entradasCentavos: number; saidasCentavos: number; liquidoCentavos: number };

/** Realizado por período. O chamador já tirou estornados e transferências. */
export function fluxoRealizado(lancamentos: readonly LancamentoDoFluxo[], periodos: readonly PeriodoDoFluxo[]): LinhaDoFluxoRealizado[] {
  return periodos.map((p) => {
    let entradas = 0;
    let saidas = 0;
    for (const l of lancamentos) {
      if (l.data < p.inicio || l.data > p.fim) continue;
      if (l.tipo === "ENTRADA") entradas += l.valorCentavos;
      else saidas += l.valorCentavos;
    }
    return { ...p, entradasCentavos: entradas, saidasCentavos: saidas, liquidoCentavos: entradas - saidas };
  });
}

export type LinhaDoFluxoProjetado = PeriodoDoFluxo & {
  entradasCentavos: number;
  saidasCentavos: number;
  /** Parte das entradas que vem só da previsão de uma etapa (sem vencimento definido ainda). */
  entradasPrevistasPorEtapaCentavos: number;
  /** Parte das saídas que são contas a pagar já vencidas (só no primeiro período). */
  saidasVencidasCentavos: number;
  liquidoCentavos: number;
  /** Saldo projetado ao FIM do período: saldo atual + líquido acumulado (sem os vencidos). */
  saldoProjetadoCentavos: number;
};

export type FluxoProjetado = {
  linhas: LinhaDoFluxoProjetado[];
  vencidos: { aReceberCentavos: number; aPagarCentavos: number };
  semPrevisao: { aReceberCentavos: number };
  aposOHorizonte: { aReceberCentavos: number; aPagarCentavos: number };
};

export function projetarFluxo(args: {
  hoje: string;
  /** Soma dos saldos das contas hoje. */
  saldoAtualCentavos: number;
  periodos: readonly PeriodoDoFluxo[];
  aReceber: readonly MovimentoDoFluxo[];
  aPagar: readonly MovimentoDoFluxo[];
}): FluxoProjetado {
  const { hoje, periodos } = args;
  const vencidos = { aReceberCentavos: 0, aPagarCentavos: 0 };
  const semPrevisao = { aReceberCentavos: 0 };
  const aposOHorizonte = { aReceberCentavos: 0, aPagarCentavos: 0 };
  const ultimoDia = periodos.length ? periodos[periodos.length - 1].fim : hoje;

  const linhas = periodos.map((p) => ({ ...p, entradasCentavos: 0, saidasCentavos: 0, entradasPrevistasPorEtapaCentavos: 0, saidasVencidasCentavos: 0, liquidoCentavos: 0, saldoProjetadoCentavos: 0 }));

  const distribuir = (lista: readonly MovimentoDoFluxo[], lado: "ENTRADA" | "SAIDA") => {
    for (const m of lista) {
      if (m.valorCentavos <= 0) continue;
      if (m.data === null) {
        if (lado === "ENTRADA") semPrevisao.aReceberCentavos += m.valorCentavos;
        continue;
      }
      if (m.data < hoje) {
        if (lado === "ENTRADA") vencidos.aReceberCentavos += m.valorCentavos;
        else vencidos.aPagarCentavos += m.valorCentavos;
        continue;
      }
      if (m.data > ultimoDia) {
        if (lado === "ENTRADA") aposOHorizonte.aReceberCentavos += m.valorCentavos;
        else aposOHorizonte.aPagarCentavos += m.valorCentavos;
        continue;
      }
      const linha = linhas.find((p) => m.data! >= p.inicio && m.data! <= p.fim);
      if (!linha) continue; // data entre períodos não contíguos: fora
      if (lado === "ENTRADA") {
        linha.entradasCentavos += m.valorCentavos;
        if (m.previsto) linha.entradasPrevistasPorEtapaCentavos += m.valorCentavos;
      } else linha.saidasCentavos += m.valorCentavos;
    }
  };
  distribuir(args.aReceber, "ENTRADA");
  distribuir(args.aPagar, "SAIDA");

  // Conta a pagar vencida sai já no primeiro período: é dinheiro que vai sair, e o saldo projetado não pode ignorá-lo.
  if (linhas.length > 0 && vencidos.aPagarCentavos > 0) {
    linhas[0].saidasCentavos += vencidos.aPagarCentavos;
    linhas[0].saidasVencidasCentavos = vencidos.aPagarCentavos;
  }

  let saldo = args.saldoAtualCentavos;
  for (const l of linhas) {
    l.liquidoCentavos = l.entradasCentavos - l.saidasCentavos;
    saldo += l.liquidoCentavos;
    l.saldoProjetadoCentavos = saldo;
  }
  return { linhas, vencidos, semPrevisao, aposOHorizonte };
}
