import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { ErroNegocio } from "@/lib/acoes";
import { registrarAuditoria } from "@/lib/auditoria";
import { problemasParaEnviar } from "@/lib/dominio/ciclo-proposta";
import { montarSecoes } from "@/lib/dominio/estrutura-proposta";
import { gerarParcelas } from "@/lib/dominio/parcelas";
import { calcularTotais, MAXIMO_CENTAVOS, quantidadeTotal } from "@/lib/dominio/preco";
import { chaveFollowUp, vencimentoAcompanharProposta } from "@/lib/dominio/followup";
import { formatarMoeda, hojeCalendario } from "@/lib/formatadores";
import { registrarInteracao } from "@/modules/interacoes/registrar";
import { mudarFaseDoProjeto } from "@/modules/projetos/servico";

import type { ConteudoProposta } from "./conteudo";
import { reservarNumeroDeProposta } from "./servico";

type Tx = Prisma.TransactionClient;
type Usuario = { id: string; nome: string };

const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** Monta o conteúdo de impressão a partir do banco (rascunho: ao vivo; enviada: vira o snapshot). */
export async function construirConteudo(db: Tx | Pick<Tx, "proposta" | "configuracaoEmpresa" | "condicaoPagamento">, propostaId: string): Promise<ConteudoProposta> {
  const [p, empresa] = await Promise.all([
    db.proposta.findFirst({
      where: { id: propostaId, deletadoEm: null },
      include: {
        opcoes: { where: { deletadoEm: null }, orderBy: { ordem: "asc" } },
        grupos: { where: { deletadoEm: null }, orderBy: { ordem: "asc" } },
        parcelas: { where: { deletadoEm: null }, orderBy: { ordem: "asc" } },
        condicao: { select: { nome: true } },
        itens: {
          where: { deletadoEm: null },
          orderBy: [{ ordem: "asc" }, { id: "asc" }],
          include: { medidas: { where: { deletadoEm: null }, orderBy: { ordem: "asc" } }, tipologia: { select: { tipoDesenho: true } } },
        },
      },
    }),
    db.configuracaoEmpresa.findUnique({ where: { id: "singleton" } }),
  ]);
  if (!p) throw new ErroNegocio("Proposta não encontrada.");

  const totais = calcularTotais(
    p.itens.map((i) => ({ opcaoId: i.opcaoId, precoTotalCentavos: i.precoTotalCentavos, medidas: i.medidas })),
    p.opcoes.map((o) => ({ id: o.id, descontoCentavos: o.descontoCentavos })),
    p.comNotaFiscal,
    p.acrescimoNotaPb,
  );

  return {
    versao: 1,
    numero: p.numero,
    revisao: p.revisao,
    parte: p.parte,
    data: dia(p.data) as string,
    geradoEm: new Date().toISOString(),
    empresa: {
      nomeFantasia: empresa?.nomeFantasia ?? null,
      razaoSocial: empresa?.razaoSocial ?? null,
      cnpj: empresa?.cnpj ?? null,
      endereco: empresa?.endereco ?? null,
      cidade: empresa?.cidade ?? null,
      uf: empresa?.uf ?? null,
      cep: empresa?.cep ?? null,
      telefone: empresa?.telefone ?? null,
      email: empresa?.emailPropostas ?? empresa?.emailContato ?? null,
      logoCaminho: empresa?.logoCaminho ?? null,
      corPrimaria: empresa?.corPrimaria ?? null,
    },
    cliente: { nome: p.clienteNome, documento: p.clienteDocumento, contato: p.clienteContato, telefone: p.clienteTelefone, email: p.clienteEmail, enderecoObra: p.enderecoObra },
    tituloEscopo: p.tituloEscopo,
    consultor: { nome: p.consultorNome, cargo: p.consultorCargo },
    comNotaFiscal: p.comNotaFiscal,
    acrescimoNotaPb: p.acrescimoNotaPb,
    exibirValorPorItem: p.exibirValorPorItem,
    descricoesMaiusculas: p.descricoesMaiusculas,
    opcoes: p.opcoes.map((o) => {
      const t = totais.find((x) => x.opcaoId === o.id)!;
      return {
        id: o.id,
        nome: o.nome,
        secoes: montarSecoes(o.id, p.grupos, p.itens).map((s) => ({
          grupo: s.grupo?.nome ?? null,
          itens: s.itens.map(({ numero, item }) => ({
            numero,
            descricao: item.descricao,
            local: item.local,
            observacoes: item.observacoes,
            tipoDesenho: item.tipologia?.tipoDesenho ?? "GENERICO",
            folhas: item.folhas,
            medidas: item.medidas.map((m) => ({ larguraMm: m.larguraMm, alturaMm: m.alturaMm, quantidade: m.quantidade, local: m.local })),
            quantidade: quantidadeTotal(item.medidas),
            precoTotalCentavos: item.precoTotalCentavos,
          })),
        })),
        totais: { itensCentavos: t.itensCentavos, descontoCentavos: t.descontoCentavos, acrescimoNotaCentavos: t.acrescimoNotaCentavos, totalCentavos: t.totalCentavos, areaM2: t.areaM2 },
      };
    }),
    prazo: { modo: p.modoPrazo, totalMinDias: p.prazoTotalMinDias, totalMaxDias: p.prazoTotalMaxDias, materialDias: p.prazoMaterialDias, execucaoDias: p.prazoExecucaoDias, vidrosDias: p.prazoVidrosDias, tipoDias: empresa?.tipoDias ?? "UTEIS" },
    validade: { texto: p.validadeTexto, ate: dia(p.validadeAte), encerradaPorReajuste: p.validadeEncerradaPorReajuste },
    pagamento: {
      condicaoNome: p.condicao?.nome ?? null,
      textoLivre: p.condicaoTextoLivre,
      dadosPagamento: p.dadosPagamento,
      parcelas: p.parcelas.map((x) => ({ descricao: x.descricao, percentualPb: x.percentualPb, gatilho: x.gatilho, forma: x.forma, diasApos: x.diasApos, dataFixa: dia(x.dataFixa), parcelasCartao: x.parcelasCartao })),
    },
    notas: p.notas,
  };
}

