import { diasDaSemana, gradeDoMes, mesVizinho, somarDias } from "@/lib/dominio/calendario";

import { nomeDoMes } from "./components/calendario";
import type { Vista } from "./schemas";

export type PeriodoDaVista = { de: string; ate: string; titulo: string; anterior: string; proxima: string };

/** Intervalo de dias que a visão (mês, semana, dia ou lista) mostra, o título dela e os botões de navegar. */
export function periodoDaVista(vista: Vista, data: string): PeriodoDaVista {
  const br = (d: string) => d.split("-").reverse().join("/");
  if (vista === "mes") {
    const grade = gradeDoMes(data);
    return { de: grade[0][0], ate: grade[grade.length - 1][6], titulo: nomeDoMes(data), anterior: mesVizinho(data, -1), proxima: mesVizinho(data, 1) };
  }
  if (vista === "semana") {
    const dias = diasDaSemana(data);
    return { de: dias[0], ate: dias[6], titulo: `${br(dias[0])} a ${br(dias[6])}`, anterior: somarDias(data, -7), proxima: somarDias(data, 7) };
  }
  if (vista === "dia") return { de: data, ate: data, titulo: br(data), anterior: somarDias(data, -1), proxima: somarDias(data, 1) };
  return { de: data, ate: somarDias(data, 30), titulo: `Próximos 30 dias, a partir de ${br(data)}`, anterior: somarDias(data, -30), proxima: somarDias(data, 30) };
}
