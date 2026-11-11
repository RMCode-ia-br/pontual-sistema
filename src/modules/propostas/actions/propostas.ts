"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { ErroNegocio, executar, falha, falhaDeValidacao, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { registrarAuditoria } from "@/lib/auditoria";
import { extrairIp } from "@/lib/auth/autenticar";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { preencherModelo } from "@/lib/dominio/modelos-texto";
import { hojeCalendario } from "@/lib/formatadores";
import { can } from "@/lib/permissoes";
import { campoIdObrigatorio } from "@/lib/validadores/campos";
import { mudarFaseDoProjeto } from "@/modules/projetos/servico";
import { registrarInteracao } from "@/modules/interacoes/registrar";

import { lerCronograma, propostaSchema, type EntradaProposta } from "../schemas";
import { calcularPrecoDoItem, exigirRascunho, reservarNumeroDeProposta } from "../servico";
import { copiarProposta } from "../servico-ciclo";

function revalidar(id?: string, projetoId?: string) {
  revalidatePath("/propostas");
  if (id) revalidatePath(`/propostas/${id}`);
  if (projetoId) revalidatePath(`/projetos/${projetoId}`);
}

const paraData = (v: string | null) => (v ? new Date(`${v}T00:00:00.000Z`) : null);

const camposAuditados = {
  id: true,
  numero: true,
  revisao: true,
  parte: true,
  status: true,
  data: true,
  clienteNome: true,
  enderecoObra: true,
  tituloEscopo: true,
  comNotaFiscal: true,
  acrescimoNotaPb: true,
  comissaoArquitetoPb: true,
  comissaoIndicacaoPb: true,
  markupPb: true,
  modoPrazo: true,
  prazoTotalMinDias: true,
  prazoTotalMaxDias: true,
  prazoMaterialDias: true,
  prazoExecucaoDias: true,
  prazoVidrosDias: true,
  validadeTexto: true,
  validadeAte: true,
  condicaoId: true,
  condicaoTextoLivre: true,
  dadosPagamento: true,
  exibirValorPorItem: true,
  descricoesMaiusculas: true,
} as const;

function textoDoEndereco(e: { logradouro: string | null; numero: string | null; complemento: string | null; bairro: string | null; cidade: string | null; uf: string | null } | null): string | null {
  if (!e) return null;
  const rua = [e.logradouro, e.numero].filter(Boolean).join(", ");
  const resto = [e.complemento, e.bairro, [e.cidade, e.uf].filter(Boolean).join("/")].filter(Boolean).join(" — ");
  return [rua, resto].filter(Boolean).join(" — ") || null;
}

