/**
 * Prazo da obra (R7/R8). Funções puras sobre datas de calendário "aaaa-mm-dd".
 *
 * - O prazo vem da proposta (por grupo de etapas ou total simples); NENHUMA duração é inventada aqui.
 * - O relógio começa na conclusão da MEDICAO_EXATA (a data-base); o prazo final conta daí em dias úteis
 *   (padrão) ou corridos, descontando só feriados cadastrados.
 * - Pausas JUSTIFICADAS (motivo não imputável à Pontual) estendem o prazo prometido pelos dias que cobrem.
 * - O sistema só SUGERE datas: reprogramar nunca é automático.
 */
import { diferencaEmDias, somarDias } from "./calendario";
import { diasEntreDoTipo, diasUteisEntre, somarDiasDoTipo, type TipoDiasDoPrazo } from "./dias-uteis";

export type GrupoDePrazo = "MATERIAL" | "EXECUCAO" | "VIDROS_FINALIZACAO";
export const GRUPOS_DE_PRAZO: readonly GrupoDePrazo[] = ["MATERIAL", "EXECUCAO", "VIDROS_FINALIZACAO"];

export type ModoDoPrazo = "NENHUM" | "TOTAL" | "POR_ETAPA";

/** O prazo como a proposta o guarda (mesma forma do snapshot congelado). */
export type PrazoDaProposta = {
  modo: ModoDoPrazo;
  totalMinDias?: number | null;
  totalMaxDias?: number | null;
  materialDias?: number | null;
  execucaoDias?: number | null;
  vidrosDias?: number | null;
};

export type PrazoResolvido = {
  modo: "TOTAL" | "POR_ETAPA";
  /** Soma que vale para o prazo final prometido. */
  diasTotais: number;
  /** Só no modo por etapa. */
  porGrupo: Record<GrupoDePrazo, number> | null;
};

const positivo = (n: number | null | undefined): n is number => typeof n === "number" && Number.isInteger(n) && n > 0;

/**
 * Traduz o prazo da proposta. No modo "prazo total simples" (ex.: "20 a 35 dias") o prometido usa o
 * valor MÁXIMO (R7). Sem prazo (ou todos vazios/zerados) devolve `null`: a obra mostra o aviso
 * "Defina o prazo da obra".
 */
export function prazoDaProposta(p: PrazoDaProposta): PrazoResolvido | null {
  if (p.modo === "TOTAL") {
    const dias = positivo(p.totalMaxDias) ? p.totalMaxDias : positivo(p.totalMinDias) ? p.totalMinDias : null;
    return dias === null ? null : { modo: "TOTAL", diasTotais: dias, porGrupo: null };
  }
  if (p.modo === "POR_ETAPA") {
    const porGrupo: Record<GrupoDePrazo, number> = {
      MATERIAL: positivo(p.materialDias) ? p.materialDias : 0,
      EXECUCAO: positivo(p.execucaoDias) ? p.execucaoDias : 0,
      VIDROS_FINALIZACAO: positivo(p.vidrosDias) ? p.vidrosDias : 0,
    };
    const diasTotais = porGrupo.MATERIAL + porGrupo.EXECUCAO + porGrupo.VIDROS_FINALIZACAO;
    return diasTotais > 0 ? { modo: "POR_ETAPA", diasTotais, porGrupo } : null;
  }
  return null;
}

/**
 * Reparte `total` dias entre itens proporcionalmente aos pesos, só com inteiros (sem float): cada um recebe
 * o piso e as sobras vão, um dia por item, para os maiores restos (empate: o primeiro). A soma é sempre `total`.
 */
export function repartirDias(total: number, pesos: readonly number[]): number[] {
  if (pesos.length === 0) return [];
  const soma = pesos.reduce((a, b) => a + b, 0);
  if (soma <= 0) throw new RangeError("Os pesos precisam somar mais que zero.");
  const resultado = pesos.map((p) => Math.floor((total * p) / soma));
  let sobra = total - resultado.reduce((a, b) => a + b, 0);
  const porResto = pesos.map((p, i) => ({ i, resto: (total * p) % soma })).sort((a, b) => b.resto - a.resto || a.i - b.i);
  for (let k = 0; sobra > 0; k++, sobra--) resultado[porResto[k].i]++;
  return resultado;
}

