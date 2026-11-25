import "server-only";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { ErroNegocio } from "@/lib/acoes";
import {
  avisoDeMesDoAceite,
  bloqueiosDoDesfazer,
  planoDeDesfazer,
  reabrirPadrao,
  rotuloDaRevisao,
  textoDoPrazo,
  type Bloqueio,
} from "@/lib/dominio/desfazer-aprovacao";
import { gerarParcelas, type ParcelaPlanejada } from "@/lib/dominio/parcelas";
import { prazoDaProposta } from "@/lib/dominio/prazo-obra";
import { dataLocalDoInstante } from "@/lib/formatadores";

import type { ConteudoProposta } from "./conteudo";
import { construirConteudo, problemasDaProposta } from "./servico-ciclo";
import { lerFatosDoDesfazer, lerRevisoes } from "./servico-desfazer";

type Db = Prisma.TransactionClient | PrismaClient;

const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export type RevisaoParaReabrir = { id: string; revisao: number; rotulo: string; temSnapshot: boolean; voltaComo: "ENVIADA" | "RASCUNHO" };

export type PreviaDoDesfazer = {
  propostaId: string;
  numero: string;
  rotulo: string;
  aprovada: boolean;
  bloqueios: Bloqueio[];
  aceite: { aceitaEm: string | null; forma: string | null; observacao: string | null; valorCentavos: number | null };
  /** Aceite de mês anterior: desfazer muda o "Vendido" daquele mês. */
  avisoDeMes: string | null;
  efeitos: { parcelas: number; etapasRemovidas: number; etapasMantidasPorOutraParte: boolean; tarefas: number; valorFechadoDepoisCentavos: number | null; faseDepois: string };
  revisoes: RevisaoParaReabrir[];
  padraoReabrirId: string | null;
};

/** O que desfazer a aprovação vai causar, sem mudar nada. É só informação: o servidor recalcula tudo ao desfazer. */
export async function previaDoDesfazer(db: Db, propostaId: string, agora: Date = new Date()): Promise<PreviaDoDesfazer> {
  const p = await db.proposta.findFirst({
    where: { id: propostaId, deletadoEm: null, projeto: { deletadoEm: null } },
    select: { id: true, numero: true, revisao: true, status: true, projetoId: true, aceitaEm: true, formaAceite: true, aceiteObservacao: true, valorAprovadoCentavos: true, projeto: { select: { status: true } } },
  });
  if (!p) throw new ErroNegocio("Proposta não encontrada.");

  const fatos = await lerFatosDoDesfazer(db, { id: p.id, status: p.status, projetoId: p.projetoId }, p.projeto.status);
  const revs = await lerRevisoes(db, p.numero);
  const restantes = await db.proposta.findMany({ where: { projetoId: p.projetoId, id: { not: p.id }, status: "APROVADA", deletadoEm: null }, select: { valorAprovadoCentavos: true } });
  const tarefas = await db.tarefa.count({ where: { chaveUnica: { in: [`medicao-exata:${p.id}`, `condominio:${p.id}`] }, status: "ABERTA", deletadoEm: null } });

  const candidatas: RevisaoParaReabrir[] = [];
  for (const r of revs.filter((x) => x.id !== p.id && x.status === "SUBSTITUIDA")) {
    const plano = planoDeDesfazer(revs, p.id, r.id);
    if ("erro" in plano) continue;
    const m = plano.mudancas.find((x) => x.id === r.id);
    candidatas.push({ id: r.id, revisao: r.revisao, rotulo: rotuloDaRevisao(r.revisao), temSnapshot: r.temSnapshot, voltaComo: m?.para === "RASCUNHO" ? "RASCUNHO" : "ENVIADA" });
  }

  const outraAprovada = restantes.length > 0;
  return {
    propostaId: p.id,
    numero: p.numero,
    rotulo: `${p.numero}${p.revisao > 0 ? ` (Rev. ${p.revisao})` : ""}`,
    aprovada: p.status === "APROVADA",
    bloqueios: bloqueiosDoDesfazer(fatos),
    aceite: { aceitaEm: dia(p.aceitaEm), forma: p.formaAceite, observacao: p.aceiteObservacao, valorCentavos: p.valorAprovadoCentavos },
    avisoDeMes: p.aceitaEm && p.valorAprovadoCentavos ? avisoDeMesDoAceite({ aceitaEm: dia(p.aceitaEm)!, hoje: dataLocalDoInstante(agora), valorCentavos: p.valorAprovadoCentavos }) : null,
    efeitos: {
      parcelas: fatos.parcelas.length,
      etapasRemovidas: outraAprovada ? 0 : fatos.etapas.length,
      etapasMantidasPorOutraParte: outraAprovada && fatos.etapas.length > 0,
      tarefas,
      valorFechadoDepoisCentavos: outraAprovada ? restantes.reduce((s, r) => s + (r.valorAprovadoCentavos ?? 0), 0) : null,
      faseDepois: outraAprovada ? p.projeto.status : "PROPOSTA_ENVIADA",
    },
    revisoes: candidatas,
    padraoReabrirId: reabrirPadrao(revs, p.id),
  };
}

