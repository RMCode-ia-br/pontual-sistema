import { z } from "zod";

import { campoIdObrigatorio, campoIdOpcional, campoTextoOpcional } from "@/lib/validadores/campos";

export const TIPOS_EVENTO = ["VISITA_TECNICA", "MEDICAO_EXATA", "MEDICAO_VIDROS", "INSTALACAO", "ENTREGA", "ASSISTENCIA", "REUNIAO"] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number];

export const ROTULO_TIPO_EVENTO: Record<TipoEvento, string> = {
  VISITA_TECNICA: "Visita técnica",
  MEDICAO_EXATA: "Medição exata",
  MEDICAO_VIDROS: "Medição dos vidros",
  INSTALACAO: "Instalação",
  ENTREGA: "Entrega",
  ASSISTENCIA: "Assistência",
  REUNIAO: "Reunião",
};

export const STATUS_EVENTO = ["AGENDADO", "CONFIRMADO", "REALIZADO", "REMARCADO", "CANCELADO", "NAO_COMPARECEU"] as const;
export type StatusEvento = (typeof STATUS_EVENTO)[number];

export const ROTULO_STATUS_EVENTO: Record<StatusEvento, string> = {
  AGENDADO: "Agendado",
  CONFIRMADO: "Confirmado",
  REALIZADO: "Realizado",
  REMARCADO: "Remarcado",
  CANCELADO: "Cancelado",
  NAO_COMPARECEU: "Não compareceu",
};

/** Lembrete antes do evento (minutos). 1440 = 24 h (R9 / modelo "lembrete de visita"). */
export const OPCOES_LEMBRETE: { valor: string; rotulo: string }[] = [
  { valor: "", rotulo: "Sem lembrete" },
  { valor: "60", rotulo: "1 hora antes" },
  { valor: "120", rotulo: "2 horas antes" },
  { valor: "1440", rotulo: "1 dia antes" },
  { valor: "2880", rotulo: "2 dias antes" },
];

const campoEnum = <const T extends readonly [string, ...string[]]>(valores: T, mensagem: string) => z.enum(valores, { message: mensagem });

const horarioLocal = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Informe a data e a hora.");

const eventoBase = z.object({
  tipo: campoEnum(TIPOS_EVENTO, "Escolha o tipo do compromisso."),
  titulo: campoTextoOpcional(160),
  /** `<input type="datetime-local">`, no horário de São Paulo. */
  inicio: horarioLocal,
  duracaoMin: z
    .string()
    .trim()
    .regex(/^\d{1,4}$/, "Informe a duração em minutos.")
    .transform(Number)
    .refine((n) => n >= 5 && n <= 24 * 60, "A duração deve ficar entre 5 minutos e 24 horas."),
  responsavelId: campoIdOpcional,
  equipeId: campoIdOpcional,
  clienteId: campoIdOpcional,
  projetoId: campoIdOpcional,
  /** Etapa da obra que este compromisso cumpre (vem do "Agendar" do calendário de instalação). Só na criação. */
  etapaProjetoId: campoIdOpcional,
  enderecoId: campoIdOpcional,
  local: campoTextoOpcional(300),
  lembreteMin: z
    .string()
    .trim()
    .transform((v) => (v === "" ? undefined : Number(v)))
    .refine((n) => n === undefined || (Number.isInteger(n) && n >= 5 && n <= 60 * 24 * 14), "Lembrete inválido.")
    .optional(),
  observacoes: campoTextoOpcional(2000),
  /** "1" quando a pessoa já viu os avisos (conflito, feriado, fora do expediente) e quer agendar assim mesmo. */
  confirmarAvisos: z.string().optional(),
});

export const eventoSchema = eventoBase;
export const eventoEditadoSchema = eventoBase.extend({ id: campoIdObrigatorio("Compromisso inválido.") });

export const mudarStatusSchema = z.object({
  id: campoIdObrigatorio("Compromisso inválido."),
  status: campoEnum(["CONFIRMADO", "REALIZADO", "CANCELADO", "NAO_COMPARECEU"] as const, "Situação inválida."),
});

export const feedSchema = z.object({ nome: campoTextoOpcional(80) });

export const idUnicoSchema = campoIdObrigatorio("Registro inválido.");

/** Visões da agenda, lidas da URL. */
export const VISTAS = ["mes", "semana", "dia", "lista"] as const;
export type Vista = (typeof VISTAS)[number];
export const ROTULO_VISTA: Record<Vista, string> = { mes: "Mês", semana: "Semana", dia: "Dia", lista: "Lista" };
