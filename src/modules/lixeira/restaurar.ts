import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { registrarAuditoria } from "@/lib/auditoria";
import { prisma } from "@/lib/db";

import { ENTIDADE_AUDITORIA, type TipoDaLixeira } from "./tipos";

type Usuario = { id: string; nome: string };
export type ResultadoDaRestauracao = { restaurados: number; conflitos: string[] };

/**
 * Restaura itens da lixeira. Antes de devolver cada um, confere se o que é ÚNICO entre os ativos
 * (código de produto, nome de equipe, CNPJ de fornecedor, CPF de funcionário) não foi reutilizado
 * enquanto ele estava fora: se foi, o item fica na lixeira e o motivo volta na lista de conflitos.
 */
export async function restaurarDaLixeira(entrada: { usuario: Usuario; tipo: TipoDaLixeira; ids: string[]; ip?: string | null }): Promise<ResultadoDaRestauracao> {
  const { usuario, tipo, ids, ip } = entrada;
  return prisma.$transaction(async (tx) => {
    const conflitos: string[] = [];
    let restaurados = 0;
    const limpar = { deletadoEm: null, atualizadoPorId: usuario.id };

    const auditar = (id: string) =>
      registrarAuditoria(tx, { usuario, entidade: ENTIDADE_AUDITORIA[tipo], entidadeId: id, acao: "RESTAURAR", antes: { excluido: true }, depois: { excluido: false }, ip });

    for (const id of ids) {
      if (tipo === "clientes") {
        const x = await tx.cliente.findFirst({ where: { id, deletadoEm: { not: null } }, select: { id: true } });
        if (!x) continue;
        await tx.cliente.update({ where: { id }, data: limpar });
      } else if (tipo === "fornecedores") {
        const x = await tx.fornecedor.findFirst({ where: { id, deletadoEm: { not: null } }, select: { razaoSocial: true, cnpj: true } });
        if (!x) continue;
        if (x.cnpj && (await tx.fornecedor.findFirst({ where: { cnpj: x.cnpj, deletadoEm: null, id: { not: id } }, select: { id: true } }))) {
          conflitos.push(`${x.razaoSocial}: já existe outro fornecedor ativo com o mesmo CNPJ.`);
          continue;
        }
        await tx.fornecedor.update({ where: { id }, data: limpar });
      } else if (tipo === "funcionarios") {
        const x = await tx.funcionario.findFirst({ where: { id, deletadoEm: { not: null } }, select: { nome: true, cpf: true } });
        if (!x) continue;
        if (x.cpf && (await tx.funcionario.findFirst({ where: { cpf: x.cpf, deletadoEm: null, id: { not: id } }, select: { id: true } }))) {
          conflitos.push(`${x.nome}: já existe outro funcionário ativo com o mesmo CPF.`);
          continue;
        }
        await tx.funcionario.update({ where: { id }, data: limpar });
      } else if (tipo === "produtos") {
        const x = await tx.produto.findFirst({ where: { id, deletadoEm: { not: null } }, select: { codigo: true, descricao: true } });
        if (!x) continue;
        if (await tx.produto.findFirst({ where: { codigo: { equals: x.codigo, mode: "insensitive" }, deletadoEm: null, id: { not: id } }, select: { id: true } })) {
          conflitos.push(`${x.descricao} (${x.codigo}): o código já foi usado por outro produto.`);
          continue;
        }
        await tx.produto.update({ where: { id }, data: limpar as Prisma.ProdutoUncheckedUpdateInput });
      } else if (tipo === "projetos") {
        // O cliente do projeto precisa estar ativo no sistema: não se restaura um projeto de cliente que está na lixeira.
        const x = await tx.projeto.findFirst({ where: { id, deletadoEm: { not: null } }, select: { codigo: true, titulo: true, cliente: { select: { deletadoEm: true } } } });
        if (!x) continue;
        if (x.cliente.deletadoEm) {
          conflitos.push(`${x.titulo} (${x.codigo}): o cliente está na lixeira; restaure o cliente primeiro.`);
          continue;
        }
        await tx.projeto.update({ where: { id }, data: limpar });
      } else {
        const x = await tx.equipe.findFirst({ where: { id, deletadoEm: { not: null } }, select: { nome: true } });
        if (!x) continue;
        if (await tx.equipe.findFirst({ where: { nome: { equals: x.nome, mode: "insensitive" }, deletadoEm: null, id: { not: id } }, select: { id: true } })) {
          conflitos.push(`${x.nome}: já existe outra equipe com esse nome.`);
          continue;
        }
        await tx.equipe.update({ where: { id }, data: limpar });
      }
      await auditar(id);
      restaurados++;
    }
    return { restaurados, conflitos };
  });
}