export type EtapaParaDatas = {
  id: string;
  /** Texto do tipo (ex.: "MEDICAO_EXATA"); só `MEDICAO_EXATA` tem tratamento próprio (marco inicial). */
  tipo: string;
  ordem: number;
  grupoPrazo: GrupoDePrazo | null;
  peso: number;
  dispensada: boolean;
};

export type DatasDaEtapa = { id: string; inicio: string | null; fim: string | null };

/**
 * Propõe as datas previstas (R7). A etapa MEDICAO_EXATA é o marco: fica na data-base e o relógio parte dela.
 * As demais, em ordem, ocupam dias consecutivos (úteis ou corridos) logo depois da anterior:
 *  - POR_ETAPA: os dias de cada grupo são repartidos entre as etapas do grupo pelo peso;
 *  - TOTAL: o total é repartido entre todas as etapas que têm grupo, pelo peso (decisão 93).
 * Etapa dispensada não recebe dias nem data. Sem prazo, só o marco recebe data. O fim da última etapa com
 * dias coincide com `somarDiasDoTipo(base, diasTotais)` quando todos os grupos têm etapa ativa.
 */
export function distribuirDatas(
  etapas: readonly EtapaParaDatas[],
  base: string,
  prazo: PrazoResolvido | null,
  tipoDias: TipoDiasDoPrazo,
  feriados: ReadonlySet<string>,
): DatasDaEtapa[] {
  const ordenadas = [...etapas].sort((a, b) => a.ordem - b.ordem);
  const dias = new Map<string, number>();

  if (prazo) {
    const comGrupo = ordenadas.filter((e) => !e.dispensada && e.grupoPrazo !== null);
    if (prazo.modo === "TOTAL") {
      const partes = repartirDias(prazo.diasTotais, comGrupo.map((e) => e.peso));
      comGrupo.forEach((e, i) => dias.set(e.id, partes[i]));
    } else if (prazo.porGrupo) {
      for (const grupo of GRUPOS_DE_PRAZO) {
        const doGrupo = comGrupo.filter((e) => e.grupoPrazo === grupo);
        const partes = repartirDias(prazo.porGrupo[grupo], doGrupo.map((e) => e.peso));
        doGrupo.forEach((e, i) => dias.set(e.id, partes[i]));
      }
    }
  }

  let cursor = base;
  return ordenadas.map((e): DatasDaEtapa => {
    if (e.dispensada) return { id: e.id, inicio: null, fim: null };
    if (e.tipo === "MEDICAO_EXATA") return { id: e.id, inicio: base, fim: base };
    const n = dias.get(e.id);
    if (n === undefined) return { id: e.id, inicio: null, fim: null };
    if (n === 0) return { id: e.id, inicio: cursor, fim: cursor };
    const inicio = somarDiasDoTipo(cursor, 1, tipoDias, feriados);
    const fim = somarDiasDoTipo(cursor, n, tipoDias, feriados);
    cursor = fim;
    return { id: e.id, inicio, fim };
  });
}

export type PausaParaPrazo = {
  inicio: string;
  /** Último dia da pausa (inclusive). Vazio = em curso: conta até `hoje`. */
  fim: string | null;
  justificada: boolean;
};

/**
 * Dias que as pausas JUSTIFICADAS acrescentam ao prazo: dias úteis (ou corridos) cobertos pela união delas,
 * contando do dia seguinte ao início do relógio (pausa anterior ao relógio não estende nada) e sem contar
 * duas vezes os dias de pausas que se sobrepõem.
 */
