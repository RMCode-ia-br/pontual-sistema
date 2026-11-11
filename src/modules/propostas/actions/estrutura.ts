"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import type { Prisma } from "@/generated/prisma/client";
import { ErroNegocio, executar, falha, falhaDeValidacao, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { registrarAuditoria } from "@/lib/auditoria";
import { extrairIp } from "@/lib/auth/autenticar";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { gerarDescricao, valoresDoTemplate } from "@/lib/dominio/descricao-item";
import { normalizarCabecalho } from "@/lib/dominio/mapeamento";
import { MAXIMO_CENTAVOS } from "@/lib/dominio/preco";
import { mover } from "@/lib/dominio/estrutura-proposta";
import { can } from "@/lib/permissoes";
import { campoIdObrigatorio } from "@/lib/validadores/campos";
import { medidasParaProposta } from "@/modules/visitas/queries";

import { duplicarOpcaoSchema, grupoSchema, itemSchema, opcaoSchema, type EntradaItem } from "../schemas";
import { calcularPrecoDoItem, exigirRascunho, type SaidaCalculoItem } from "../servico";

type Tx = Prisma.TransactionClient;

function revalidar(id: string, projetoId: string) {
  revalidatePath(`/propostas/${id}`);
  revalidatePath("/propostas");
  revalidatePath(`/projetos/${projetoId}`);
}

/** Confere que cada ID de catálogo vindo do navegador existe (nunca confiar no cliente). */
async function conferirCatalogos(tx: Tx, v: { tipologiaId: string | null; linhaId: string | null; acabamentoId: string | null; tipoVidroId: string | null }) {
  const [tipologia, linha, acabamento, vidro] = await Promise.all([
    v.tipologiaId ? tx.tipologia.count({ where: { id: v.tipologiaId, deletadoEm: null } }) : 1,
    v.linhaId ? tx.linhaAluminio.count({ where: { id: v.linhaId, deletadoEm: null } }) : 1,
    v.acabamentoId ? tx.acabamentoAluminio.count({ where: { id: v.acabamentoId, deletadoEm: null } }) : 1,
    v.tipoVidroId ? tx.tipoVidro.count({ where: { id: v.tipoVidroId, deletadoEm: null } }) : 1,
  ]);
  if (!tipologia || !linha || !acabamento || !vidro) throw new ErroNegocio("Um dos itens escolhidos (tipologia, linha, acabamento ou vidro) não foi encontrado. Atualize a página.");
}

async function conferirOpcaoEGrupo(tx: Tx, propostaId: string, opcaoId: string, grupoId: string | null) {
  const opcao = await tx.opcaoProposta.count({ where: { id: opcaoId, propostaId, deletadoEm: null } });
  if (!opcao) throw new ErroNegocio("A opção escolhida não pertence a esta proposta.");
  if (grupoId) {
    const grupo = await tx.grupoProposta.count({ where: { id: grupoId, propostaId, deletadoEm: null } });
    if (!grupo) throw new ErroNegocio("A seção escolhida não pertence a esta proposta.");
  }
}

/** A soma dos itens de qualquer opção tem de caber no inteiro do banco. */
async function conferirTeto(tx: Tx, propostaId: string) {
  const soma = await tx.itemProposta.groupBy({ by: ["opcaoId"], where: { propostaId, deletadoEm: null }, _sum: { precoTotalCentavos: true } });
  if (soma.some((s) => (s._sum.precoTotalCentavos ?? 0) > MAXIMO_CENTAVOS)) throw new ErroNegocio("A soma dos itens passa do valor máximo aceito (R$ 21.474.836,47).");
}

function paraCalculo(v: { modoPreco: "MANUAL" | "TABELA" | "COMPOSICAO"; tipologiaId: string | null; linhaId: string | null; acabamentoId: string | null; tipoVidroId: string | null; espessuraVidroMm: number | null; folhas: number | null; valorManual: number | null; markup: number | null; medidas: { larguraMm: number; alturaMm: number; quantidade: number }[] }, markupPropostaPb: number | null) {
  return {
    modoPreco: v.modoPreco,
    tipologiaId: v.tipologiaId,
    linhaId: v.linhaId,
    acabamentoId: v.acabamentoId,
    tipoVidroId: v.tipoVidroId,
    espessuraVidroMm: v.espessuraVidroMm,
    folhas: v.folhas,
    medidas: v.medidas.map((m) => ({ larguraMm: m.larguraMm, alturaMm: m.alturaMm, quantidade: m.quantidade })),
    valorManualCentavos: v.valorManual,
    markupItemPb: v.markup,
    markupPropostaPb,
  };
}

// ----- Itens -----

/** Prévia do preço (não grava): alimenta o painel do item enquanto a pessoa preenche. */
export async function calcularPreviaDoItem(entrada: EntradaItem): Promise<ResultadoAcao<Extract<SaidaCalculoItem, { ok: true }> | { semTabela: boolean }>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "proposta")) return falha("Sem permissão.");
  const lido = itemSchema.safeParse(entrada);
  if (!lido.success) return falhaDeValidacao(lido.error);
  const v = lido.data;
  return executar("propostas.previa", async () => {
    const proposta = await prisma.proposta.findFirst({ where: { id: v.propostaId, deletadoEm: null }, select: { markupPb: true } });
    if (!proposta) throw new ErroNegocio("Proposta não encontrada.");
    const calc = await calcularPrecoDoItem(prisma, paraCalculo(v, proposta.markupPb));
    if (!calc.ok) return { ok: false, erro: calc.erro, campos: calc.semTabela ? { valorManual: calc.erro } : undefined } as ResultadoAcao<never>;
    return sucesso(calc);
  });
}

