/** Limites do plano gratuito do Supabase (spec seção 3). Ajustar aqui se o plano mudar. */
export const LIMITE_BANCO_BYTES = 500 * 1024 * 1024; // 500 MB
export const LIMITE_ARQUIVOS_BYTES = 1024 * 1024 * 1024; // 1 GB

export type NivelDeUso = "normal" | "atencao" | "critico";

/** Alerta a partir de 70% (atenção) e 90% (crítico). */
export function nivelDeUso(usado: number, limite: number): NivelDeUso {
  if (limite <= 0) return "normal";
  const proporcao = usado / limite;
  if (proporcao >= 0.9) return "critico";
  if (proporcao >= 0.7) return "atencao";
  return "normal";
}

export function percentualDeUso(usado: number, limite: number): number {
  if (limite <= 0) return 0;
  return Math.min(100, Math.round((usado / limite) * 1000) / 10);
}

export function bytesLegiveis(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2).replace(".", ",")} GB`;
}
