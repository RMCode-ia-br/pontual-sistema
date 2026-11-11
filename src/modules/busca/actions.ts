"use server";

import { z } from "zod";

import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";

export type ResultadoBusca = {
  tarefas: { id: string; titulo: string; concluida: boolean }[];
  usuarios: { id: string; nome: string; login: string }[];
};

const termoSchema = z.string().trim().min(2).max(80);

/** Escapa curingas do LIKE para o texto digitado valer literalmente. */
function padraoLike(termo: string): string {
  return `%${termo.replace(/[\\%_]/g, "\\$&")}%`;
}

/**
 * Busca global (Ctrl+K), sem diferenciar acentos nem maiúsculas (extensão `unaccent`).
 * Nesta fase busca tarefas e usuários; clientes, projetos, propostas, fornecedores e produtos
 * entram junto com os respectivos módulos.
 */
export async function buscaGlobal(termo: string): Promise<ResultadoBusca> {
  await exigirSessao();
  const parse = termoSchema.safeParse(termo);
  if (!parse.success) return { tarefas: [], usuarios: [] };
  const padrao = padraoLike(parse.data);

  const [tarefas, usuarios] = await Promise.all([
    prisma.$queryRaw<{ id: string; titulo: string; status: string }[]>`
      SELECT id, titulo, status::text AS status FROM "Tarefa"
       WHERE "deletadoEm" IS NULL AND unaccent(titulo) ILIKE unaccent(${padrao})
       ORDER BY "criadoEm" DESC LIMIT 6`,
    prisma.$queryRaw<{ id: string; nome: string; login: string }[]>`
      SELECT id, nome, login FROM "Usuario"
       WHERE "deletadoEm" IS NULL AND (unaccent(nome) ILIKE unaccent(${padrao}) OR login ILIKE ${padrao})
       ORDER BY nome LIMIT 6`,
  ]);

  return {
    tarefas: tarefas.map((t) => ({ id: t.id, titulo: t.titulo, concluida: t.status === "CONCLUIDA" })),
    usuarios,
  };
}
