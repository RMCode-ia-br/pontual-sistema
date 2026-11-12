import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { ErroNegocio } from "@/lib/acoes";
import { registrarAuditoria } from "@/lib/auditoria";
import { datasDeFeriado, type TipoDiasDoPrazo } from "@/lib/dominio/dias-uteis";
import { etapasDoModelo, type GatilhoDeEtapa, type ItemDoModelo } from "@/lib/dominio/etapas";
import { distribuirDatas, prazoDaProposta, type PrazoDaProposta } from "@/lib/dominio/prazo-obra";
import { dataLocalDoInstante } from "@/lib/formatadores";

type Tx = Prisma.TransactionClient;
type Usuario = { id: string; nome: string };

const paraData = (dia: string) => new Date(`${dia}T00:00:00.000Z`);

// ---------------------------------------------------------------------------------------------------------
// Modelo de etapas (R7)
// ---------------------------------------------------------------------------------------------------------

const SELECAO_DO_ITEM = {
  tipo: true,
  nome: true,
  ordem: true,
  grupoPrazo: true,
  peso: true,
  liberaGatilho: true,
  marcoGarantia: true,
  exigeEsquadria: true,
  ativo: true,
} as const;

/** Id do modelo de etapas padrão (o que gera as etapas das obras novas); `null` se ainda não existe. */
export async function modeloPadraoId(db: Tx | Pick<Tx, "modeloEtapas">): Promise<string | null> {
  const m = await db.modeloEtapas.findFirst({ where: { padrao: true, deletadoEm: null }, select: { id: true } });
  return m?.id ?? null;
}

/**
 * Substitui as etapas do modelo pelas informadas (renumeradas de 1 em diante). As linhas antigas saem por exclusão
 * lógica: nada referencia os itens do modelo (a obra guarda uma CÓPIA), então obras existentes não mudam.
 * A validação (`validarModeloDeEtapas`) é de quem chama.
 */
export async function substituirItensDoModelo(
  tx: Tx,
  e: { modeloId: string; itens: ItemDoModelo[]; usuario: Usuario; ip?: string | null; agora?: Date },
): Promise<void> {
  const agora = e.agora ?? new Date();
  const modelo = await tx.modeloEtapas.findFirst({ where: { id: e.modeloId, deletadoEm: null }, select: { id: true } });
  if (!modelo) throw new ErroNegocio("Modelo de etapas não encontrado.");

  const antes = await tx.modeloEtapaItem.findMany({ where: { modeloId: e.modeloId, deletadoEm: null }, orderBy: { ordem: "asc" }, select: SELECAO_DO_ITEM });
  await tx.modeloEtapaItem.updateMany({ where: { modeloId: e.modeloId, deletadoEm: null }, data: { deletadoEm: agora, atualizadoPorId: e.usuario.id } });

  const depois = e.itens.map((i, indice) => ({ ...i, ordem: indice + 1 }));
  await tx.modeloEtapaItem.createMany({
    data: depois.map((i) => ({ ...i, modeloId: e.modeloId, criadoPorId: e.usuario.id, atualizadoPorId: e.usuario.id })),
  });

  await registrarAuditoria(tx, {
    usuario: e.usuario,
    entidade: "ModeloEtapas",
    entidadeId: e.modeloId,
    acao: "ATUALIZAR",
    antes: { itens: antes },
    depois: { itens: depois },
    ip: e.ip,
  });
}

// ---------------------------------------------------------------------------------------------------------
// Parcelas liberadas por etapa (R6)
// ---------------------------------------------------------------------------------------------------------

/**
 * Abre as parcelas a receber do projeto que aguardam este gatilho: viram ABERTA com o vencimento informado, ficam
 * ligadas à etapa e ganham a tarefa "Cobrar parcela" (idempotente pela chave única). Devolve quantas abriu.
 * Chamada ao dispensar/concluir a etapa que libera o gatilho (e na geração, se essa etapa já nasce dispensada).
 */