export async function salvarItem(entrada: EntradaItem): Promise<ResultadoAcao<{ id: string }>> {
  const sessao = await exigirSessao();
  if (!can(sessao, entrada.id ? "editar" : "criar", "proposta")) return falha("Sem permissão.");
  const lido = itemSchema.safeParse(entrada);
  if (!lido.success) return falhaDeValidacao(lido.error);
  const v = lido.data;

  return executar("propostas.item", async () => {
    const ip = extrairIp(await headers());
    const r = await prisma.$transaction(async (tx) => {
      const proposta = await exigirRascunho(tx, v.propostaId);
      await conferirOpcaoEGrupo(tx, v.propostaId, v.opcaoId, v.grupoId);
      await conferirCatalogos(tx, v);
      const calc = await calcularPrecoDoItem(tx, paraCalculo(v, proposta.markupPb));
      if (!calc.ok) throw new ErroNegocio(calc.erro, calc.semTabela ? { valorManual: calc.erro } : undefined);

      const dados = {
        opcaoId: v.opcaoId,
        grupoId: v.grupoId,
        tipologiaId: v.tipologiaId,
        linhaId: v.linhaId,
        acabamentoId: v.acabamentoId,
        tipoVidroId: v.tipoVidroId,
        espessuraVidroMm: v.espessuraVidroMm,
        folhas: v.folhas,
        faces: v.faces,
        torresCm: v.torresCm,
        descricao: v.descricao,
        descricaoEditada: v.descricaoEditada,
        local: v.local || null,
        observacoes: v.observacoes || null,
        modoPreco: calc.modoPreco,
        cobranca: calc.cobranca,
        valorManualCentavos: v.valorManual,
        precoTotalCentavos: calc.precoTotalCentavos,
        custoEstimadoCentavos: calc.custoEstimadoCentavos,
        markupPb: v.modoPreco === "COMPOSICAO" ? v.markup : null,
        calculadoEm: new Date(),
        avisoPreco: calc.aviso,
      };
      let id: string;
      let antes: Record<string, unknown> | null = null;
      if (v.id) {
        const atual = await tx.itemProposta.findFirst({ where: { id: v.id, propostaId: v.propostaId, deletadoEm: null }, select: { id: true, descricao: true, modoPreco: true, precoTotalCentavos: true, opcaoId: true, grupoId: true } });
        if (!atual) throw new ErroNegocio("Item não encontrado.");
        antes = atual;
        // Trocar de seção/opção leva o item para o fim da nova.
        const mudouDeLugar = atual.opcaoId !== v.opcaoId || atual.grupoId !== v.grupoId;
        const ordem = mudouDeLugar ? ((await tx.itemProposta.aggregate({ where: { propostaId: v.propostaId, opcaoId: v.opcaoId, deletadoEm: null }, _max: { ordem: true } }))._max.ordem ?? -1) + 1 : undefined;
        await tx.itemProposta.update({ where: { id: v.id }, data: { ...dados, ...(ordem === undefined ? {} : { ordem }), atualizadoPorId: sessao.id } });
        await tx.itemPropostaMedida.updateMany({ where: { itemId: v.id, deletadoEm: null }, data: { deletadoEm: new Date(), atualizadoPorId: sessao.id } });
        id = v.id;
      } else {
        const ordem = ((await tx.itemProposta.aggregate({ where: { propostaId: v.propostaId, opcaoId: v.opcaoId, deletadoEm: null }, _max: { ordem: true } }))._max.ordem ?? -1) + 1;
        const novo = await tx.itemProposta.create({ data: { propostaId: v.propostaId, ...dados, ordem, criadoPorId: sessao.id, atualizadoPorId: sessao.id }, select: { id: true } });
        id = novo.id;
      }
      await tx.itemPropostaMedida.createMany({
        data: v.medidas.map((m, ordem) => ({ itemId: id, larguraMm: m.larguraMm, alturaMm: m.alturaMm, quantidade: m.quantidade, local: m.local || null, ordem, criadoPorId: sessao.id, atualizadoPorId: sessao.id })),
      });
      await conferirTeto(tx, v.propostaId);
      await registrarAuditoria(tx, {
        usuario: sessao,
        entidade: "ItemProposta",
        entidadeId: id,
        acao: v.id ? "ATUALIZAR" : "CRIAR",
        antes,
        depois: { propostaId: v.propostaId, descricao: v.descricao, modoPreco: calc.modoPreco, precoTotalCentavos: calc.precoTotalCentavos, medidas: v.medidas },
        ip,
      });
      return { id, projetoId: proposta.projetoId, aviso: calc.aviso };
    });
    revalidar(v.propostaId, r.projetoId);
    return sucesso({ id: r.id }, r.aviso ?? (v.id ? "Item atualizado." : "Item adicionado."));
  });
}

