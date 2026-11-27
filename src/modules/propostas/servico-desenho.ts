import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { ErroNegocio } from "@/lib/acoes";
import { registrarAuditoria } from "@/lib/auditoria";
import { CATEGORIA_DESENHO_DO_ITEM, configDoDesenhoSchema, ENTIDADE_DO_DESENHO_DO_ITEM } from "@/lib/dominio/desenho-item";
import type { ImagemGravada } from "@/lib/imagem/envio";

import { exigirRascunho } from "./servico";

type Db = Prisma.TransactionClient;

/** `desenhoConfig` (JSON nulável) para copiar de um item para outro: nulo vira `DbNull`, que é o que o Prisma pede na gravação. */
export function configParaCopia(config: Prisma.JsonValue | null): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return config === null ? Prisma.DbNull : (config as Prisma.InputJsonValue);
}
type Usuario = { id: string; nome: string };

export type { ImagemGravada };

/**
 * Trava a proposta (FOR UPDATE, dentro de `exigirRascunho`) e só então confere que ela é rascunho, que não está excluída
 * e que o item é DESTA proposta e está vivo. Tudo na mesma transação: enviar/aprovar não passam no meio.
 */
async function itemEditavel(tx: Db, propostaId: string, itemId: string) {
  const proposta = await exigirRascunho(tx, propostaId);
  const item = await tx.itemProposta.findFirst({ where: { id: itemId, propostaId: proposta.id, deletadoEm: null }, select: { id: true, desenhoAnexoId: true } });
  if (!item) throw new ErroNegocio("Item não encontrado.");
  return { proposta, item };
}

/**
 * Configuração do desenho validada ANTES de gravar (item e tipologia): só `tamanhoDesenho` = "GRANDE"; outra chave ou valor
 * é recusado. `null` = Normal, sem configuração.
 */
export function exigirConfigDoDesenho(config: unknown): { tamanhoDesenho: "GRANDE" } | null {
  const r = configDoDesenhoSchema.safeParse(config);
  if (!r.success) throw new ErroNegocio("Configuração do desenho inválida.");
  return r.data;
}

/**
 * O anexo antigo só recebe exclusão lógica quando NENHUM item vivo e NENHUMA tipologia viva ainda o usa (revisões, itens
 * duplicados e tipologias criadas do item dividem o mesmo arquivo). O objeto no Storage nunca é apagado: snapshots enviados
 * leem o desenho por ele.
 */
export async function aposentarDesenhoSeSemUso(tx: Db, anexoId: string | null, usuario: Usuario) {
  if (!anexoId) return;
  const [itens, tipologias] = await Promise.all([
    tx.itemProposta.count({ where: { desenhoAnexoId: anexoId, deletadoEm: null } }),
    tx.tipologia.count({ where: { desenhoAnexoId: anexoId, deletadoEm: null } }),
  ]);
  if (itens > 0 || tipologias > 0) return;
  await tx.anexo.updateMany({ where: { id: anexoId, deletadoEm: null }, data: { deletadoEm: new Date(), atualizadoPorId: usuario.id } });
}

/** Registra a imagem já processada e gravada no Storage como o desenho do item (troca a anterior, se houver). */
export async function definirDesenhoDoItem(
  tx: Db,
  e: { usuario: Usuario; propostaId: string; itemId: string; imagem: ImagemGravada; ip?: string | null },
): Promise<{ anexoId: string; projetoId: string }> {
  const { proposta, item } = await itemEditavel(tx, e.propostaId, e.itemId);
  const anexo = await tx.anexo.create({
    data: {
      entidadeTipo: ENTIDADE_DO_DESENHO_DO_ITEM,
      entidadeId: item.id,
      categoria: CATEGORIA_DESENHO_DO_ITEM,
      nome: `desenho-item.${e.imagem.mime === "image/png" ? "png" : "jpg"}`, // o nome enviado pelo usuário nunca é usado
      caminho: e.imagem.caminho,
      mime: e.imagem.mime,
      tamanhoBytes: e.imagem.tamanhoBytes,
      sha256: e.imagem.sha256,
      larguraPx: e.imagem.larguraPx,
      alturaPx: e.imagem.alturaPx,
      usarNoPortfolio: false, // o padrão do banco é true: desenho de proposta não é foto de portfólio
      criadoPorId: e.usuario.id,
      atualizadoPorId: e.usuario.id,
    },
    select: { id: true },
  });
  await tx.itemProposta.update({ where: { id: item.id }, data: { desenhoAnexoId: anexo.id, atualizadoPorId: e.usuario.id } });
  await aposentarDesenhoSeSemUso(tx, item.desenhoAnexoId, e.usuario);
  await registrarAuditoria(tx, {
    usuario: e.usuario,
    entidade: "ItemProposta",
    entidadeId: item.id,
    acao: "ATUALIZAR",
    antes: { desenhoAnexoId: item.desenhoAnexoId },
    depois: { desenhoAnexoId: anexo.id, sha256: e.imagem.sha256, larguraPx: e.imagem.larguraPx, alturaPx: e.imagem.alturaPx },
    ip: e.ip ?? undefined,
  });
  return { anexoId: anexo.id, projetoId: proposta.projetoId };
}

/** Volta ao desenho automático: só desliga a referência (o arquivo e o histórico ficam). */
export async function removerDesenhoDoItem(tx: Db, e: { usuario: Usuario; propostaId: string; itemId: string; ip?: string | null }): Promise<{ projetoId: string }> {
  const { proposta, item } = await itemEditavel(tx, e.propostaId, e.itemId);
  if (!item.desenhoAnexoId) throw new ErroNegocio("Este item já usa o desenho automático.");
  await tx.itemProposta.update({ where: { id: item.id }, data: { desenhoAnexoId: null, atualizadoPorId: e.usuario.id } });
  await aposentarDesenhoSeSemUso(tx, item.desenhoAnexoId, e.usuario);
  await registrarAuditoria(tx, {
    usuario: e.usuario,
    entidade: "ItemProposta",
    entidadeId: item.id,
    acao: "ATUALIZAR",
    antes: { desenhoAnexoId: item.desenhoAnexoId },
    depois: { desenhoAnexoId: null },
    ip: e.ip ?? undefined,
  });
  return { projetoId: proposta.projetoId };
}
