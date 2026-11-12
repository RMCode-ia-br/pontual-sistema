import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { ErroNegocio } from "@/lib/acoes";
import { registrarAuditoria } from "@/lib/auditoria";
import { CATEGORIA_FOTO_DE_OBRA, type MomentoDaFoto } from "@/lib/dominio/portfolio";
import { dataLocalDoInstante, inputParaData } from "@/lib/formatadores";
import { registrarInteracao } from "@/modules/interacoes/registrar";

type Tx = Prisma.TransactionClient;
type Usuario = { id: string; nome: string };

const STATUS_DE_OBRA = ["APROVADO", "EM_EXECUCAO", "CONCLUIDO"];
const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

/** Muda o momento, o uso no portfólio ou a descrição de uma foto de obra. `undefined` mantém; `null` limpa a descrição. */
export async function atualizarFotoDaObra(
  tx: Tx,
  e: { anexoId: string; momento?: MomentoDaFoto; usarNoPortfolio?: boolean; descricao?: string | null; usuario: Usuario; ip?: string | null },
): Promise<void> {
  const foto = await tx.anexo.findFirst({
    where: { id: e.anexoId, deletadoEm: null, entidadeTipo: "Projeto", categoria: CATEGORIA_FOTO_DE_OBRA, mime: { startsWith: "image/" } },
    select: { id: true, entidadeId: true, momento: true, usarNoPortfolio: true, descricao: true },
  });
  if (!foto) throw new ErroNegocio("Foto não encontrada.");
  const obra = await tx.projeto.findFirst({ where: { id: foto.entidadeId, deletadoEm: null }, select: { id: true } });
  if (!obra) throw new ErroNegocio("A obra desta foto não foi encontrada.");

  const descricao = e.descricao === undefined ? foto.descricao : e.descricao?.trim() || null;
  if (descricao && descricao.length > 300) throw new ErroNegocio("Use no máximo 300 caracteres na descrição.", { descricao: "Máximo de 300 caracteres." });
  const depois = { momento: e.momento ?? foto.momento, usarNoPortfolio: e.usarNoPortfolio ?? foto.usarNoPortfolio, descricao };
  await tx.anexo.update({ where: { id: foto.id }, data: { ...depois, atualizadoPorId: e.usuario.id } });
  await registrarAuditoria(tx, {
    usuario: e.usuario,
    entidade: "Anexo",
    entidadeId: foto.id,
    acao: "ATUALIZAR",
    antes: { momento: foto.momento, usarNoPortfolio: foto.usarNoPortfolio, descricao: foto.descricao },
    depois,
    ip: e.ip,
  });
}

/** O cliente autoriza (padrão) ou não o uso das fotos da obra no portfólio (R18). Sem autorização, nada vai à galeria. */
export async function definirAutorizacaoDePortfolio(tx: Tx, e: { projetoId: string; autoriza: boolean; usuario: Usuario; ip?: string | null }): Promise<boolean> {
  const projeto = await tx.projeto.findFirst({ where: { id: e.projetoId, deletadoEm: null }, select: { id: true, clienteId: true, autorizaPortfolio: true, publicadoInstagramEm: true } });
  if (!projeto) throw new ErroNegocio("Obra não encontrada.");
  if (projeto.autorizaPortfolio === e.autoriza) return false;

  await tx.projeto.update({ where: { id: projeto.id }, data: { autorizaPortfolio: e.autoriza, atualizadoPorId: e.usuario.id } });
  await registrarInteracao(tx, {
    tipo: "SISTEMA",
    texto: e.autoriza ? "Uso das fotos da obra no portfólio autorizado pelo cliente." : "O cliente NÃO autoriza o uso das fotos da obra no portfólio: elas saem da galeria.",
    clienteId: projeto.clienteId,
    projetoId: projeto.id,
    usuarioId: e.usuario.id,
  });
  await registrarAuditoria(tx, { usuario: e.usuario, entidade: "Projeto", entidadeId: projeto.id, acao: "ATUALIZAR", antes: { autorizaPortfolio: projeto.autorizaPortfolio }, depois: { autorizaPortfolio: e.autoriza }, ip: e.ip });
  return true;
}

/** Marca (com a data) ou desmarca que a obra já foi publicada no Instagram, para não repetir (spec 7.8). */
export async function definirPublicacaoNoInstagram(tx: Tx, e: { projetoId: string; publicada: boolean; data?: string; usuario: Usuario; ip?: string | null; agora?: Date }): Promise<void> {
  const projeto = await tx.projeto.findFirst({ where: { id: e.projetoId, deletadoEm: null }, select: { id: true, clienteId: true, status: true, autorizaPortfolio: true, publicadoInstagramEm: true } });
  if (!projeto || !STATUS_DE_OBRA.includes(projeto.status)) throw new ErroNegocio("Obra não encontrada.");

  let publicadoEm: string | null = null;
  if (e.publicada) {
    if (!projeto.autorizaPortfolio) throw new ErroNegocio("O cliente não autorizou o uso das fotos no portfólio.");
    const hoje = dataLocalDoInstante(e.agora ?? new Date());
    publicadoEm = e.data ?? hoje;
    if (!inputParaData(publicadoEm)) throw new ErroNegocio("Informe uma data válida.", { data: "Informe uma data válida." });
    if (publicadoEm > hoje) throw new ErroNegocio("A data da publicação não pode ser no futuro.", { data: "Use hoje ou uma data passada." });
  }

  await tx.projeto.update({ where: { id: projeto.id }, data: { publicadoInstagramEm: publicadoEm ? inputParaData(publicadoEm) : null, atualizadoPorId: e.usuario.id } });
  await registrarInteracao(tx, {
    tipo: "SISTEMA",
    texto: publicadoEm ? `Obra marcada como publicada no Instagram em ${br(publicadoEm)}.` : "Marca de publicação no Instagram removida.",
    clienteId: projeto.clienteId,
    projetoId: projeto.id,
    usuarioId: e.usuario.id,
  });
  await registrarAuditoria(tx, { usuario: e.usuario, entidade: "Projeto", entidadeId: projeto.id, acao: "ATUALIZAR", antes: { publicadoInstagramEm: dia(projeto.publicadoInstagramEm) }, depois: { publicadoInstagramEm: publicadoEm }, ip: e.ip });
}
