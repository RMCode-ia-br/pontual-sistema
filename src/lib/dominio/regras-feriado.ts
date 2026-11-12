// Regras de feriado que se repetem todo ano: data fixa, n-ésimo dia da semana do mês (ex.: 3ª segunda de
// outubro) e dependentes da Páscoa (Sexta-feira Santa, Carnaval, Corpus Christi). Funções puras sobre
// datas de calendário "aaaa-mm-dd" (sem fuso), como o resto do domínio (calendario.ts, dias-uteis.ts).

export type TipoDeFeriadoRegra = "FERIADO" | "OUTRO";

export type RegraFeriado =
  | { tipo: "FIXA"; mes: number; dia: number }
  /** `ordem` de 1 a 4 (a 5ª ocorrência nem sempre existe); `diaSemana` 0 = domingo … 6 = sábado. */
  | { tipo: "NESIMO_DIA_DA_SEMANA"; mes: number; ordem: 1 | 2 | 3 | 4; diaSemana: number }
  /** Dias a partir do domingo de Páscoa (negativo = antes). */
  | { tipo: "PASCOA"; deslocamento: number };

export type DefinicaoDeFeriado = { nome: string; tipo: TipoDeFeriadoRegra; regra: RegraFeriado };

export type FeriadoExpandido = { data: string; nome: string; tipo: TipoDeFeriadoRegra };

const DIA_EM_MS = 86_400_000;

function paraTexto(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dataUtc(ano: number, mes: number, dia: number): Date {
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  // Rejeita 31/04, 29/02 em ano comum etc. (o Date "rola" para o mês seguinte).
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
    throw new Error(`Data inexistente: ${dia}/${mes}/${ano}.`);
  }
  return d;
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher), como "aaaa-mm-dd". */
export function domingoDePascoa(ano: number): string {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return paraTexto(new Date(Date.UTC(ano, mes - 1, dia)));
}

/** Data em que a regra cai no ano informado. */
export function dataDaRegra(regra: RegraFeriado, ano: number): string {
  if (!Number.isInteger(ano) || ano < 1583 || ano > 9999) throw new Error(`Ano fora do calendário gregoriano: ${ano}.`);
  switch (regra.tipo) {
    case "FIXA":
      return paraTexto(dataUtc(ano, regra.mes, regra.dia));
    case "PASCOA": {
      const pascoa = new Date(`${domingoDePascoa(ano)}T00:00:00Z`);
      return paraTexto(new Date(pascoa.getTime() + regra.deslocamento * DIA_EM_MS));
    }
    case "NESIMO_DIA_DA_SEMANA": {
      if (regra.diaSemana < 0 || regra.diaSemana > 6) throw new Error("Dia da semana inválido.");
      const primeiroDoMes = dataUtc(ano, regra.mes, 1);
      const deslocamento = (regra.diaSemana - primeiroDoMes.getUTCDay() + 7) % 7;
      return paraTexto(dataUtc(ano, regra.mes, 1 + deslocamento + (regra.ordem - 1) * 7));
    }
  }
}

/** Expande as definições para todos os anos do intervalo, em ordem de data. */
export function expandirRegras(definicoes: readonly DefinicaoDeFeriado[], anoInicial: number, anoFinal: number): FeriadoExpandido[] {
  const lista: FeriadoExpandido[] = [];
  for (let ano = anoInicial; ano <= anoFinal; ano++) {
    for (const def of definicoes) lista.push({ data: dataDaRegra(def.regra, ano), nome: def.nome, tipo: def.tipo });
  }
  return lista.sort((a, b) => (a.data === b.data ? a.nome.localeCompare(b.nome) : a.data < b.data ? -1 : 1));
}