/** Cria a proposta (rascunho) a partir do projeto: cabeçalho do cliente, textos padrão e primeira opção. */
export async function criarProposta(projetoIdBruto: string): Promise<ResultadoAcao<{ id: string }>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "criar", "proposta")) return falha("Sem permissão.");
  const projetoId = campoIdObrigatorio("Projeto inválido.").safeParse(projetoIdBruto);
  if (!projetoId.success) return falha("Projeto inválido.");

  return executar("propostas.criar", async () => {
    const ip = extrairIp(await headers());
    const criada = await prisma.$transaction(async (tx) => {
      const projeto = await tx.projeto.findFirst({
        where: { id: projetoId.data, deletadoEm: null, cliente: { deletadoEm: null } },
        select: {
          id: true,
          codigo: true,
          titulo: true,
          status: true,
          clienteId: true,
          cliente: { select: { nome: true, cpfCnpj: true, telefone: true, whatsapp: true, email: true, contatos: { where: { deletadoEm: null }, orderBy: { criadoEm: "asc" }, take: 1, select: { nome: true } } } },
          enderecoObra: { select: { logradouro: true, numero: true, complemento: true, bairro: true, cidade: true, uf: true } },
        },
      });
      if (!projeto) throw new ErroNegocio("Projeto não encontrado.");
      if (["APROVADO", "EM_EXECUCAO", "CONCLUIDO", "PERDIDO", "CANCELADO"].includes(projeto.status)) {
        throw new ErroNegocio("Este projeto já saiu do funil comercial. Reabra-o antes de criar uma nova proposta.");
      }

      const [config, notasModelo, validadeModelo] = await Promise.all([
        tx.configuracaoEmpresa.findUnique({ where: { id: "singleton" } }),
        tx.modeloTexto.findFirst({ where: { chave: "proposta.notas", deletadoEm: null }, select: { conteudo: true } }),
        tx.modeloTexto.findFirst({ where: { chave: "proposta.termos.validade", deletadoEm: null }, select: { conteudo: true } }),
      ]);
      const nomeFantasia = config?.nomeFantasia ?? undefined;
      const notas = (notasModelo?.conteudo ?? "")
        .split("\n")
        .map((l) => preencherModelo(l.trim(), { nomeFantasia }).texto)
        .filter((l) => l !== "");

      const { numero, sequencial, ano } = await reservarNumeroDeProposta(tx);
      const nova = await tx.proposta.create({
        data: {
          projetoId: projeto.id,
          numero,
          numeroSequencial: sequencial,
          ano,
          data: hojeCalendario(),
          consultorNome: config?.consultorNome ?? null,
          consultorCargo: config?.consultorCargo ?? null,
          clienteNome: projeto.cliente.nome,
          clienteDocumento: projeto.cliente.cpfCnpj,
          clienteContato: projeto.cliente.contatos[0]?.nome ?? null,
          clienteTelefone: projeto.cliente.whatsapp || projeto.cliente.telefone,
          clienteEmail: projeto.cliente.email,
          enderecoObra: textoDoEndereco(projeto.enderecoObra),
          acrescimoNotaPb: config?.acrescimoNotaPb ?? 500,
          validadeTexto: validadeModelo?.conteudo ?? "Até alteração dos fornecedores",
          dadosPagamento: config?.dadosPagamento ?? null,
          notas,
          exibirValorPorItem: config?.pdfExibirValorPorItem ?? true,
          descricoesMaiusculas: config?.pdfDescricoesMaiusculas ?? true,
          opcoes: { create: [{ nome: "Opção 1", ordem: 0, criadoPorId: sessao.id, atualizadoPorId: sessao.id }] },
          criadoPorId: sessao.id,
          atualizadoPorId: sessao.id,
        },
        select: { id: true, numero: true },
      });

      // Quem ainda estava só em lead/visita passa a "Elaborando proposta" (mesma regra do funil).
      if (projeto.status === "NOVO_LEAD" || projeto.status === "VISITA_AGENDADA") {
        await mudarFaseDoProjeto(tx, {
          usuario: sessao,
          projeto: { id: projeto.id, codigo: projeto.codigo, titulo: projeto.titulo, clienteId: projeto.clienteId, status: projeto.status },
          para: "ELABORANDO_PROPOSTA",
          ip,
        });
      }
      await registrarInteracao(tx, { tipo: "SISTEMA", texto: `Proposta ${nova.numero} criada (rascunho).`, clienteId: projeto.clienteId, projetoId: projeto.id, usuarioId: sessao.id });
      await registrarAuditoria(tx, { usuario: sessao, entidade: "Proposta", entidadeId: nova.id, acao: "CRIAR", depois: { numero: nova.numero, projetoId: projeto.id }, ip });
      return { id: nova.id, projetoId: projeto.id, numero: nova.numero };
    });
    revalidar(criada.id, criada.projetoId);
    revalidatePath("/funil");
    return sucesso({ id: criada.id }, `Proposta ${criada.numero} criada.`);
  });
}

