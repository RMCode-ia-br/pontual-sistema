/**
 * Etapas da obra (R7): rótulos, geração a partir do modelo, transições permitidas e o que o andamento das
 * etapas faz com o status do projeto. Funções puras, sem banco.
 */
import type { GrupoDePrazo, StatusDeEtapa } from "./prazo-obra";

export type TipoDeEtapa =
  | "MEDICAO_EXATA"
  | "PEDIDO_MATERIAL"
  | "FABRICACAO"
  | "INSTALACAO_ESQUADRIAS"
  | "MEDICAO_VIDROS"
  | "PEDIDO_VIDROS"
  | "INSTALACAO_VIDROS"
  | "ACABAMENTO"
  | "ENTREGA"
  | "OUTRA";

export const ROTULO_TIPO_ETAPA: Record<TipoDeEtapa, string> = {
  MEDICAO_EXATA: "Medição exata",
  PEDIDO_MATERIAL: "Pedido de material",
  FABRICACAO: "Fabricação",
  INSTALACAO_ESQUADRIAS: "Instalação das esquadrias",
  MEDICAO_VIDROS: "Medição dos vidros",
  PEDIDO_VIDROS: "Pedido dos vidros",
  INSTALACAO_VIDROS: "Instalação dos vidros",
  ACABAMENTO: "Acabamento",
  ENTREGA: "Entrega",
  OUTRA: "Outra etapa",
};

export const ROTULO_STATUS_ETAPA: Record<StatusDeEtapa, string> = {
  PENDENTE: "Pendente",
  EM_ANDAMENTO: "Em andamento",
  CONCLUIDA: "Concluída",
  BLOQUEADA: "Bloqueada",
  DISPENSADA: "Dispensada",
};

export const ROTULO_GRUPO_PRAZO: Record<GrupoDePrazo, string> = {
  MATERIAL: "Material",
  EXECUCAO: "Execução",
  VIDROS_FINALIZACAO: "Vidros e finalização",
};

export type GatilhoDeEtapa = "ENTREGA_MATERIAL" | "ENTREGA_E_INSTALACAO";

export type ItemDoModelo = {
  tipo: TipoDeEtapa;
  nome: string;
  ordem: number;
  grupoPrazo: GrupoDePrazo | null;
  peso: number;
  liberaGatilho: GatilhoDeEtapa | null;
  marcoGarantia: boolean;
  /** Só faz sentido se algum item aprovado exige esquadria (Tipologia.exigeEsquadria). */
  exigeEsquadria: boolean;
  ativo: boolean;
};

export type EtapaGerada = {
  tipo: TipoDeEtapa;
  nome: string;
  ordem: number;
  grupoPrazo: GrupoDePrazo | null;
  peso: number;
  liberaGatilho: GatilhoDeEtapa | null;
  marcoGarantia: boolean;
  status: "PENDENTE" | "DISPENSADA";
};

/**
 * Etapas de uma obra nova: itens ativos do modelo, na ordem (renumerada de 1 em diante). As que exigem
 * esquadria nascem DISPENSADAS quando nenhum item aprovado a exige (ex.: só box e guarda-corpo); o gestor
 * pode reativá-las.
 */
export function etapasDoModelo(itens: readonly ItemDoModelo[], temEsquadria: boolean): EtapaGerada[] {
  return itens
    .filter((i) => i.ativo)
    .sort((a, b) => a.ordem - b.ordem)
    .map((i, indice) => ({
      tipo: i.tipo,
      nome: i.nome,
      ordem: indice + 1,
      grupoPrazo: i.grupoPrazo,
      peso: i.peso,
      liberaGatilho: i.liberaGatilho,
      marcoGarantia: i.marcoGarantia,
      status: i.exigeEsquadria && !temEsquadria ? "DISPENSADA" : "PENDENTE",
    }));
}

const TRANSICOES: Record<StatusDeEtapa, readonly StatusDeEtapa[]> = {
  PENDENTE: ["EM_ANDAMENTO", "CONCLUIDA", "BLOQUEADA", "DISPENSADA"],
  EM_ANDAMENTO: ["PENDENTE", "CONCLUIDA", "BLOQUEADA", "DISPENSADA"],
  // Concluir exige desbloquear antes: o bloqueio precisa ser resolvido, não esquecido.
  BLOQUEADA: ["PENDENTE", "EM_ANDAMENTO", "DISPENSADA"],
  CONCLUIDA: ["EM_ANDAMENTO"],
  DISPENSADA: ["PENDENTE"],
};

export function transicaoPermitida(de: StatusDeEtapa, para: StatusDeEtapa): boolean {
  return TRANSICOES[de].includes(para);
}

type EtapaParaAndamento = { tipo: string; ordem: number; status: StatusDeEtapa };

/** A primeira etapa que ainda não terminou (coluna do Kanban de obras); `null` se todas terminaram. */
export function etapaAtual<T extends { ordem: number; status: StatusDeEtapa }>(etapas: readonly T[]): T | null {
  return [...etapas].sort((a, b) => a.ordem - b.ordem).find((e) => e.status !== "CONCLUIDA" && e.status !== "DISPENSADA") ?? null;
}

/** A obra termina quando a etapa ENTREGA é concluída; sem ENTREGA no modelo, quando a última etapa ativa termina. */
export function entregaConcluida(etapas: readonly EtapaParaAndamento[]): boolean {
  const ativas = etapas.filter((e) => e.status !== "DISPENSADA");
  const entrega = ativas.find((e) => e.tipo === "ENTREGA");
  if (entrega) return entrega.status === "CONCLUIDA";
  const ultima = [...ativas].sort((a, b) => b.ordem - a.ordem)[0];
  return ultima?.status === "CONCLUIDA";
}

export type StatusDeObra = "APROVADO" | "EM_EXECUCAO" | "CONCLUIDO";

/**
 * Status que o projeto deve ter segundo as etapas (R7): EM_EXECUCAO quando qualquer etapa está em andamento
 * (ou já foi concluída) e CONCLUIDO quando a entrega foi concluída; reabrir a entrega volta a EM_EXECUCAO.
 * Devolve `null` quando não há o que mudar ou o projeto não está numa fase de obra.
 */
export function statusDoProjetoPelasEtapas(atual: string, etapas: readonly EtapaParaAndamento[]): StatusDeObra | null {
  if (atual !== "APROVADO" && atual !== "EM_EXECUCAO" && atual !== "CONCLUIDO") return null;
  let alvo: StatusDeObra;
  if (entregaConcluida(etapas)) alvo = "CONCLUIDO";
  else if (etapas.some((e) => e.status === "EM_ANDAMENTO" || e.status === "CONCLUIDA")) alvo = "EM_EXECUCAO";
  else alvo = "APROVADO";
  // Não volta a APROVADO sozinho depois de iniciada a execução.
  if (alvo === "APROVADO" && atual !== "APROVADO") alvo = "EM_EXECUCAO";
  return alvo === atual ? null : alvo;
}
