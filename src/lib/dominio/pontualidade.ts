/**
 * Pontualidade (R8), o indicador-chave: obras concluídas até o prazo prometido (já considerando as pausas
 * justificadas) ÷ obras concluídas no período. Mostra-se também a média de dias de desvio e a versão
 * "sem considerar pausas". Desvio positivo = atraso; negativo = adiantamento, na mesma unidade do prazo
 * (dias úteis ou corridos da obra). Obra sem prazo prometido não pode ser avaliada e fica de fora da conta.
 */
import { diasEntreDoTipo, type TipoDiasDoPrazo } from "./dias-uteis";

export type ObraConcluida = {
  concluidaEm: string;
  /** Prazo prometido já com as pausas justificadas. */
  prazoFinalPrometido: string | null;
  /** Prazo contado do relógio sem nenhuma pausa; se vazio, usa o prometido. */
  prazoFinalSemPausas: string | null;
  tipoDias: TipoDiasDoPrazo;
};

export type AvaliacaoDeObra =
  | { avaliavel: false }
  | { avaliavel: true; pontual: boolean; desvioDias: number; pontualSemPausas: boolean; desvioSemPausasDias: number };

export function avaliarPontualidade(obra: ObraConcluida, feriados: ReadonlySet<string>): AvaliacaoDeObra {
  if (!obra.prazoFinalPrometido) return { avaliavel: false };
  const semPausas = obra.prazoFinalSemPausas ?? obra.prazoFinalPrometido;
  return {
    avaliavel: true,
    pontual: obra.concluidaEm <= obra.prazoFinalPrometido,
    desvioDias: diasEntreDoTipo(obra.prazoFinalPrometido, obra.concluidaEm, obra.tipoDias, feriados),
    pontualSemPausas: obra.concluidaEm <= semPausas,
    desvioSemPausasDias: diasEntreDoTipo(semPausas, obra.concluidaEm, obra.tipoDias, feriados),
  };
}

export type ResumoDePontualidade = {
  /** Obras concluídas que podem ser avaliadas (têm prazo prometido). */
  concluidas: number;
  /** Obras concluídas sem prazo prometido: não entram na porcentagem. */
  semPrazo: number;
  pontuais: number;
  /** Porcentagem com uma casa decimal; `null` sem obras avaliáveis. */
  pontualidadePct: number | null;
  desvioMedioDias: number | null;
  pontuaisSemPausas: number;
  pontualidadeSemPausasPct: number | null;
  desvioMedioSemPausasDias: number | null;
};

/** Arredonda x/n a uma casa decimal só com inteiros, simétrico para negativos (meio afasta do zero). */
function umaCasa(soma: number, n: number, escala: 1 | 100): number {
  const r = Math.round((Math.abs(soma) * 10 * escala) / n);
  return r === 0 ? 0 : (Math.sign(soma) * r) / 10;
}

export function resumirPontualidade(avaliacoes: readonly AvaliacaoDeObra[]): ResumoDePontualidade {
  const avaliadas = avaliacoes.filter((a): a is Extract<AvaliacaoDeObra, { avaliavel: true }> => a.avaliavel);
  const n = avaliadas.length;
  const pontuais = avaliadas.filter((a) => a.pontual).length;
  const pontuaisSemPausas = avaliadas.filter((a) => a.pontualSemPausas).length;
  const somaDesvio = avaliadas.reduce((s, a) => s + a.desvioDias, 0);
  const somaDesvioSem = avaliadas.reduce((s, a) => s + a.desvioSemPausasDias, 0);
  return {
    concluidas: n,
    semPrazo: avaliacoes.length - n,
    pontuais,
    pontualidadePct: n === 0 ? null : umaCasa(pontuais, n, 100),
    desvioMedioDias: n === 0 ? null : umaCasa(somaDesvio, n, 1),
    pontuaisSemPausas,
    pontualidadeSemPausasPct: n === 0 ? null : umaCasa(pontuaisSemPausas, n, 100),
    desvioMedioSemPausasDias: n === 0 ? null : umaCasa(somaDesvioSem, n, 1),
  };
}
