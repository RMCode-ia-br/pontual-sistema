import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { ErroNegocio } from "@/lib/acoes";
import { registrarAuditoria } from "@/lib/auditoria";
import { somarDias } from "@/lib/dominio/calendario";
import { datasDeFeriado, type TipoDiasDoPrazo } from "@/lib/dominio/dias-uteis";
import { ROTULO_STATUS_ETAPA, statusDoProjetoPelasEtapas, transicaoPermitida, type GatilhoDeEtapa } from "@/lib/dominio/etapas";
import { chaveFollowUp, vencimentoAvisoFimGarantia, vencimentoPedidoAvaliacao } from "@/lib/dominio/followup";
import type { StatusProjeto } from "@/lib/dominio/funil";
import {
  calcularPrazoFinal,
  distribuirDatas,
  prazoDaProposta,
  sugerirReprogramacao,
  type EtapaParaDatas,
  type PrazoResolvido,
  type StatusDeEtapa,
  type SugestaoDeData,
} from "@/lib/dominio/prazo-obra";
import { dataLocalDoInstante } from "@/lib/formatadores";
import { registrarInteracao } from "@/modules/interacoes/registrar";
import { mudarFaseDoProjeto } from "@/modules/projetos/servico";
import type { ConteudoProposta } from "@/modules/propostas/conteudo";

import { abrirParcelasDoGatilho, carregarPeriodosDeFeriado, gerarEtapasDaObra } from "./servico";

type Tx = Prisma.TransactionClient;
type Usuario = { id: string; nome: string };
type Leitura = Tx | Pick<Tx, "projeto" | "etapaProjeto" | "pausaProjeto" | "feriado">;

const STATUS_DE_OBRA = ["APROVADO", "EM_EXECUCAO", "CONCLUIDO"];
const REGEX_DIA = /^\d{4}-\d{2}-\d{2}$/;

const paraData = (dia: string) => new Date(`${dia}T00:00:00.000Z`);
const dia = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const encerrada = (s: StatusDeEtapa) => s === "CONCLUIDA" || s === "DISPENSADA";

function validarDia(valor: string, nome: string): string {
  const data = REGEX_DIA.test(valor) ? paraData(valor) : null;
  // `toISOString` estoura em data impossível (ex.: 2026-13-45): confere antes.
  if (!data || Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== valor) throw new ErroNegocio(`Informe ${nome} válida.`);
  // Um ano digitado errado (1926, 2926) estouraria o limite das contas de dias úteis com um erro genérico.
  if (valor < "2015-01-01" || valor > "2060-12-31") throw new ErroNegocio(`Informe ${nome} entre 2015 e 2060.`);
  return valor;
}

const PROJETO_OBRA = {
  id: true,
  codigo: true,
  titulo: true,
  clienteId: true,
  status: true,
  responsavelId: true,
  prazoModo: true,
  prazoDias: true,
  prazoMaterialDias: true,
  prazoExecucaoDias: true,
  prazoVidrosDias: true,
  tipoDiasPrazo: true,
  dataInicioPrazo: true,
  prazoFinalPrometido: true,
  dataConclusao: true,
} as const;

type ProjetoDeObra = Prisma.ProjetoGetPayload<{ select: typeof PROJETO_OBRA }>;

/** Trava o projeto (serializa as mudanças da mesma obra) e confere que ele está em obra. */
async function travarObra(tx: Tx, projetoId: string): Promise<ProjetoDeObra> {
  await tx.$queryRaw`SELECT "id" FROM "Projeto" WHERE "id" = ${projetoId} FOR UPDATE`;
  const projeto = await tx.projeto.findFirst({ where: { id: projetoId, deletadoEm: null }, select: PROJETO_OBRA });
  if (!projeto) throw new ErroNegocio("Obra não encontrada.");
  if (!STATUS_DE_OBRA.includes(projeto.status)) throw new ErroNegocio("Este projeto ainda não está em obra: ela começa quando uma proposta é aprovada.");
  return projeto;
}

const etapasDoProjeto = (db: Leitura, projetoId: string) => db.etapaProjeto.findMany({ where: { projetoId, deletadoEm: null }, orderBy: { ordem: "asc" } });
type EtapaDeObra = Awaited<ReturnType<typeof etapasDoProjeto>>[number];

/** O prazo guardado na obra, no formato do domínio (`null` = sem prazo definido). */
export function prazoDaObra(p: Pick<ProjetoDeObra, "prazoModo" | "prazoDias" | "prazoMaterialDias" | "prazoExecucaoDias" | "prazoVidrosDias">): PrazoResolvido | null {
  return prazoDaProposta({ modo: p.prazoModo, totalMinDias: p.prazoDias, totalMaxDias: p.prazoDias, materialDias: p.prazoMaterialDias, execucaoDias: p.prazoExecucaoDias, vidrosDias: p.prazoVidrosDias });
}

const paraDatas = (e: EtapaDeObra): EtapaParaDatas => ({ id: e.id, tipo: e.tipo, ordem: e.ordem, grupoPrazo: e.grupoPrazo, peso: e.peso, dispensada: e.status === "DISPENSADA" });

/**
 * Recalcula e grava o prazo final prometido (com as pausas justificadas) e o cache dos dias de pausa. Só tem o que
 * calcular depois que o relógio começou (medição exata concluída) e se a obra tem prazo.
 */
export async function atualizarPrazoFinal(tx: Tx, projetoId: string, hoje: string, usuarioId: string): Promise<void> {
  const projeto = await tx.projeto.findUniqueOrThrow({ where: { id: projetoId }, select: PROJETO_OBRA });
  const inicio = dia(projeto.dataInicioPrazo);
  const prazo = prazoDaObra(projeto);
  if (!inicio || !prazo) return;
  const [pausas, periodos] = await Promise.all([
    tx.pausaProjeto.findMany({ where: { projetoId, deletadoEm: null }, select: { inicio: true, fim: true, justificada: true } }),
    carregarPeriodosDeFeriado(tx),
  ]);
  const final = calcularPrazoFinal(inicio, prazo.diasTotais, pausas.map((p) => ({ inicio: dia(p.inicio)!, fim: dia(p.fim), justificada: p.justificada })), hoje, projeto.tipoDiasPrazo, datasDeFeriado(periodos));
  await tx.projeto.update({ where: { id: projetoId }, data: { prazoFinalPrometido: paraData(final.comPausas), diasPausaJustificada: final.diasPausaJustificada, atualizadoPorId: usuarioId } });
}

