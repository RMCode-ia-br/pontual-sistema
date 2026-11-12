import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { ErroNegocio } from "@/lib/acoes";
import { registrarAuditoria } from "@/lib/auditoria";
import { formatarNumeroDoChamado, ROTULO_STATUS_CHAMADO, transicaoDeChamadoPermitida, type StatusDoChamado, type TipoDoProblema } from "@/lib/dominio/chamados";
import { classificarChamado, ROTULO_CLASSIFICACAO, type Classificacao, type ResultadoDaClassificacao } from "@/lib/dominio/garantia";
import { MAXIMO_CENTAVOS } from "@/lib/dominio/preco";
import { dataLocalDoInstante, formatarMoeda, inputParaData } from "@/lib/formatadores";
import { registrarInteracao } from "@/modules/interacoes/registrar";

type Tx = Prisma.TransactionClient;
type Usuario = { id: string; nome: string };

const STATUS_DE_OBRA = ["APROVADO", "EM_EXECUCAO", "CONCLUIDO"] as const;
const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

/** Próximo número do chamado: UPSERT atômico no contador (o lock da linha serializa aberturas simultâneas). */
export async function proximoNumeroDeChamado(tx: Tx): Promise<number> {
  const linhas = await tx.$queryRaw<{ valor: number }[]>`
    INSERT INTO "ContadorSequencia" ("chave", "valor", "atualizadoEm")
    VALUES ('chamado', 1, now())
    ON CONFLICT ("chave") DO UPDATE SET "valor" = "ContadorSequencia"."valor" + 1, "atualizadoEm" = now()
    RETURNING "valor"`;
  return Number(linhas[0].valor);
}

/**
 * Classificação do chamado (R12) pela conclusão da etapa-marco da obra (instalação) e pela garantia de regulagem
 * das Configurações. Sem obra, ou com a instalação ainda não concluída, a sugestão é "fora da garantia" com o
 * motivo explicado: quem decide é o gestor.
 */
export async function avaliarGarantia(db: Tx | Pick<Tx, "etapaProjeto" | "configuracaoEmpresa">, e: { projetoId: string | null; tipoProblema: TipoDoProblema; abertoEm: string }): Promise<ResultadoDaClassificacao> {
  const cfg = await db.configuracaoEmpresa.findUnique({ where: { id: "singleton" }, select: { garantiaRegulagemDias: true } });
  let marcoConcluidoEm: string | null = null;
  if (e.projetoId) {
    const marco = await db.etapaProjeto.findFirst({ where: { projetoId: e.projetoId, marcoGarantia: true, status: "CONCLUIDA", deletadoEm: null, fimReal: { not: null } }, orderBy: { fimReal: "desc" }, select: { fimReal: true } });
    marcoConcluidoEm = dia(marco?.fimReal ?? null);
  }
  return classificarChamado({ tipoProblema: e.tipoProblema, temObra: e.projetoId !== null, marcoConcluidoEm, abertoEm: e.abertoEm, garantiaDias: cfg?.garantiaRegulagemDias ?? 90 });
}

export type EntradaDeChamado = { clienteId: string; projetoId?: string | null; tipoProblema: TipoDoProblema; descricao: string; usuario: Usuario; ip?: string | null; agora?: Date };