export async function duplicarItem(propostaIdBruto: string, itemIdBruto: string): Promise<ResultadoAcao<{ id: string }>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "criar", "proposta")) return falha("Sem permissão.");
  const propostaId = campoIdObrigatorio().safeParse(propostaIdBruto);
  const itemId = campoIdObrigatorio().safeParse(itemIdBruto);
  if (!propostaId.success || !itemId.success) return falha("Registro inválido.");

  return executar("propostas.item.duplicar", async () => {
    const ip = extrairIp(await headers());
    const r = await prisma.$transaction(async (tx) => {
      const proposta = await exigirRascunho(tx, propostaId.data);
      const o = await tx.itemProposta.findFirst({ where: { id: itemId.data, propostaId: proposta.id, deletadoEm: null }, include: { medidas: { where: { deletadoEm: null }, orderBy: { ordem: "asc" } } } });
      if (!o) throw new ErroNegocio("Item não encontrado.");
      const ordem = ((await tx.itemProposta.aggregate({ where: { propostaId: proposta.id, opcaoId: o.opcaoId, deletadoEm: null }, _max: { ordem: true } }))._max.ordem ?? -1) + 1;
      const copia = await tx.itemProposta.create({
        data: {
          propostaId: proposta.id,
          opcaoId: o.opcaoId,
          grupoId: o.grupoId,
          ordem,
          tipologiaId: o.tipologiaId,
          linhaId: o.linhaId,
          acabamentoId: o.acabamentoId,
          tipoVidroId: o.tipoVidroId,
          espessuraVidroMm: o.espessuraVidroMm,
          folhas: o.folhas,
          faces: o.faces,
          torresCm: o.torresCm,
          descricao: o.descricao,
          descricaoEditada: o.descricaoEditada,
          local: o.local,
          observacoes: o.observacoes,
          modoPreco: o.modoPreco,
          cobranca: o.cobranca,
          valorManualCentavos: o.valorManualCentavos,
          precoTotalCentavos: o.precoTotalCentavos,
          custoEstimadoCentavos: o.custoEstimadoCentavos,
          markupPb: o.markupPb,
          calculadoEm: o.calculadoEm,
          avisoPreco: o.avisoPreco,
          medidas: { create: o.medidas.map((m) => ({ larguraMm: m.larguraMm, alturaMm: m.alturaMm, quantidade: m.quantidade, local: m.local, ordem: m.ordem, criadoPorId: sessao.id, atualizadoPorId: sessao.id })) },
          criadoPorId: sessao.id,
          atualizadoPorId: sessao.id,
        },
        select: { id: true },
      });
      await conferirTeto(tx, proposta.id);
      await registrarAuditoria(tx, { usuario: sessao, entidade: "ItemProposta", entidadeId: copia.id, acao: "DUPLICAR", depois: { origem: o.id }, ip });
      return { id: copia.id, projetoId: proposta.projetoId };
    });
    revalidar(propostaId.data, r.projetoId);
    return sucesso({ id: r.id }, "Item duplicado.");
  });
}

export async function removerItem(propostaIdBruto: string, itemIdBruto: string): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "excluir", "proposta")) return falha("Sem permissão.");
  const propostaId = campoIdObrigatorio().safeParse(propostaIdBruto);
  const itemId = campoIdObrigatorio().safeParse(itemIdBruto);
  if (!propostaId.success || !itemId.success) return falha("Registro inválido.");

  return executar("propostas.item.remover", async () => {
    const ip = extrairIp(await headers());
    const projetoId = await prisma.$transaction(async (tx) => {
      const proposta = await exigirRascunho(tx, propostaId.data);
      const antes = await tx.itemProposta.findFirst({ where: { id: itemId.data, propostaId: proposta.id, deletadoEm: null }, select: { id: true, descricao: true, precoTotalCentavos: true } });
      if (!antes) throw new ErroNegocio("Item não encontrado.");
      await tx.itemProposta.update({ where: { id: antes.id }, data: { deletadoEm: new Date(), atualizadoPorId: sessao.id } });
      await tx.itemPropostaMedida.updateMany({ where: { itemId: antes.id, deletadoEm: null }, data: { deletadoEm: new Date(), atualizadoPorId: sessao.id } });
      await registrarAuditoria(tx, { usuario: sessao, entidade: "ItemProposta", entidadeId: antes.id, acao: "EXCLUIR", antes, ip });
      return proposta.projetoId;
    });
    revalidar(propostaId.data, projetoId);
    return sucesso(undefined, "Item removido.");
  });
}