export function diasDePausaJustificada(
  pausas: readonly PausaParaPrazo[],
  inicioDoPrazo: string,
  hoje: string,
  tipoDias: TipoDiasDoPrazo,
  feriados: ReadonlySet<string>,
): number {
  const primeiroDia = somarDias(inicioDoPrazo, 1);
  const intervalos = pausas
    .filter((p) => p.justificada)
    .map((p) => ({ de: p.inicio > primeiroDia ? p.inicio : primeiroDia, ate: p.fim ?? hoje }))
    .filter((i) => i.ate >= i.de)
    .sort((a, b) => (a.de < b.de ? -1 : a.de > b.de ? 1 : 0));

  const unidos: { de: string; ate: string }[] = [];
  for (const i of intervalos) {
    const ultimo = unidos[unidos.length - 1];
    if (ultimo && i.de <= ultimo.ate) {
      if (i.ate > ultimo.ate) ultimo.ate = i.ate;
    } else {
      unidos.push({ ...i });
    }
  }

  return unidos.reduce((total, i) => {
    return total + (tipoDias === "CORRIDOS" ? diferencaEmDias(i.de, i.ate) + 1 : diasUteisEntre(somarDias(i.de, -1), i.ate, feriados));
  }, 0);
}

export type PrazoFinal = {
  /** Prazo da proposta contado do início do relógio, sem pausas. */
  semPausas: string;
  /** `semPausas` empurrado pelos dias de pausa justificada: é o prazo prometido (R8). */
  comPausas: string;
  diasPausaJustificada: number;
};

export function calcularPrazoFinal(
  inicioDoPrazo: string,
  prazoDias: number,
  pausas: readonly PausaParaPrazo[],
  hoje: string,
  tipoDias: TipoDiasDoPrazo,
  feriados: ReadonlySet<string>,
): PrazoFinal {
  const diasPausa = diasDePausaJustificada(pausas, inicioDoPrazo, hoje, tipoDias, feriados);
  return {
    semPausas: somarDiasDoTipo(inicioDoPrazo, prazoDias, tipoDias, feriados),
    comPausas: somarDiasDoTipo(inicioDoPrazo, prazoDias + diasPausa, tipoDias, feriados),
    diasPausaJustificada: diasPausa,
  };
}

export type StatusDeEtapa = "PENDENTE" | "EM_ANDAMENTO" | "CONCLUIDA" | "BLOQUEADA" | "DISPENSADA";

export type EtapaComDatas = {
  id: string;
  ordem: number;
  status: StatusDeEtapa;
  inicioPrevisto: string | null;
  fimPrevisto: string | null;
};

export type SugestaoDeData = {
  id: string;
  inicioPrevisto: string | null;
  fimPrevisto: string | null;
  novoInicio: string | null;
  novoFim: string | null;
};

/**
 * Ao concluir uma etapa fora da data prevista, SUGERE deslocar as seguintes pelo mesmo desvio (em dias úteis
 * ou corridos). Só mexe em etapas ainda não concluídas e com data, e nunca sugere data anterior à conclusão.
 * O prazo prometido NÃO se move (atraso é atraso): só as datas das etapas.
 */
export function sugerirReprogramacao(
  etapas: readonly EtapaComDatas[],
  concluidaId: string,
  fimReal: string,
  tipoDias: TipoDiasDoPrazo,
  feriados: ReadonlySet<string>,
): SugestaoDeData[] {
  const concluida = etapas.find((e) => e.id === concluidaId);
  if (!concluida || !concluida.fimPrevisto) return [];
  const desvio = diasEntreDoTipo(concluida.fimPrevisto, fimReal, tipoDias, feriados);
  if (desvio === 0) return [];

  const mover = (data: string | null): string | null => {
    if (!data) return null;
    const nova = somarDiasDoTipo(data, desvio, tipoDias, feriados);
    return nova < fimReal ? fimReal : nova;
  };

  return etapas
    .filter((e) => e.ordem > concluida.ordem && ["PENDENTE", "EM_ANDAMENTO", "BLOQUEADA"].includes(e.status))
    .filter((e) => e.inicioPrevisto !== null || e.fimPrevisto !== null)
    .map((e) => ({
      id: e.id,
      inicioPrevisto: e.inicioPrevisto,
      fimPrevisto: e.fimPrevisto,
      novoInicio: mover(e.inicioPrevisto),
      novoFim: mover(e.fimPrevisto),
    }))
    .filter((s) => s.novoInicio !== s.inicioPrevisto || s.novoFim !== s.fimPrevisto);
}
