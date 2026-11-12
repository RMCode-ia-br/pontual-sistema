// Parcelamento e recorrência de contas a pagar. Funções puras sobre datas de calendário "aaaa-mm-dd" e
// dinheiro em centavos. A última parcela absorve a diferença do arredondamento (convenção do projeto).

import { dividirArredondando } from "./preco";

export const MAXIMO_DE_PARCELAS = 60;

function partes(data: string): { ano: number; mes: number; dia: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  if (!m) throw new RangeError("Data inválida.");
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) throw new RangeError("Data inválida.");
  return { ano, mes, dia };
}

const doisDigitos = (n: number) => String(n).padStart(2, "0");

export function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/** Primeiro dia do mês da data ("2026-11-12" → "2026-11-01"): é a competência. */
export function competenciaDe(data: string): string {
  const { ano, mes } = partes(data);
  return `${ano}-${doisDigitos(mes)}-01`;
}

/**
 * Soma meses mantendo o dia desejado; em mês mais curto vale o último dia (31/01 + 1 mês = 28/02, e depois
 * 31/03: o dia é sempre o pedido, não o do mês anterior).
 */
export function somarMeses(data: string, meses: number, diaDesejado?: number): string {
  const { ano, mes, dia } = partes(data);
  const total = ano * 12 + (mes - 1) + meses;
  const novoAno = Math.floor(total / 12);
  const novoMes = (total % 12) + 1;
  const alvo = Math.min(diaDesejado ?? dia, ultimoDiaDoMes(novoAno, novoMes));
  return `${novoAno}-${doisDigitos(novoMes)}-${doisDigitos(alvo)}`;
}

export type ParcelaDePagar = {
  numero: number;
  total: number;
  valorCentavos: number;
  vencimento: string;
  competencia: string;
};

/**
 * Divide um valor em `quantidade` parcelas mensais. Cada parcela vale o total ÷ quantidade (meio centavo para
 * cima) e a última recebe o que sobrou, então a soma é SEMPRE igual ao total. O vencimento repete o dia do
 * primeiro (ajustado nos meses curtos).
 */
export function gerarParcelamento(totalCentavos: number, quantidade: number, primeiroVencimento: string): ParcelaDePagar[] {
  if (!Number.isInteger(totalCentavos) || totalCentavos <= 0) throw new RangeError("Valor inválido.");
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > MAXIMO_DE_PARCELAS) {
    throw new RangeError(`Informe de 1 a ${MAXIMO_DE_PARCELAS} parcelas.`);
  }
  if (totalCentavos < quantidade) throw new RangeError("O valor é menor que o número de parcelas (cada parcela precisa de ao menos 1 centavo).");
  const { dia } = partes(primeiroVencimento);

  const cada = Number(dividirArredondando(BigInt(totalCentavos), BigInt(quantidade)));
  let acumulado = 0;
  return Array.from({ length: quantidade }, (_, i) => {
    const ultima = i === quantidade - 1;
    const valor = ultima ? totalCentavos - acumulado : cada;
    acumulado += valor;
    const vencimento = somarMeses(primeiroVencimento, i, dia);
    return { numero: i + 1, total: quantidade, valorCentavos: valor, vencimento, competencia: competenciaDe(vencimento) };
  });
}

// ---------- Recorrência ----------

export type PeriodicidadeDaRecorrencia = "MENSAL" | "TRIMESTRAL" | "ANUAL";

const MESES_POR_PERIODO: Record<PeriodicidadeDaRecorrencia, number> = { MENSAL: 1, TRIMESTRAL: 3, ANUAL: 12 };

export type RegraDeRecorrencia = {
  diaVencimento: number;
  periodicidade: PeriodicidadeDaRecorrencia;
  inicio: string;
  fim: string | null;
};

export type Ocorrencia = { competencia: string; vencimento: string };

/**
 * Ocorrências cujo vencimento cai entre `de` e `ate` (inclusive), respeitando o início e o fim da recorrência.
 * A primeira ocorrência é a primeira cujo vencimento não é anterior ao início (início em 20/05 com vencimento
 * no dia 10: a primeira é 10/06). Em mês mais curto vale o último dia. A competência é o mês do vencimento.
 */
export function ocorrenciasDaRecorrencia(regra: RegraDeRecorrencia, de: string, ate: string): Ocorrencia[] {
  if (!Number.isInteger(regra.diaVencimento) || regra.diaVencimento < 1 || regra.diaVencimento > 31) throw new RangeError("Dia de vencimento inválido.");
  const passo = MESES_POR_PERIODO[regra.periodicidade];
  const limite = regra.fim !== null && regra.fim < ate ? regra.fim : ate;
  const piso = regra.inicio > de ? regra.inicio : de;
  const resultado: Ocorrencia[] = [];

  // Ancora no mês do início; o primeiro vencimento pode cair antes do início e então é descartado.
  const primeiroMes = `${regra.inicio.slice(0, 7)}-01`;
  for (let k = 0; ; k++) {
    const vencimento = somarMeses(primeiroMes, k * passo, regra.diaVencimento);
    if (vencimento > limite) break;
    if (k > 12 * 200) throw new RangeError("Período longo demais.");
    if (vencimento >= piso) resultado.push({ competencia: competenciaDe(vencimento), vencimento });
  }
  return resultado;
}

/** Último dia do mês que fica `mesesAFrente` meses depois do mês de `hoje` (horizonte da geração). */
export function horizonteDaRecorrencia(hoje: string, mesesAFrente: number): string {
  if (!Number.isInteger(mesesAFrente) || mesesAFrente < 0) throw new RangeError("Horizonte inválido.");
  const alvo = somarMeses(competenciaDe(hoje), mesesAFrente);
  const { ano, mes } = partes(alvo);
  return `${ano}-${doisDigitos(mes)}-${doisDigitos(ultimoDiaDoMes(ano, mes))}`;
}