/** O que falta para enviar (vazio = pronta). Lê as linhas do banco, não o que a tela mostra. */
export async function problemasDaProposta(tx: Tx, propostaId: string): Promise<string[]> {
  const p = await tx.proposta.findFirst({
    where: { id: propostaId, deletadoEm: null },
    select: {
      clienteNome: true,
      condicaoTextoLivre: true,
      parcelas: { where: { deletadoEm: null }, select: { id: true } },
      opcoes: { where: { deletadoEm: null }, orderBy: { ordem: "asc" }, select: { id: true, nome: true } },
      itens: { where: { deletadoEm: null }, select: { opcaoId: true, descricao: true, precoTotalCentavos: true, medidas: { where: { deletadoEm: null }, select: { id: true } } } },
    },
  });
  if (!p) throw new ErroNegocio("Proposta não encontrada.");
  return problemasParaEnviar({
    clienteNome: p.clienteNome,
    condicao: { temParcelas: p.parcelas.length > 0, textoLivre: p.condicaoTextoLivre },
    opcoes: p.opcoes.map((o) => ({ nome: o.nome, itens: p.itens.filter((i) => i.opcaoId === o.id).map((i) => ({ descricao: i.descricao, precoTotalCentavos: i.precoTotalCentavos, medidas: i.medidas.length })) })),
  });
}

/** Congela o conteúdo (R4) e marca ENVIADA. Chamada dentro da transação de quem envia ou aprova. */
async function congelar(tx: Tx, propostaId: string, usuario: Usuario, agora: Date) {
  const problemas = await problemasDaProposta(tx, propostaId);
  if (problemas.length > 0) throw new ErroNegocio(`A proposta ainda não está pronta: ${problemas.join(" ")}`);
  const conteudo = await construirConteudo(tx, propostaId);
  const mudou = await tx.proposta.updateMany({
    where: { id: propostaId, status: "RASCUNHO", deletadoEm: null },
    data: { status: "ENVIADA", enviadaEm: agora, snapshot: conteudo as unknown as Prisma.InputJsonValue, atualizadoPorId: usuario.id },
  });
  if (mudou.count === 0) throw new ErroNegocio("Esta proposta mudou enquanto você decidia. Atualize a página.");
  return conteudo;
}