/** Sobe ou desce o item dentro da própria seção (a numeração é sempre automática). */
export async function moverItem(propostaIdBruto: string, itemIdBruto: string, direcao: "acima" | "abaixo"): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "proposta")) return falha("Sem permissão.");
  const propostaId = campoIdObrigatorio().safeParse(propostaIdBruto);
  const itemId = campoIdObrigatorio().safeParse(itemIdBruto);
  if (!propostaId.success || !itemId.success || (direcao !== "acima" && direcao !== "abaixo")) return falha("Registro inválido.");

  return executar("propostas.item.mover", async () => {
    const projetoId = await prisma.$transaction(async (tx) => {
      const proposta = await exigirRascunho(tx, propostaId.data);
      const item = await tx.itemProposta.findFirst({ where: { id: itemId.data, propostaId: proposta.id, deletadoEm: null }, select: { id: true, opcaoId: true, grupoId: true } });
      if (!item) throw new ErroNegocio("Item não encontrado.");
      const irmaos = await tx.itemProposta.findMany({ where: { propostaId: proposta.id, opcaoId: item.opcaoId, grupoId: item.grupoId, deletadoEm: null }, orderBy: [{ ordem: "asc" }, { id: "asc" }], select: { id: true } });
      const nova = mover(irmaos, item.id, direcao);
      if (!nova) return proposta.projetoId;
      for (const [ordem, id] of nova.entries()) await tx.itemProposta.update({ where: { id }, data: { ordem, atualizadoPorId: sessao.id } });
      return proposta.projetoId;
    });
    revalidar(propostaId.data, projetoId);
    return sucesso();
  });
}

// ----- Opções -----

export async function salvarOpcao(entrada: { id?: string | null; propostaId: string; nome: string; desconto?: string }): Promise<ResultadoAcao<{ id: string }>> {
  const sessao = await exigirSessao();
  if (!can(sessao, entrada.id ? "editar" : "criar", "proposta")) return falha("Sem permissão.");
  const lido = opcaoSchema.safeParse(entrada);
  if (!lido.success) return falhaDeValidacao(lido.error);
  const v = lido.data;

  return executar("propostas.opcao", async () => {
    const ip = extrairIp(await headers());
    const r = await prisma.$transaction(async (tx) => {
      const proposta = await exigirRascunho(tx, v.propostaId);
      let id: string;
      if (v.id) {
        const atual = await tx.opcaoProposta.findFirst({ where: { id: v.id, propostaId: proposta.id, deletadoEm: null }, select: { id: true, nome: true, descontoCentavos: true } });
        if (!atual) throw new ErroNegocio("Opção não encontrada.");
        await tx.opcaoProposta.update({ where: { id: v.id }, data: { nome: v.nome, descontoCentavos: v.desconto ?? 0, atualizadoPorId: sessao.id } });
        await registrarAuditoria(tx, { usuario: sessao, entidade: "OpcaoProposta", entidadeId: v.id, acao: "ATUALIZAR", antes: atual, depois: { nome: v.nome, descontoCentavos: v.desconto ?? 0 }, ip });
        id = v.id;
      } else {
        const ordem = ((await tx.opcaoProposta.aggregate({ where: { propostaId: proposta.id, deletadoEm: null }, _max: { ordem: true } }))._max.ordem ?? -1) + 1;
        const nova = await tx.opcaoProposta.create({ data: { propostaId: proposta.id, nome: v.nome, ordem, descontoCentavos: v.desconto ?? 0, criadoPorId: sessao.id, atualizadoPorId: sessao.id }, select: { id: true } });
        await registrarAuditoria(tx, { usuario: sessao, entidade: "OpcaoProposta", entidadeId: nova.id, acao: "CRIAR", depois: { nome: v.nome }, ip });
        id = nova.id;
      }
      return { id, projetoId: proposta.projetoId };
    });
    revalidar(v.propostaId, r.projetoId);
    return sucesso({ id: r.id }, "Opção salva.");
  });
}

