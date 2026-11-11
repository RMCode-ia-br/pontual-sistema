/**
 * Regras da agenda (R9, spec 7.4): conflito de horário, expediente, horários livres e avisos de calendário.
 * Tudo em instantes UTC; o "dia" e a "hora" são sempre os de São Paulo. Conflito é ALERTA, nunca bloqueio.
 */
import { formatInTimeZone } from "date-fns-tz";

import { FUSO_PADRAO, inputParaData, instanteDeDataHoraLocal } from "../formatadores";

export type Intervalo = { inicio: Date; fim: Date };

/** Horário comercial configurado (HH:mm; vazio/nulo = sem expediente naquele dia). */
export type ConfigExpediente = {
  horarioSemanaInicio: string | null;
  horarioSemanaFim: string | null;
  horarioSabadoInicio: string | null;
  horarioSabadoFim: string | null;
};

/** "08:00" → 480. Texto fora do padrão → null. */
export function minutosDoHorario(horario: string | null | undefined): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec((horario ?? "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function horarioDosMinutos(minutos: number): string {
  return `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`;
}

/** Expediente do dia da semana (0 = domingo … 6 = sábado). Domingo nunca tem expediente. */
export function expedienteDoDia(diaSemana: number, cfg: ConfigExpediente): { inicioMin: number; fimMin: number } | null {
  if (diaSemana === 0) return null;
  const [ini, fim] =
    diaSemana === 6 ? [cfg.horarioSabadoInicio, cfg.horarioSabadoFim] : [cfg.horarioSemanaInicio, cfg.horarioSemanaFim];
  const inicioMin = minutosDoHorario(ini);
  const fimMin = minutosDoHorario(fim);
  if (inicioMin === null || fimMin === null || fimMin <= inicioMin) return null;
  return { inicioMin, fimMin };
}

/** Dois intervalos se sobrepõem? Encostar (um termina quando o outro começa) NÃO é sobreposição. */
export function sobrepoe(a: Intervalo, b: Intervalo): boolean {
  return a.inicio.getTime() < b.fim.getTime() && b.inicio.getTime() < a.fim.getTime();
}

export type EventoOcupando = Intervalo & {
  id: string;
  responsavelId: string | null;
  equipeId: string | null;
  status: string;
};

/** Cancelados e "não compareceu" não ocupam a agenda. */
const STATUS_QUE_NAO_OCUPAM = ["CANCELADO", "NAO_COMPARECEU"];

export function ocupaAgenda(status: string): boolean {
  return !STATUS_QUE_NAO_OCUPAM.includes(status);
}

/**
 * Eventos que colidem com o novo horário para o MESMO responsável ou a MESMA equipe.
 * O próprio evento (ao editar/remarcar) nunca conta contra si.
 */
export function detectarConflitos(
  novo: Intervalo & { id?: string | null; responsavelId?: string | null; equipeId?: string | null },
  existentes: EventoOcupando[],
): EventoOcupando[] {
  return existentes.filter((e) => {
    if (novo.id && e.id === novo.id) return false;
    if (!ocupaAgenda(e.status)) return false;
    if (!sobrepoe(novo, e)) return false;
    const mesmoResponsavel = !!novo.responsavelId && novo.responsavelId === e.responsavelId;
    const mesmaEquipe = !!novo.equipeId && novo.equipeId === e.equipeId;
    return mesmoResponsavel || mesmaEquipe;
  });
}

/** Data e hora locais de um instante: `{ data: "aaaa-mm-dd", minutos, diaSemana (0 = domingo) }`. */
export function partesLocais(instante: Date): { data: string; minutos: number; diaSemana: number } {
  const [data, hora, iso] = formatInTimeZone(instante, FUSO_PADRAO, "yyyy-MM-dd HH:mm i").split(" ");
  const [h, min] = hora.split(":").map(Number);
  return { data, minutos: h * 60 + min, diaSemana: Number(iso) % 7 };
}

/** Dia da semana (0 = domingo) de uma data de calendário "aaaa-mm-dd". */
export function diaDaSemana(dataLocal: string): number {
  const d = inputParaData(dataLocal);
  if (!d) throw new RangeError("Data inválida.");
  return d.getUTCDay();
}

/** O horário cai fora do expediente (ou atravessa a meia-noite)? */
export function foraDoExpediente(intervalo: Intervalo, cfg: ConfigExpediente): boolean {
  const ini = partesLocais(intervalo.inicio);
  const fim = partesLocais(intervalo.fim);
  if (ini.data !== fim.data) return true;
  const exp = expedienteDoDia(ini.diaSemana, cfg);
  if (!exp) return true;
  return ini.minutos < exp.inicioMin || fim.minutos > exp.fimMin;
}

/**
 * Horários de início livres em um dia: dentro do expediente, sem tocar em `ocupados` e, se `agora` for
 * informado, só no futuro. `passoMin` é o intervalo entre as opções.
 */
export function horariosLivres(opcoes: {
  data: string;
  duracaoMin: number;
  cfg: ConfigExpediente;
  ocupados: Intervalo[];
  passoMin?: number;
  agora?: Date;
}): Date[] {
  const { data, duracaoMin, cfg, ocupados, agora } = opcoes;
  const passo = opcoes.passoMin ?? 30;
  if (!Number.isInteger(duracaoMin) || duracaoMin <= 0 || !Number.isInteger(passo) || passo <= 0) return [];
  if (!inputParaData(data)) return [];
  const exp = expedienteDoDia(diaDaSemana(data), cfg);
  if (!exp) return [];

  const livres: Date[] = [];
  for (let inicioMin = exp.inicioMin; inicioMin + duracaoMin <= exp.fimMin; inicioMin += passo) {
    const inicio = instanteDeDataHoraLocal(data, horarioDosMinutos(inicioMin));
    if (!inicio) continue;
    if (agora && inicio.getTime() < agora.getTime()) continue;
    const candidato = { inicio, fim: new Date(inicio.getTime() + duracaoMin * 60_000) };
    if (ocupados.some((o) => sobrepoe(candidato, o))) continue;
    livres.push(inicio);
  }
  return livres;
}

/** Limites de um dia local: [00:00 do dia, 00:00 do dia seguinte) como instantes UTC. */
export function limitesDoDia(dataLocal: string): Intervalo {
  const base = inputParaData(dataLocal);
  if (!base) throw new RangeError("Data inválida.");
  const seguinte = new Date(base.getTime() + 24 * 3_600_000).toISOString().slice(0, 10);
  const inicio = instanteDeDataHoraLocal(dataLocal, "00:00");
  const fim = instanteDeDataHoraLocal(seguinte, "00:00");
  if (!inicio || !fim) throw new RangeError("Data inválida.");
  return { inicio, fim };
}

export type PeriodoDoCalendario = {
  /** Data de calendário (`@db.Date`, meia-noite UTC). */
  data: Date;
  dataFim: Date | null;
  tipo: "FERIADO" | "FERIAS_COLETIVA_FORNECEDORES" | "OUTRO";
  nome: string;
};

/** Períodos (feriado, férias coletivas, outro) que cobrem uma data local "aaaa-mm-dd". */
export function periodosQueCobrem(dataLocal: string, periodos: PeriodoDoCalendario[]): PeriodoDoCalendario[] {
  const dia = inputParaData(dataLocal);
  if (!dia) return [];
  const t = dia.getTime();
  return periodos.filter((p) => p.data.getTime() <= t && t <= (p.dataFim ?? p.data).getTime());
}

/**
 * Avisos (texto pronto) para quem está agendando: fora do expediente, feriado ou férias coletivas.
 * Servem só para alertar; nunca impedem o agendamento.
 */
export function avisosDoAgendamento(intervalo: Intervalo, cfg: ConfigExpediente, periodos: PeriodoDoCalendario[]): string[] {
  const avisos: string[] = [];
  if (foraDoExpediente(intervalo, cfg)) avisos.push("Horário fora do expediente configurado.");
  const dia = partesLocais(intervalo.inicio).data;
  for (const p of periodosQueCobrem(dia, periodos)) {
    if (p.tipo === "FERIADO") avisos.push(`Feriado: ${p.nome}.`);
    else if (p.tipo === "FERIAS_COLETIVA_FORNECEDORES") avisos.push(`Férias coletivas: ${p.nome}. Fábricas e fornecedores podem estar parados.`);
    else avisos.push(`${p.nome}.`);
  }
  return avisos;
}
