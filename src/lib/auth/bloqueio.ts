/** Regra da seção 3: 5 falhas em 15 min travam o login por 15 min. */
export const MAX_FALHAS = 5;
export const JANELA_MS = 15 * 60 * 1000;
export const BLOQUEIO_MS = 15 * 60 * 1000;

export type Tentativa = { identificador: string; ip: string; sucesso: boolean; criadoEm: Date };

/**
 * Falhas que contam para o bloqueio de UMA chave (conta ou IP): as da janela de 15 min, desconsideradas as
 * anteriores ao último login bem-sucedido dessa mesma chave. Função pura (recebe as tentativas já lidas).
 */
export function falhasContadas(tentativas: Tentativa[], pertence: (t: Tentativa) => boolean, agora: Date): Date[] {
  const inicioJanela = agora.getTime() - JANELA_MS;
  const dela = tentativas.filter((t) => pertence(t) && t.criadoEm.getTime() > inicioJanela);
  const sucessos = dela.filter((t) => t.sucesso).map((t) => t.criadoEm.getTime());
  const ultimoSucesso = sucessos.length > 0 ? Math.max(...sucessos) : -Infinity;
  return dela.filter((t) => !t.sucesso && t.criadoEm.getTime() > ultimoSucesso).map((t) => t.criadoEm);
}

/**
 * Bloqueio de uma tentativa de login: vale o que terminar mais tarde entre o bloqueio da CONTA e o do IP.
 * Uma única leitura de tentativas (as da conta ou do IP) alimenta os dois, para reduzir idas ao banco.
 */
export function statusBloqueioDasTentativas(tentativas: Tentativa[], conta: string, ip: string, agora: Date = new Date()): StatusBloqueio {
  const porConta = avaliarBloqueio(falhasContadas(tentativas, (t) => t.identificador === conta, agora), agora);
  const porIp = avaliarBloqueio(falhasContadas(tentativas, (t) => t.ip === ip, agora), agora);
  if (porConta.bloqueado && porIp.bloqueado) return porConta.ate >= porIp.ate ? porConta : porIp;
  return porConta.bloqueado ? porConta : porIp;
}

export type StatusBloqueio ={ bloqueado: false } | { bloqueado: true; ate: Date; minutosRestantes: number };

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