type LinhaDeParcela = { ordem: number; descricao: string; valorCentavos: number; vencimento: string | null };

export type PreviaDaTroca = {
  deId: string;
  paraId: string;
  numero: string;
  deRotulo: string;
  paraRotulo: string;
  /** A troca não faz sentido (outra proposta, revisão que não está de lado...). Vazio = pode seguir. */
  erro: string | null;
  bloqueios: Bloqueio[];
  /** A revisão ainda é rascunho e não está pronta para ser aprovada: o que falta. */
  problemasDaRevisao: string[];
  opcoes: { id: string; nome: string; totalCentavos: number }[];
  opcaoPadraoId: string | null;
  /** Formas de pagamento da revisão escolhida (vazio = só a forma de sempre). */
  formas: { nome: string; principal: boolean; totais: { opcaoId: string; totalCentavos: number }[] }[];
  /** Forma que a prévia usou: a pedida, ou a de mesmo NOME da aprovação atual. null = escolha pendente. */
  formaEscolhida: string | null;
  /** Pré-preenchido com a aprovação atual; o usuário pode mudar. */
  aceite: { aceitaEm: string; forma: string; observacao: string | null };
  valorFechado: { antesCentavos: number | null; depoisCentavos: number | null };
  parcelas: { antes: LinhaDeParcela[]; depois: LinhaDeParcela[] };
  etapas: { removidas: number; mantidasPorOutraParte: boolean; prazoAntes: string; prazoDepois: string };
  tarefas: { canceladas: number };
  avisoDeMes: string | null;
};

