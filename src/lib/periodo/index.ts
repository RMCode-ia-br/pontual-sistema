/**
 * Período de análise dos painéis e relatórios. Bloco genérico, sem conhecimento do negócio.
 *
 * Um período é um par de DATAS DE CALENDÁRIO "aaaa-mm-dd", com os dois extremos INCLUSIVOS, no fuso de São Paulo
 * ("hoje" vem de `dataLocalDoInstante`). Texto em vez de `Date` para nunca errar o dia por causa de fuso. Para consultar
 * o banco: `limitesDeCalendario` (colunas `@db.Date`) e `limitesEmInstantes` (colunas com hora, como `aceitaEm`).
 *
 * O padrão é o MÊS ATUAL. A URL aceita `mes=aaaa-mm`, `periodo=30d|90d|12m|ano` ou `de=` e `ate=`; qualquer valor
 * inválido volta ao mês atual com um aviso (nunca derruba a página).
 */
import { fromZonedTime } from "date-fns-tz";

import { FUSO_PADRAO } from "../formatadores";

export type Periodo = { de: string; ate: string };
export type TipoDePeriodo = "mes" | "30d" | "90d" | "12m" | "ano" | "livre";

/** Teto de um período livre, para ninguém pedir 50 anos de relatório por engano (ou de propósito). */
export const MAXIMO_DE_DIAS_DO_PERIODO = 1830;

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

const dois = (n: number) => String(n).padStart(2, "0");
const montar = (a: number, m: number, d: number) => `${a}-${dois(m)}-${dois(d)}`;

/** Confere que o texto é uma data real ("2026-02-30" não é). */
export function dataValida(texto: string | null | undefined): texto is string {
  if (!texto || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const [a, m, d] = texto.split("-").map(Number);
  const data = new Date(Date.UTC(a, m - 1, d));
  return data.getUTCFullYear() === a && data.getUTCMonth() === m - 1 && data.getUTCDate() === d;
}

function partes(texto: string): { a: number; m: number; d: number } {
  const [a, m, d] = texto.split("-").map(Number);
  return { a, m, d };
}

const diasNoMes = (a: number, m: number) => new Date(Date.UTC(a, m, 0)).getUTCDate();

export function somarDias(texto: string, dias: number): string {
  const { a, m, d } = partes(texto);
  const r = new Date(Date.UTC(a, m - 1, d + dias));
  return montar(r.getUTCFullYear(), r.getUTCMonth() + 1, r.getUTCDate());
}

/** Soma meses mantendo o dia, ou o último dia do mês quando ele não existe (31/03 − 1 mês = 28/02). */
export function somarMeses(texto: string, meses: number): string {
  const { a, m, d } = partes(texto);
  const total = a * 12 + (m - 1) + meses;
  const ano = Math.floor(total / 12);
  const mes = (total % 12) + 1;
  return montar(ano, mes, Math.min(d, diasNoMes(ano, mes)));
}

/** Quantos dias o período tem, contando os dois extremos. */
export function diasDoPeriodo(p: Periodo): number {
  const a = partes(p.de);
  const b = partes(p.ate);
  return Math.round((Date.UTC(b.a, b.m - 1, b.d) - Date.UTC(a.a, a.m - 1, a.d)) / 86_400_000) + 1;
}

export function primeiroDiaDoMes(texto: string): string {
  const { a, m } = partes(texto);
  return montar(a, m, 1);
}

export function ultimoDiaDoMes(texto: string): string {
  const { a, m } = partes(texto);
  return montar(a, m, diasNoMes(a, m));
}

/** O mês inteiro ao qual a data pertence. */
export function mesDaData(texto: string): Periodo {
  return { de: primeiroDiaDoMes(texto), ate: ultimoDiaDoMes(texto) };
}

/** "aaaa-mm" → o mês inteiro; null se inválido. */
export function mesDoTexto(texto: string | null | undefined): Periodo | null {
  if (!texto || !/^\d{4}-\d{2}$/.test(texto)) return null;
  const primeiro = `${texto}-01`;
  return dataValida(primeiro) ? mesDaData(primeiro) : null;
}

/** O período é exatamente um mês de calendário (do dia 1º ao último)? */
export function ehMesInteiro(p: Periodo): boolean {
  return p.de === primeiroDiaDoMes(p.de) && p.ate === ultimoDiaDoMes(p.de);
}

/** "aaaa-mm" do mês de uma data. */
export const chaveDoMes = (texto: string) => texto.slice(0, 7);

export type PeriodoLido = { periodo: Periodo; tipo: TipoDePeriodo; aviso?: string };

type ParametrosDePeriodo = { mes?: string | string[]; periodo?: string | string[]; de?: string | string[]; ate?: string | string[] };
const um = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? "") : (v ?? ""));

/** Os períodos prontos do seletor, contados até `hoje`. */
export function periodoPronto(tipo: Exclude<TipoDePeriodo, "mes" | "livre">, hoje: string): Periodo {
  switch (tipo) {
    case "30d":
      return { de: somarDias(hoje, -29), ate: hoje };
    case "90d":
      return { de: somarDias(hoje, -89), ate: hoje };
    case "12m":
      return { de: somarDias(somarMeses(hoje, -12), 1), ate: hoje };
    case "ano":
      return { de: `${partes(hoje).a}-01-01`, ate: hoje };
  }
}

