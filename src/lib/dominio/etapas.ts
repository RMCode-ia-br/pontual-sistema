/**
 * Etapas da obra (R7): rótulos, geração a partir do modelo, transições permitidas e o que o andamento das
 * etapas faz com o status do projeto. Funções puras, sem banco.
 */
import type { GrupoDePrazo, StatusDeEtapa } from "./prazo-obra";

export const TIPOS_DE_ETAPA = [
  "MEDICAO_EXATA",
  "PEDIDO_MATERIAL",
  "FABRICACAO",
  "INSTALACAO_ESQUADRIAS",
  "MEDICAO_VIDROS",
  "PEDIDO_VIDROS",
  "INSTALACAO_VIDROS",
  "ACABAMENTO",
  "ENTREGA",
  "OUTRA",
] as const;

export type TipoDeEtapa = (typeof TIPOS_DE_ETAPA)[number];

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

/** Só estes gatilhos de pagamento dependem de uma etapa da obra (R6). */
export const GATILHOS_DE_ETAPA = ["ENTREGA_MATERIAL", "ENTREGA_E_INSTALACAO"] as const;

export type GatilhoDeEtapa = (typeof GATILHOS_DE_ETAPA)[number];

export const ROTULO_GATILHO_DE_ETAPA: Record<GatilhoDeEtapa, string> = {
  ENTREGA_MATERIAL: "Entrega do material (esquadrias)",
  ENTREGA_E_INSTALACAO: "Entrega dos vidros e instalação",
};

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

export const PESO_MAXIMO_DE_ETAPA = 10;
export const MAXIMO_DE_ETAPAS_NO_MODELO = 30;

export type ValidacaoDoModelo = { ok: true } | { ok: false; erro: string };

/**
 * Confere o modelo de etapas antes de salvar (R7). Regras:
 * - ao menos uma etapa ativa, e a MEDICAO_EXATA (que inicia o relógio do prazo, R8) ativa, única, primeira e fora de qualquer grupo;
 * - cada tipo aparece uma vez entre as ativas (exceto "outra"): a obra tem uma etapa de cada tipo;
 * - cada gatilho de pagamento liberado por no máximo uma etapa, e um único marco de garantia (valem para TODAS as
 *   linhas, como o índice do banco); etapa inativa não pode liberar parcela nem marcar a garantia;
 * - peso inteiro de 1 a 10.
 */
export function validarModeloDeEtapas(itens: readonly Pick<ItemDoModelo, "tipo" | "nome" | "grupoPrazo" | "peso" | "liberaGatilho" | "marcoGarantia" | "ativo">[]): ValidacaoDoModelo {
  const erro = (mensagem: string): ValidacaoDoModelo => ({ ok: false, erro: mensagem });
  if (itens.length > MAXIMO_DE_ETAPAS_NO_MODELO) return erro(`No máximo ${MAXIMO_DE_ETAPAS_NO_MODELO} etapas.`);
  const ativos = itens.filter((i) => i.ativo);
  if (ativos.length === 0) return erro("Deixe ao menos uma etapa ativa.");

  for (const i of itens) {
    if (!Number.isInteger(i.peso) || i.peso < 1 || i.peso > PESO_MAXIMO_DE_ETAPA) return erro(`O peso de "${i.nome}" deve ser um número de 1 a ${PESO_MAXIMO_DE_ETAPA}.`);
    if (!i.ativo && i.liberaGatilho) return erro(`"${i.nome}" está inativa e não pode liberar parcela: ative a etapa ou tire o gatilho dela.`);
    if (!i.ativo && i.marcoGarantia) return erro(`"${i.nome}" está inativa e não pode marcar o início da garantia.`);
  }

  const medicoes = ativos.filter((i) => i.tipo === "MEDICAO_EXATA");
  if (medicoes.length === 0) return erro("A medição exata é obrigatória: é dela que o prazo da obra começa a contar.");
  if (ativos[0].tipo !== "MEDICAO_EXATA") return erro("A medição exata precisa ser a primeira etapa.");
  if (medicoes[0].grupoPrazo !== null) return erro("A medição exata não entra em nenhum prazo: ela só inicia o relógio.");

  const vistos = new Set<TipoDeEtapa>();
  for (const i of ativos) {
    if (i.tipo === "OUTRA") continue;
    if (vistos.has(i.tipo)) return erro(`A etapa "${ROTULO_TIPO_ETAPA[i.tipo]}" aparece mais de uma vez. Use o tipo "Outra etapa" para etapas extras.`);
    vistos.add(i.tipo);
  }

  for (const gatilho of GATILHOS_DE_ETAPA) {
    if (itens.filter((i) => i.liberaGatilho === gatilho).length > 1) return erro(`Só uma etapa pode liberar a parcela "${ROTULO_GATILHO_DE_ETAPA[gatilho]}".`);
  }
  if (itens.filter((i) => i.marcoGarantia).length > 1) return erro("Só uma etapa pode marcar o início da garantia.");

  return { ok: true };
}

/**
 * Avisos (não bloqueiam) sobre um modelo válido: o que ficaria sem funcionar. O gestor decide.
 */
export function avisosDoModelo(itens: readonly Pick<ItemDoModelo, "tipo" | "nome" | "grupoPrazo" | "liberaGatilho" | "marcoGarantia" | "ativo">[]): string[] {
  const ativos = itens.filter((i) => i.ativo);
  const avisos: string[] = [];
  for (const gatilho of GATILHOS_DE_ETAPA) {
    if (!ativos.some((i) => i.liberaGatilho === gatilho)) {
      avisos.push(`Nenhuma etapa libera a parcela "${ROTULO_GATILHO_DE_ETAPA[gatilho]}": as parcelas com esse gatilho ficariam aguardando para sempre.`);
    }
  }
  if (!ativos.some((i) => i.marcoGarantia)) {
    avisos.push("Nenhuma etapa marca o início da garantia: os chamados de assistência não conseguem conferir o prazo de regulagem.");
  }
  for (const i of ativos) {
    if (i.tipo !== "MEDICAO_EXATA" && i.grupoPrazo === null) avisos.push(`"${i.nome}" não pertence a nenhum prazo e ficará sem datas previstas.`);
  }
  return avisos;
}

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