// ---------------------------------------------------------------------------------------------------------
// Parcelas: devolver ao "aguardando" quando a etapa que as liberou é reaberta
// ---------------------------------------------------------------------------------------------------------

async function reverterParcelasDaEtapa(tx: Tx, e: { etapaId: string; usuario: Usuario; ip?: string | null }): Promise<number> {
  // Trava as parcelas antes de decidir: um recebimento simultâneo não pode escapar da conferência de "já tem pagamento".
  await tx.$queryRaw`SELECT "id" FROM "ContaReceber" WHERE "etapaProjetoId" = ${e.etapaId} AND "deletadoEm" IS NULL ORDER BY "id" FOR UPDATE`;
  const contas = await tx.contaReceber.findMany({ where: { etapaProjetoId: e.etapaId, deletadoEm: null }, select: { id: true, descricao: true, status: true }, orderBy: { ordem: "asc" } });
  const comPagamento = contas.find((c) => c.status === "PARCIAL" || c.status === "PAGA");
  if (comPagamento) throw new ErroNegocio(`A parcela "${comPagamento.descricao}" já tem pagamento registrado. Estorne o pagamento antes de reabrir a etapa.`);
  const abertas = contas.filter((c) => c.status === "ABERTA");
  if (abertas.length === 0) return 0;

  await tx.contaReceber.updateMany({ where: { id: { in: abertas.map((c) => c.id) }, status: "ABERTA", valorPagoCentavos: 0 }, data: { status: "AGUARDANDO_GATILHO", vencimento: null, etapaProjetoId: null, atualizadoPorId: e.usuario.id } });
  await tx.tarefa.updateMany({
    where: { chaveUnica: { in: abertas.map((c) => `cobranca:${c.id}`) }, status: "ABERTA", deletadoEm: null },
    data: { status: "CANCELADA", atualizadoPorId: e.usuario.id },
  });
  for (const c of abertas) {
    await registrarAuditoria(tx, {
      usuario: e.usuario,
      entidade: "ContaReceber",
      entidadeId: c.id,
      acao: "REVERTER_LIBERACAO",
      antes: { status: "ABERTA", etapaProjetoId: e.etapaId },
      depois: { status: "AGUARDANDO_GATILHO", vencimento: null, etapaProjetoId: null },
      ip: e.ip,
    });
  }
  return abertas.length;
}

// ---------------------------------------------------------------------------------------------------------
// Etapa: iniciar, concluir, bloquear, desbloquear, dispensar, reabrir
// ---------------------------------------------------------------------------------------------------------

export type EntradaMudancaDeEtapa = {
  etapaId: string;
  para: StatusDeEtapa;
  usuario: Usuario;
  /** Dia do fato (início ou conclusão), "aaaa-mm-dd"; padrão: hoje (São Paulo). Não pode ser no futuro. */
  data?: string;
  /** Vencimento das parcelas liberadas ao concluir/dispensar a etapa-gatilho; padrão: o dia do fato. */
  vencimentoDasParcelas?: string;
  motivoBloqueioId?: string | null;
  detalheBloqueio?: string | null;
  ip?: string | null;
  agora?: Date;
};

export type ResultadoDaMudancaDeEtapa = {
  etapaId: string;
  status: StatusDeEtapa;
  parcelasLiberadas: number;
  parcelasRevertidas: number;
  /** Novo status do projeto, se as etapas o mudaram. */
  statusDoProjeto: StatusProjeto | null;
  /**
   * Datas que o sistema SUGERE depois da mudança (nunca aplica sozinho): `RELOGIO` ao concluir a medição exata
   * (datas definitivas) e `DESVIO` ao concluir fora da data prevista (deslocar as seguintes).
   */
  sugestoes: { tipo: "RELOGIO" | "DESVIO"; itens: SugestaoDeData[] } | null;
};

const ACAO_DA_MUDANCA = (de: StatusDeEtapa, para: StatusDeEtapa): string => {
  if (para === "EM_ANDAMENTO") return de === "PENDENTE" ? "INICIAR" : de === "BLOQUEADA" ? "DESBLOQUEAR" : "REABRIR";
  if (para === "PENDENTE") return de === "DISPENSADA" ? "REATIVAR" : de === "BLOQUEADA" ? "DESBLOQUEAR" : "DESFAZER_INICIO";
  return { CONCLUIDA: "CONCLUIR", BLOQUEADA: "BLOQUEAR", DISPENSADA: "DISPENSAR" }[para as "CONCLUIDA" | "BLOQUEADA" | "DISPENSADA"];
};

/**
 * Muda o estado de uma etapa da obra (R7/R8) numa transação só, com a obra travada:
 * - transição válida (matriz do domínio), datas coerentes e sem futuro; bloqueio exige motivo da lista;
 * - concluir a MEDICAO_EXATA inicia o relógio do prazo (grava o início e o prazo final prometido) e SUGERE datas definitivas;
 * - concluir ou dispensar a etapa-gatilho abre as parcelas aguardando (R6) com tarefa de cobrança; reabrir devolve ao aguardando
 *   (recusa se já houver pagamento);
 * - o status do projeto acompanha (EM_EXECUCAO / CONCLUIDO) e, ao concluir a entrega, nascem os follow-ups (avaliação do Google);
 *   ao concluir a etapa-marco da garantia, o aviso do fim da garantia.
 */
