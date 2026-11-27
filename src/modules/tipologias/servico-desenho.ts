import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { ErroNegocio } from "@/lib/acoes";
import { registrarAuditoria } from "@/lib/auditoria";
import {
  aplicarTamanhoNaConfig,
  CATEGORIA_DESENHO_DA_TIPOLOGIA,
  ENTIDADE_DO_DESENHO_DA_TIPOLOGIA,
  type TamanhoDoDesenho,
} from "@/lib/dominio/desenho-item";
import type { ImagemGravada } from "@/lib/imagem/envio";
import { aposentarDesenhoSeSemUso, exigirConfigDoDesenho } from "@/modules/propostas/servico-desenho";

import { TIPOS_DESENHO } from "./schemas";

type Db = Prisma.TransactionClient;
type Usuario = { id: string; nome: string };

export const MENSAGEM_NOME_REPETIDO = "Já existe uma tipologia com esse nome.";

/** Trava a tipologia viva (FOR UPDATE): definir, trocar, remover e mudar o tamanho do desenho nunca andam juntos. */
async function tipologiaEditavel(tx: Db, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "Tipologia" WHERE "id" = ${id} FOR UPDATE`;
  const t = await tx.tipologia.findFirst({ where: { id, deletadoEm: null }, select: { id: true, nome: true, desenhoAnexoId: true, desenhoConfig: true } });
  if (!t) throw new ErroNegocio("Tipologia não encontrada.");
  return t;
}

/** Registra a imagem já processada e gravada no Storage como o desenho da tipologia (troca a anterior, se houver). */
export async function definirDesenhoDaTipologia(
  tx: Db,
  e: { usuario: Usuario; tipologiaId: string; imagem: ImagemGravada; ip?: string | null },
): Promise<{ anexoId: string }> {
  const t = await tipologiaEditavel(tx, e.tipologiaId);
  const anexo = await tx.anexo.create({
    data: {
      entidadeTipo: ENTIDADE_DO_DESENHO_DA_TIPOLOGIA,
      entidadeId: t.id,
      categoria: CATEGORIA_DESENHO_DA_TIPOLOGIA,
      nome: `desenho-tipologia.${e.imagem.mime === "image/png" ? "png" : "jpg"}`, // o nome enviado pelo usuário nunca é usado
      caminho: e.imagem.caminho,
      mime: e.imagem.mime,
      tamanhoBytes: e.imagem.tamanhoBytes,
      sha256: e.imagem.sha256,
      larguraPx: e.imagem.larguraPx,
      alturaPx: e.imagem.alturaPx,
      usarNoPortfolio: false,
      criadoPorId: e.usuario.id,
      atualizadoPorId: e.usuario.id,
    },
    select: { id: true },
  });
  await tx.tipologia.update({ where: { id: t.id }, data: { desenhoAnexoId: anexo.id, atualizadoPorId: e.usuario.id } });
  await aposentarDesenhoSeSemUso(tx, t.desenhoAnexoId, e.usuario);
  await registrarAuditoria(tx, {
    usuario: e.usuario,
    entidade: "Tipologia",
    entidadeId: t.id,
    acao: "ATUALIZAR",
    antes: { desenhoAnexoId: t.desenhoAnexoId },
    depois: { desenhoAnexoId: anexo.id, sha256: e.imagem.sha256, larguraPx: e.imagem.larguraPx, alturaPx: e.imagem.alturaPx },
    ip: e.ip ?? undefined,
  });
  return { anexoId: anexo.id };
}

/**
 * Tira o desenho da tipologia: os rascunhos que a usam voltam ao desenho automático; propostas enviadas não mudam (o snapshot
 * guarda a imagem). Só desliga a referência: o arquivo e o histórico ficam.
 */
export async function removerDesenhoDaTipologia(tx: Db, e: { usuario: Usuario; tipologiaId: string; ip?: string | null }): Promise<void> {
  const t = await tipologiaEditavel(tx, e.tipologiaId);
  if (!t.desenhoAnexoId) throw new ErroNegocio("Esta tipologia já usa o desenho automático.");
  // O tamanho só faz sentido com imagem: sair da imagem zera a configuração (a pendência da 3.6b-1 não se repete aqui).
  await tx.tipologia.update({ where: { id: t.id }, data: { desenhoAnexoId: null, desenhoConfig: Prisma.DbNull, atualizadoPorId: e.usuario.id } });
  await aposentarDesenhoSeSemUso(tx, t.desenhoAnexoId, e.usuario);
  await registrarAuditoria(tx, {
    usuario: e.usuario,
    entidade: "Tipologia",
    entidadeId: t.id,
    acao: "ATUALIZAR",
    antes: { desenhoAnexoId: t.desenhoAnexoId, desenhoConfig: t.desenhoConfig },
    depois: { desenhoAnexoId: null, desenhoConfig: null },
    ip: e.ip ?? undefined,
  });
}

/** Normal ou Grande para o desenho da tipologia (só com imagem). Config validada estritamente antes de gravar. */
export async function mudarTamanhoDoDesenhoDaTipologia(tx: Db, e: { usuario: Usuario; tipologiaId: string; tamanho: TamanhoDoDesenho; ip?: string | null }): Promise<void> {
  const t = await tipologiaEditavel(tx, e.tipologiaId);
  if (!t.desenhoAnexoId) throw new ErroNegocio("Envie um desenho antes de escolher o tamanho.");
  const nova = exigirConfigDoDesenho(aplicarTamanhoNaConfig(t.desenhoConfig, e.tamanho));
  await tx.tipologia.update({ where: { id: t.id }, data: { desenhoConfig: nova ?? Prisma.DbNull, atualizadoPorId: e.usuario.id } });
  await registrarAuditoria(tx, {
    usuario: e.usuario,
    entidade: "Tipologia",
    entidadeId: t.id,
    acao: "ATUALIZAR",
    antes: { desenhoConfig: t.desenhoConfig },
    depois: { desenhoConfig: nova },
    ip: e.ip ?? undefined,
  });
}

/** Tira a marca "criada de uma proposta, revisar" (quem conferiu o cadastro). */
export async function marcarTipologiaComoRevisada(tx: Db, e: { usuario: Usuario; tipologiaId: string; ip?: string | null }): Promise<void> {
  await tipologiaEditavel(tx, e.tipologiaId);
  const atual = await tx.tipologia.findUniqueOrThrow({ where: { id: e.tipologiaId }, select: { revisarCadastro: true } });
  if (!atual.revisarCadastro) return;
  await tx.tipologia.update({ where: { id: e.tipologiaId }, data: { revisarCadastro: false, atualizadoPorId: e.usuario.id } });
  await registrarAuditoria(tx, {
    usuario: e.usuario,
    entidade: "Tipologia",
    entidadeId: e.tipologiaId,
    acao: "ATUALIZAR",
    antes: { revisarCadastro: true },
    depois: { revisarCadastro: false },
    ip: e.ip ?? undefined,
  });
}

export type EntradaSalvarComoTipologia = {
  usuario: Usuario;
  itemId: string;
  nome: string;
  tipoDesenho: (typeof TIPOS_DESENHO)[number];
  templateDescricao: string;
  ip?: string | null;
};

/**
 * "Salvar este desenho como nova tipologia". A tipologia aponta para o MESMO `Anexo` do item (nenhum arquivo é copiado) e nasce
 * marcada "criada de uma proposta, revisar". NADA comercial é inventado: sem composição, mão de obra nem preços; categoria,
 * cobrança, markup e "exige esquadria" ficam nos padrões neutros do banco; só folhas e categoria vêm da tipologia de origem
 * (dado descritivo). Idempotente: o mesmo item com o mesmo nome devolve a tipologia já criada (clique duplo, nova tentativa).
 */
export async function salvarDesenhoComoNovaTipologia(tx: Db, e: EntradaSalvarComoTipologia): Promise<{ tipologiaId: string; jaExistia: boolean }> {
  const nome = e.nome.trim();
  // Trava a linha do item: duas chamadas simultâneas para o mesmo item andam uma de cada vez.
  await tx.$queryRaw`SELECT "id" FROM "ItemProposta" WHERE "id" = ${e.itemId} FOR UPDATE`;
  const item = await tx.itemProposta.findFirst({
    where: { id: e.itemId, deletadoEm: null, proposta: { deletadoEm: null } },
    select: { id: true, desenhoAnexoId: true, desenhoConfig: true, tipologia: { select: { categoria: true, opcoesFolhas: true } } },
  });
  if (!item) throw new ErroNegocio("Item não encontrado.");
  if (!item.desenhoAnexoId) throw new ErroNegocio("Só um item com desenho personalizado pode virar tipologia.");

  const igual = await tx.tipologia.findFirst({
    where: { deletadoEm: null, nome: { equals: nome, mode: "insensitive" } },
    select: { id: true, criadaDeItemId: true },
  });
  if (igual) {
    if (igual.criadaDeItemId === item.id) return { tipologiaId: igual.id, jaExistia: true };
    throw new ErroNegocio(MENSAGEM_NOME_REPETIDO, { nome: MENSAGEM_NOME_REPETIDO });
  }

  const ultima = await tx.tipologia.aggregate({ where: { deletadoEm: null }, _max: { ordem: true } });
  const config = exigirConfigDoDesenho(aplicarTamanhoNaConfig(null, item.desenhoConfig && (item.desenhoConfig as Record<string, unknown>).tamanhoDesenho === "GRANDE" ? "GRANDE" : undefined));
  const nova = await tx.tipologia.create({
    data: {
      nome,
      tipoDesenho: e.tipoDesenho,
      templateDescricao: e.templateDescricao.trim(),
      ...(item.tipologia ? { categoria: item.tipologia.categoria, opcoesFolhas: item.tipologia.opcoesFolhas } : {}),
      desenhoAnexoId: item.desenhoAnexoId,
      ...(config ? { desenhoConfig: config } : {}),
      revisarCadastro: true,
      revisarTexto: true,
      criadaDeItemId: item.id,
      ordem: (ultima._max.ordem ?? 0) + 1,
      criadoPorId: e.usuario.id,
      atualizadoPorId: e.usuario.id,
    },
    select: { id: true },
  });
  await registrarAuditoria(tx, {
    usuario: e.usuario,
    entidade: "Tipologia",
    entidadeId: nova.id,
    acao: "CRIAR",
    depois: { nome, tipoDesenho: e.tipoDesenho, desenhoAnexoId: item.desenhoAnexoId, criadaDeItemId: item.id, revisarCadastro: true },
    ip: e.ip ?? undefined,
  });
  return { tipologiaId: nova.id, jaExistia: false };
}
