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

/**
 * Distribui compromissos de um dia em colunas lado a lado quando se sobrepõem (grade de semana/dia).
 * Cada item recebe `coluna` (0-based) e `colunas` (quantas colunas o grupo de itens sobrepostos ocupa).
 */
export function distribuirEmColunas<T extends { inicioMin: number; fimMin: number }>(itens: T[]): (T & { coluna: number; colunas: number })[] {
  const ordenados = [...itens].sort((a, b) => a.inicioMin - b.inicioMin || b.fimMin - a.fimMin);
  const resultado: (T & { coluna: number; colunas: number })[] = [];
  let grupo: (T & { coluna: number; colunas: number })[] = [];
  let fimDasColunas: number[] = [];

  const fecharGrupo = () => {
    for (const item of grupo) item.colunas = fimDasColunas.length;
    resultado.push(...grupo);
    grupo = [];
    fimDasColunas = [];
  };

  for (const item of ordenados) {
    // Começou depois que todas as colunas do grupo terminaram: é outro grupo.
    if (grupo.length > 0 && item.inicioMin >= Math.max(...fimDasColunas)) fecharGrupo();
    let coluna = fimDasColunas.findIndex((fim) => fim <= item.inicioMin);
    if (coluna === -1) {
      coluna = fimDasColunas.length;
      fimDasColunas.push(item.fimMin);
    } else {
      fimDasColunas[coluna] = item.fimMin;
    }
    grupo.push({ ...item, coluna, colunas: 1 });
  }
  if (grupo.length > 0) fecharGrupo();
  return resultado;
}