/** Lê o período da URL. Padrão: o mês atual. Valor inválido → mês atual + aviso. */
export function lerPeriodo(params: ParametrosDePeriodo, hoje: string): PeriodoLido {
  const padrao: PeriodoLido = { periodo: mesDaData(hoje), tipo: "mes" };
  const de = um(params.de);
  const ate = um(params.ate);
  const mes = um(params.mes);
  const pronto = um(params.periodo);

  if (de || ate) {
    if (!dataValida(de) || !dataValida(ate)) return { ...padrao, aviso: "As datas do período não são válidas: mostrando o mês atual." };
    if (de > ate) return { ...padrao, aviso: "A data inicial é depois da final: mostrando o mês atual." };
    if (diasDoPeriodo({ de, ate }) > MAXIMO_DE_DIAS_DO_PERIODO) return { ...padrao, aviso: "O período é longo demais (no máximo 5 anos): mostrando o mês atual." };
    return { periodo: { de, ate }, tipo: "livre" };
  }
  if (mes) {
    const p = mesDoTexto(mes);
    return p ? { periodo: p, tipo: "mes" } : { ...padrao, aviso: "O mês escolhido não é válido: mostrando o mês atual." };
  }
  if (pronto) {
    if (pronto === "30d" || pronto === "90d" || pronto === "12m" || pronto === "ano") return { periodo: periodoPronto(pronto, hoje), tipo: pronto };
    return { ...padrao, aviso: "O período escolhido não existe: mostrando o mês atual." };
  }
  return padrao;
}

const formatarDia = (texto: string) => {
  const { a, m, d } = partes(texto);
  return `${dois(d)}/${dois(m)}/${a}`;
};

/** Texto do período para títulos e para o cabeçalho de impressão: "novembro de 2026" ou "01/11/2026 a 12/11/2026". */
export function rotuloDoPeriodo(p: Periodo): string {
  if (ehMesInteiro(p)) {
    const { a, m } = partes(p.de);
    return `${MESES[m - 1]} de ${a}`;
  }
  return `${formatarDia(p.de)} a ${formatarDia(p.ate)}`;
}

/** Parâmetros de URL que reproduzem o período (para montar os links das listas e dos relatórios). */
export function parametrosDoPeriodo(p: Periodo): Record<string, string> {
  return ehMesInteiro(p) ? { mes: chaveDoMes(p.de) } : { de: p.de, ate: p.ate };
}

export type Comparacao = {
  /** O período imediatamente anterior (mês anterior, no caso de um mês). */
  anterior: Periodo;
  /** O mesmo período, um ano antes. */
  anoPassado: Periodo;
  /** O período ainda está em andamento: as comparações vão só até o mesmo ponto (ex.: dia 12 contra dia 12). */
  emAndamento: boolean;
  /** O trecho do período atual que entra na comparação (até hoje, se está em andamento). */
  atual: Periodo;
};

/**
 * Períodos de comparação. Um mês em andamento (12/11) é comparado até o MESMO DIA do mês anterior (12/10) e do ano
 * passado (12/11/2025), para não comparar um mês pela metade com um mês inteiro. Um mês já fechado compara com o mês
 * inteiro. Um período livre compara com o trecho de mesma duração logo antes e com o mesmo trecho um ano antes.
 */
export function periodoDeComparacao(p: Periodo, hoje: string): Comparacao {
  const emAndamento = p.de <= hoje && p.ate > hoje;
  const atual: Periodo = emAndamento ? { de: p.de, ate: hoje } : p;

  if (ehMesInteiro(p)) {
    const mesmoPonto = (meses: number): Periodo => {
      const de = somarMeses(p.de, meses);
      const fimDoMes = ultimoDiaDoMes(de);
      const ate = emAndamento ? somarMeses(atual.ate, meses) : fimDoMes;
      return { de, ate: ate < fimDoMes ? ate : fimDoMes };
    };
    return { anterior: mesmoPonto(-1), anoPassado: mesmoPonto(-12), emAndamento, atual };
  }

  const dias = diasDoPeriodo(atual);
  return {
    anterior: { de: somarDias(atual.de, -dias), ate: somarDias(atual.de, -1) },
    anoPassado: { de: somarMeses(atual.de, -12), ate: somarMeses(atual.ate, -12) },
    emAndamento,
    atual,
  };
}

/** Limites para colunas `@db.Date` (meia-noite UTC), extremos inclusivos. */
export function limitesDeCalendario(p: Periodo): { de: Date; ate: Date } {
  return { de: new Date(`${p.de}T00:00:00.000Z`), ate: new Date(`${p.ate}T00:00:00.000Z`) };
}

/** Limites para colunas com hora (`aceitaEm`...): começo do 1º dia e começo do dia seguinte ao último, em São Paulo. */
export function limitesEmInstantes(p: Periodo): { inicio: Date; fimExclusivo: Date } {
  return {
    inicio: fromZonedTime(`${p.de}T00:00:00`, FUSO_PADRAO),
    fimExclusivo: fromZonedTime(`${somarDias(p.ate, 1)}T00:00:00`, FUSO_PADRAO),
  };
}

/** Os `n` meses de calendário que terminam no mês de `hoje`, do mais antigo ao mais recente (relatório de 12 meses). */
export function ultimosMeses(hoje: string, n: number): (Periodo & { mes: string })[] {
  const lista: (Periodo & { mes: string })[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const primeiro = somarMeses(primeiroDiaDoMes(hoje), -i);
    lista.push({ ...mesDaData(primeiro), mes: chaveDoMes(primeiro) });
  }
  return lista;
}