/** Abre o chamado já classificado, com o motivo; a linha do tempo do cliente e da obra registra a abertura. */
export async function abrirChamado(tx: Tx, e: EntradaDeChamado): Promise<{ id: string; numero: number; classificacao: Classificacao; motivo: string }> {
  const descricao = e.descricao.trim();
  if (descricao.length < 3) throw new ErroNegocio("Descreva o problema.", { descricao: "Descreva o problema em poucas palavras." });
  if (descricao.length > 2000) throw new ErroNegocio("Use no máximo 2.000 caracteres na descrição.", { descricao: "Máximo de 2.000 caracteres." });

  const cliente = await tx.cliente.findFirst({ where: { id: e.clienteId, deletadoEm: null }, select: { id: true } });
  if (!cliente) throw new ErroNegocio("Cliente não encontrado.", { clienteId: "Escolha um cliente." });
  if (e.projetoId) {
    const obra = await tx.projeto.findFirst({ where: { id: e.projetoId, deletadoEm: null }, select: { id: true, clienteId: true, status: true } });
    if (!obra) throw new ErroNegocio("Obra não encontrada.", { projetoId: "Escolha uma obra da lista." });
    if (obra.clienteId !== e.clienteId) throw new ErroNegocio("Essa obra pertence a outro cliente.", { projetoId: "Escolha uma obra do cliente." });
    if (!(STATUS_DE_OBRA as readonly string[]).includes(obra.status)) throw new ErroNegocio("A assistência é para obras: o projeto ainda não foi aprovado.", { projetoId: "Escolha uma obra aprovada." });
  }

  const hoje = dataLocalDoInstante(e.agora ?? new Date());
  const r = await avaliarGarantia(tx, { projetoId: e.projetoId ?? null, tipoProblema: e.tipoProblema, abertoEm: hoje });
  const numero = await proximoNumeroDeChamado(tx);
  const criado = await tx.chamado.create({
    data: {
      numero,
      clienteId: e.clienteId,
      projetoId: e.projetoId ?? null,
      descricao,
      tipoProblema: e.tipoProblema,
      classificacaoSugerida: r.classificacao,
      classificacao: r.classificacao,
      motivoClassificacao: r.motivo,
      cobrarVisita: r.cobrarVisita,
      abertoEm: e.agora ?? new Date(),
      criadoPorId: e.usuario.id,
      atualizadoPorId: e.usuario.id,
    },
    select: { id: true },
  });
  await registrarInteracao(tx, {
    tipo: "SISTEMA",
    texto: `Chamado de assistência ${formatarNumeroDoChamado(numero)} aberto (${ROTULO_CLASSIFICACAO[r.classificacao].toLowerCase()}): ${descricao.length > 140 ? `${descricao.slice(0, 140)}…` : descricao}`,
    clienteId: e.clienteId,
    projetoId: e.projetoId ?? null,
    usuarioId: e.usuario.id,
  });
  await registrarAuditoria(tx, {
    usuario: e.usuario,
    entidade: "Chamado",
    entidadeId: criado.id,
    acao: "CRIAR",
    depois: { numero, clienteId: e.clienteId, projetoId: e.projetoId ?? null, tipoProblema: e.tipoProblema, classificacao: r.classificacao, cobrarVisita: r.cobrarVisita },
    ip: e.ip,
  });
  return { id: criado.id, numero, classificacao: r.classificacao, motivo: r.motivo };
}

