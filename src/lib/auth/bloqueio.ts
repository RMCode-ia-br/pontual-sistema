/** Regra da seção 3: 5 falhas em 15 min travam o login por 15 min. */
export const MAX_FALHAS = 5;
export const JANELA_MS = 15 * 60 * 1000;
export const BLOQUEIO_MS = 15 * 60 * 1000;

export type StatusBloqueio = { bloqueado: false } | { bloqueado: true; ate: Date; minutosRestantes: number };

/**
 * Decide se o login está bloqueado a partir das datas das falhas recentes
 * (já desconsideradas as anteriores a um login bem-sucedido).
 * O bloqueio dura BLOQUEIO_MS a partir da falha mais recente.
 * Função pura, sem acesso a banco, para ser testável.
 */
export function avaliarBloqueio(falhas: Date[], agora: Date = new Date()): StatusBloqueio {
  const inicioJanela = agora.getTime() - JANELA_MS;
  const recentes = falhas.filter((d) => d.getTime() > inicioJanela).sort((a, b) => b.getTime() - a.getTime());

  if (recentes.length < MAX_FALHAS) return { bloqueado: false };

  const ate = new Date(recentes[0].getTime() + BLOQUEIO_MS);
  if (ate.getTime() <= agora.getTime()) return { bloqueado: false };

  return {
    bloqueado: true,
    ate,
    minutosRestantes: Math.max(1, Math.ceil((ate.getTime() - agora.getTime()) / 60000)),
  };
}