export async function mudarStatusDaEtapa(tx: Tx, e: EntradaMudancaDeEtapa): Promise<ResultadoDaMudancaDeEtapa> {
  const agora = e.agora ?? new Date();
  const hoje = dataLocalDoInstante(agora);
  const ref = await tx.etapaProjeto.findFirst({ where: { id: e.etapaId, deletadoEm: null, projeto: { deletadoEm: null } }, select: { projetoId: true } });
  if (!ref) throw new ErroNegocio("Etapa não encontrada.");
  const projeto = await travarObra(tx, ref.projetoId);
  const etapas = await etapasDoProjeto(tx, projeto.id);
  const etapa = etapas.find((x) => x.id === e.etapaId);
  if (!etapa) throw new ErroNegocio("Etapa não encontrada.");

  const de = etapa.status;
  const para = e.para;
  if (!transicaoPermitida(de, para)) throw new ErroNegocio(`Não dá para passar a etapa de "${ROTULO_STATUS_ETAPA[de]}" para "${ROTULO_STATUS_ETAPA[para]}".`);

  const dataFato = validarDia(e.data ?? hoje, "a data");
  // Dispensar também não aceita data futura: ela vira o vencimento das parcelas liberadas.
  if ((para === "CONCLUIDA" || para === "DISPENSADA" || (para === "EM_ANDAMENTO" && de === "PENDENTE")) && dataFato > hoje) throw new ErroNegocio("A data não pode ser no futuro.", { data: "Use hoje ou uma data passada." });

  // ----- a própria etapa -----
  const dados: Prisma.EtapaProjetoUncheckedUpdateInput = { status: para, atualizadoPorId: e.usuario.id };
  let nomeDoMotivo: string | null = null;
  if (de === "BLOQUEADA") Object.assign(dados, { motivoBloqueioId: null, detalheBloqueio: null });
  if (para === "EM_ANDAMENTO") {
    if (de === "PENDENTE" || (de === "BLOQUEADA" && !etapa.inicioReal)) dados.inicioReal = paraData(dataFato);
    if (de === "CONCLUIDA") dados.fimReal = null;
  } else if (para === "PENDENTE") {
    if (de === "EM_ANDAMENTO") dados.inicioReal = null;
  } else if (para === "CONCLUIDA") {
    const inicio = dia(etapa.inicioReal) ?? dataFato;
    if (dataFato < inicio) throw new ErroNegocio(`A conclusão não pode ser anterior ao início da etapa (${br(inicio)}).`, { data: "Use uma data a partir do início." });
    if (etapa.tipo === "ENTREGA") {
      if ((await tx.pausaProjeto.count({ where: { projetoId: projeto.id, fim: null, deletadoEm: null } })) > 0) {
        throw new ErroNegocio("Encerre a pausa em curso antes de concluir a entrega.");
      }
      // Entregar com etapa anterior aberta deixaria parcelas sem abrir e a garantia sem começar: o gestor
      // conclui ou dispensa cada uma, de propósito (nada é resolvido sozinho).
      const abertas = etapas.filter((x) => x.ordem < etapa.ordem && !encerrada(x.status));
      if (abertas.length > 0) {
        throw new ErroNegocio(`Antes de concluir a entrega, conclua ou dispense: ${abertas.map((x) => x.nome).join(", ")}.`);
      }
    }
    dados.inicioReal = paraData(inicio);
    dados.fimReal = paraData(dataFato);
    if (etapa.tipo === "MEDICAO_EXATA") dados.provisoria = false; // virou fato
  } else if (para === "BLOQUEADA") {
    if (!e.motivoBloqueioId) throw new ErroNegocio("Escolha o motivo do bloqueio.", { motivoBloqueioId: "Escolha o motivo." });
    const motivo = await tx.motivoBloqueio.findFirst({ where: { id: e.motivoBloqueioId, ativo: true, deletadoEm: null }, select: { nome: true } });
    if (!motivo) throw new ErroNegocio("O motivo escolhido não está disponível.", { motivoBloqueioId: "Escolha um motivo da lista." });
    nomeDoMotivo = motivo.nome;
    const detalhe = e.detalheBloqueio?.trim() || null;
    if (detalhe && detalhe.length > 500) throw new ErroNegocio("Use no máximo 500 caracteres no detalhe.", { detalheBloqueio: "Máximo de 500 caracteres." });
    Object.assign(dados, { motivoBloqueioId: e.motivoBloqueioId, detalheBloqueio: detalhe });
  }
  await tx.etapaProjeto.update({ where: { id: etapa.id }, data: dados });

  // ----- parcelas ligadas à etapa (R6) -----
  let parcelasLiberadas = 0;
  let parcelasRevertidas = 0;
  if (etapa.liberaGatilho) {
    if (!encerrada(de) && encerrada(para)) {
      const vencimento = validarDia(e.vencimentoDasParcelas ?? dataFato, "o vencimento das parcelas");
      parcelasLiberadas = await abrirParcelasDoGatilho(tx, {
        projetoId: projeto.id,
        gatilho: etapa.liberaGatilho as GatilhoDeEtapa,
        etapaId: etapa.id,
        vencimento,
        motivo: `A etapa "${etapa.nome}" foi ${para === "CONCLUIDA" ? "concluída" : "dispensada"} em ${br(dataFato)}: a parcela está liberada para cobrança.`,
        usuario: e.usuario,
        ip: e.ip,
      });
    } else if (encerrada(de) && !encerrada(para)) {
      parcelasRevertidas = await reverterParcelasDaEtapa(tx, { etapaId: etapa.id, usuario: e.usuario, ip: e.ip });
    }
  }

  // ----- relógio do prazo e sugestões de datas -----
  const [periodos, depois] = await Promise.all([carregarPeriodosDeFeriado(tx), etapasDoProjeto(tx, projeto.id)]);
  const feriados = datasDeFeriado(periodos);
  const tipoDias = projeto.tipoDiasPrazo;
  const dadosProjeto: Prisma.ProjetoUncheckedUpdateInput = {};
  let sugestoes: ResultadoDaMudancaDeEtapa["sugestoes"] = null;
  const novasDatas = (itens: SugestaoDeData[]) => (itens.length > 0 ? itens : null);

  if (etapa.tipo === "MEDICAO_EXATA" && para === "CONCLUIDA") {
    dadosProjeto.dataInicioPrazo = paraData(dataFato);
    const prazo = prazoDaObra(projeto);
    if (prazo) {
      const datas = distribuirDatas(depois.map(paraDatas), dataFato, prazo, tipoDias, feriados);
      const itens = depois
        .filter((x) => !encerrada(x.status) && x.tipo !== "MEDICAO_EXATA")
        .flatMap((x) => {
          const d = datas.find((y) => y.id === x.id);
          if (!d?.inicio || !d.fim) return [];
          const s: SugestaoDeData = { id: x.id, inicioPrevisto: dia(x.inicioPrevisto), fimPrevisto: dia(x.fimPrevisto), novoInicio: d.inicio, novoFim: d.fim };
          return s.novoInicio !== s.inicioPrevisto || s.novoFim !== s.fimPrevisto ? [s] : [];
        });
      const n = novasDatas(itens);
      sugestoes = n ? { tipo: "RELOGIO", itens: n } : null;
    }
  } else if (etapa.tipo === "MEDICAO_EXATA" && de === "CONCLUIDA") {
    // Medição reaberta: o relógio para e as datas voltam a ser provisórias.
    Object.assign(dadosProjeto, { dataInicioPrazo: null, prazoFinalPrometido: null, diasPausaJustificada: 0 });
    await tx.etapaProjeto.updateMany({ where: { projetoId: projeto.id, deletadoEm: null, status: { in: ["PENDENTE", "EM_ANDAMENTO", "BLOQUEADA"] }, inicioPrevisto: { not: null } }, data: { provisoria: true } });
  } else if (para === "CONCLUIDA") {
    const itens = sugerirReprogramacao(
      depois.map((x) => ({ id: x.id, ordem: x.ordem, status: x.status, inicioPrevisto: dia(x.inicioPrevisto), fimPrevisto: dia(x.fimPrevisto) })),
      etapa.id,
      dataFato,
      tipoDias,
      feriados,
    );
    const n = novasDatas(itens);
    sugestoes = n ? { tipo: "DESVIO", itens: n } : null;
  }

  // ----- status do projeto -----
  const alvo = statusDoProjetoPelasEtapas(projeto.status, depois.map((x) => ({ tipo: x.tipo, ordem: x.ordem, status: x.status })));
  let statusDoProjeto: StatusProjeto | null = null;
  if (alvo) {
    await mudarFaseDoProjeto(tx, {
      usuario: e.usuario,
      projeto: { id: projeto.id, codigo: projeto.codigo, titulo: projeto.titulo, clienteId: projeto.clienteId, status: projeto.status as StatusProjeto },
      para: alvo,
      ip: e.ip,
      agora,
    });
    statusDoProjeto = alvo;
    if (alvo === "CONCLUIDO") dadosProjeto.dataConclusao = paraData(dataFato);
    else if (projeto.status === "CONCLUIDO") dadosProjeto.dataConclusao = null;
  }
  if (Object.keys(dadosProjeto).length > 0) await tx.projeto.update({ where: { id: projeto.id }, data: { ...dadosProjeto, atualizadoPorId: e.usuario.id } });
  await atualizarPrazoFinal(tx, projeto.id, dataFato > hoje ? dataFato : hoje, e.usuario.id);

  // ----- follow-ups (R11): avaliação do Google ao entregar; aviso do fim da garantia ao concluir o marco -----
  await acompanhamentos(tx, { projeto, etapa, de, para, dataFato, usuario: e.usuario, agora });

  // ----- linha do tempo e auditoria -----
  const frase = {
    EM_ANDAMENTO: de === "PENDENTE" ? `iniciada em ${br(dataFato)}` : de === "BLOQUEADA" ? "desbloqueada e em andamento" : "reaberta",
    PENDENTE: de === "DISPENSADA" ? "reativada" : de === "BLOQUEADA" ? "desbloqueada" : "voltou para pendente",
    CONCLUIDA: `concluída em ${br(dataFato)}`,
    BLOQUEADA: `bloqueada (${nomeDoMotivo}${e.detalheBloqueio?.trim() ? `: ${e.detalheBloqueio.trim()}` : ""})`,
    DISPENSADA: "dispensada (não se aplica a esta obra)",
  }[para];
  const extra = [
    parcelasLiberadas > 0 ? `${parcelasLiberadas} parcela(s) liberada(s) para cobrança` : null,
    parcelasRevertidas > 0 ? `${parcelasRevertidas} parcela(s) voltaram a aguardar a etapa` : null,
  ].filter(Boolean);
  await registrarInteracao(tx, {
    tipo: "SISTEMA",
    texto: `Etapa "${etapa.nome}" ${frase}.${extra.length > 0 ? ` ${extra.join("; ")}.` : ""}`,
    clienteId: projeto.clienteId,
    projetoId: projeto.id,
    usuarioId: e.usuario.id,
  });
  await registrarAuditoria(tx, {
    usuario: e.usuario,
    entidade: "EtapaProjeto",
    entidadeId: etapa.id,
    acao: ACAO_DA_MUDANCA(de, para),
    antes: { status: de, inicioReal: dia(etapa.inicioReal), fimReal: dia(etapa.fimReal), motivoBloqueioId: etapa.motivoBloqueioId },
    depois: { status: para, inicioReal: dia((dados.inicioReal as Date | null | undefined) ?? etapa.inicioReal), fimReal: dia(dados.fimReal === undefined ? etapa.fimReal : (dados.fimReal as Date | null)), motivoBloqueioId: para === "BLOQUEADA" ? e.motivoBloqueioId : null },
    ip: e.ip,
  });

  return { etapaId: etapa.id, status: para, parcelasLiberadas, parcelasRevertidas, statusDoProjeto, sugestoes };
}

