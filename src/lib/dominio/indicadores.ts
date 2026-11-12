/**
 * Contas puras dos indicadores do painel (spec seção 8). A consulta entrega as contagens e as somas; aqui só se calcula.
 * Regra geral: sem base para a conta (divisão por zero, dado que não foi informado), o resultado é `null`, que a tela
 * mostra como "sem base" / "não informado", nunca como zero.
 */

/** Percentual com UMA casa (44,3). `null` quando o divisor não é positivo. */
function percentual(parte: number, total: number): number | null {
  if (!Number.isFinite(parte) || !Number.isFinite(total) || total <= 0) return null;
  return Math.round((parte * 1000) / total) / 10;
}

/**
 * Taxa de fechamento = aprovados ÷ (aprovados + perdidos que tiveram proposta enviada), pela data da decisão.
 * Sem nenhuma decisão na janela, não há taxa (null), e não "0%".
 */
export function taxaDeFechamento(aprovados: number, perdidosComProposta: number): number | null {
  return percentual(aprovados, aprovados + perdidosComProposta);
}

/** Ticket médio = vendido ÷ número de projetos aprovados no período (centavos, arredondado). `null` sem projetos. */
export function ticketMedio(vendidoCentavos: number, projetosAprovados: number): number | null {
  if (projetosAprovados <= 0) return null;
  return Math.round(vendidoCentavos / projetosAprovados);
}

/** Média de dias com UMA casa; `null` sem nenhum caso (a tela diz "sem dados no período"). */
export function mediaDeDias(dias: readonly number[]): number | null {
  if (dias.length === 0) return null;
  return Math.round((dias.reduce((s, d) => s + d, 0) * 10) / dias.length) / 10;
}

/** Limite de faturamento com nota: vazio, zero ou negativo = "limite não informado" (null). */
export function limiteInformado(limiteCentavos: number | null | undefined): number | null {
  return typeof limiteCentavos === "number" && Number.isFinite(limiteCentavos) && limiteCentavos > 0 ? limiteCentavos : null;
}

/**
 * Quanto do limite já foi recebido com nota (acompanhamento gerencial, não é apuração). Sem limite informado (vazio ou
 * zero) devolve `null`: sem percentual e sem divisão por zero.
 */
export function percentualDoLimite(recebidoCentavos: number, limiteCentavos: number | null | undefined): number | null {
  const limite = limiteInformado(limiteCentavos);
  return limite === null ? null : percentual(recebidoCentavos, limite);
}

/** Ocupação da fábrica = m² em produção ou a começar ÷ capacidade mensal em m². `null` sem capacidade informada. */
export function ocupacaoDaFabrica(m2: number, capacidadeM2: number | null | undefined): number | null {
  if (typeof capacidadeM2 !== "number" || !(capacidadeM2 > 0)) return null;
  return percentual(m2, capacidadeM2);
}

/** Meta atingida (em %), com a mesma regra: sem meta positiva, `null`. */
export function percentualDaMeta(valorCentavos: number, metaCentavos: number | null | undefined): number | null {
  return typeof metaCentavos === "number" && metaCentavos > 0 ? percentual(valorCentavos, metaCentavos) : null;
}
