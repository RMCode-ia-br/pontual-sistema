/**
 * Visão derivada de uma obra (prazo "ao vivo", semáforo e avisos). Funções puras sobre dados já lidos:
 * estados derivados (atrasada, vence em breve) são calculados na consulta, nunca gravados (spec seção 3).
 * Datas em texto "aaaa-mm-dd".
 */
import { anoSemFeriados, datasDeFeriado, diasEntreDoTipo, type PeriodoDeFeriado, type TipoDiasDoPrazo } from "@/lib/dominio/dias-uteis";
import { avaliarPontualidade, type AvaliacaoDeObra } from "@/lib/dominio/pontualidade";
import { calcularPrazoFinal, prazoDaProposta, type GrupoDePrazo, type ModoDoPrazo, type StatusDeEtapa } from "@/lib/dominio/prazo-obra";
import { semaforoDaData, type Semaforo } from "@/lib/dominio/semaforo";

const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

export type PrazoDaObraVisao = {
  /** A obra tem prazo em dias (da proposta ou definido depois). */
  definido: boolean;
  modo: ModoDoPrazo;
  tipoDias: TipoDiasDoPrazo;
  diasTotais: number | null;
  porGrupo: Record<GrupoDePrazo, number> | null;
  /** A medição exata foi concluída: o prazo já conta. */
  relogioIniciado: boolean;
  inicio: string | null;
  /** Prazo contado do início, sem pausas. */
  semPausas: string | null;
  /** Prazo prometido (com as pausas justificadas). */
  comPausas: string | null;
  diasPausaJustificada: number;
  /** Dias úteis (ou corridos) até o prazo prometido; negativo = já passou. Vazio se a obra foi concluída. */
  diasRestantes: number | null;
  semaforo: Semaforo | null;
  /** Antes do relógio: a data final que as etapas provisórias indicam (não é promessa). */
  previsaoProvisoria: string | null;
  /** Obra concluída: o veredito de pontualidade (com e sem pausas). */
  pontualidade: AvaliacaoDeObra | null;
};

export type EntradaDaVisao = {
  projeto: {
    status: string;
    prazoModo: ModoDoPrazo;
    prazoDias: number | null;
    prazoMaterialDias: number | null;
    prazoExecucaoDias: number | null;
    prazoVidrosDias: number | null;
    tipoDiasPrazo: TipoDiasDoPrazo;
    dataInicioPrazo: string | null;
    dataConclusao: string | null;
  };
  etapas: { status: StatusDeEtapa; fimPrevisto: string | null }[];
  pausas: { inicio: string; fim: string | null; justificada: boolean }[];
  periodos: PeriodoDeFeriado[];
  hoje: string;
  diasAlerta: number;
};

export function visaoDoPrazo(e: EntradaDaVisao): PrazoDaObraVisao {
  const { projeto } = e;
  const prazo = prazoDaProposta({
    modo: projeto.prazoModo,
    totalMinDias: projeto.prazoDias,
    totalMaxDias: projeto.prazoDias,
    materialDias: projeto.prazoMaterialDias,
    execucaoDias: projeto.prazoExecucaoDias,
    vidrosDias: projeto.prazoVidrosDias,
  });
  const feriados = datasDeFeriado(e.periodos);
  const concluida = projeto.status === "CONCLUIDO" && projeto.dataConclusao !== null;
  const base: PrazoDaObraVisao = {
    definido: prazo !== null,
    modo: prazo?.modo ?? "NENHUM",
    tipoDias: projeto.tipoDiasPrazo,
    diasTotais: prazo?.diasTotais ?? null,
    porGrupo: prazo?.porGrupo ?? null,
    relogioIniciado: projeto.dataInicioPrazo !== null,
    inicio: projeto.dataInicioPrazo,
    semPausas: null,
    comPausas: null,
    diasPausaJustificada: 0,
    diasRestantes: null,
    semaforo: null,
    previsaoProvisoria: null,
    pontualidade: null,
  };
  if (!prazo) return base;

  if (!projeto.dataInicioPrazo) {
    const fins = e.etapas.filter((x) => x.status !== "DISPENSADA" && x.fimPrevisto).map((x) => x.fimPrevisto!);
    return { ...base, previsaoProvisoria: fins.length > 0 ? [...fins].sort().at(-1)! : null };
  }

  // Pausa em curso conta até hoje (ou até a conclusão, se a obra já terminou).
  const ate = concluida ? projeto.dataConclusao! : e.hoje;
  const final = calcularPrazoFinal(projeto.dataInicioPrazo, prazo.diasTotais, e.pausas, ate, projeto.tipoDiasPrazo, feriados);
  const resultado: PrazoDaObraVisao = { ...base, semPausas: final.semPausas, comPausas: final.comPausas, diasPausaJustificada: final.diasPausaJustificada };

  if (concluida) {
    resultado.pontualidade = avaliarPontualidade(
      { concluidaEm: projeto.dataConclusao!, prazoFinalPrometido: final.comPausas, prazoFinalSemPausas: final.semPausas, tipoDias: projeto.tipoDiasPrazo },
      feriados,
    );
    return resultado;
  }
  resultado.diasRestantes = diasEntreDoTipo(e.hoje, final.comPausas, projeto.tipoDiasPrazo, feriados);
  resultado.semaforo = semaforoDaData(final.comPausas, e.hoje, e.diasAlerta);
  return resultado;
}