async function acompanhamentos(
  tx: Tx,
  e: { projeto: ProjetoDeObra; etapa: EtapaDeObra; de: StatusDeEtapa; para: StatusDeEtapa; dataFato: string; usuario: Usuario; agora: Date },
): Promise<void> {
  const { projeto, etapa, de, para } = e;
  // Reabrir uma etapa cancela os avisos que a conclusão tinha criado (se ainda estão abertos).
  if (de === "CONCLUIDA" && para !== "CONCLUIDA") {
    const prefixos = [];
    if (etapa.tipo === "ENTREGA") prefixos.push(`followup:pedir-avaliacao:${projeto.id}:${etapa.id}:`);
    if (etapa.marcoGarantia) prefixos.push(`followup:fim-garantia:${projeto.id}:${etapa.id}:`);
    for (const prefixo of prefixos) {
      await tx.tarefa.updateMany({ where: { chaveUnica: { startsWith: prefixo }, status: "ABERTA", deletadoEm: null }, data: { status: "CANCELADA", atualizadoPorId: e.usuario.id } });
    }
  }
  if (para !== "CONCLUIDA" || de === "CONCLUIDA") return;

  const cfg = await tx.configuracaoEmpresa.findUnique({ where: { id: "singleton" }, select: { diasPedidoAvaliacao: true, garantiaRegulagemDias: true, linkAvaliacaoGoogle: true } });
  const instante = new Date(`${e.dataFato}T12:00:00.000Z`); // meio-dia UTC cai no mesmo dia em São Paulo
  // A chave identifica ESTA conclusão: concluir, reabrir e concluir de novo é outro fato e gera outro aviso.
  // (Conta os já criados, inclusive cancelados; a obra está travada, então a sequência não se repete.)
  const referencia = async (tipo: "pedir-avaliacao" | "fim-garantia") => {
    const anteriores = await tx.tarefa.count({ where: { chaveUnica: { startsWith: `followup:${tipo}:${projeto.id}:${etapa.id}:` } } });
    return `${etapa.id}:${anteriores + 1}`;
  };
  const tarefas: Prisma.TarefaCreateManyInput[] = [];
  if (etapa.tipo === "ENTREGA") {
    tarefas.push({
      titulo: `Pedir avaliação no Google — ${projeto.titulo}`,
      descricao: cfg?.linkAvaliacaoGoogle ? "Obra entregue. Envie o pedido pelo WhatsApp (a mensagem já está pronta na obra)." : "Obra entregue. Cadastre o link de avaliação do Google em Configurações, Empresa, antes de enviar o pedido.",
      tipo: "PEDIR_AVALIACAO",
      responsavelId: projeto.responsavelId,
      vencimento: vencimentoPedidoAvaliacao(instante, cfg?.diasPedidoAvaliacao ?? 2),
      clienteId: projeto.clienteId,
      projetoId: projeto.id,
      chaveUnica: chaveFollowUp("pedir-avaliacao", projeto.id, await referencia("pedir-avaliacao")),
      criadoPorId: e.usuario.id,
      atualizadoPorId: e.usuario.id,
    });
  }
  if (etapa.marcoGarantia) {
    const garantiaDias = cfg?.garantiaRegulagemDias ?? 90;
    tarefas.push({
      titulo: `Fim da garantia de regulagem — ${projeto.titulo}`,
      descricao: `A garantia de regulagem termina em ${br(somarDias(e.dataFato, garantiaDias))}. Depois dessa data, a visita é cobrada.`,
      tipo: "FIM_GARANTIA",
      responsavelId: projeto.responsavelId,
      vencimento: vencimentoAvisoFimGarantia(instante, garantiaDias),
      clienteId: projeto.clienteId,
      projetoId: projeto.id,
      chaveUnica: chaveFollowUp("fim-garantia", projeto.id, await referencia("fim-garantia")),
      criadoPorId: e.usuario.id,
      atualizadoPorId: e.usuario.id,
    });
  }
  if (tarefas.length > 0) await tx.tarefa.createMany({ data: tarefas, skipDuplicates: true });
}

