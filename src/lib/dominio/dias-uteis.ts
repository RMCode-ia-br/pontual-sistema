/**
 * Dias úteis e feriados (R8). Funções puras sobre datas de calendário "aaaa-mm-dd" (sem fuso).
 * Dia útil = segunda a sexta que não seja `FERIADO` cadastrado. Férias coletivas de fornecedores e
 * pontos facultativos (tipo OUTRO, ex.: Carnaval) NÃO descontam: só avisam (spec seção 6, `Feriado`).
 * Nada daqui conhece feriado de Macaé: o gestor cadastra os municipais em Configurações.
 */
import { diaDaSemanaDe, diferencaEmDias, somarDias } from "./calendario";

export type TipoDeFeriado = "FERIADO" | "FERIAS_COLETIVA_FORNECEDORES" | "OUTRO";

export type PeriodoDeFeriado = {
  data: string;
  /** Fim do período (férias coletivas); vazio = um dia só. */
  dataFim?: string | null;
  tipo: TipoDeFeriado;
};

export type TipoDiasDoPrazo = "UTEIS" | "CORRIDOS";

const LIMITE_DE_DIAS = 20_000;

/** Conjunto das datas que NÃO são dia útil por serem feriado (só o tipo FERIADO). */
export function datasDeFeriado(periodos: readonly PeriodoDeFeriado[]): Set<string> {
  const datas = new Set<string>();
  for (const p of periodos) {
    if (p.tipo !== "FERIADO") continue;
    const fim = p.dataFim && p.dataFim > p.data ? p.dataFim : p.data;
    if (diferencaEmDias(p.data, fim) > 366) throw new RangeError("Período de feriado longo demais.");
    for (let d = p.data; d <= fim; d = somarDias(d, 1)) datas.add(d);
  }
  return datas;
}

export function ehDiaUtil(data: string, feriados: ReadonlySet<string>): boolean {
  const dia = diaDaSemanaDe(data);
  return dia !== 0 && dia !== 6 && !feriados.has(data);
}

/**
 * `dias` dias úteis depois de `data` (negativo: antes). Com 0 devolve a própria data, mesmo que não seja útil.
 * A data de partida não conta: 1 dia útil depois de uma sexta é a segunda (ou o próximo dia útil).
 */
export function somarDiasUteis(data: string, dias: number, feriados: ReadonlySet<string>): string {
  if (!Number.isInteger(dias) || Math.abs(dias) > LIMITE_DE_DIAS) throw new RangeError("Número de dias inválido.");
  const passo = dias < 0 ? -1 : 1;
  let restante = Math.abs(dias);
  let d = data;
  while (restante > 0) {
    d = somarDias(d, passo);
    if (ehDiaUtil(d, feriados)) restante--;
  }
  return d;
}

/**
 * Dias úteis em (`a`, `b`]: positivo se `b` é depois de `a`, negativo se antes (e zero se iguais).
 * É o inverso de `somarDiasUteis` quando `b` é dia útil.
 */
export function diasUteisEntre(a: string, b: string, feriados: ReadonlySet<string>): number {
  if (a === b) return 0;
  const [de, ate, sinal] = b > a ? [a, b, 1] : [b, a, -1];
  if (diferencaEmDias(de, ate) > LIMITE_DE_DIAS) throw new RangeError("Intervalo longo demais.");
  let total = 0;
  for (let d = somarDias(de, 1); d <= ate; d = somarDias(d, 1)) {
    if (ehDiaUtil(d, feriados)) total++;
  }
  return sinal * total;
}

/** Soma dias úteis ou corridos conforme a configuração (`tipoDias`) da obra. */
export function somarDiasDoTipo(data: string, dias: number, tipo: TipoDiasDoPrazo, feriados: ReadonlySet<string>): string {
  if (tipo === "CORRIDOS") {
    if (!Number.isInteger(dias) || Math.abs(dias) > LIMITE_DE_DIAS) throw new RangeError("Número de dias inválido.");
    return somarDias(data, dias);
  }
  return somarDiasUteis(data, dias, feriados);
}

/** Dias úteis ou corridos entre duas datas (mesma convenção de `diasUteisEntre`). */
export function diasEntreDoTipo(a: string, b: string, tipo: TipoDiasDoPrazo, feriados: ReadonlySet<string>): number {
  return tipo === "CORRIDOS" ? diferencaEmDias(a, b) : diasUteisEntre(a, b, feriados);
}

/**
 * Horizonte dos feriados: devolve o ANO da data se não há nenhum feriado cadastrado nele (a conta de dias
 * úteis ficaria errada em silêncio); `null` se o ano está coberto. A interface avisa o gestor.
 */
export function anoSemFeriados(data: string, periodos: readonly PeriodoDeFeriado[]): number | null {
  const ano = Number(data.slice(0, 4));
  const cobertos = new Set(periodos.filter((p) => p.tipo === "FERIADO").map((p) => Number(p.data.slice(0, 4))));
  return cobertos.has(ano) ? null : ano;
}