export type EntradaDeAvisos = {
  prazo: PrazoDaObraVisao;
  etapas: { nome: string; tipo: string; status: StatusDeEtapa; inicioPrevisto: string | null; fimPrevisto: string | null }[];
  periodos: PeriodoDeFeriado[];
  /** Endereço de condomínio da obra, se for o caso. */
  condominio: { nome: string | null; exigeAprovacaoFachada: boolean; fachadaAprovada: boolean } | null;
  concluida: boolean;
};

const ETAPAS_QUE_DEPENDEM_DE_COMPRA = ["PEDIDO_MATERIAL", "FABRICACAO", "PEDIDO_VIDROS"];

/** Avisos que NÃO bloqueiam nada: o gestor decide (nada é alterado sozinho). */
export function avisosDaObra(e: EntradaDeAvisos): string[] {
  if (e.concluida) return [];
  const avisos: string[] = [];

  if (!e.prazo.definido) {
    avisos.push("Defina o prazo da obra: sem ele as etapas ficam sem datas previstas e o prazo prometido não é calculado.");
  } else if (!e.prazo.relogioIniciado) {
    avisos.push("As datas são provisórias: o prazo só começa a contar quando a medição exata for concluída.");
  }

  const dataFinal = e.prazo.comPausas ?? e.prazo.previsaoProvisoria;
  if (dataFinal && e.prazo.tipoDias === "UTEIS") {
    const ano = anoSemFeriados(dataFinal, e.periodos);
    if (ano !== null) avisos.push(`Não há feriados cadastrados em ${ano}: a conta de dias úteis pode estar errada. Cadastre-os em Configurações, Feriados e férias.`);
  }

  const ferias = e.periodos.filter((p) => p.tipo === "FERIAS_COLETIVA_FORNECEDORES");
  for (const etapa of e.etapas) {
    if (etapa.status === "CONCLUIDA" || etapa.status === "DISPENSADA" || !ETAPAS_QUE_DEPENDEM_DE_COMPRA.includes(etapa.tipo)) continue;
    const inicio = etapa.inicioPrevisto ?? etapa.fimPrevisto;
    const fim = etapa.fimPrevisto ?? etapa.inicioPrevisto;
    if (!inicio || !fim) continue;
    const periodo = ferias.find((p) => p.data <= fim && (p.dataFim ?? p.data) >= inicio);
    if (periodo) {
      const ate = periodo.dataFim ?? periodo.data;
      avisos.push(`As férias coletivas dos fornecedores (${br(periodo.data)}${ate !== periodo.data ? ` a ${br(ate)}` : ""}) caem durante "${etapa.nome}": confira compras e prazos.`);
    }
  }

  if (e.condominio?.exigeAprovacaoFachada && !e.condominio.fachadaAprovada) {
    avisos.push(`O condomínio${e.condominio.nome ? ` (${e.condominio.nome})` : ""} ainda não aprovou a mudança da fachada: confirme antes de instalar.`);
  }
  return avisos;
}