// ---------------------------------------------------------------------------------------------------------
// Editar etapa e aplicar datas sugeridas
// ---------------------------------------------------------------------------------------------------------

export type EntradaEdicaoDeEtapa = {
  etapaId: string;
  usuario: Usuario;
  /** `undefined` mantém; `null` limpa. */
  responsavelId?: string | null;
  equipeId?: string | null;
  inicioPrevisto?: string | null;
  fimPrevisto?: string | null;
  observacao?: string | null;
  ip?: string | null;
};

export async function editarEtapa(tx: Tx, e: EntradaEdicaoDeEtapa): Promise<void> {
  const ref = await tx.etapaProjeto.findFirst({ where: { id: e.etapaId, deletadoEm: null, projeto: { deletadoEm: null } }, select: { projetoId: true } });
  if (!ref) throw new ErroNegocio("Etapa não encontrada.");
  const projeto = await travarObra(tx, ref.projetoId);
  const etapa = await tx.etapaProjeto.findFirstOrThrow({ where: { id: e.etapaId, deletadoEm: null } });

  if (e.responsavelId) {
    const u = await tx.usuario.findFirst({ where: { id: e.responsavelId, ativo: true, deletadoEm: null }, select: { id: true } });
    if (!u) throw new ErroNegocio("O responsável escolhido não está disponível.", { responsavelId: "Escolha um usuário ativo." });
  }
  if (e.equipeId) {
    const q = await tx.equipe.findFirst({ where: { id: e.equipeId, ativo: true, deletadoEm: null }, select: { id: true } });
    if (!q) throw new ErroNegocio("A equipe escolhida não está disponível.", { equipeId: "Escolha uma equipe ativa." });
  }
  const inicio = e.inicioPrevisto === undefined ? dia(etapa.inicioPrevisto) : e.inicioPrevisto ? validarDia(e.inicioPrevisto, "a data de início") : null;
  const fim = e.fimPrevisto === undefined ? dia(etapa.fimPrevisto) : e.fimPrevisto ? validarDia(e.fimPrevisto, "a data de término") : null;
  if (inicio && fim && fim < inicio) throw new ErroNegocio("O término não pode ser antes do início.", { fimPrevisto: "Use uma data a partir do início." });
  const observacao = e.observacao === undefined ? etapa.observacao : e.observacao?.trim() || null;
  if (observacao && observacao.length > 500) throw new ErroNegocio("Use no máximo 500 caracteres na observação.", { observacao: "Máximo de 500 caracteres." });

  const mudouDatas = inicio !== dia(etapa.inicioPrevisto) || fim !== dia(etapa.fimPrevisto);
  const dados = {
    responsavelId: e.responsavelId === undefined ? etapa.responsavelId : e.responsavelId,
    equipeId: e.equipeId === undefined ? etapa.equipeId : e.equipeId,
    inicioPrevisto: inicio ? paraData(inicio) : null,
    fimPrevisto: fim ? paraData(fim) : null,
    observacao,
    // Datas acertadas à mão depois que o relógio começou deixam de ser provisórias.
    provisoria: mudouDatas ? projeto.dataInicioPrazo === null && (inicio !== null || fim !== null) : etapa.provisoria,
    atualizadoPorId: e.usuario.id,
  };
  await tx.etapaProjeto.update({ where: { id: etapa.id }, data: dados });
  await registrarAuditoria(tx, {
    usuario: e.usuario,
    entidade: "EtapaProjeto",
    entidadeId: etapa.id,
    acao: "ATUALIZAR",
    antes: { responsavelId: etapa.responsavelId, equipeId: etapa.equipeId, inicioPrevisto: dia(etapa.inicioPrevisto), fimPrevisto: dia(etapa.fimPrevisto), observacao: etapa.observacao },
    depois: { responsavelId: dados.responsavelId, equipeId: dados.equipeId, inicioPrevisto: inicio, fimPrevisto: fim, observacao },
    ip: e.ip,
  });
}

