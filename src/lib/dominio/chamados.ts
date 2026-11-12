/**
 * Assistência e garantia (R12): rótulos e andamento dos chamados. Código puro.
 * A classificação (em garantia ou não) está em `garantia.ts`.
 */
export const TIPOS_DE_PROBLEMA = ["REGULAGEM", "VIDRO", "OUTRO"] as const;
export type TipoDoProblema = (typeof TIPOS_DE_PROBLEMA)[number];

export const ROTULO_TIPO_PROBLEMA: Record<TipoDoProblema, string> = {
  REGULAGEM: "Regulagem de acessórios",
  VIDRO: "Vidro",
  OUTRO: "Outro",
};

export const STATUS_DE_CHAMADO = ["ABERTO", "AGENDADO", "EM_ATENDIMENTO", "RESOLVIDO", "CANCELADO"] as const;
export type StatusDoChamado = (typeof STATUS_DE_CHAMADO)[number];

export const ROTULO_STATUS_CHAMADO: Record<StatusDoChamado, string> = {
  ABERTO: "Aberto",
  AGENDADO: "Visita agendada",
  EM_ATENDIMENTO: "Em atendimento",
  RESOLVIDO: "Resolvido",
  CANCELADO: "Cancelado",
};

/** Chamados que ainda pedem atenção. */
export const STATUS_EM_ABERTO: readonly StatusDoChamado[] = ["ABERTO", "AGENDADO", "EM_ATENDIMENTO"];

const TRANSICOES: Record<StatusDoChamado, readonly StatusDoChamado[]> = {
  ABERTO: ["AGENDADO", "EM_ATENDIMENTO", "RESOLVIDO", "CANCELADO"],
  AGENDADO: ["ABERTO", "EM_ATENDIMENTO", "RESOLVIDO", "CANCELADO"],
  EM_ATENDIMENTO: ["AGENDADO", "RESOLVIDO", "CANCELADO"],
  // Reabrir é a única saída de um chamado encerrado.
  RESOLVIDO: ["ABERTO"],
  CANCELADO: ["ABERTO"],
};

export function transicaoDeChamadoPermitida(de: StatusDoChamado, para: StatusDoChamado): boolean {
  return TRANSICOES[de].includes(para);
}

/** Formato "#0007" do número sequencial do chamado. */
export function formatarNumeroDoChamado(numero: number): string {
  return `#${String(numero).padStart(4, "0")}`;
}