export async function removerOpcao(propostaIdBruto: string, opcaoIdBruto: string): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "excluir", "proposta")) return falha("Sem permissão.");
  const propostaId = campoIdObrigatorio().safeParse(propostaIdBruto);
  const opcaoId = campoIdObrigatorio().safeParse(opcaoIdBruto);
  if (!propostaId.success || !opcaoId.success) return falha("Registro inválido.");

  return executar("propostas.opcao.remover", async () => {
    const ip = extrairIp(await headers());
    const projetoId = await prisma.$transaction(async (tx) => {
      const proposta = await exigirRascunho(tx, propostaId.data);
      const opcoes = await tx.opcaoProposta.findMany({ where: { propostaId: proposta.id, deletadoEm: null }, select: { id: true, nome: true } });
      const alvo = opcoes.find((o) => o.id === opcaoId.data);
      if (!alvo) throw new ErroNegocio("Opção não encontrada.");
      if (opcoes.length <= 1) throw new ErroNegocio("A proposta precisa ter ao menos uma opção.");
      const agora = new Date();
      const itens = await tx.itemProposta.findMany({ where: { opcaoId: alvo.id, deletadoEm: null }, select: { id: true } });
      await tx.itemPropostaMedida.updateMany({ where: { itemId: { in: itens.map((i) => i.id) }, deletadoEm: null }, data: { deletadoEm: agora, atualizadoPorId: sessao.id } });
      await tx.itemProposta.updateMany({ where: { opcaoId: alvo.id, deletadoEm: null }, data: { deletadoEm: agora, atualizadoPorId: sessao.id } });
      await tx.opcaoProposta.update({ where: { id: alvo.id }, data: { deletadoEm: agora, atualizadoPorId: sessao.id } });
      await registrarAuditoria(tx, { usuario: sessao, entidade: "OpcaoProposta", entidadeId: alvo.id, acao: "EXCLUIR", antes: { nome: alvo.nome, itens: itens.length }, ip });
      return proposta.projetoId;
    });
    revalidar(propostaId.data, projetoId);
    return sucesso(undefined, "Opção removida.");
  });
}

/**
 * Copia a opção com todos os itens e, se pedido, troca linha/acabamento/vidro/espessura de TODOS os itens copiados
 * recalculando o preço de cada um. Item que não puder ser recalculado (ex.: sem preço na tabela) mantém o valor
 * anterior e fica com aviso para revisar.
 */