/**
 * Datas que o sistema propõe para as etapas ainda abertas, com o prazo e as pausas de agora: parte do início do
 * relógio (ou, antes dele, da data provisória da medição exata). Não grava nada.
 */
export async function sugerirDatasDaObra(db: Leitura, projetoId: string, hoje: string): Promise<{ base: string; itens: SugestaoDeData[] } | { erro: string }> {
  const projeto = await db.projeto.findFirst({ where: { id: projetoId, deletadoEm: null }, select: PROJETO_OBRA });
  if (!projeto) return { erro: "Obra não encontrada." };
  const prazo = prazoDaObra(projeto);
  if (!prazo) return { erro: "Defina o prazo da obra para calcular as datas." };
  const [etapas, periodos] = await Promise.all([etapasDoProjeto(db, projetoId), carregarPeriodosDeFeriado(db)]);
  const medicao = etapas.find((x) => x.tipo === "MEDICAO_EXATA" && x.status !== "DISPENSADA");
  const base = dia(projeto.dataInicioPrazo) ?? dia(medicao?.fimPrevisto) ?? hoje;
  const datas = distribuirDatas(etapas.map(paraDatas), base, prazo, projeto.tipoDiasPrazo, datasDeFeriado(periodos));
  const itens = etapas
    .filter((x) => !encerrada(x.status) && x.tipo !== "MEDICAO_EXATA")
    .flatMap((x) => {
      const d = datas.find((y) => y.id === x.id);
      if (!d?.inicio || !d.fim) return [];
      const s: SugestaoDeData = { id: x.id, inicioPrevisto: dia(x.inicioPrevisto), fimPrevisto: dia(x.fimPrevisto), novoInicio: d.inicio, novoFim: d.fim };
      return s.novoInicio !== s.inicioPrevisto || s.novoFim !== s.fimPrevisto ? [s] : [];
    });
  return { base, itens };
}

/** Aplica as datas que o gestor confirmou (só em etapas abertas da obra). */
export async function aplicarDatasSugeridas(tx: Tx, e: { projetoId: string; itens: { etapaId: string; inicio: string; fim: string }[]; usuario: Usuario; ip?: string | null }): Promise<number> {
  const projeto = await travarObra(tx, e.projetoId);
  const etapas = await etapasDoProjeto(tx, e.projetoId);
  let aplicadas = 0;
  for (const item of e.itens) {
    const etapa = etapas.find((x) => x.id === item.etapaId);
    if (!etapa) throw new ErroNegocio("Uma das etapas não pertence a esta obra.");
    if (encerrada(etapa.status)) continue;
    validarDia(item.inicio, "a data de início");
    validarDia(item.fim, "a data de término");
    if (item.fim < item.inicio) throw new ErroNegocio(`"${etapa.nome}": o término não pode ser antes do início.`);
    await tx.etapaProjeto.update({ where: { id: etapa.id }, data: { inicioPrevisto: paraData(item.inicio), fimPrevisto: paraData(item.fim), provisoria: projeto.dataInicioPrazo === null, atualizadoPorId: e.usuario.id } });
    await registrarAuditoria(tx, {
      usuario: e.usuario,
      entidade: "EtapaProjeto",
      entidadeId: etapa.id,
      acao: "REPROGRAMAR",
      antes: { inicioPrevisto: dia(etapa.inicioPrevisto), fimPrevisto: dia(etapa.fimPrevisto) },
      depois: { inicioPrevisto: item.inicio, fimPrevisto: item.fim },
      ip: e.ip,
    });
    aplicadas++;
  }
  if (aplicadas > 0) {
    await registrarInteracao(tx, { tipo: "SISTEMA", texto: `Datas previstas de ${aplicadas} etapa(s) reprogramadas.`, clienteId: projeto.clienteId, projetoId: projeto.id, usuarioId: e.usuario.id });
  }
  return aplicadas;
}

// ---------------------------------------------------------------------------------------------------------
// Prazo da obra
// ---------------------------------------------------------------------------------------------------------

export type EntradaPrazoDaObra = {
  projetoId: string;
  modo: "NENHUM" | "TOTAL" | "POR_ETAPA";
  totalDias?: number | null;
  materialDias?: number | null;
  execucaoDias?: number | null;
  vidrosDias?: number | null;
  tipoDias: TipoDiasDoPrazo;
  usuario: Usuario;
  ip?: string | null;
};

/** Define ou ajusta o prazo da obra (quando a proposta não trazia, ou por acerto do gestor). Auditado. */
export async function definirPrazoDaObra(tx: Tx, e: EntradaPrazoDaObra): Promise<void> {
  const projeto = await travarObra(tx, e.projetoId);
  const prazo = prazoDaProposta({ modo: e.modo, totalMinDias: e.totalDias, totalMaxDias: e.totalDias, materialDias: e.materialDias, execucaoDias: e.execucaoDias, vidrosDias: e.vidrosDias });
  if (e.modo !== "NENHUM" && !prazo) throw new ErroNegocio("Informe ao menos um prazo em dias (maior que zero).");

  const novo = {
    prazoModo: prazo ? prazo.modo : ("NENHUM" as const),
    prazoDias: prazo?.diasTotais ?? null,
    prazoMaterialDias: prazo?.porGrupo?.MATERIAL || null,
    prazoExecucaoDias: prazo?.porGrupo?.EXECUCAO || null,
    prazoVidrosDias: prazo?.porGrupo?.VIDROS_FINALIZACAO || null,
    tipoDiasPrazo: e.tipoDias,
  };
  const antes = { prazoModo: projeto.prazoModo, prazoDias: projeto.prazoDias, prazoMaterialDias: projeto.prazoMaterialDias, prazoExecucaoDias: projeto.prazoExecucaoDias, prazoVidrosDias: projeto.prazoVidrosDias, tipoDiasPrazo: projeto.tipoDiasPrazo };
  await tx.projeto.update({ where: { id: projeto.id }, data: { ...novo, ...(prazo ? {} : { prazoFinalPrometido: null, diasPausaJustificada: 0 }), atualizadoPorId: e.usuario.id } });
  await atualizarPrazoFinal(tx, projeto.id, dataLocalDoInstante(new Date()), e.usuario.id);
  await registrarInteracao(tx, {
    tipo: "SISTEMA",
    texto: prazo ? `Prazo da obra definido: ${prazo.diasTotais} dias ${e.tipoDias === "UTEIS" ? "úteis" : "corridos"}.` : "Prazo da obra removido.",
    clienteId: projeto.clienteId,
    projetoId: projeto.id,
    usuarioId: e.usuario.id,
  });
  await registrarAuditoria(tx, { usuario: e.usuario, entidade: "Projeto", entidadeId: projeto.id, acao: "DEFINIR_PRAZO", antes, depois: novo, ip: e.ip });
}