async function travarChamado(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "Chamado" WHERE "id" = ${id} FOR UPDATE`;
  const chamado = await tx.chamado.findFirst({ where: { id, deletadoEm: null } });
  if (!chamado) throw new ErroNegocio("Chamado não encontrado.");
  return chamado;
}

export type AjusteDeChamado = {
  id: string;
  usuario: Usuario;
  ip?: string | null;
  classificacao?: Classificacao;
  cobrarVisita?: boolean;
  /** `null` limpa o valor. */
  valorCobradoCentavos?: number | null;
  descricao?: string;
};

/**
 * O gestor pode sobrescrever a classificação sugerida, decidir se cobra a visita e registrar o valor cobrado (R12).
 * O que o sistema sugeriu fica guardado; depois que a cobrança vira conta a receber, valor e cobrança travam.
 */
export async function ajustarChamado(tx: Tx, e: AjusteDeChamado): Promise<void> {
  const antes = await travarChamado(tx, e.id);
  const travado = antes.contaReceberId !== null;
  if (travado && (e.cobrarVisita !== undefined || e.valorCobradoCentavos !== undefined)) {
    throw new ErroNegocio("A cobrança já virou conta a receber: ajuste o valor lá (Financeiro).");
  }
  if (e.valorCobradoCentavos != null && (!Number.isInteger(e.valorCobradoCentavos) || e.valorCobradoCentavos < 0 || e.valorCobradoCentavos > MAXIMO_CENTAVOS)) {
    throw new ErroNegocio("Informe um valor válido.", { valorCobradoCentavos: "Informe um valor válido." });
  }
  const descricao = e.descricao === undefined ? antes.descricao : e.descricao.trim();
  if (descricao.length < 3 || descricao.length > 2000) throw new ErroNegocio("A descrição deve ter de 3 a 2.000 caracteres.", { descricao: "De 3 a 2.000 caracteres." });

  const cobrar = e.cobrarVisita ?? antes.cobrarVisita;
  // Sem cobrança não há valor cobrado: limpa, para o número não ficar solto.
  const valor = !cobrar ? null : e.valorCobradoCentavos === undefined ? antes.valorCobradoCentavos : e.valorCobradoCentavos;
  const depois = { classificacao: e.classificacao ?? antes.classificacao, cobrarVisita: cobrar, valorCobradoCentavos: valor, descricao };
  await tx.chamado.update({ where: { id: antes.id }, data: { ...depois, atualizadoPorId: e.usuario.id } });

  if (depois.classificacao !== antes.classificacao) {
    await registrarInteracao(tx, {
      tipo: "SISTEMA",
      texto: `Chamado ${formatarNumeroDoChamado(antes.numero)}: classificação ajustada de "${ROTULO_CLASSIFICACAO[antes.classificacao]}" para "${ROTULO_CLASSIFICACAO[depois.classificacao]}" (o sistema sugeriu "${ROTULO_CLASSIFICACAO[antes.classificacaoSugerida]}").`,
      clienteId: antes.clienteId,
      projetoId: antes.projetoId,
      usuarioId: e.usuario.id,
    });
  }
  await registrarAuditoria(tx, {
    usuario: e.usuario,
    entidade: "Chamado",
    entidadeId: antes.id,
    acao: "ATUALIZAR",
    antes: { classificacao: antes.classificacao, cobrarVisita: antes.cobrarVisita, valorCobradoCentavos: antes.valorCobradoCentavos, descricao: antes.descricao },
    depois,
    ip: e.ip,
  });
}

export type MudancaDeStatusDoChamado = { id: string; para: StatusDoChamado; solucao?: string; usuario: Usuario; ip?: string | null; agora?: Date };

/** Muda o andamento do chamado. Resolver exige dizer o que foi feito; reabrir limpa a data da resolução. */
export async function mudarStatusDoChamado(tx: Tx, e: MudancaDeStatusDoChamado): Promise<void> {
  const antes = await travarChamado(tx, e.id);
  if (!transicaoDeChamadoPermitida(antes.status, e.para)) {
    throw new ErroNegocio(`Não dá para passar o chamado de "${ROTULO_STATUS_CHAMADO[antes.status]}" para "${ROTULO_STATUS_CHAMADO[e.para]}".`);
  }
  let solucao = antes.solucao;
  if (e.para === "RESOLVIDO") {
    solucao = (e.solucao ?? "").trim();
    if (solucao.length < 3) throw new ErroNegocio("Diga o que foi feito para resolver.", { solucao: "Descreva a solução em poucas palavras." });
    if (solucao.length > 2000) throw new ErroNegocio("Use no máximo 2.000 caracteres na solução.", { solucao: "Máximo de 2.000 caracteres." });
  }
  const agora = e.agora ?? new Date();

  // Cancelar um chamado cuja visita já virou conta a receber: a conta não pode ficar aberta e cobrável. Sem pagamento ela
  // é cancelada junto (com auditoria); com pagamento o cancelamento é recusado e o estorno é do Financeiro.
  let contaCancelada: string | null = null;
  if (e.para === "CANCELADO" && antes.contaReceberId) {
    await tx.$queryRaw`SELECT "id" FROM "ContaReceber" WHERE "id" = ${antes.contaReceberId} FOR UPDATE`;
    const conta = await tx.contaReceber.findUnique({ where: { id: antes.contaReceberId }, select: { id: true, status: true } });
    if (conta && (conta.status === "PARCIAL" || conta.status === "PAGA")) {
      throw new ErroNegocio("A cobrança desta visita já tem pagamento: estorne no Financeiro antes de cancelar o chamado.");
    }
    if (conta && conta.status !== "CANCELADA") {
      await tx.contaReceber.update({ where: { id: conta.id }, data: { status: "CANCELADA", atualizadoPorId: e.usuario.id } });
      await registrarAuditoria(tx, { usuario: e.usuario, entidade: "ContaReceber", entidadeId: conta.id, acao: "CANCELAR", antes: { status: conta.status }, depois: { status: "CANCELADA", origem: "Chamado cancelado", chamadoId: antes.id }, ip: e.ip });
      contaCancelada = conta.id;
    }
  }

  await tx.chamado.update({
    where: { id: antes.id },
    data: { status: e.para, solucao, resolvidoEm: e.para === "RESOLVIDO" ? agora : e.para === "ABERTO" ? null : antes.resolvidoEm, atualizadoPorId: e.usuario.id },
  });
  const frase = { ABERTO: "reaberto", AGENDADO: "com visita agendada", EM_ATENDIMENTO: "em atendimento", RESOLVIDO: `resolvido: ${solucao}`, CANCELADO: "cancelado" }[e.para];
  await registrarInteracao(tx, { tipo: "SISTEMA", texto: `Chamado ${formatarNumeroDoChamado(antes.numero)} ${frase}.${contaCancelada ? " A cobrança da visita foi cancelada junto." : ""}`, clienteId: antes.clienteId, projetoId: antes.projetoId, usuarioId: e.usuario.id });
  await registrarAuditoria(tx, {
    usuario: e.usuario,
    entidade: "Chamado",
    entidadeId: antes.id,
    acao: { ABERTO: "REABRIR", AGENDADO: "AGENDAR", EM_ATENDIMENTO: "ATENDER", RESOLVIDO: "RESOLVER", CANCELADO: "CANCELAR" }[e.para],
    antes: { status: antes.status },
    depois: { status: e.para, ...(e.para === "RESOLVIDO" ? { solucao } : {}) },
    ip: e.ip,
  });
}

/**
 * Gera a conta a receber da visita cobrada (uma vez só). Exige cobrança marcada, valor e obra (a parcela pertence à
 * obra); o pagamento e a cobrança em si ficam no Financeiro (Fase 5).
 */
export async function gerarCobrancaDoChamado(tx: Tx, e: { id: string; vencimento?: string; usuario: Usuario; ip?: string | null; agora?: Date }): Promise<{ contaId: string }> {
  const chamado = await travarChamado(tx, e.id);
  if (chamado.contaReceberId) throw new ErroNegocio("A cobrança deste chamado já foi gerada.");
  if (!chamado.cobrarVisita) throw new ErroNegocio("Marque que a visita será cobrada antes de gerar a cobrança.");
  if (!chamado.valorCobradoCentavos || chamado.valorCobradoCentavos <= 0) throw new ErroNegocio("Informe o valor cobrado da visita.", { valorCobradoCentavos: "Informe o valor." });
  if (!chamado.projetoId) throw new ErroNegocio("A cobrança fica na conta a receber de uma obra: vincule o chamado a uma obra.");
  if (chamado.status === "CANCELADO") throw new ErroNegocio("O chamado está cancelado.");

  const hoje = dataLocalDoInstante(e.agora ?? new Date());
  const vencimento = e.vencimento ?? hoje;
  if (!inputParaData(vencimento)) throw new ErroNegocio("Informe um vencimento válido.", { vencimento: "Informe uma data válida." });

  const ultima = await tx.contaReceber.aggregate({ where: { projetoId: chamado.projetoId }, _max: { ordem: true } });
  const conta = await tx.contaReceber.create({
    data: {
      projetoId: chamado.projetoId,
      clienteId: chamado.clienteId,
      ordem: (ultima._max.ordem ?? 0) + 1,
      descricao: `Visita de assistência ${formatarNumeroDoChamado(chamado.numero)}`,
      valorCentavos: chamado.valorCobradoCentavos,
      vencimento: inputParaData(vencimento),
      status: "ABERTA",
      criadoPorId: e.usuario.id,
      atualizadoPorId: e.usuario.id,
    },
    select: { id: true },
  });
  await tx.chamado.update({ where: { id: chamado.id }, data: { contaReceberId: conta.id, atualizadoPorId: e.usuario.id } });
  await registrarInteracao(tx, {
    tipo: "SISTEMA",
    texto: `Chamado ${formatarNumeroDoChamado(chamado.numero)}: cobrança da visita gerada (${formatarMoeda(chamado.valorCobradoCentavos)}, vence em ${br(vencimento)}).`,
    clienteId: chamado.clienteId,
    projetoId: chamado.projetoId,
    usuarioId: e.usuario.id,
  });
  await registrarAuditoria(tx, { usuario: e.usuario, entidade: "ContaReceber", entidadeId: conta.id, acao: "CRIAR", depois: { origem: "Chamado", chamadoId: chamado.id, valorCentavos: chamado.valorCobradoCentavos, vencimento }, ip: e.ip });
  await registrarAuditoria(tx, { usuario: e.usuario, entidade: "Chamado", entidadeId: chamado.id, acao: "GERAR_COBRANCA", antes: { contaReceberId: null }, depois: { contaReceberId: conta.id }, ip: e.ip });
  return { contaId: conta.id };
}