export async function abrirParcelasDoGatilho(
  tx: Tx,
  e: { projetoId: string; gatilho: GatilhoDeEtapa; etapaId: string; vencimento: string; motivo: string; usuario: Usuario; ip?: string | null },
): Promise<number> {
  const contas = await tx.contaReceber.findMany({
    where: { projetoId: e.projetoId, gatilho: e.gatilho, status: "AGUARDANDO_GATILHO", deletadoEm: null },
    select: { id: true, descricao: true },
    orderBy: { ordem: "asc" },
  });
  if (contas.length === 0) return 0;

  const projeto = await tx.projeto.findUniqueOrThrow({ where: { id: e.projetoId }, select: { responsavelId: true, clienteId: true } });
  const vencimento = paraData(e.vencimento);
  await tx.contaReceber.updateMany({
    where: { id: { in: contas.map((c) => c.id) }, status: "AGUARDANDO_GATILHO" },
    data: { status: "ABERTA", vencimento, etapaProjetoId: e.etapaId, atualizadoPorId: e.usuario.id },
  });
  await tx.tarefa.createMany({
    data: contas.map((c) => ({
      titulo: `Cobrar parcela — ${c.descricao}`,
      descricao: e.motivo,
      tipo: "COBRAR_PARCELA",
      responsavelId: projeto.responsavelId,
      vencimento,
      clienteId: projeto.clienteId,
      projetoId: e.projetoId,
      chaveUnica: `cobranca:${c.id}`,
      criadoPorId: e.usuario.id,
      atualizadoPorId: e.usuario.id,
    })),
    skipDuplicates: true,
  });
  for (const c of contas) {
    await registrarAuditoria(tx, {
      usuario: e.usuario,
      entidade: "ContaReceber",
      entidadeId: c.id,
      acao: "LIBERAR_POR_ETAPA",
      antes: { status: "AGUARDANDO_GATILHO", vencimento: null, etapaProjetoId: null },
      depois: { status: "ABERTA", vencimento: e.vencimento, etapaProjetoId: e.etapaId },
      ip: e.ip,
    });
  }
  return contas.length;
}

// ---------------------------------------------------------------------------------------------------------
// Geração das etapas na aprovação (R5, passo 4)
// ---------------------------------------------------------------------------------------------------------

export type EntradaGeracaoDeEtapas = {
  projetoId: string;
  propostaId: string;
  /** Opção aprovada: só os itens dela dizem se a obra tem esquadria. */
  opcaoId: string;
  usuario: Usuario;
  /** Data do aceite (aaaa-mm-dd): base das datas provisórias quando a medição ainda não foi agendada. */
  aceitaEm: string;
  /** Prazo e tipo de dias da proposta aprovada (do snapshot congelado). */
  prazo: PrazoDaProposta & { tipoDias: TipoDiasDoPrazo };
  ip?: string | null;
};

export type ResultadoDaGeracao = {
  criadas: number;
  dispensadas: number;
  /** A obra já tinha etapas (ex.: segunda "parte" aprovada): nada foi recriado. */
  jaExistiam: boolean;
  /** Não há modelo de etapas ativo: o gestor gera as etapas depois, na obra. */
  semModelo: boolean;
  parcelasLiberadas: number;
};

/**
 * Passo 4 da aprovação (R5): gera as etapas da obra a partir do modelo padrão, dentro da transação da aprovação.
 * - Idempotente por projeto: quem já tem etapas não recebe outras (a segunda "parte" só atualiza o prazo, se faltava).
 * - Copia o prazo da proposta para o projeto (só se o projeto ainda não tinha prazo). Sem prazo: etapas sem datas.
 * - Etapas que exigem esquadria nascem DISPENSADAS se nenhum item aprovado exige (item sem tipologia conta como "exige").
 * - Datas PROVISÓRIAS: partem da medição exata agendada, ou do aceite; o relógio só começa quando a medição é concluída.
 * - Etapa-gatilho que nasce dispensada abre a parcela na data do aceite (não há entrega a esperar).
 * Quem chama já travou o projeto (`FOR UPDATE`), então duas aprovações não geram etapas em duplicidade.
 */