/** Marca como ENVIADA: congela, substitui a revisão anterior, move o projeto no funil e cria o acompanhamento (R11). */
export async function enviarProposta(tx: Tx, entrada: { usuario: Usuario; propostaId: string; ip?: string | null; agora?: Date }) {
  const { usuario, propostaId, ip } = entrada;
  const agora = entrada.agora ?? new Date();
  await tx.$queryRaw`SELECT "id" FROM "Proposta" WHERE "id" = ${propostaId} FOR UPDATE`;
  const antes = await tx.proposta.findFirst({
    where: { id: propostaId, deletadoEm: null, projeto: { deletadoEm: null } },
    select: { id: true, numero: true, revisao: true, revisaoDeId: true, status: true, projeto: { select: { id: true, codigo: true, titulo: true, clienteId: true, status: true, responsavelId: true } } },
  });
  if (!antes) throw new ErroNegocio("Proposta não encontrada.");
  if (antes.status !== "RASCUNHO") throw new ErroNegocio("Esta proposta já foi enviada.");
  const projeto = antes.projeto;
  if (["APROVADO", "EM_EXECUCAO", "CONCLUIDO", "CANCELADO"].includes(projeto.status)) {
    throw new ErroNegocio("Este projeto já saiu do funil comercial; não dá para enviar uma nova proposta por ele.");
  }

  await congelar(tx, propostaId, usuario, agora);

  // A revisão anterior sai de vigor quando a nova é enviada (docs/DECISOES.md, 67).
  if (antes.revisaoDeId) {
    await tx.proposta.updateMany({ where: { id: antes.revisaoDeId, status: "ENVIADA" }, data: { status: "SUBSTITUIDA", atualizadoPorId: usuario.id } });
  }

  if (projeto.status === "PROPOSTA_ENVIADA" || projeto.status === "NEGOCIACAO") {
    // Já está no funil nessa fase: só garante o acompanhamento desta proposta (idempotente).
    const config = await tx.configuracaoEmpresa.findUnique({ where: { id: "singleton" }, select: { diasFollowUpProposta: true } });
    await tx.tarefa.createMany({
      data: [
        {
          titulo: `Acompanhar proposta ${antes.numero} — ${projeto.titulo}`,
          descricao: `Projeto ${projeto.codigo}: veja se o cliente recebeu a proposta e tire as dúvidas.`,
          tipo: "FOLLOW_UP_PROPOSTA",
          responsavelId: projeto.responsavelId,
          vencimento: vencimentoAcompanharProposta(agora, config?.diasFollowUpProposta ?? 3),
          clienteId: projeto.clienteId,
          projetoId: projeto.id,
          chaveUnica: chaveFollowUp("acompanhar-proposta", projeto.id, `proposta:${propostaId}`),
          criadoPorId: usuario.id,
          atualizadoPorId: usuario.id,
        },
      ],
      skipDuplicates: true,
    });
  } else {
    await mudarFaseDoProjeto(tx, { usuario, projeto: { id: projeto.id, codigo: projeto.codigo, titulo: projeto.titulo, clienteId: projeto.clienteId, status: projeto.status }, para: "PROPOSTA_ENVIADA", ip, agora });
  }

  await registrarInteracao(tx, { tipo: "SISTEMA", texto: `Proposta ${antes.numero}${antes.revisao > 0 ? ` (Rev. ${antes.revisao})` : ""} marcada como enviada e congelada.`, clienteId: projeto.clienteId, projetoId: projeto.id, usuarioId: usuario.id });
  await registrarAuditoria(tx, { usuario, entidade: "Proposta", entidadeId: propostaId, acao: "ENVIAR", antes: { status: "RASCUNHO" }, depois: { status: "ENVIADA", enviadaEm: agora }, ip });
  return { numero: antes.numero, projetoId: projeto.id };
}

export type EntradaAprovacao = {
  usuario: Usuario;
  propostaId: string;
  opcaoId: string;
  forma: "WHATSAPP" | "EMAIL" | "ASSINATURA" | "VERBAL";
  /** Data do aceite (AAAA-MM-DD, calendário de São Paulo). */
  aceitaEm: string;
  observacao?: string | null;
  ip?: string | null;
  agora?: Date;
};

/**
 * Aprovação (R5), numa transação só: aceite, projeto → Aprovado com valor fechado, parcelas a receber (R6), tarefas e
 * linha do tempo. Aprovar um rascunho congela antes. Idempotente nas parcelas (única por proposta + ordem).
 * O passo 4 (etapas da obra) é o ponto de extensão da Fase 4: `gerarEtapasDaObra`.
 */