/** O que trocar a aprovação vai mudar (parcelas, etapas, tarefas, valor fechado), sem mudar nada. */
export async function previaDaTroca(db: Db, e: { deId: string; paraId: string; opcaoId?: string | null; formaPagamento?: string | null }, agora: Date = new Date()): Promise<PreviaDaTroca> {
  const buscar = (id: string) =>
    db.proposta.findFirst({
      where: { id, deletadoEm: null, projeto: { deletadoEm: null } },
      select: { id: true, numero: true, revisao: true, status: true, projetoId: true, snapshot: true, aceitaEm: true, formaAceite: true, aceiteObservacao: true, opcaoAprovadaId: true, alternativaAprovadaId: true, valorAprovadoCentavos: true, parcelas: { where: { deletadoEm: null, alternativaId: null }, orderBy: { ordem: "asc" } } },
    });
  const de = await buscar(e.deId);
  const para = await buscar(e.paraId);
  if (!de || !para) throw new ErroNegocio("Proposta não encontrada.");

  const antes = await previaDoDesfazer(db, de.id, agora);
  let erro: string | null = null;
  if (de.id === para.id) erro = "Escolha outra revisão para aprovar no lugar desta.";
  else if (de.numero !== para.numero || de.projetoId !== para.projetoId) erro = "As duas propostas precisam ser revisões do mesmo número.";
  else if (de.status !== "APROVADA") erro = `A ${rotuloDaRevisao(de.revisao)} não está aprovada. Atualize a página.`;
  else if (para.status !== "SUBSTITUIDA") erro = `A ${rotuloDaRevisao(para.revisao)} não ficou de lado; só dá para trocar por uma revisão substituída.`;

  // Conteúdo da revisão: congelado se já foi enviada; senão o que está no rascunho agora (será congelado ao aprovar).
  const conteudo = para.snapshot ? (para.snapshot as unknown as ConteudoProposta) : await construirConteudo(db, para.id);
  const opcoes = conteudo.opcoes.map((o) => ({ id: o.id, nome: o.nome, totalCentavos: o.totais.totalCentavos }));
  // A opção aprovada hoje tem cópia na revisão com o mesmo nome (a cópia gera ids novos).
  const nomeAprovado = de.snapshot ? (de.snapshot as unknown as ConteudoProposta).opcoes.find((o) => o.id === de.opcaoAprovadaId)?.nome : undefined;
  const opcaoPadraoId = (e.opcaoId && opcoes.some((o) => o.id === e.opcaoId) ? e.opcaoId : opcoes.find((o) => o.nome === nomeAprovado)?.id ?? opcoes[0]?.id) ?? null;
  const escolhida = opcoes.find((o) => o.id === opcaoPadraoId) ?? null;

  // Forma de pagamento: casa pelo NOME com a que está aprovada hoje; se não casar, a pessoa escolhe (null = pendente).
  const formasDoConteudo = conteudo.formasPagamento ?? [];
  let nomeFormaAprovada: string | null = null;
  if (de.alternativaAprovadaId) nomeFormaAprovada = (await db.alternativaPagamento.findUnique({ where: { id: de.alternativaAprovadaId }, select: { nome: true } }))?.nome ?? null;
  else nomeFormaAprovada = (de.snapshot as unknown as ConteudoProposta | null)?.formasPagamento?.find((x) => x.principal)?.nome ?? null;
  const formaPadrao = formasDoConteudo.find((f) => f.nome === nomeFormaAprovada)?.nome ?? null;
  const formaEscolhida = formasDoConteudo.length < 2 ? null : e.formaPagamento === undefined || e.formaPagamento === null ? formaPadrao : (formasDoConteudo.find((f) => f.nome === e.formaPagamento)?.nome ?? null);
  const formaObj = formasDoConteudo.find((f) => f.nome === formaEscolhida) ?? null;
  const pendenteDeForma = formasDoConteudo.length > 1 && !formaObj;
  const totalEscolhido = escolhida ? (formaObj?.porOpcao.find((x) => x.opcaoId === escolhida.id)?.totalCentavos ?? (pendenteDeForma ? null : escolhida.totalCentavos)) : null;

  const aceitaEm = dia(de.aceitaEm) ?? dataLocalDoInstante(agora);
  const cronograma = formaObj ? formaObj.parcelas : (conteudo.pagamento?.parcelas ?? para.parcelas.map((x) => ({ descricao: x.descricao, percentualPb: x.percentualPb, gatilho: x.gatilho, forma: x.forma, diasApos: x.diasApos, dataFixa: dia(x.dataFixa), parcelasCartao: x.parcelasCartao })));
  const depoisParcelas: LinhaDeParcela[] =
    totalEscolhido !== null && cronograma.length > 0 && !pendenteDeForma
      ? gerarParcelas(
          totalEscolhido,
          cronograma.map((x): ParcelaPlanejada => ({ descricao: x.descricao, percentualPb: x.percentualPb, gatilho: x.gatilho as ParcelaPlanejada["gatilho"], forma: x.forma as ParcelaPlanejada["forma"], diasApos: x.diasApos, dataFixa: x.dataFixa, parcelasCartao: x.parcelasCartao })),
          aceitaEm,
        ).map((g) => ({ ordem: g.ordem, descricao: g.descricao, valorCentavos: g.valorCentavos, vencimento: g.vencimento }))
      : [];
  const antesParcelas: LinhaDeParcela[] = await db.contaReceber
    .findMany({ where: { propostaId: de.id, deletadoEm: null }, orderBy: { ordem: "asc" }, select: { ordem: true, descricao: true, valorCentavos: true, vencimento: true } })
    .then((l) => l.map((x) => ({ ordem: x.ordem, descricao: x.descricao, valorCentavos: x.valorCentavos, vencimento: dia(x.vencimento) })));

  const projeto = await db.projeto.findUniqueOrThrow({ where: { id: de.projetoId }, select: { prazoModo: true, prazoDias: true, prazoMaterialDias: true, prazoExecucaoDias: true, prazoVidrosDias: true, tipoDiasPrazo: true, valorFechadoCentavos: true } });
  const resolvido = prazoDaProposta(conteudo.prazo);
  const outraParte = antes.efeitos.etapasMantidasPorOutraParte;
  const outrasValor = antes.efeitos.valorFechadoDepoisCentavos ?? 0; // soma das outras partes aprovadas (0 se não há)

  return {
    deId: de.id,
    paraId: para.id,
    numero: de.numero,
    deRotulo: rotuloDaRevisao(de.revisao),
    paraRotulo: rotuloDaRevisao(para.revisao),
    erro,
    bloqueios: antes.bloqueios,
    problemasDaRevisao: para.status === "SUBSTITUIDA" && !para.snapshot ? await problemasDaProposta(db as Prisma.TransactionClient, para.id) : [],
    opcoes,
    opcaoPadraoId,
    formas: formasDoConteudo.map((f) => ({ nome: f.nome, principal: f.principal, totais: f.porOpcao.map((t) => ({ opcaoId: t.opcaoId, totalCentavos: t.totalCentavos })) })),
    formaEscolhida,
    aceite: { aceitaEm, forma: de.formaAceite ?? "WHATSAPP", observacao: de.aceiteObservacao },
    valorFechado: { antesCentavos: projeto.valorFechadoCentavos, depoisCentavos: totalEscolhido !== null ? outrasValor + totalEscolhido : null },
    parcelas: { antes: antesParcelas, depois: depoisParcelas },
    etapas: {
      removidas: antes.efeitos.etapasRemovidas,
      mantidasPorOutraParte: outraParte,
      prazoAntes: textoDoPrazo({ modo: projeto.prazoModo, dias: projeto.prazoDias, material: projeto.prazoMaterialDias, execucao: projeto.prazoExecucaoDias, vidros: projeto.prazoVidrosDias, tipoDias: projeto.tipoDiasPrazo }),
      prazoDepois: outraParte
        ? "o prazo da obra continua o mesmo (há outra parte aprovada)"
        : textoDoPrazo({ modo: resolvido?.modo ?? "NENHUM", dias: resolvido?.diasTotais ?? null, material: resolvido?.porGrupo?.MATERIAL ?? null, execucao: resolvido?.porGrupo?.EXECUCAO ?? null, vidros: resolvido?.porGrupo?.VIDROS_FINALIZACAO ?? null, tipoDias: conteudo.prazo.tipoDias }),
    },
    tarefas: { canceladas: antes.efeitos.tarefas },
    avisoDeMes: antes.avisoDeMes,
  };
}
