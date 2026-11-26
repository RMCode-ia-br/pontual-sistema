import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { ErroNegocio } from "@/lib/acoes";
import { registrarAuditoria } from "@/lib/auditoria";
import { CATEGORIA_DESENHO_DO_ITEM, ENTIDADE_DO_DESENHO_DO_ITEM } from "@/lib/dominio/desenho-item";

import { exigirRascunho } from "./servico";

type Db = Prisma.TransactionClient;
type Usuario = { id: string; nome: string };

export type ImagemGravada = {
  caminho: string;
  mime: string;
  tamanhoBytes: number;
  sha256: string;
  larguraPx: number;
  alturaPx: number;
};

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
 * O anexo antigo só recebe exclusão lógica quando NENHUM item vivo ainda o usa (revisões e itens duplicados dividem o
 * mesmo arquivo). O objeto no Storage nunca é apagado: snapshots enviados leem o desenho por ele.
 */
async function aposentarSeSemUso(tx: Db, anexoId: string | null, usuario: Usuario) {
  if (!anexoId) return;
  const emUso = await tx.itemProposta.count({ where: { desenhoAnexoId: anexoId, deletadoEm: null } });
  if (emUso > 0) return;
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
  await aposentarSeSemUso(tx, item.desenhoAnexoId, e.usuario);
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
  await aposentarSeSemUso(tx, item.desenhoAnexoId, e.usuario);
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