export async function gerarEtapasDaObra(tx: Tx, e: EntradaGeracaoDeEtapas): Promise<ResultadoDaGeracao> {
  const vazio: ResultadoDaGeracao = { criadas: 0, dispensadas: 0, jaExistiam: false, semModelo: false, parcelasLiberadas: 0 };
  const prazo = prazoDaProposta(e.prazo);

  const projeto = await tx.projeto.findUniqueOrThrow({ where: { id: e.projetoId }, select: { prazoModo: true } });
  if (prazo && projeto.prazoModo === "NENHUM") {
    await tx.projeto.update({
      where: { id: e.projetoId },
      data: {
        prazoModo: prazo.modo,
        prazoDias: prazo.diasTotais,
        prazoMaterialDias: prazo.porGrupo?.MATERIAL ?? null,
        prazoExecucaoDias: prazo.porGrupo?.EXECUCAO ?? null,
        prazoVidrosDias: prazo.porGrupo?.VIDROS_FINALIZACAO ?? null,
        tipoDiasPrazo: e.prazo.tipoDias,
        atualizadoPorId: e.usuario.id,
      },
    });
  }

  if ((await tx.etapaProjeto.count({ where: { projetoId: e.projetoId, deletadoEm: null } })) > 0) return { ...vazio, jaExistiam: true };

  const modelo = await tx.modeloEtapas.findFirst({
    where: { padrao: true, ativo: true, deletadoEm: null },
    select: { itens: { where: { deletadoEm: null, ativo: true }, orderBy: { ordem: "asc" }, select: SELECAO_DO_ITEM } },
  });
  if (!modelo || modelo.itens.length === 0) return { ...vazio, semModelo: true };

  // Esquadria: algum item aprovado exige (ou não diz a tipologia, e então não dá para dispensar por conta própria).
  const itens = await tx.itemProposta.findMany({
    where: { propostaId: e.propostaId, opcaoId: e.opcaoId, deletadoEm: null },
    select: { tipologiaId: true, tipologia: { select: { exigeEsquadria: true } } },
  });
  const temEsquadria = itens.length === 0 || itens.some((i) => !i.tipologiaId || i.tipologia?.exigeEsquadria !== false);

  const etapas = etapasDoModelo(modelo.itens as ItemDoModelo[], temEsquadria);

  // Datas provisórias: medição exata agendada (a mais próxima a partir do aceite) ou o próprio aceite.
  const medicao = await tx.eventoAgenda.findFirst({
    where: { projetoId: e.projetoId, tipo: "MEDICAO_EXATA", status: { in: ["AGENDADO", "CONFIRMADO"] }, deletadoEm: null, inicio: { gte: paraData(e.aceitaEm) } },
    orderBy: { inicio: "asc" },
    select: { inicio: true },
  });
  const agendada = medicao ? dataLocalDoInstante(medicao.inicio) : null;
  const base = agendada && agendada >= e.aceitaEm ? agendada : e.aceitaEm;

  const feriados = datasDeFeriado(
    (await tx.feriado.findMany({ where: { ativo: true, deletadoEm: null }, select: { data: true, dataFim: true, tipo: true } })).map((f) => ({
      data: f.data.toISOString().slice(0, 10),
      dataFim: f.dataFim ? f.dataFim.toISOString().slice(0, 10) : null,
      tipo: f.tipo,
    })),
  );
  const datas = distribuirDatas(
    etapas.map((et) => ({ id: String(et.ordem), tipo: et.tipo, ordem: et.ordem, grupoPrazo: et.grupoPrazo, peso: et.peso, dispensada: et.status === "DISPENSADA" })),
    base,
    prazo,
    e.prazo.tipoDias,
    feriados,
  );

  const criadas = await tx.etapaProjeto.createManyAndReturn({
    data: etapas.map((et) => {
      const d = datas.find((x) => x.id === String(et.ordem))!;
      return {
        projetoId: e.projetoId,
        tipo: et.tipo,
        nome: et.nome,
        ordem: et.ordem,
        grupoPrazo: et.grupoPrazo,
        peso: et.peso,
        liberaGatilho: et.liberaGatilho,
        marcoGarantia: et.marcoGarantia,
        status: et.status,
        inicioPrevisto: d.inicio ? paraData(d.inicio) : null,
        fimPrevisto: d.fim ? paraData(d.fim) : null,
        provisoria: d.inicio !== null,
        criadoPorId: e.usuario.id,
        atualizadoPorId: e.usuario.id,
      };
    }),
    skipDuplicates: true,
    select: { id: true, status: true, liberaGatilho: true },
  });

  let parcelasLiberadas = 0;
  for (const et of criadas) {
    if (et.status === "DISPENSADA" && et.liberaGatilho) {
      parcelasLiberadas += await abrirParcelasDoGatilho(tx, {
        projetoId: e.projetoId,
        gatilho: et.liberaGatilho as GatilhoDeEtapa, // só os dois gatilhos de etapa passam pelo CHECK do banco
        etapaId: et.id,
        vencimento: e.aceitaEm,
        motivo: "A etapa não se aplica a esta obra (dispensada), então a parcela foi liberada na data do aceite.",
        usuario: e.usuario,
        ip: e.ip,
      });
    }
  }

  return { criadas: criadas.length, dispensadas: criadas.filter((c) => c.status === "DISPENSADA").length, jaExistiam: false, semModelo: false, parcelasLiberadas };
}