/** Salva cabeçalho, condições comerciais e cronograma. Mudar o markup da proposta recalcula os itens por composição. */
export async function salvarProposta(entrada: EntradaProposta): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "proposta")) return falha("Sem permissão.");
  const lido = propostaSchema.safeParse(entrada);
  if (!lido.success) return falhaDeValidacao(lido.error);
  const v = lido.data;
  const cronograma = lerCronograma(v.parcelas);
  if ("erro" in cronograma) return falha(cronograma.erro);
  if (cronograma.parcelas.length > 0 && v.condicaoTextoLivre) return falha("Uma condição com texto livre não tem parcelas.");
  if (v.modoPrazo === "TOTAL" && v.prazoTotalMinDias && v.prazoTotalMaxDias && v.prazoTotalMinDias > v.prazoTotalMaxDias) {
    return falha("O prazo mínimo não pode ser maior que o máximo.", { prazoTotalMinDias: "Maior que o máximo." });
  }

  return executar("propostas.salvar", async () => {
    const ip = extrairIp(await headers());
    const resultado = await prisma.$transaction(async (tx) => {
      const atual = await exigirRascunho(tx, v.id);
      if (v.condicaoId) {
        const existe = await tx.condicaoPagamento.count({ where: { id: v.condicaoId, deletadoEm: null } });
        if (!existe) throw new ErroNegocio("A condição de pagamento escolhida não foi encontrada.");
      }
      const antes = await tx.proposta.findUniqueOrThrow({ where: { id: v.id }, select: camposAuditados });
      const novoMarkup = v.markup;
      const depois = await tx.proposta.update({
        where: { id: v.id },
        data: {
          parte: v.parte || null,
          data: paraData(v.data) as Date,
          consultorNome: v.consultorNome || null,
          consultorCargo: v.consultorCargo || null,
          clienteNome: v.clienteNome,
          clienteDocumento: v.clienteDocumento || null,
          clienteContato: v.clienteContato || null,
          clienteTelefone: v.clienteTelefone || null,
          clienteEmail: v.clienteEmail || null,
          enderecoObra: v.enderecoObra || null,
          tituloEscopo: v.tituloEscopo,
          comNotaFiscal: v.comNotaFiscal,
          acrescimoNotaPb: v.acrescimoNota ?? antes.acrescimoNotaPb,
          comissaoArquitetoPb: v.comissaoArquiteto ?? 0,
          comissaoIndicacaoPb: v.comissaoIndicacao ?? 0,
          markupPb: novoMarkup,
          modoPrazo: v.modoPrazo,
          prazoTotalMinDias: v.modoPrazo === "TOTAL" ? v.prazoTotalMinDias : null,
          prazoTotalMaxDias: v.modoPrazo === "TOTAL" ? v.prazoTotalMaxDias : null,
          prazoMaterialDias: v.modoPrazo === "POR_ETAPA" ? v.prazoMaterialDias : null,
          prazoExecucaoDias: v.modoPrazo === "POR_ETAPA" ? v.prazoExecucaoDias : null,
          prazoVidrosDias: v.modoPrazo === "POR_ETAPA" ? v.prazoVidrosDias : null,
          validadeTexto: v.validadeTexto || null,
          validadeAte: paraData(v.validadeAte),
          condicaoId: v.condicaoId,
          condicaoTextoLivre: v.condicaoTextoLivre || null,
          dadosPagamento: v.dadosPagamento || null,
          notas: v.notas,
          exibirValorPorItem: v.exibirValorPorItem,
          descricoesMaiusculas: v.descricoesMaiusculas,
          observacoesInternas: v.observacoesInternas || null,
          atualizadoPorId: sessao.id,
        },
        select: camposAuditados,
      });

      // Cronograma: troca inteira (as linhas antigas vão para a exclusão lógica).
      await tx.propostaParcela.updateMany({ where: { propostaId: v.id, deletadoEm: null }, data: { deletadoEm: new Date(), atualizadoPorId: sessao.id } });
      if (cronograma.parcelas.length > 0) {
        await tx.propostaParcela.createMany({
          data: cronograma.parcelas.map((p) => ({
            propostaId: v.id,
            ordem: p.ordem,
            descricao: p.descricao,
            percentualPb: p.percentualPb,
            gatilho: p.gatilho,
            forma: p.forma,
            diasApos: p.diasApos ?? null,
            dataFixa: paraData(p.dataFixa ?? null),
            parcelasCartao: p.parcelasCartao ?? null,
            criadoPorId: sessao.id,
            atualizadoPorId: sessao.id,
          })),
        });
      }

      // O markup da proposta muda o preço dos itens por composição que não têm markup próprio.
      let recalculados = 0;
      if (antes.markupPb !== depois.markupPb) {
        const itens = await tx.itemProposta.findMany({
          where: { propostaId: v.id, deletadoEm: null, modoPreco: "COMPOSICAO", markupPb: null },
          select: { id: true, tipologiaId: true, linhaId: true, acabamentoId: true, tipoVidroId: true, espessuraVidroMm: true, folhas: true, medidas: { where: { deletadoEm: null }, select: { larguraMm: true, alturaMm: true, quantidade: true } } },
        });
        for (const i of itens) {
          const calc = await calcularPrecoDoItem(tx, { ...i, modoPreco: "COMPOSICAO", valorManualCentavos: null, markupItemPb: null, markupPropostaPb: depois.markupPb });
          if (calc.ok) {
            await tx.itemProposta.update({ where: { id: i.id }, data: { precoTotalCentavos: calc.precoTotalCentavos, custoEstimadoCentavos: calc.custoEstimadoCentavos, calculadoEm: new Date(), avisoPreco: null, atualizadoPorId: sessao.id } });
            recalculados++;
          }
        }
      }
      await registrarAuditoria(tx, { usuario: sessao, entidade: "Proposta", entidadeId: v.id, acao: "ATUALIZAR", antes, depois: { ...depois, parcelas: cronograma.parcelas.length }, ip });
      return { projetoId: atual.projetoId, recalculados };
    });
    revalidar(v.id, resultado.projetoId);
    return sucesso(undefined, resultado.recalculados > 0 ? `Proposta salva. ${resultado.recalculados} item(ns) recalculado(s) com o novo markup.` : "Proposta salva.");
  });
}

