// Regras de contas a receber e a pagar ("títulos"): situação derivada (atrasado, vence hoje…), saldo e como um
// pagamento ou um estorno muda o valor pago e o status. Funções puras; dinheiro em centavos inteiros e datas
// de calendário "aaaa-mm-dd". Atraso NUNCA é gravado: sai sempre desta função, a partir do vencimento.

import { diferencaEmDias } from "./calendario";
import { formatarMoeda } from "../formatadores";

export type StatusDoTitulo = "AGUARDANDO_GATILHO" | "ABERTA" | "PARCIAL" | "PAGA" | "CANCELADA";

export type TituloParaSituacao = {
  status: StatusDoTitulo;
  /** `null` enquanto a parcela aguarda a etapa. */
  vencimento: string | null;
  valorCentavos: number;
  valorPagoCentavos: number;
};

export type SituacaoDoTitulo = "AGUARDANDO_ETAPA" | "A_VENCER" | "VENCE_HOJE" | "ATRASADO" | "PAGO" | "CANCELADO";

export type ResumoDoTitulo = {
  situacao: SituacaoDoTitulo;
  /** Recebeu/pagou parte e ainda deve o resto (pode estar a vencer ou atrasado ao mesmo tempo). */
  parcial: boolean;
  saldoCentavos: number;
  /** Dias corridos de atraso (só quando `ATRASADO`). */
  diasEmAtraso: number;
  /** Dias até vencer (`0` = hoje; `null` sem vencimento, pago ou cancelado). */
  diasParaVencer: number | null;
};

export const ROTULO_SITUACAO: Record<SituacaoDoTitulo, string> = {
  AGUARDANDO_ETAPA: "Aguardando etapa",
  A_VENCER: "A vencer",
  VENCE_HOJE: "Vence hoje",
  ATRASADO: "Atrasado",
  PAGO: "Pago",
  CANCELADO: "Cancelado",
};

export function saldoDoTitulo(valorCentavos: number, valorPagoCentavos: number): number {
  return Math.max(0, valorCentavos - valorPagoCentavos);
}

/** Situação do título hoje. `hoje` é a data de calendário de São Paulo ("aaaa-mm-dd"). */
export function situacaoDoTitulo(t: TituloParaSituacao, hoje: string): ResumoDoTitulo {
  const saldo = saldoDoTitulo(t.valorCentavos, t.valorPagoCentavos);
  const parcial = t.valorPagoCentavos > 0 && saldo > 0 && t.status !== "CANCELADA";
  const sem = { parcial, saldoCentavos: saldo, diasEmAtraso: 0, diasParaVencer: null };

  if (t.status === "CANCELADA") return { ...sem, situacao: "CANCELADO", parcial: false, saldoCentavos: 0 };
  if (t.status === "PAGA" || saldo === 0) return { ...sem, situacao: "PAGO", parcial: false, saldoCentavos: 0 };
  if (t.status === "AGUARDANDO_GATILHO") return { ...sem, situacao: "AGUARDANDO_ETAPA" };
  if (t.vencimento === null) return { ...sem, situacao: "A_VENCER" };

  const dias = diferencaEmDias(hoje, t.vencimento); // positivo = ainda vai vencer
  if (dias < 0) return { ...sem, situacao: "ATRASADO", diasEmAtraso: -dias };
  if (dias === 0) return { ...sem, situacao: "VENCE_HOJE", diasParaVencer: 0 };
  return { ...sem, situacao: "A_VENCER", diasParaVencer: dias };
}

/** "Vence em breve": a vencer em até `dias` dias (janela configurável em Configurações; padrão 7). */
export function venceEmBreve(resumo: ResumoDoTitulo, dias: number): boolean {
  return resumo.situacao === "A_VENCER" && resumo.diasParaVencer !== null && resumo.diasParaVencer <= dias;
}

export type TituloParaMovimento = {
  status: StatusDoTitulo;
  valorCentavos: number;
  valorPagoCentavos: number;
};

export type ResultadoDeMovimento = { ok: true; valorPagoCentavos: number; status: StatusDoTitulo } | { ok: false; erro: string };