export async function duplicarOpcao(entrada: { propostaId: string; opcaoId: string; nome: string; linhaId?: string | null; acabamentoId?: string | null; tipoVidroId?: string | null; espessuraVidroMm?: string }): Promise<ResultadoAcao<{ id: string; avisos: number }>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "criar", "proposta")) return falha("Sem permissão.");
  const lido = duplicarOpcaoSchema.safeParse(entrada);
  if (!lido.success) return falhaDeValidacao(lido.error);
  const v = lido.data;

  return executar("propostas.opcao.duplicar", async () => {
    const ip = extrairIp(await headers());
    const r = await prisma.$transaction(async (tx) => {
      const proposta = await exigirRascunho(tx, v.propostaId);
      const origem = await tx.opcaoProposta.findFirst({ where: { id: v.opcaoId, propostaId: proposta.id, deletadoEm: null } });
      if (!origem) throw new ErroNegocio("Opção não encontrada.");
      await conferirCatalogos(tx, { tipologiaId: null, linhaId: v.linhaId, acabamentoId: v.acabamentoId, tipoVidroId: v.tipoVidroId });
      const ordem = ((await tx.opcaoProposta.aggregate({ where: { propostaId: proposta.id, deletadoEm: null }, _max: { ordem: true } }))._max.ordem ?? -1) + 1;
      const nova = await tx.opcaoProposta.create({ data: { propostaId: proposta.id, nome: v.nome, ordem, descontoCentavos: origem.descontoCentavos, criadoPorId: sessao.id, atualizadoPorId: sessao.id }, select: { id: true } });
      const itens = await tx.itemProposta.findMany({ where: { opcaoId: origem.id, deletadoEm: null }, orderBy: { ordem: "asc" }, include: { medidas: { where: { deletadoEm: null }, orderBy: { ordem: "asc" } } } });
      let avisos = 0;
      // Nomes do catálogo e modelos das tipologias, para REGERAR a descrição dos itens copiados (o texto leva linha,
      // vidro e espessura: copiar sem regerar imprimiria "LINHA SUPREMA" numa opção Gold).
      const [linhasCat, acabCat, vidrosCat, tipologiasCat, cabecalho] = await Promise.all([
        tx.linhaAluminio.findMany({ select: { id: true, nome: true } }),
        tx.acabamentoAluminio.findMany({ select: { id: true, nome: true } }),
        tx.tipoVidro.findMany({ select: { id: true, nome: true } }),
        tx.tipologia.findMany({ where: { id: { in: [...new Set(itens.flatMap((x) => (x.tipologiaId ? [x.tipologiaId] : [])))] } }, select: { id: true, templateDescricao: true } }),
        tx.proposta.findUniqueOrThrow({ where: { id: proposta.id }, select: { descricoesMaiusculas: true } }),
      ]);
      const nomeDe = (lista: { id: string; nome: string }[], id: string | null) => (id ? (lista.find((x) => x.id === id)?.nome ?? null) : null);
      for (const i of itens) {
        const trocas = {
          linhaId: v.linhaId ?? i.linhaId,
          acabamentoId: v.acabamentoId ?? i.acabamentoId,
          tipoVidroId: v.tipoVidroId ?? i.tipoVidroId,
          espessuraVidroMm: v.espessuraVidroMm ?? i.espessuraVidroMm,
        };
        const mudou = trocas.linhaId !== i.linhaId || trocas.acabamentoId !== i.acabamentoId || trocas.tipoVidroId !== i.tipoVidroId || trocas.espessuraVidroMm !== i.espessuraVidroMm;
        let modoPreco = i.modoPreco;
        let preco = i.precoTotalCentavos;
        let custo = i.custoEstimadoCentavos;
        let aviso = i.avisoPreco;
        let cobranca = i.cobranca;
        let descricao = i.descricao;
        if (mudou) {
          const modelo = i.tipologiaId ? tipologiasCat.find((t) => t.id === i.tipologiaId)?.templateDescricao : null;
          if (!i.descricaoEditada && modelo) {
            const g = gerarDescricao(
              modelo,
              valoresDoTemplate({ folhas: i.folhas, faces: i.faces, torresCm: i.torresCm, linha: nomeDe(linhasCat, trocas.linhaId), tipoVidro: nomeDe(vidrosCat, trocas.tipoVidroId), espessuraMm: trocas.espessuraVidroMm, acabamento: nomeDe(acabCat, trocas.acabamentoId) }),
              i.medidas.map((m) => ({ larguraMm: m.larguraMm, alturaMm: m.alturaMm, quantidade: m.quantidade })),
            );
            descricao = cabecalho.descricoesMaiusculas ? g.texto.toUpperCase() : g.texto;
          } else {
            // Descrição editada à mão (ou item livre): não dá para regerar; avisa para conferir.
            avisos++;
            aviso = `Revisar a descrição: ela foi escrita à mão e ainda cita a combinação anterior.${aviso ? ` ${aviso}` : ""}`;
          }
        }
        if (mudou && i.modoPreco !== "MANUAL") {
          const calc = await calcularPrecoDoItem(tx, {
            modoPreco: i.modoPreco,
            tipologiaId: i.tipologiaId,
            ...trocas,
            folhas: i.folhas,
            medidas: i.medidas.map((m) => ({ larguraMm: m.larguraMm, alturaMm: m.alturaMm, quantidade: m.quantidade })),
            valorManualCentavos: i.valorManualCentavos,
            markupItemPb: i.markupPb,
            markupPropostaPb: proposta.markupPb,
          });
          if (calc.ok) {
            modoPreco = calc.modoPreco;
            preco = calc.precoTotalCentavos;
            custo = calc.custoEstimadoCentavos;
            aviso = calc.aviso;
            cobranca = calc.cobranca;
          } else {
            aviso = `Revisar: não foi possível recalcular com a nova combinação (${calc.erro}) Mantido o valor anterior.`;
            avisos++;
          }
        } else if (mudou) {
          aviso = "Combinação trocada: confira o valor manual.";
          avisos++;
        }
        await tx.itemProposta.create({
          data: {
            propostaId: proposta.id,
            opcaoId: nova.id,
            grupoId: i.grupoId,
            ordem: i.ordem,
            tipologiaId: i.tipologiaId,
            ...trocas,
            folhas: i.folhas,
            faces: i.faces,
            torresCm: i.torresCm,
            descricao,
            descricaoEditada: i.descricaoEditada,
            local: i.local,
            observacoes: i.observacoes,
            modoPreco,
            cobranca,
            valorManualCentavos: i.valorManualCentavos,
            precoTotalCentavos: preco,
            custoEstimadoCentavos: custo,
            markupPb: i.markupPb,
            calculadoEm: new Date(),
            avisoPreco: aviso,
            medidas: { create: i.medidas.map((m) => ({ larguraMm: m.larguraMm, alturaMm: m.alturaMm, quantidade: m.quantidade, local: m.local, ordem: m.ordem, criadoPorId: sessao.id, atualizadoPorId: sessao.id })) },
            criadoPorId: sessao.id,
            atualizadoPorId: sessao.id,
          },
        });
      }
      await conferirTeto(tx, proposta.id);
      await registrarAuditoria(tx, { usuario: sessao, entidade: "OpcaoProposta", entidadeId: nova.id, acao: "DUPLICAR", depois: { origem: origem.id, itens: itens.length, trocas: { linhaId: v.linhaId, acabamentoId: v.acabamentoId, tipoVidroId: v.tipoVidroId, espessuraVidroMm: v.espessuraVidroMm } }, ip });
      return { id: nova.id, projetoId: proposta.projetoId, avisos };
    });
    revalidar(v.propostaId, r.projetoId);
    return sucesso({ id: r.id, avisos: r.avisos }, r.avisos > 0 ? `Opção duplicada. ${r.avisos} item(ns) precisam de revisão.` : "Opção duplicada.");
  });
}

