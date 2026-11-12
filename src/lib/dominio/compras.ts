// Compras e recebimento (spec 7.10, R14). Quantidades em MILÉSIMOS inteiros, dinheiro em centavos. Funções puras.
//
// O custo real da obra lê o RECEBIMENTO (valor congelado), nunca a conta a pagar: a conta a pagar nasce da mesma compra e
// contar as duas contaria o custo duas vezes.

export type StatusDaCompra = "RASCUNHO" | "PEDIDO" | "RECEBIDO_PARCIAL" | "RECEBIDO" | "CANCELADO";

export const ROTULO_STATUS_DA_COMPRA: Record<StatusDaCompra, string> = {
  RASCUNHO: "Rascunho",
  PEDIDO: "Pedido feito",
  RECEBIDO_PARCIAL: "Recebida em parte",
  RECEBIDO: "Recebida",
  CANCELADO: "Cancelada",
};

export const numeroDaCompra = (numero: number): string => `C-${String(numero).padStart(4, "0")}`;

export type ItemParaStatus = { quantidadeMilesimos: number; recebidaMilesimos: number };

/**
 * Status depois de um recebimento: tudo recebido → RECEBIDO; algo recebido → RECEBIDO_PARCIAL; nada → PEDIDO. Rascunho e
 * cancelada não mudam por aqui (rascunho não recebe; cancelada não volta).
 */
export function statusAposRecebimento(atual: StatusDaCompra, itens: readonly ItemParaStatus[]): StatusDaCompra {
  if (atual === "RASCUNHO" || atual === "CANCELADO") return atual;
  if (itens.length === 0) return atual;
  if (itens.every((i) => i.recebidaMilesimos >= i.quantidadeMilesimos)) return "RECEBIDO";
  if (itens.some((i) => i.recebidaMilesimos > 0)) return "RECEBIDO_PARCIAL";
  return "PEDIDO";
}

export type ResultadoDoRecebimento = { ok: true; restanteMilesimos: number } | { ok: false; erro: string };

/** Quanto ainda pode ser recebido de um item; o recebimento nunca passa do pedido (se pesou a mais, ajuste o pedido antes). */
export function conferirRecebimento(e: { quantidadeMilesimos: number; recebidaMilesimos: number; recebeMilesimos: number }): ResultadoDoRecebimento {
  if (!Number.isInteger(e.recebeMilesimos) || e.recebeMilesimos <= 0) return { ok: false, erro: "Informe a quantidade recebida (maior que zero)." };
  const restante = e.quantidadeMilesimos - e.recebidaMilesimos;
  if (e.recebeMilesimos > restante) return { ok: false, erro: `Passa do pedido: faltam receber ${restante / 1000}. Ajuste a quantidade do pedido antes, se chegou mais.` };
  return { ok: true, restanteMilesimos: restante - e.recebeMilesimos };
}

export type ItemParaTotal = { quantidadeMilesimos: number; precoUnitarioCentavos: number | null };

/** Total do pedido = soma de quantidade × preço dos itens COM preço; os sem preço são contados à parte (nunca valem zero). */
export function totalDoPedido(itens: readonly ItemParaTotal[]): { totalCentavos: number; itensSemPreco: number } {
  let total = 0;
  let semPreco = 0;
  for (const i of itens) {
    if (i.precoUnitarioCentavos === null) semPreco += 1;
    else total += Math.round((i.quantidadeMilesimos * i.precoUnitarioCentavos) / 1000);
  }
  return { totalCentavos: total, itensSemPreco: semPreco };
}

/** Entrega atrasada (derivada, nunca gravada): pedido feito ou recebido em parte com a previsão de entrega já passada. */
export function entregaAtrasada(c: { status: StatusDaCompra; previsaoEntrega: string | null }, hoje: string): boolean {
  return (c.status === "PEDIDO" || c.status === "RECEBIDO_PARCIAL") && c.previsaoEntrega !== null && c.previsaoEntrega < hoje;
}

/** Custo por unidade do ESTOQUE de uma entrega: valor ÷ quantidade que entrou. Sem valor (sem preço), null. */
export function custoUnitarioDaEntrega(valorCentavos: number | null, quantidadeEstoqueMilesimos: number): number | null {
  if (valorCentavos === null || quantidadeEstoqueMilesimos <= 0) return null;
  return Math.round((valorCentavos * 1000) / quantidadeEstoqueMilesimos);
}

/** Só se cancela o que ainda não recebeu nada (com recebimento, o estoque e o custo já existem: estorna-se antes). */
export function podeCancelarCompra(status: StatusDaCompra, totalRecebidoMilesimos: number): { ok: true } | { ok: false; erro: string } {
  if (status === "CANCELADO") return { ok: false, erro: "A compra já está cancelada." };
  if (totalRecebidoMilesimos > 0) return { ok: false, erro: "Já houve recebimento: estorne as entradas antes de cancelar." };
  return { ok: true };
}
