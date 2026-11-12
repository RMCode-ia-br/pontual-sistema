"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { ErroNegocio, executar, falha, falhaDeValidacao, formDataParaObjeto, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { registrarAuditoria } from "@/lib/auditoria";
import { extrairIp } from "@/lib/auth/autenticar";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { grupoCombinaComTipo, ROTULO_GRUPO_DRE, type GrupoDreChave } from "@/lib/dominio/dre";
import { can } from "@/lib/permissoes";

import {
  dadosItemSchema,
  definicaoPorSlug,
  espessuraSchema,
  nomeCatalogoSchema,
  slugSchema,
  type DefinicaoCatalogo,
  type SlugCatalogo,
} from "./definicoes";
import { delegadoDoCatalogo, listarCatalogo } from "./repositorio";

const CAMINHO = "/configuracoes/catalogos";
const idSchema = z.string().min(1).max(64);

/** Valida o formulário conforme o tipo de catálogo e devolve só os campos que vão ao banco. */
function lerDados(def: DefinicaoCatalogo, bruto: Record<string, string>, criando: boolean):
  | { ok: true; dados: Record<string, unknown> }
  | { ok: false; resultado: ResultadoAcao<never> } {
  const base = dadosItemSchema.safeParse(bruto);
  if (!base.success) return { ok: false, resultado: falhaDeValidacao(base.error) };

  const dados: Record<string, unknown> = {};

  if (def.extra === "espessura") {
    const mm = espessuraSchema.safeParse(base.data.nome);
    // O valor é validado fora do esquema do formulário, então o erro precisa ser ligado ao campo "nome".
    if (!mm.success) return { ok: false, resultado: falha(mm.error.issues[0].message, { nome: mm.error.issues[0].message }) };
    dados.mm = mm.data;
  } else {
    const nome = nomeCatalogoSchema.safeParse(base.data.nome);
    if (!nome.success) return { ok: false, resultado: falha(nome.error.issues[0].message, { nome: nome.error.issues[0].message }) };
    dados.nome = nome.data;
  }

  if (def.extra === "justificado") dados.justificado = base.data.justificado;

  if (def.extra === "financeira") {
    if (criando) {
      if (!base.data.tipo) return { ok: false, resultado: falha("Escolha se é receita ou despesa.", { tipo: "Escolha se é receita ou despesa." }) };
      dados.tipo = base.data.tipo; // o tipo não muda depois de criado (afetaria o histórico do DRE)
    }
    const grupo = base.data.grupo;
    if (!grupo) return { ok: false, resultado: falha("Escolha o grupo no DRE.", { grupo: "Escolha o grupo no DRE." }) };
    if (criando && base.data.tipo && !grupoCombinaComTipo(base.data.tipo, grupo)) {
      return { ok: false, resultado: falha("Esse grupo não combina com o tipo escolhido.", { grupo: "Esse grupo não combina com o tipo escolhido." }) };
    }
    dados.grupo = grupo;
    dados.grupoDre = ROTULO_GRUPO_DRE[grupo]; // texto antigo, mantido coerente por compatibilidade
  }
  return { ok: true, dados };
}

function definicaoOuFalha(slugBruto: string): { def: DefinicaoCatalogo; slug: SlugCatalogo } | null {
  const slug = slugSchema.safeParse(slugBruto);
  if (!slug.success) return null;
  const def = definicaoPorSlug(slug.data);
  return def ? { def, slug: slug.data } : null;
}

export async function criarItemCatalogo(slugBruto: string, _anterior: ResultadoAcao | null, formData: FormData): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "criar", "catalogo")) return falha("Sem permissão.");
  const alvo = definicaoOuFalha(slugBruto);
  if (!alvo) return falha("Catálogo inválido.");

  const lido = lerDados(alvo.def, formDataParaObjeto(formData), true);
  if (!lido.ok) return lido.resultado;

  return executar(
    "catalogos.criar",
    async () => {
      const ip = extrairIp(await headers());
      await prisma.$transaction(async (tx) => {
        const delegado = delegadoDoCatalogo(alvo.slug, tx);
        const ultimo = await delegado.findMany({ where: { deletadoEm: null }, orderBy: { ordem: "desc" }, take: 1 });
        const ordem = ultimo.length > 0 ? Number(ultimo[0].ordem) + 1 : 0;
        const criado = await delegado.create({
          data: { ...lido.dados, ordem, criadoPorId: sessao.id, atualizadoPorId: sessao.id },
        });
        await registrarAuditoria(tx, { usuario: sessao, entidade: alvo.def.entidade, entidadeId: String(criado.id), acao: "CRIAR", depois: criado, ip });
      });
      revalidatePath(CAMINHO);
      return sucesso(undefined, "Item adicionado.");
    },
    "Já existe um item com esse nome.",
  );
}