// ---------------------------------------------------------------------------------------------------------
// Pausas (R8)
// ---------------------------------------------------------------------------------------------------------

export async function abrirPausa(tx: Tx, e: { projetoId: string; inicio?: string; motivoBloqueioId: string; observacao?: string | null; usuario: Usuario; ip?: string | null; agora?: Date }): Promise<{ id: string; justificada: boolean }> {
  const agora = e.agora ?? new Date();
  const hoje = dataLocalDoInstante(agora);
  const projeto = await travarObra(tx, e.projetoId);
  if (projeto.status === "CONCLUIDO") throw new ErroNegocio("A obra já foi concluída.");
  const inicio = validarDia(e.inicio ?? hoje, "a data de início da pausa");
  if (inicio > hoje) throw new ErroNegocio("A pausa não pode começar no futuro.", { inicio: "Use hoje ou uma data passada." });
  if ((await tx.pausaProjeto.count({ where: { projetoId: projeto.id, fim: null, deletadoEm: null } })) > 0) throw new ErroNegocio("Já existe uma pausa em curso. Encerre-a antes de abrir outra.");
  const motivo = await tx.motivoBloqueio.findFirst({ where: { id: e.motivoBloqueioId, ativo: true, deletadoEm: null }, select: { nome: true, justificado: true } });
  if (!motivo) throw new ErroNegocio("O motivo escolhido não está disponível.", { motivoBloqueioId: "Escolha um motivo da lista." });
  const observacao = e.observacao?.trim() || null;
  if (observacao && observacao.length > 500) throw new ErroNegocio("Use no máximo 500 caracteres.", { observacao: "Máximo de 500 caracteres." });

  const pausa = await tx.pausaProjeto.create({
    data: { projetoId: projeto.id, inicio: paraData(inicio), motivoBloqueioId: e.motivoBloqueioId, justificada: motivo.justificado, observacao, criadoPorId: e.usuario.id, atualizadoPorId: e.usuario.id },
    select: { id: true },
  });
  await atualizarPrazoFinal(tx, projeto.id, hoje, e.usuario.id);
  await registrarInteracao(tx, {
    tipo: "SISTEMA",
    texto: `Obra pausada desde ${br(inicio)}: ${motivo.nome}. ${motivo.justificado ? "Pausa justificada: estende o prazo prometido." : "Pausa não justificada: o prazo prometido não muda."}`,
    clienteId: projeto.clienteId,
    projetoId: projeto.id,
    usuarioId: e.usuario.id,
  });
  await registrarAuditoria(tx, { usuario: e.usuario, entidade: "PausaProjeto", entidadeId: pausa.id, acao: "CRIAR", depois: { projetoId: projeto.id, inicio, motivoBloqueioId: e.motivoBloqueioId, justificada: motivo.justificado, observacao }, ip: e.ip });
  return { id: pausa.id, justificada: motivo.justificado };
}

async function carregarPausa(tx: Tx, pausaId: string) {
  const pausa = await tx.pausaProjeto.findFirst({ where: { id: pausaId, deletadoEm: null, projeto: { deletadoEm: null } } });
  if (!pausa) throw new ErroNegocio("Pausa não encontrada.");
  return pausa;
}

export async function encerrarPausa(tx: Tx, e: { pausaId: string; fim?: string; usuario: Usuario; ip?: string | null; agora?: Date }): Promise<void> {
  const agora = e.agora ?? new Date();
  const hoje = dataLocalDoInstante(agora);
  const ref = await carregarPausa(tx, e.pausaId);
  const projeto = await travarObra(tx, ref.projetoId);
  const pausa = await carregarPausa(tx, e.pausaId);
  if (pausa.fim) throw new ErroNegocio("Esta pausa já foi encerrada.");
  const fim = validarDia(e.fim ?? hoje, "a data de término da pausa");
  if (fim > hoje) throw new ErroNegocio("O término não pode ser no futuro.", { fim: "Use hoje ou uma data passada." });
  if (fim < dia(pausa.inicio)!) throw new ErroNegocio(`O término não pode ser antes do início (${br(dia(pausa.inicio)!)}).`, { fim: "Use uma data a partir do início." });

  await tx.pausaProjeto.update({ where: { id: pausa.id }, data: { fim: paraData(fim), atualizadoPorId: e.usuario.id } });
  await atualizarPrazoFinal(tx, projeto.id, hoje, e.usuario.id);
  await registrarInteracao(tx, { tipo: "SISTEMA", texto: `Pausa encerrada em ${br(fim)} (começou em ${br(dia(pausa.inicio)!)}).`, clienteId: projeto.clienteId, projetoId: projeto.id, usuarioId: e.usuario.id });
  await registrarAuditoria(tx, { usuario: e.usuario, entidade: "PausaProjeto", entidadeId: pausa.id, acao: "ENCERRAR", antes: { fim: null }, depois: { fim }, ip: e.ip });
}

