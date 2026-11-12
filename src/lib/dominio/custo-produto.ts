// Custo do produto a cada compra: ÚLTIMO CUSTO (decisão do dono, 2026-11-12). O custo do produto vira o da última compra
// recebida com preço; recebimento sem preço não mexe no custo (nunca zera nem inventa). Funções puras; dinheiro em centavos.

export type AtualizacaoDeCusto = { muda: false; motivo: "SEM_PRECO" | "IGUAL" } | { muda: true; anteriorCentavos: number | null; novoCentavos: number };

export function atualizarCustoPeloUltimoRecebimento(custoAtualCentavos: number | null, custoDoRecebimentoCentavos: number | null): AtualizacaoDeCusto {
  if (custoDoRecebimentoCentavos === null || custoDoRecebimentoCentavos <= 0) return { muda: false, motivo: "SEM_PRECO" };
  if (custoAtualCentavos === custoDoRecebimentoCentavos) return { muda: false, motivo: "IGUAL" };
  return { muda: true, anteriorCentavos: custoAtualCentavos, novoCentavos: custoDoRecebimentoCentavos };
}