/** Cópia como base de uma proposta nova (novo número, rascunho). Vale para qualquer status. */
export async function duplicarProposta(propostaIdBruto: string): Promise<ResultadoAcao<{ id: string }>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "criar", "proposta")) return falha("Sem permissão.");
  const propostaId = campoIdObrigatorio("Proposta inválida.").safeParse(propostaIdBruto);
  if (!propostaId.success) return falha("Proposta inválida.");

  return executar("propostas.duplicar", async () => {
    const ip = extrairIp(await headers());
    const criada = await prisma.$transaction(async (tx) => {
      const c = await copiarProposta(tx, { usuarioId: sessao.id, origemId: propostaId.data, modo: "NOVA" });
      const projeto = await tx.projeto.findUniqueOrThrow({ where: { id: c.projetoId }, select: { clienteId: true } });
      await registrarInteracao(tx, { tipo: "SISTEMA", texto: `Proposta ${c.numero} criada como cópia da ${c.origemNumero}.`, clienteId: projeto.clienteId, projetoId: c.projetoId, usuarioId: sessao.id });
      await registrarAuditoria(tx, { usuario: sessao, entidade: "Proposta", entidadeId: c.id, acao: "DUPLICAR", depois: { numero: c.numero, origem: c.origemNumero }, ip });
      return c;
    });
    revalidar(criada.id, criada.projetoId);
    return sucesso({ id: criada.id }, `Proposta ${criada.numero} criada como cópia.`);
  });
}

/** Exclusão lógica; só rascunho (proposta enviada tem histórico e se cancela, não se apaga). */
export async function excluirProposta(propostaIdBruto: string): Promise<ResultadoAcao<{ projetoId: string }>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "excluir", "proposta")) return falha("Sem permissão.");
  const propostaId = campoIdObrigatorio("Proposta inválida.").safeParse(propostaIdBruto);
  if (!propostaId.success) return falha("Proposta inválida.");

  return executar("propostas.excluir", async () => {
    const ip = extrairIp(await headers());
    const r = await prisma.$transaction(async (tx) => {
      const p = await exigirRascunho(tx, propostaId.data);
      await tx.proposta.update({ where: { id: p.id }, data: { deletadoEm: new Date(), atualizadoPorId: sessao.id } });
      await registrarAuditoria(tx, { usuario: sessao, entidade: "Proposta", entidadeId: p.id, acao: "EXCLUIR", antes: { numero: p.numero, revisao: p.revisao }, ip });
      await registrarInteracao(tx, { tipo: "SISTEMA", texto: `Proposta ${p.numero} (rascunho) excluída.`, clienteId: p.projeto.clienteId, projetoId: p.projetoId, usuarioId: sessao.id });
      return { projetoId: p.projetoId };
    });
    revalidar(undefined, r.projetoId);
    return sucesso({ projetoId: r.projetoId }, "Rascunho excluído.");
  });
}
