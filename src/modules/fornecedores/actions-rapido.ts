"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { executar, falha, falhaDeValidacao, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { registrarAuditoria } from "@/lib/auditoria";
import { extrairIp } from "@/lib/auth/autenticar";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissoes";
import { campoTelefone, campoTexto } from "@/lib/validadores/campos";

export type FornecedorParaEscolha = { id: string; nome: string };

/** Busca fornecedores ativos por parte do nome ou do nome fantasia, para o campo de escolha. */
export async function buscarFornecedoresParaCampo(termo: string): Promise<ResultadoAcao<FornecedorParaEscolha[]>> {
  await exigirSessao();
  const t = termo.trim().slice(0, 80);
  if (t.length < 2) return sucesso([]);
  const lista = await prisma.fornecedor.findMany({
    where: { ativo: true, deletadoEm: null, OR: [{ razaoSocial: { contains: t, mode: "insensitive" } }, { nomeFantasia: { contains: t, mode: "insensitive" } }] },
    orderBy: { razaoSocial: "asc" },
    take: 8,
    select: { id: true, razaoSocial: true, nomeFantasia: true },
  });
  return sucesso(lista.map((f) => ({ id: f.id, nome: f.nomeFantasia ? `${f.nomeFantasia} (${f.razaoSocial})` : f.razaoSocial })));
}

const fornecedorRapidoSchema = z.object({ razaoSocial: campoTexto("o nome do fornecedor", 160), telefone: campoTelefone("Telefone") });

/** Cadastra um fornecedor na hora (só nome e telefone; o resto se completa depois no cadastro). */
export async function cadastrarFornecedorRapido(entrada: unknown): Promise<ResultadoAcao<FornecedorParaEscolha>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "criar", "fornecedor")) return falha("Sem permissão.");
  const dados = fornecedorRapidoSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error);
  return executar("fornecedores.rapido", async () => {
    const ip = extrairIp(await headers());
    const criado = await prisma.$transaction(async (tx) => {
      const novo = await tx.fornecedor.create({
        data: { razaoSocial: dados.data.razaoSocial, telefone: dados.data.telefone ?? null, criadoPorId: sessao.id, atualizadoPorId: sessao.id },
        select: { id: true, razaoSocial: true, telefone: true },
      });
      await registrarAuditoria(tx, { usuario: sessao, entidade: "Fornecedor", entidadeId: novo.id, acao: "CRIAR", depois: { ...novo, origem: "cadastro rápido" }, ip });
      return novo;
    });
    revalidatePath("/fornecedores");
    return sucesso({ id: criado.id, nome: criado.razaoSocial }, "Fornecedor cadastrado.");
  });
}
