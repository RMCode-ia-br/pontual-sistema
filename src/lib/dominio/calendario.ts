/**
 * Geometria do calendário da Agenda (mês, semana, dia). Datas de calendário como "aaaa-mm-dd";
 * a semana começa no domingo (convenção brasileira de agenda). Sem fuso: são só dias do calendário.
 */

function paraUtc(dataLocal: string): Date {
  const d = new Date(`${dataLocal}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== dataLocal) throw new RangeError("Data inválida.");
  return d;
}

const texto = (d: Date) => d.toISOString().slice(0, 10);

export function somarDias(dataLocal: string, dias: number): string {
  return texto(new Date(paraUtc(dataLocal).getTime() + dias * 86_400_000));
}

/** Domingo da semana que contém a data. */
export function inicioDaSemana(dataLocal: string): string {
  return somarDias(dataLocal, -paraUtc(dataLocal).getUTCDay());
}

/** Os 7 dias (domingo a sábado) da semana da data. */
export function diasDaSemana(dataLocal: string): string[] {
  const inicio = inicioDaSemana(dataLocal);
  return Array.from({ length: 7 }, (_, i) => somarDias(inicio, i));
}

/** Grade do mês: semanas completas (domingo a sábado) que cobrem o mês da data, com 4 a 6 linhas. */
export function gradeDoMes(dataLocal: string): string[][] {
  const d = paraUtc(dataLocal);
  const primeiro = texto(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
  const ultimo = texto(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
  const semanas: string[][] = [];
  for (let inicio = inicioDaSemana(primeiro); inicio <= ultimo; inicio = somarDias(inicio, 7)) {
    semanas.push(diasDaSemana(inicio));
  }
  return semanas;
}

/** Primeiro dia do mês seguinte/anterior (para os botões "mês anterior" e "próximo mês"). */
export function mesVizinho(dataLocal: string, delta: number): string {
  const d = paraUtc(dataLocal);
  return texto(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1)));
}

/** `true` se as duas datas estão no mesmo mês e ano. */
export function mesmoMes(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}