// ----- Seções (grupos) -----

export async function salvarGrupo(entrada: { id?: string | null; propostaId: string; nome: string }): Promise<ResultadoAcao<{ id: string }>> {
  const sessao = await exigirSessao();
  if (!can(sessao, entrada.id ? "editar" : "criar", "proposta")) return falha("Sem permissão.");
  const lido = grupoSchema.safeParse(entrada);
  if (!lido.success) return falhaDeValidacao(lido.error);
  const v = lido.data;

  return executar("propostas.grupo", async () => {
    const ip = extrairIp(await headers());
    const r = await prisma.$transaction(async (tx) => {
      const proposta = await exigirRascunho(tx, v.propostaId);
      let id: string;
      if (v.id) {
        const atual = await tx.grupoProposta.findFirst({ where: { id: v.id, propostaId: proposta.id, deletadoEm: null }, select: { nome: true } });
        if (!atual) throw new ErroNegocio("Seção não encontrada.");
        await tx.grupoProposta.update({ where: { id: v.id }, data: { nome: v.nome, atualizadoPorId: sessao.id } });
        await registrarAuditoria(tx, { usuario: sessao, entidade: "GrupoProposta", entidadeId: v.id, acao: "ATUALIZAR", antes: atual, depois: { nome: v.nome }, ip });
        id = v.id;
      } else {
        const ordem = ((await tx.grupoProposta.aggregate({ where: { propostaId: proposta.id, deletadoEm: null }, _max: { ordem: true } }))._max.ordem ?? -1) + 1;
        const novo = await tx.grupoProposta.create({ data: { propostaId: proposta.id, nome: v.nome, ordem, criadoPorId: sessao.id, atualizadoPorId: sessao.id }, select: { id: true } });
        await registrarAuditoria(tx, { usuario: sessao, entidade: "GrupoProposta", entidadeId: novo.id, acao: "CRIAR", depois: { nome: v.nome }, ip });
        id = novo.id;
      }
      return { id, projetoId: proposta.projetoId };
    });
    revalidar(v.propostaId, r.projetoId);
    return sucesso({ id: r.id }, "Seção salva.");
  });
}

export async function moverGrupo(propostaIdBruto: string, grupoIdBruto: string, direcao: "acima" | "abaixo"): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "proposta")) return falha("Sem permissão.");
  const propostaId = campoIdObrigatorio().safeParse(propostaIdBruto);
  const grupoId = campoIdObrigatorio().safeParse(grupoIdBruto);
  if (!propostaId.success || !grupoId.success || (direcao !== "acima" && direcao !== "abaixo")) return falha("Registro inválido.");

  return executar("propostas.grupo.mover", async () => {
    const projetoId = await prisma.$transaction(async (tx) => {
      const proposta = await exigirRascunho(tx, propostaId.data);
      const grupos = await tx.grupoProposta.findMany({ where: { propostaId: proposta.id, deletadoEm: null }, orderBy: [{ ordem: "asc" }, { id: "asc" }], select: { id: true } });
      if (!grupos.some((g) => g.id === grupoId.data)) throw new ErroNegocio("Seção não encontrada.");
      const nova = mover(grupos, grupoId.data, direcao);
      if (nova) for (const [ordem, id] of nova.entries()) await tx.grupoProposta.update({ where: { id }, data: { ordem, atualizadoPorId: sessao.id } });
      return proposta.projetoId;
    });
    revalidar(propostaId.data, projetoId);
    return sucesso();
  });
}

/** Remove a seção; os itens dela continuam na proposta, sem seção. */
export async function removerGrupo(propostaIdBruto: string, grupoIdBruto: string): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "excluir", "proposta")) return falha("Sem permissão.");
  const propostaId = campoIdObrigatorio().safeParse(propostaIdBruto);
  const grupoId = campoIdObrigatorio().safeParse(grupoIdBruto);
  if (!propostaId.success || !grupoId.success) return falha("Registro inválido.");

  return executar("propostas.grupo.remover", async () => {
    const ip = extrairIp(await headers());
    const projetoId = await prisma.$transaction(async (tx) => {
      const proposta = await exigirRascunho(tx, propostaId.data);
      const alvo = await tx.grupoProposta.findFirst({ where: { id: grupoId.data, propostaId: proposta.id, deletadoEm: null }, select: { id: true, nome: true } });
      if (!alvo) throw new ErroNegocio("Seção não encontrada.");
      await tx.itemProposta.updateMany({ where: { grupoId: alvo.id, deletadoEm: null }, data: { grupoId: null, atualizadoPorId: sessao.id } });
      await tx.grupoProposta.update({ where: { id: alvo.id }, data: { deletadoEm: new Date(), atualizadoPorId: sessao.id } });
      await registrarAuditoria(tx, { usuario: sessao, entidade: "GrupoProposta", entidadeId: alvo.id, acao: "EXCLUIR", antes: alvo, ip });
      return proposta.projetoId;
    });
    revalidar(propostaId.data, projetoId);
    return sucesso(undefined, "Seção removida. Os itens continuam na proposta.");
  });
}