export async function editarItemCatalogo(slugBruto: string, idBruto: string, _anterior: ResultadoAcao | null, formData: FormData): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "catalogo")) return falha("Sem permissão.");
  const alvo = definicaoOuFalha(slugBruto);
  const id = idSchema.safeParse(idBruto);
  if (!alvo || !id.success) return falha("Item inválido.");

  const lido = lerDados(alvo.def, formDataParaObjeto(formData), false);
  if (!lido.ok) return lido.resultado;

  return executar(
    "catalogos.editar",
    async () => {
      const ip = extrairIp(await headers());
      await prisma.$transaction(async (tx) => {
        const delegado = delegadoDoCatalogo(alvo.slug, tx);
        const antes = await delegado.findFirst({ where: { id: id.data, deletadoEm: null } });
        if (!antes) throw new ErroNegocio("Item não encontrado.");
        if (alvo.def.extra === "financeira" && !grupoCombinaComTipo(antes.tipo as "RECEITA" | "DESPESA", lido.dados.grupo as GrupoDreChave)) {
          throw new ErroNegocio("Esse grupo não combina com o tipo da categoria.", { grupo: "Esse grupo não combina com o tipo da categoria." });
        }
        const depois = await delegado.update({ where: { id: id.data }, data: { ...lido.dados, atualizadoPorId: sessao.id } });
        await registrarAuditoria(tx, { usuario: sessao, entidade: alvo.def.entidade, entidadeId: id.data, acao: "ATUALIZAR", antes, depois, ip });
      });
      revalidatePath(CAMINHO);
      return sucesso(undefined, "Item atualizado.");
    },
    "Já existe um item com esse nome.",
  );
}

export async function alternarAtivoItemCatalogo(slugBruto: string, idBruto: string, ativo: boolean): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "catalogo")) return falha("Sem permissão.");
  const alvo = definicaoOuFalha(slugBruto);
  const id = idSchema.safeParse(idBruto);
  if (!alvo || !id.success) return falha("Item inválido.");

  return executar("catalogos.alternarAtivo", async () => {
    const ip = extrairIp(await headers());
    await prisma.$transaction(async (tx) => {
      const delegado = delegadoDoCatalogo(alvo.slug, tx);
      const antes = await delegado.findFirst({ where: { id: id.data, deletadoEm: null } });
      if (!antes) throw new ErroNegocio("Item não encontrado.");
      if (Boolean(antes.ativo) === ativo) return;
      const depois = await delegado.update({ where: { id: id.data }, data: { ativo, atualizadoPorId: sessao.id } });
      await registrarAuditoria(tx, {
        usuario: sessao,
        entidade: alvo.def.entidade,
        entidadeId: id.data,
        acao: ativo ? "ATIVAR" : "DESATIVAR",
        antes,
        depois,
        ip,
      });
    });
    revalidatePath(CAMINHO);
    return sucesso(undefined, ativo ? "Item ativado." : "Item desativado. Ele deixa de aparecer nas escolhas, mas o histórico é mantido.");
  });
}

/** Sobe ou desce um item na ordem de exibição (troca de lugar com o vizinho). */
export async function moverItemCatalogo(slugBruto: string, idBruto: string, direcao: "cima" | "baixo"): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "catalogo")) return falha("Sem permissão.");
  const alvo = definicaoOuFalha(slugBruto);
  const id = idSchema.safeParse(idBruto);
  if (!alvo || !id.success || (direcao !== "cima" && direcao !== "baixo")) return falha("Item inválido.");

  return executar("catalogos.mover", async () => {
    const ip = extrairIp(await headers());
    await prisma.$transaction(async (tx) => {
      // Duas reordenações simultâneas do mesmo catálogo não podem se sobrescrever: serializa por catálogo.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`catalogo:${alvo.slug}`}))`;

      // Lê e escreve dentro da MESMA transação (a lista não pode mudar entre a leitura e a escrita).
      const lista = await listarCatalogo(alvo.slug, tx);
      const itemAtual = lista.find((i) => i.id === id.data);
      if (!itemAtual) throw new ErroNegocio("Item não encontrado.");
      const grupo = alvo.slug === "categorias-financeiras" ? lista.filter((i) => i.tipo === itemAtual.tipo) : lista;
      const posicao = grupo.findIndex((i) => i.id === id.data);
      const vizinho = grupo[direcao === "cima" ? posicao - 1 : posicao + 1];
      if (!vizinho) return;

      // Normaliza as posições (0..n) e troca as duas, para funcionar mesmo com ordens repetidas.
      const antes = grupo.map((i) => i.id);
      const reordenado = [...antes];
      [reordenado[posicao], reordenado[reordenado.indexOf(vizinho.id)]] = [vizinho.id, id.data];

      const delegado = delegadoDoCatalogo(alvo.slug, tx);
      for (const [indice, itemId] of reordenado.entries()) {
        await delegado.update({ where: { id: itemId }, data: { ordem: indice, atualizadoPorId: sessao.id } });
      }
      await registrarAuditoria(tx, {
        usuario: sessao,
        entidade: alvo.def.entidade,
        entidadeId: id.data,
        acao: "REORDENAR",
        antes: { ordem: antes },
        depois: { ordem: reordenado },
        ip,
      });
    });
    revalidatePath(CAMINHO);
    return sucesso();
  });
}