export async function aprovarProposta(tx: Tx, e: EntradaAprovacao) {
  const { usuario, propostaId, ip } = e;
  const agora = e.agora ?? new Date();
  await tx.$queryRaw`SELECT "id" FROM "Proposta" WHERE "id" = ${propostaId} FOR UPDATE`;
  const p = await tx.proposta.findFirst({
    where: { id: propostaId, deletadoEm: null, projeto: { deletadoEm: null } },
    include: {
      opcoes: { where: { deletadoEm: null } },
      parcelas: { where: { deletadoEm: null }, orderBy: { ordem: "asc" } },
      projeto: { select: { id: true, codigo: true, titulo: true, clienteId: true, status: true, responsavelId: true, enderecoObra: { select: { condominio: true, condominioNome: true } } } },
    },
  });
  if (!p) throw new ErroNegocio("Proposta não encontrada.");
  if (p.status !== "RASCUNHO" && p.status !== "ENVIADA" && p.status !== "EXPIRADA") {
    throw new ErroNegocio(p.status === "APROVADA" ? "Esta proposta já foi aprovada." : "Só propostas em rascunho ou enviadas podem ser aprovadas. Se foi substituída, aprove a revisão vigente.");
  }
  if (p.projeto.status === "CANCELADO") throw new ErroNegocio("O projeto está cancelado.");
  // Serializa as aprovações do mesmo projeto (a soma do valor fechado precisa enxergar a anterior).
  await tx.$queryRaw`SELECT "id" FROM "Projeto" WHERE "id" = ${p.projeto.id} FOR UPDATE`;
  // Revisões do mesmo número são alternativas, nunca somam: se uma já foi aprovada, as outras não podem ser.
  const irma = await tx.proposta.count({ where: { numero: p.numero, id: { not: propostaId }, status: "APROVADA", deletadoEm: null } });
  if (irma > 0) throw new ErroNegocio(`Outra revisão da proposta ${p.numero} já foi aprovada.`);
  if (!p.opcoes.some((o) => o.id === e.opcaoId)) throw new ErroNegocio("A opção aprovada não pertence a esta proposta.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.aceitaEm) || Number.isNaN(Date.parse(`${e.aceitaEm}T00:00:00Z`))) throw new ErroNegocio("Informe uma data de aceite válida.");

  // Rascunho aprovado direto: congela antes (a proposta aprovada sempre tem snapshot).
  if (p.status === "RASCUNHO") await congelar(tx, propostaId, usuario, agora);

  // Proposta já enviada: vale o que foi CONGELADO (o que o cliente recebeu), não o estado ao vivo.
  const conteudo = p.status !== "RASCUNHO" && p.snapshot ? (p.snapshot as unknown as ConteudoProposta) : await construirConteudo(tx, propostaId);
  const opcao = conteudo.opcoes.find((o) => o.id === e.opcaoId);
  if (!opcao) throw new ErroNegocio("A opção aprovada não pertence a esta proposta.");
  const valorAprovado = opcao.totais.totalCentavos;
  if (valorAprovado <= 0) throw new ErroNegocio("A opção escolhida está sem valor.");
  if (valorAprovado > MAXIMO_CENTAVOS) throw new ErroNegocio("O valor da proposta passa do máximo aceito (R$ 21.474.836,47).");

  const marcou = await tx.proposta.updateMany({
    where: { id: propostaId, status: { in: ["ENVIADA", "EXPIRADA"] }, deletadoEm: null },
    data: {
      status: "APROVADA",
      aceitaEm: new Date(`${e.aceitaEm}T12:00:00.000Z`),
      formaAceite: e.forma,
      aceiteObservacao: e.observacao || null,
      opcaoAprovadaId: e.opcaoId,
      valorAprovadoCentavos: valorAprovado,
      atualizadoPorId: usuario.id,
    },
  });
  if (marcou.count === 0) throw new ErroNegocio("Esta proposta mudou enquanto você decidia. Atualize a página.");

  // As outras revisões do mesmo número (rascunho ou enviadas) saem de vigor.
  await tx.proposta.updateMany({ where: { numero: p.numero, id: { not: propostaId }, status: { in: ["RASCUNHO", "ENVIADA", "EXPIRADA"] }, deletadoEm: null }, data: { status: "SUBSTITUIDA", atualizadoPorId: usuario.id } });

  // Projeto: valor fechado = soma das propostas aprovadas ("partes" diferentes somam).
  const soma = await tx.proposta.aggregate({ where: { projetoId: p.projeto.id, status: "APROVADA", deletadoEm: null }, _sum: { valorAprovadoCentavos: true } });
  const valorFechado = soma._sum.valorAprovadoCentavos ?? valorAprovado;
  const antesProjeto = { status: p.projeto.status };
  const fases = ["NOVO_LEAD", "VISITA_AGENDADA", "ELABORANDO_PROPOSTA", "PROPOSTA_ENVIADA", "NEGOCIACAO", "PERDIDO"];
  if (fases.includes(p.projeto.status)) {
    await mudarFaseDoProjeto(tx, { usuario, projeto: { id: p.projeto.id, codigo: p.projeto.codigo, titulo: p.projeto.titulo, clienteId: p.projeto.clienteId, status: p.projeto.status as never }, para: "APROVADO", ip, agora });
    await tx.projeto.update({ where: { id: p.projeto.id }, data: { valorFechadoCentavos: valorFechado, dataFechamento: agora, atualizadoPorId: usuario.id } });
  } else {
    // Já aprovado/em execução (outra "parte"): só atualiza o valor fechado.
    await tx.projeto.update({ where: { id: p.projeto.id }, data: { valorFechadoCentavos: valorFechado, atualizadoPorId: usuario.id } });
  }
  // O acompanhamento comercial deixa de fazer sentido.
  await tx.tarefa.updateMany({ where: { projetoId: p.projeto.id, tipo: "FOLLOW_UP_PROPOSTA", status: "ABERTA", deletadoEm: null }, data: { status: "CANCELADA", atualizadoPorId: usuario.id } });

  // Parcelas a receber (R6): total da opção aprovada (com a nota, se houver) dividido pelo cronograma.
  let parcelasGeradas = 0;
  if (p.parcelas.length > 0) {
    const geradas = gerarParcelas(
      valorAprovado,
      p.parcelas.map((x) => ({ descricao: x.descricao, percentualPb: x.percentualPb, gatilho: x.gatilho, forma: x.forma, diasApos: x.diasApos, dataFixa: dia(x.dataFixa), parcelasCartao: x.parcelasCartao })),
      e.aceitaEm,
    );
    const r = await tx.contaReceber.createMany({
      data: geradas.map((g) => ({
        projetoId: p.projeto.id,
        propostaId,
        clienteId: p.projeto.clienteId,
        ordem: g.ordem,
        descricao: `${p.numero} — ${g.descricao}`,
        valorCentavos: g.valorCentavos,
        percentualPb: g.percentualPb,
        vencimento: g.vencimento ? new Date(`${g.vencimento}T00:00:00.000Z`) : null,
        gatilho: g.gatilho,
        forma: g.forma,
        parcelasCartao: g.parcelasCartao,
        status: g.status,
        comNotaFiscal: p.comNotaFiscal,
        criadoPorId: usuario.id,
        atualizadoPorId: usuario.id,
      })),
      skipDuplicates: true,
    });
    parcelasGeradas = r.count;
  }

  // Tarefas (R5.5): medição exata e, se for prédio, aprovação do condomínio. Idempotentes (chave única).
  const hoje = new Date(`${e.aceitaEm}T00:00:00.000Z`);
  const tarefas: Prisma.TarefaCreateManyInput[] = [
    {
      titulo: `Agendar medição exata — ${p.projeto.titulo}`,
      descricao: `Proposta ${p.numero} aprovada. O prazo da obra conta a partir da medição exata.`,
      tipo: "AGENDAR_MEDICAO",
      responsavelId: p.projeto.responsavelId,
      vencimento: hoje,
      clienteId: p.projeto.clienteId,
      projetoId: p.projeto.id,
      chaveUnica: `medicao-exata:${propostaId}`,
      criadoPorId: usuario.id,
      atualizadoPorId: usuario.id,
    },
  ];
  if (p.projeto.enderecoObra?.condominio) {
    tarefas.push({
      titulo: `Confirmar aprovação do condomínio — ${p.projeto.titulo}`,
      descricao: `${p.projeto.enderecoObra.condominioNome ? `Condomínio ${p.projeto.enderecoObra.condominioNome}. ` : ""}Confira se a mudança foi aprovada e os horários permitidos.`,
      tipo: "CONFIRMAR_CONDOMINIO",
      responsavelId: p.projeto.responsavelId,
      vencimento: hoje,
      clienteId: p.projeto.clienteId,
      projetoId: p.projeto.id,
      chaveUnica: `condominio:${propostaId}`,
      criadoPorId: usuario.id,
      atualizadoPorId: usuario.id,
    });
  }
  await tx.tarefa.createMany({ data: tarefas, skipDuplicates: true });

  await gerarEtapasDaObra(tx, { projetoId: p.projeto.id, propostaId, usuario });

  await registrarInteracao(tx, {
    tipo: "SISTEMA",
    texto: `Proposta ${p.numero} aprovada${conteudo.opcoes.length > 1 ? ` (opção "${opcao.nome}")` : ""}: ${formatarMoeda(valorAprovado)}, aceite por ${e.forma.toLowerCase()}.${p.parcelas.length === 0 ? " Condição a combinar: nenhuma parcela foi gerada." : ` ${parcelasGeradas} parcela(s) a receber geradas.`}`,
    clienteId: p.projeto.clienteId,
    projetoId: p.projeto.id,
    usuarioId: usuario.id,
  });
  await registrarAuditoria(tx, { usuario, entidade: "Proposta", entidadeId: propostaId, acao: "APROVAR", antes: { status: p.status, projeto: antesProjeto }, depois: { status: "APROVADA", opcaoAprovadaId: e.opcaoId, valorAprovadoCentavos: valorAprovado, parcelas: parcelasGeradas, valorFechadoCentavos: valorFechado }, ip });

  const outras = await tx.proposta.count({ where: { projetoId: p.projeto.id, id: { not: propostaId }, status: { in: ["RASCUNHO", "ENVIADA"] }, deletadoEm: null } });
  return { numero: p.numero, projetoId: p.projeto.id, valorAprovadoCentavos: valorAprovado, parcelasGeradas, semParcelas: p.parcelas.length === 0, outrasEmAberto: outras, valorFechadoCentavos: valorFechado };
}

/** Ponto de extensão da Fase 4 (R5, passo 4): gerar as etapas da obra a partir do modelo. Hoje não faz nada. */
async function gerarEtapasDaObra(_tx: Tx, _dados: { projetoId: string; propostaId: string; usuario: Usuario }): Promise<void> {
  return;
}

/**
 * Copia a proposta inteira (cabeçalho, opções, seções, itens com medidas e cronograma).
 * NOVA = número novo (cópia como base); REVISAO = mesmo número, revisão + 1, ligada à anterior.
 */
export async function copiarProposta(tx: Tx, entrada: { usuarioId: string; origemId: string; modo: "NOVA" | "REVISAO"; agora?: Date }) {
  const { usuarioId, origemId, modo } = entrada;
  const o = await tx.proposta.findFirst({
    where: { id: origemId, deletadoEm: null, projeto: { deletadoEm: null } },
    include: {
      opcoes: { where: { deletadoEm: null }, orderBy: { ordem: "asc" } },
      grupos: { where: { deletadoEm: null }, orderBy: { ordem: "asc" } },
      parcelas: { where: { deletadoEm: null }, orderBy: { ordem: "asc" } },
      itens: { where: { deletadoEm: null }, orderBy: { ordem: "asc" }, include: { medidas: { where: { deletadoEm: null }, orderBy: { ordem: "asc" } } } },
    },
  });
  if (!o) throw new ErroNegocio("Proposta não encontrada.");
  const autor = { criadoPorId: usuarioId, atualizadoPorId: usuarioId };

  let numero = o.numero;
  let sequencial = o.numeroSequencial;
  let ano = o.ano;
  let revisao = 0;
  if (modo === "REVISAO") {
    // Inclui as excluídas: o índice único (número + revisão) vale para elas também.
    const maior = await tx.proposta.aggregate({ where: { numero: o.numero }, _max: { revisao: true } });
    revisao = (maior._max.revisao ?? o.revisao) + 1;
  } else {
    const novo = await reservarNumeroDeProposta(tx, entrada.agora);
    numero = novo.numero;
    sequencial = novo.sequencial;
    ano = novo.ano;
  }

  const nova = await tx.proposta.create({
    data: {
      projetoId: o.projetoId,
      numero,
      numeroSequencial: sequencial,
      ano,
      revisao,
      revisaoDeId: modo === "REVISAO" ? o.id : null,
      parte: o.parte,
      data: hojeCalendario(entrada.agora),
      consultorNome: o.consultorNome,
      consultorCargo: o.consultorCargo,
      clienteNome: o.clienteNome,
      clienteDocumento: o.clienteDocumento,
      clienteContato: o.clienteContato,
      clienteTelefone: o.clienteTelefone,
      clienteEmail: o.clienteEmail,
      enderecoObra: o.enderecoObra,
      tituloEscopo: o.tituloEscopo,
      comNotaFiscal: o.comNotaFiscal,
      acrescimoNotaPb: o.acrescimoNotaPb,
      comissaoArquitetoPb: o.comissaoArquitetoPb,
      comissaoIndicacaoPb: o.comissaoIndicacaoPb,
      markupPb: o.markupPb,
      modoPrazo: o.modoPrazo,
      prazoTotalMinDias: o.prazoTotalMinDias,
      prazoTotalMaxDias: o.prazoTotalMaxDias,
      prazoMaterialDias: o.prazoMaterialDias,
      prazoExecucaoDias: o.prazoExecucaoDias,
      prazoVidrosDias: o.prazoVidrosDias,
      validadeTexto: o.validadeTexto,
      validadeAte: modo === "REVISAO" ? o.validadeAte : null,
      condicaoId: o.condicaoId,
      condicaoTextoLivre: o.condicaoTextoLivre,
      dadosPagamento: o.dadosPagamento,
      notas: o.notas,
      exibirValorPorItem: o.exibirValorPorItem,
      descricoesMaiusculas: o.descricoesMaiusculas,
      observacoesInternas: o.observacoesInternas,
      ...autor,
    },
    select: { id: true, numero: true, revisao: true },
  });
  const mapaOpcao = new Map<string, string>();
  for (const op of o.opcoes) {
    const c = await tx.opcaoProposta.create({ data: { propostaId: nova.id, nome: op.nome, ordem: op.ordem, descontoCentavos: op.descontoCentavos, ...autor }, select: { id: true } });
    mapaOpcao.set(op.id, c.id);
  }
  const mapaGrupo = new Map<string, string>();
  for (const g of o.grupos) {
    const c = await tx.grupoProposta.create({ data: { propostaId: nova.id, nome: g.nome, ordem: g.ordem, ...autor }, select: { id: true } });
    mapaGrupo.set(g.id, c.id);
  }
  for (const i of o.itens) {
    await tx.itemProposta.create({
      data: {
        propostaId: nova.id,
        opcaoId: mapaOpcao.get(i.opcaoId)!,
        grupoId: i.grupoId ? (mapaGrupo.get(i.grupoId) ?? null) : null,
        ordem: i.ordem,
        tipologiaId: i.tipologiaId,
        linhaId: i.linhaId,
        acabamentoId: i.acabamentoId,
        tipoVidroId: i.tipoVidroId,
        espessuraVidroMm: i.espessuraVidroMm,
        folhas: i.folhas,
        faces: i.faces,
        torresCm: i.torresCm,
        descricao: i.descricao,
        descricaoEditada: i.descricaoEditada,
        local: i.local,
        observacoes: i.observacoes,
        modoPreco: i.modoPreco,
        cobranca: i.cobranca,
        valorManualCentavos: i.valorManualCentavos,
        precoTotalCentavos: i.precoTotalCentavos,
        custoEstimadoCentavos: i.custoEstimadoCentavos,
        markupPb: i.markupPb,
        calculadoEm: i.calculadoEm,
        avisoPreco: i.avisoPreco,
        medidas: { create: i.medidas.map((m) => ({ larguraMm: m.larguraMm, alturaMm: m.alturaMm, quantidade: m.quantidade, local: m.local, ordem: m.ordem, ...autor })) },
        ...autor,
      },
    });
  }
  if (o.parcelas.length > 0) {
    await tx.propostaParcela.createMany({
      data: o.parcelas.map((p) => ({ propostaId: nova.id, ordem: p.ordem, descricao: p.descricao, percentualPb: p.percentualPb, gatilho: p.gatilho, forma: p.forma, diasApos: p.diasApos, dataFixa: p.dataFixa, parcelasCartao: p.parcelasCartao, ...autor })),
    });
  }
  return { id: nova.id, numero: nova.numero, revisao: nova.revisao, projetoId: o.projetoId, origemNumero: o.numero };
}