/**
 * Status que o título deve ter para um valor e um valor pago. Cancelado e "aguardando a etapa" (sem nada pago)
 * não mudam sozinhos. Serve ao pagamento, ao estorno e ao ajuste de valor.
 */
export function statusParaValores(valorCentavos: number, valorPagoCentavos: number, atual: StatusDoTitulo): StatusDoTitulo {
  if (atual === "CANCELADA") return "CANCELADA";
  if (valorPagoCentavos >= valorCentavos) return "PAGA";
  if (valorPagoCentavos > 0) return "PARCIAL";
  return atual === "AGUARDANDO_GATILHO" ? "AGUARDANDO_GATILHO" : "ABERTA";
}

function valorValido(v: number): boolean {
  return Number.isInteger(v) && v > 0;
}

/**
 * Registra um pagamento (total ou parcial). Recusa valor acima do saldo: o sistema não inventa juros, multa nem
 * troco; para fechar com desconto o gestor ajusta o valor do título (com motivo, auditado).
 */
export function aplicarPagamento(t: TituloParaMovimento, valorCentavos: number): ResultadoDeMovimento {
  if (!valorValido(valorCentavos)) return { ok: false, erro: "Informe um valor maior que zero." };
  if (t.status === "CANCELADA") return { ok: false, erro: "Este título está cancelado." };
  if (t.status === "PAGA") return { ok: false, erro: "Este título já está pago." };
  if (t.status === "AGUARDANDO_GATILHO") {
    return { ok: false, erro: "Este título aguarda a conclusão de uma etapa da obra. Libere-o antes de registrar o pagamento." };
  }
  const saldo = saldoDoTitulo(t.valorCentavos, t.valorPagoCentavos);
  if (valorCentavos > saldo) {
    return { ok: false, erro: `O valor passa do saldo (${formatarMoeda(saldo)}). Para fechar com desconto, ajuste o valor do título.` };
  }
  const pago = t.valorPagoCentavos + valorCentavos;
  return { ok: true, valorPagoCentavos: pago, status: statusParaValores(t.valorCentavos, pago, t.status) };
}

/** Desfaz um pagamento já registrado (o estorno do lançamento). O que sobrar é recalculado do valor pago. */
export function aplicarEstorno(t: TituloParaMovimento, valorCentavos: number): ResultadoDeMovimento {
  if (!valorValido(valorCentavos)) return { ok: false, erro: "Valor do estorno inválido." };
  if (t.status === "CANCELADA") return { ok: false, erro: "Este título está cancelado." };
  if (valorCentavos > t.valorPagoCentavos) return { ok: false, erro: "O estorno passa do valor já pago." };
  const pago = t.valorPagoCentavos - valorCentavos;
  return { ok: true, valorPagoCentavos: pago, status: statusParaValores(t.valorCentavos, pago, "ABERTA") };
}

/**
 * Ajuste do valor do título (desconto, correção). Nunca abaixo do que já foi pago; se o novo valor iguala o pago,
 * o título quita.
 */
export function ajustarValor(t: TituloParaMovimento, novoValorCentavos: number): ResultadoDeMovimento {
  if (!valorValido(novoValorCentavos)) return { ok: false, erro: "Informe um valor maior que zero." };
  if (t.status === "CANCELADA") return { ok: false, erro: "Este título está cancelado." };
  if (novoValorCentavos < t.valorPagoCentavos) {
    return { ok: false, erro: `Já foram pagos ${formatarMoeda(t.valorPagoCentavos)}: o valor não pode ser menor que isso. Estorne um pagamento antes.` };
  }
  return { ok: true, valorPagoCentavos: t.valorPagoCentavos, status: statusParaValores(novoValorCentavos, t.valorPagoCentavos, t.status) };
}

/** Só se cancela título sem pagamento (com pagamento, estorna-se primeiro). */
export function podeCancelar(t: TituloParaMovimento): { ok: true } | { ok: false; erro: string } {
  if (t.status === "CANCELADA") return { ok: false, erro: "Este título já está cancelado." };
  if (t.valorPagoCentavos > 0) return { ok: false, erro: "Há pagamento registrado: estorne antes de cancelar." };
  return { ok: true };
}
