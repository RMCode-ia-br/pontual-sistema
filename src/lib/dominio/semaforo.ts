/**
 * Semáforo de prazo (R8). Funções puras sobre datas de calendário "aaaa-mm-dd".
 * Verde = no prazo; amarelo = vence em até `diasAlerta` dias corridos (configurável, padrão 3); vermelho = atrasada.
 * Etapa atrasada = hoje > data prevista de fim e não concluída (nem dispensada).
 */
import { diferencaEmDias } from "./calendario";
import type { StatusDeEtapa } from "./prazo-obra";

export type Semaforo = "VERDE" | "AMARELO" | "VERMELHO";

export const ROTULO_SEMAFORO: Record<Semaforo, string> = {
  VERDE: "No prazo",
  AMARELO: "Vence em breve",
  VERMELHO: "Atrasada",
};

const GRAVIDADE: Record<Semaforo, number> = { VERDE: 0, AMARELO: 1, VERMELHO: 2 };

type EtapaParaSemaforo = { status: StatusDeEtapa; fimPrevisto: string | null };

const encerrada = (status: StatusDeEtapa) => status === "CONCLUIDA" || status === "DISPENSADA";

export function etapaAtrasada(e: EtapaParaSemaforo, hoje: string): boolean {
  return !encerrada(e.status) && e.fimPrevisto !== null && hoje > e.fimPrevisto;
}

/** `null` quando não se aplica: etapa encerrada ou sem data prevista. */
export function semaforoDaData(fimPrevisto: string | null, hoje: string, diasAlerta: number): Semaforo | null {
  if (fimPrevisto === null) return null;
  if (hoje > fimPrevisto) return "VERMELHO";
  return diferencaEmDias(hoje, fimPrevisto) <= diasAlerta ? "AMARELO" : "VERDE";
}

export function semaforoDaEtapa(e: EtapaParaSemaforo, hoje: string, diasAlerta: number): Semaforo | null {
  if (encerrada(e.status)) return null;
  return semaforoDaData(e.fimPrevisto, hoje, diasAlerta);
}

export function pior(semaforos: readonly (Semaforo | null)[]): Semaforo | null {
  let resultado: Semaforo | null = null;
  for (const s of semaforos) {
    if (s !== null && (resultado === null || GRAVIDADE[s] > GRAVIDADE[resultado])) resultado = s;
  }
  return resultado;
}

/**
 * Cor da obra = a pior entre as etapas abertas e o prazo final prometido. Obra concluída não tem semáforo
 * (o que vale é a pontualidade). `null` = sem datas para avaliar.
 */
export function semaforoDaObra(
  etapas: readonly EtapaParaSemaforo[],
  prazoFinalPrometido: string | null,
  concluida: boolean,
  hoje: string,
  diasAlerta: number,
): Semaforo | null {
  if (concluida) return null;
  return pior([...etapas.map((e) => semaforoDaEtapa(e, hoje, diasAlerta)), semaforoDaData(prazoFinalPrometido, hoje, diasAlerta)]);
}
