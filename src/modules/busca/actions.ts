"use server";

import { z } from "zod";

import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { padraoLike } from "@/lib/listas/parametros";
import { somenteDigitos } from "@/lib/validadores";

export type ResultadoBusca = {
  clientes: { id: string; nome: string; detalhe: string | null }[];
  fornecedores: { id: string; nome: string }[];
  produtos: { id: string; codigo: string; descricao: string }[];
  funcionarios: { id: string; nome: string; cargo: string | null }[];
  tarefas: { id: string; titulo: string; concluida: boolean }[];
  usuarios: { id: string; nome: string; login: string }[];
};

const termoSchema = z.string().trim().min(2).max(80);

const POR_GRUPO = 5;

/**
 * Busca global (Ctrl+K), sem diferenciar acentos nem maiúsculas. Usa exatamente as expressões dos
 * índices trigram (`f_unaccent(lower(...))`), então continua rápida com milhares de cadastros.
 * Cadastros na lixeira nunca aparecem. Projetos e propostas entram nas Fases 2 e 3.
 */
export async function buscaGlobal(termo: string): Promise<ResultadoBusca> {
  await exigirSessao();
  const parse = termoSchema.safeParse(termo);
  const vazio: ResultadoBusca = { clientes: [], fornecedores: [], produtos: [], funcionarios: [], tarefas: [], usuarios: [] };
  if (!parse.success) return vazio;

  const texto = padraoLike(parse.data.toLowerCase());
  const digitos = somenteDigitos(parse.data);
  const porDigitos = digitos.length >= 3 ? `%${digitos}%` : null;

  const [clientes, fornecedores, produtos, funcionarios, tarefas, usuarios] = await Promise.all([
    prisma.$queryRaw<{ id: string; nome: string; telefone: string | null; email: string | null }[]>`
      SELECT id, nome, coalesce(whatsapp, telefone) AS telefone, email FROM "Cliente"
       WHERE "deletadoEm" IS NULL
         AND ( public.f_unaccent(lower("nome" || ' ' || coalesce("nomeFantasia", ''))) LIKE public.f_unaccent(${texto})
            OR (${porDigitos}::text IS NOT NULL AND ("cpfCnpj" LIKE ${porDigitos} OR "telefone" LIKE ${porDigitos} OR "whatsapp" LIKE ${porDigitos})) )
       ORDER BY nome LIMIT ${POR_GRUPO}`,
    prisma.$queryRaw<{ id: string; razaoSocial: string }[]>`
      SELECT id, "razaoSocial" FROM "Fornecedor"
       WHERE "deletadoEm" IS NULL
         AND ( public.f_unaccent(lower("razaoSocial" || ' ' || coalesce("nomeFantasia", ''))) LIKE public.f_unaccent(${texto})
            OR (${porDigitos}::text IS NOT NULL AND "cnpj" LIKE ${porDigitos}) )
       ORDER BY "razaoSocial" LIMIT ${POR_GRUPO}`,
    prisma.$queryRaw<{ id: string; codigo: string; descricao: string }[]>`
      SELECT id, codigo, descricao FROM "Produto"
       WHERE "deletadoEm" IS NULL AND public.f_unaccent(lower("codigo" || ' ' || "descricao")) LIKE public.f_unaccent(${texto})
       ORDER BY codigo LIMIT ${POR_GRUPO}`,
    prisma.$queryRaw<{ id: string; nome: string; cargo: string | null }[]>`
      SELECT id, nome, cargo FROM "Funcionario"
       WHERE "deletadoEm" IS NULL AND public.f_unaccent(lower("nome")) LIKE public.f_unaccent(${texto})
       ORDER BY nome LIMIT ${POR_GRUPO}`,
    prisma.$queryRaw<{ id: string; titulo: string; status: string }[]>`
      SELECT id, titulo, status::text AS status FROM "Tarefa"
       WHERE "deletadoEm" IS NULL AND public.f_unaccent(lower("titulo")) LIKE public.f_unaccent(${texto})
       ORDER BY "criadoEm" DESC LIMIT ${POR_GRUPO}`,
    prisma.$queryRaw<{ id: string; nome: string; login: string }[]>`
      SELECT id, nome, login FROM "Usuario"
       WHERE "deletadoEm" IS NULL AND (unaccent(nome) ILIKE unaccent(${texto}) OR login ILIKE ${texto})
       ORDER BY nome LIMIT ${POR_GRUPO}`,
  ]);

  return {
    clientes: clientes.map((c) => ({ id: c.id, nome: c.nome, detalhe: c.telefone ?? c.email })),
    fornecedores: fornecedores.map((f) => ({ id: f.id, nome: f.razaoSocial })),
    produtos,
    funcionarios,
    tarefas: tarefas.map((t) => ({ id: t.id, titulo: t.titulo, concluida: t.status === "CONCLUIDA" })),
    usuarios,
  };
}
