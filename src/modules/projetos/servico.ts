import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { ErroNegocio } from "@/lib/acoes";
import { registrarAuditoria } from "@/lib/auditoria";
import { anoEmSaoPaulo, chaveContadorProjeto, formatarCodigoProjeto } from "@/lib/dominio/codigo-projeto";
import { chaveFollowUp, vencimentoAcompanharProposta } from "@/lib/dominio/followup";
import { ROTULO_STATUS_PROJETO, type StatusProjeto } from "@/lib/dominio/funil";
import { registrarInteracao } from "@/modules/interacoes/registrar";

type Tx = Prisma.TransactionClient;
type Usuario = { id: string; nome: string };

/**
 * Próximo código `P-AAAA-NNNN`. O contador anual é incrementado com UPSERT atômico dentro da transação de
 * quem cria o projeto: o lock da linha serializa criações simultâneas (nunca sai o mesmo número duas vezes).
 */
export async function proximoCodigoDoProjeto(tx: Tx, agora: Date = new Date()): Promise<string> {
  const ano = anoEmSaoPaulo(agora);
  const linhas = await tx.$queryRaw<{ valor: number }[]>`
    INSERT INTO "ContadorSequencia" ("chave", "valor", "atualizadoEm")
    VALUES (${chaveContadorProjeto(ano)}, 1, now())
    ON CONFLICT ("chave") DO UPDATE SET "valor" = "ContadorSequencia"."valor" + 1, "atualizadoEm" = now()
    RETURNING "valor"`;
  return formatarCodigoProjeto(ano, Number(linhas[0].valor));
}

export type ProjetoParaMover = { id: string; codigo: string; titulo: string; clienteId: string; status: StatusProjeto };

export type DadosDePerda = { motivoPerdaId: string; detalhe?: string; concorrente?: string };

/**
 * Muda a fase do projeto (a validação das regras do funil é de quem chama, em `avaliarMovimento`).
 * Tudo na mesma transação: projeto, histórico de fases, linha do tempo e auditoria.
 */
export async function mudarFaseDoProjeto(
  tx: Tx,
  entrada: { usuario: Usuario; projeto: ProjetoParaMover; para: StatusProjeto; perda?: DadosDePerda; ip?: string | null; agora?: Date },
): Promise<{ historicoId: string }> {
  const { usuario, projeto, para, perda, ip } = entrada;
  const agora = entrada.agora ?? new Date();

  let nomeDoMotivo: string | null = null;
  if (para === "PERDIDO") {
    if (!perda?.motivoPerdaId) throw new ErroNegocio("Informe o motivo da perda.", { motivoPerdaId: "Escolha o motivo." });
    const motivo = await tx.motivoPerda.findFirst({ where: { id: perda.motivoPerdaId, ativo: true, deletadoEm: null }, select: { nome: true } });
    if (!motivo) throw new ErroNegocio("O motivo escolhido não está disponível.", { motivoPerdaId: "Escolha um motivo da lista." });
    nomeDoMotivo = motivo.nome;
  }

  const perdendo = para === "PERDIDO";
  // Só muda se o projeto ainda está na fase que a tela/ação leu: dois cliques ou duas abas não duplicam histórico nem tarefa.
  const mudou = await tx.projeto.updateMany({
    where: { id: projeto.id, status: projeto.status, deletadoEm: null },
    data: {
      status: para,
      ultimaMovimentacaoEm: agora,
      perdidoEm: perdendo ? agora : null,
      motivoPerdaId: perdendo ? perda!.motivoPerdaId : null,
      motivoPerdaDetalhe: perdendo ? (perda!.detalhe ?? null) : null,
      concorrente: perdendo ? (perda!.concorrente ?? null) : null,
      atualizadoPorId: usuario.id,
    },
  });
  if (mudou.count === 0) throw new ErroNegocio("Este projeto mudou de fase enquanto você decidia. Atualize a página e tente de novo.");
  const depois = await tx.projeto.findUniqueOrThrow({
    where: { id: projeto.id },
    select: { status: true, motivoPerdaId: true, motivoPerdaDetalhe: true, concorrente: true, perdidoEm: true },
  });

  const historico = await tx.historicoFaseProjeto.create({
    data: { projetoId: projeto.id, de: projeto.status, para, criadoEm: agora, criadoPorId: usuario.id },
    select: { id: true },
  });

  // R11: proposta enviada → "Acompanhar proposta" em D+N. A chave inclui o movimento de fase: refazer o mesmo
  // movimento não duplica a tarefa, mas sair e voltar à fase (outro fato) cria uma nova.
  if (para === "PROPOSTA_ENVIADA") {
    const [config, dono] = await Promise.all([
      tx.configuracaoEmpresa.findUnique({ where: { id: "singleton" }, select: { diasFollowUpProposta: true } }),
      tx.projeto.findUnique({ where: { id: projeto.id }, select: { responsavelId: true } }),
    ]);
    await tx.tarefa.createMany({
      data: [
        {
          titulo: `Acompanhar proposta — ${projeto.titulo}`,
          descricao: `Projeto ${projeto.codigo}: veja se o cliente recebeu a proposta e tire as dúvidas.`,
          tipo: "FOLLOW_UP_PROPOSTA",
          responsavelId: dono?.responsavelId ?? null,
          vencimento: vencimentoAcompanharProposta(agora, config?.diasFollowUpProposta ?? 3),
          clienteId: projeto.clienteId,
          projetoId: projeto.id,
          chaveUnica: chaveFollowUp("acompanhar-proposta", projeto.id, historico.id),
          criadoPorId: usuario.id,
          atualizadoPorId: usuario.id,
        },
      ],
      skipDuplicates: true,
    });
  }

  // Projeto perdido: o acompanhamento da proposta não faz mais sentido.
  if (perdendo) {
    await tx.tarefa.updateMany({ where: { projetoId: projeto.id, tipo: "FOLLOW_UP_PROPOSTA", status: "ABERTA", deletadoEm: null }, data: { status: "CANCELADA", atualizadoPorId: usuario.id } });
  }

  const complemento = perdendo ? ` Motivo: ${nomeDoMotivo}${perda?.concorrente ? ` (${perda.concorrente})` : ""}.` : "";
  await registrarInteracao(tx, {
    tipo: "SISTEMA",
    texto: `Fase alterada de "${ROTULO_STATUS_PROJETO[projeto.status]}" para "${ROTULO_STATUS_PROJETO[para]}".${complemento}`,
    clienteId: projeto.clienteId,
    projetoId: projeto.id,
    usuarioId: usuario.id,
  });

  await registrarAuditoria(tx, {
    usuario,
    entidade: "Projeto",
    entidadeId: projeto.id,
    acao: "ATUALIZAR",
    antes: { status: projeto.status },
    depois: depois,
    ip,
  });

  return { historicoId: historico.id };
}