/** O gestor pode corrigir se a pausa é justificada (a regra vem do motivo, mas há casos de exceção) e a observação. */
export async function ajustarPausa(tx: Tx, e: { pausaId: string; justificada: boolean; observacao?: string | null; usuario: Usuario; ip?: string | null; agora?: Date }): Promise<void> {
  const hoje = dataLocalDoInstante(e.agora ?? new Date());
  const ref = await carregarPausa(tx, e.pausaId);
  await travarObra(tx, ref.projetoId);
  const pausa = await carregarPausa(tx, e.pausaId);
  const observacao = e.observacao === undefined ? pausa.observacao : e.observacao?.trim() || null;
  if (observacao && observacao.length > 500) throw new ErroNegocio("Use no máximo 500 caracteres.", { observacao: "Máximo de 500 caracteres." });
  await tx.pausaProjeto.update({ where: { id: pausa.id }, data: { justificada: e.justificada, observacao, atualizadoPorId: e.usuario.id } });
  await atualizarPrazoFinal(tx, pausa.projetoId, hoje, e.usuario.id);
  await registrarAuditoria(tx, { usuario: e.usuario, entidade: "PausaProjeto", entidadeId: pausa.id, acao: "ATUALIZAR", antes: { justificada: pausa.justificada, observacao: pausa.observacao }, depois: { justificada: e.justificada, observacao }, ip: e.ip });
}

export async function excluirPausa(tx: Tx, e: { pausaId: string; usuario: Usuario; ip?: string | null; agora?: Date }): Promise<void> {
  const hoje = dataLocalDoInstante(e.agora ?? new Date());
  const ref = await carregarPausa(tx, e.pausaId);
  const projeto = await travarObra(tx, ref.projetoId);
  const pausa = await carregarPausa(tx, e.pausaId);
  await tx.pausaProjeto.update({ where: { id: pausa.id }, data: { deletadoEm: new Date(), atualizadoPorId: e.usuario.id } });
  await atualizarPrazoFinal(tx, projeto.id, hoje, e.usuario.id);
  await registrarInteracao(tx, { tipo: "SISTEMA", texto: `Pausa de ${br(dia(pausa.inicio)!)} removida do registro.`, clienteId: projeto.clienteId, projetoId: projeto.id, usuarioId: e.usuario.id });
  await registrarAuditoria(tx, { usuario: e.usuario, entidade: "PausaProjeto", entidadeId: pausa.id, acao: "EXCLUIR", antes: { inicio: dia(pausa.inicio), fim: dia(pausa.fim), justificada: pausa.justificada }, ip: e.ip });
}

// ---------------------------------------------------------------------------------------------------------
// Condomínio e obras aprovadas antes da Fase 4
// ---------------------------------------------------------------------------------------------------------

/** Marca a aprovação da fachada pelo condomínio e conclui a tarefa "Confirmar aprovação do condomínio". */
export async function marcarFachadaAprovada(tx: Tx, e: { projetoId: string; usuario: Usuario; ip?: string | null; agora?: Date }): Promise<void> {
  const agora = e.agora ?? new Date();
  const projeto = await travarObra(tx, e.projetoId);
  const endereco = await tx.projeto.findUniqueOrThrow({ where: { id: projeto.id }, select: { enderecoObra: { select: { id: true, condominio: true, condominioNome: true, exigeAprovacaoFachada: true, fachadaAprovada: true } } } });
  const end = endereco.enderecoObra;
  if (!end?.condominio) throw new ErroNegocio("O endereço desta obra não é de condomínio.");
  if (end.fachadaAprovada) throw new ErroNegocio("A fachada já está marcada como aprovada.");

  await tx.enderecoCliente.update({ where: { id: end.id }, data: { fachadaAprovada: true, atualizadoPorId: e.usuario.id } });
  await tx.tarefa.updateMany({ where: { projetoId: projeto.id, tipo: "CONFIRMAR_CONDOMINIO", status: "ABERTA", deletadoEm: null }, data: { status: "CONCLUIDA", concluidaEm: agora, atualizadoPorId: e.usuario.id } });
  await registrarInteracao(tx, { tipo: "SISTEMA", texto: `Aprovação da fachada pelo condomínio${end.condominioNome ? ` (${end.condominioNome})` : ""} registrada.`, clienteId: projeto.clienteId, projetoId: projeto.id, usuarioId: e.usuario.id });
  await registrarAuditoria(tx, { usuario: e.usuario, entidade: "EnderecoCliente", entidadeId: end.id, acao: "ATUALIZAR", antes: { fachadaAprovada: false }, depois: { fachadaAprovada: true }, ip: e.ip });
}

/**
 * Para obras aprovadas antes de existir o modelo de etapas: gera as etapas a partir da proposta aprovada (prazo do
 * snapshot, data do aceite). Recusa se já há etapas ou se não há modelo ativo.
 */
export async function gerarEtapasDeProjetoAprovado(tx: Tx, e: { projetoId: string; usuario: Usuario; ip?: string | null }): Promise<number> {
  const projeto = await travarObra(tx, e.projetoId);
  if ((await tx.etapaProjeto.count({ where: { projetoId: projeto.id, deletadoEm: null } })) > 0) throw new ErroNegocio("Esta obra já tem etapas.");
  const proposta = await tx.proposta.findFirst({
    where: { projetoId: projeto.id, status: "APROVADA", deletadoEm: null },
    orderBy: { aceitaEm: "asc" },
    select: { id: true, opcaoAprovadaId: true, aceitaEm: true, snapshot: true },
  });
  if (!proposta?.opcaoAprovadaId) throw new ErroNegocio("Nenhuma proposta aprovada neste projeto.");
  const prazo = (proposta.snapshot as unknown as ConteudoProposta | null)?.prazo ?? { modo: "NENHUM" as const, tipoDias: "UTEIS" as const };
  const r = await gerarEtapasDaObra(tx, {
    projetoId: projeto.id,
    propostaId: proposta.id,
    opcaoId: proposta.opcaoAprovadaId,
    usuario: e.usuario,
    aceitaEm: dataLocalDoInstante(proposta.aceitaEm ?? new Date()),
    prazo,
    ip: e.ip,
  });
  if (r.semModelo) throw new ErroNegocio("Não há modelo de etapas ativo. Crie o modelo em Configurações, Modelo de etapas.");
  await registrarInteracao(tx, { tipo: "SISTEMA", texto: `${r.criadas} etapa(s) da obra geradas a partir do modelo.`, clienteId: projeto.clienteId, projetoId: projeto.id, usuarioId: e.usuario.id });
  await registrarAuditoria(tx, { usuario: e.usuario, entidade: "Projeto", entidadeId: projeto.id, acao: "GERAR_ETAPAS", depois: { etapas: r.criadas, dispensadas: r.dispensadas, parcelasLiberadas: r.parcelasLiberadas }, ip: e.ip });
  return r.criadas;
}