// ----- Importar medidas da visita (R9) -----

/**
 * Cria itens a partir das medidas-rascunho COMPLETAS do projeto. Nunca inventa: o valor do item entra como manual
 * zerado (a pessoa preenche) e medidas sem largura/altura ficam de fora e são contadas no retorno.
 */
export async function importarMedidasDaVisita(propostaIdBruto: string, opcaoIdBruto: string): Promise<ResultadoAcao<{ criados: number; incompletas: number }>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "criar", "proposta")) return falha("Sem permissão.");
  const propostaId = campoIdObrigatorio().safeParse(propostaIdBruto);
  const opcaoId = campoIdObrigatorio().safeParse(opcaoIdBruto);
  if (!propostaId.success || !opcaoId.success) return falha("Registro inválido.");

  return executar("propostas.importar-visita", async () => {
    const ip = extrairIp(await headers());
    const base = await prisma.proposta.findFirst({ where: { id: propostaId.data, deletadoEm: null }, select: { projetoId: true } });
    if (!base) throw new ErroNegocio("Proposta não encontrada.");
    const { prontas, incompletas } = await medidasParaProposta(base.projetoId);
    if (prontas.length === 0) throw new ErroNegocio(incompletas.length > 0 ? "As medidas da visita estão incompletas (falta largura ou altura)." : "Este projeto não tem medidas anotadas na visita.");

    const r = await prisma.$transaction(async (tx) => {
      const proposta = await exigirRascunho(tx, propostaId.data);
      await conferirOpcaoEGrupo(tx, proposta.id, opcaoId.data, null);
      const tipologias = await tx.tipologia.findMany({ where: { deletadoEm: null, ativo: true }, select: { id: true, nome: true, templateDescricao: true, opcoesFolhas: true } });
      const norm = tipologias.map((t) => ({ ...t, chave: normalizarCabecalho(t.nome) }));
      let ordem = ((await tx.itemProposta.aggregate({ where: { propostaId: proposta.id, opcaoId: opcaoId.data, deletadoEm: null }, _max: { ordem: true } }))._max.ordem ?? -1) + 1;
      for (const m of prontas) {
        const chaveVao = normalizarCabecalho(m.tipologia ?? "");
        const tipologia = chaveVao ? (norm.find((t) => t.chave === chaveVao) ?? norm.find((t) => t.chave.includes(chaveVao) || chaveVao.includes(t.chave))) : undefined;
        const medidas = [{ larguraMm: m.larguraMm, alturaMm: m.alturaMm, quantidade: m.quantidade }];
        const gerada = tipologia ? gerarDescricao(tipologia.templateDescricao, {}, medidas) : null;
        const descricao = gerada?.texto || `${m.tipologia ?? "Item"}${m.ambiente ? ` — ${m.ambiente}` : ""} (completar descrição)`;
        await tx.itemProposta.create({
          data: {
            propostaId: proposta.id,
            opcaoId: opcaoId.data,
            ordem: ordem++,
            tipologiaId: tipologia?.id ?? null,
            descricao,
            local: m.ambiente,
            modoPreco: "MANUAL",
            valorManualCentavos: null,
            precoTotalCentavos: 0,
            avisoPreco: "Importado da visita: informe o valor e complete a descrição.",
            medidas: { create: [{ larguraMm: m.larguraMm, alturaMm: m.alturaMm, quantidade: m.quantidade, local: m.ambiente, ordem: 0, criadoPorId: sessao.id, atualizadoPorId: sessao.id }] },
            criadoPorId: sessao.id,
            atualizadoPorId: sessao.id,
          },
        });
      }
      await registrarAuditoria(tx, { usuario: sessao, entidade: "Proposta", entidadeId: proposta.id, acao: "IMPORTAR_MEDIDAS_VISITA", depois: { itens: prontas.length, incompletas: incompletas.length }, ip });
      return { projetoId: proposta.projetoId };
    });
    revalidar(propostaId.data, r.projetoId);
    return sucesso({ criados: prontas.length, incompletas: incompletas.length }, `${prontas.length} item(ns) criado(s) com as medidas da visita.${incompletas.length > 0 ? ` ${incompletas.length} medida(s) incompleta(s) ficaram de fora.` : ""}`);
  });
}
