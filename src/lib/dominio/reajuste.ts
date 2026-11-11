/**
 * Reajuste de custo (R13). Funções puras sobre centavos inteiros: sem ponto flutuante no dinheiro,
 * arredondamento "meio para cima" (0,5 centavo sobe), e nenhum custo pode zerar, ficar negativo ou
 * estourar o limite do campo inteiro do banco.
 */

/** Limite do custo unitário (cabe com folga num inteiro de 32 bits, em centavos). */
export const CUSTO_MAXIMO_CENTAVOS = 2_000_000_000;

export type RegraReajuste =
  | { modo: "PERCENTUAL"; /** Ex.: 5 = +5%; -3,5 = desconto de 3,5%. Até 2 casas. */ percentual: number }
  | { modo: "VALOR_FIXO"; /** Acréscimo (positivo) ou desconto (negativo) em centavos. */ valorCentavos: number };

export type ResultadoReajuste = { ok: true; novoCentavos: number } | { ok: false; motivo: string };

/** Confere a regra em si (antes de olhar produto algum). Devolve a mensagem de erro ou null. */
export function validarRegra(regra: RegraReajuste): string | null {
  if (regra.modo === "PERCENTUAL") {
    const p = regra.percentual;
    if (!Number.isFinite(p)) return "Informe o percentual do reajuste.";
    if (p === 0) return "O percentual não pode ser zero.";
    if (Math.abs(p) > 1000) return "O percentual passa de 1.000%. Confira o valor.";
    if (Math.abs(Math.round(p * 100) - p * 100) > 1e-6) return "Use no máximo 2 casas decimais no percentual.";
    return null;
  }
  const v = regra.valorCentavos;
  if (!Number.isInteger(v)) return "Informe o valor do reajuste em reais e centavos.";
  if (v === 0) return "O valor do reajuste não pode ser zero.";
  if (Math.abs(v) > CUSTO_MAXIMO_CENTAVOS) return "O valor do reajuste é grande demais.";
  return null;
}

/** Aplica a regra a um custo. Não valida a regra: chame `validarRegra` antes. */
export function calcularReajuste(custoAtualCentavos: number | null, regra: RegraReajuste): ResultadoReajuste {
  if (custoAtualCentavos === null) return { ok: false, motivo: "Produto sem custo informado." };
  if (!Number.isInteger(custoAtualCentavos) || custoAtualCentavos < 0) return { ok: false, motivo: "Custo atual inválido." };

  let variacao: number;
  if (regra.modo === "PERCENTUAL") {
    const pontosBase = Math.round(regra.percentual * 100); // 5,25% = 525 pontos-base
    const bruto = custoAtualCentavos * Math.abs(pontosBase);
    // Meio para cima sobre o módulo; o sinal é reaplicado depois (desconto arredonda do mesmo jeito).
    variacao = Math.sign(pontosBase) * Math.floor((bruto + 5000) / 10000);
  } else {
    variacao = regra.valorCentavos;
  }

  const novo = custoAtualCentavos + variacao;
  if (novo <= 0) return { ok: false, motivo: "O novo custo ficaria zerado ou negativo." };
  if (novo > CUSTO_MAXIMO_CENTAVOS) return { ok: false, motivo: "O novo custo passa do limite permitido." };
  if (novo === custoAtualCentavos) return { ok: false, motivo: "O reajuste não muda o valor (arredondamento)." };
  return { ok: true, novoCentavos: novo };
}

/** Descrição curta para o histórico: "+5%" ou "-R$ 2,50". */
export function descreverRegra(regra: RegraReajuste): string {
  if (regra.modo === "PERCENTUAL") {
    const sinal = regra.percentual > 0 ? "+" : "";
    return `${sinal}${String(regra.percentual).replace(".", ",")}%`;
  }
  const abs = Math.abs(regra.valorCentavos);
  const reais = `${Math.floor(abs / 100).toLocaleString("pt-BR")},${String(abs % 100).padStart(2, "0")}`;
  return `${regra.valorCentavos > 0 ? "+" : "-"}R$ ${reais}`;
}
