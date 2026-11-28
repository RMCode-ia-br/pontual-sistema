"use server";

import { z } from "zod";

import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissoes";
import { padraoLike } from "@/lib/listas/parametros";
import { somenteDigitos } from "@/lib/validadores";

export type ResultadoBusca = {
  clientes: { id: string; nome: string; detalhe: string | null }[];
  projetos: { id: string; codigo: string; titulo: string; cliente: string }[];
  propostas: { id: string; numero: string; revisao: number; cliente: string; status: string }[];
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
 * Cadastros na lixeira nunca aparecem. Propostas: por número (ex.: 2000-26) e cliente.
 */
export async function buscaGlobal(termo: string): Promise<ResultadoBusca> {
  const sessao = await exigirSessao();
  const parse = termoSchema.safeParse(termo);
  const vazio: ResultadoBusca = { clientes: [], projetos: [], propostas: [], fornecedores: [], produtos: [], funcionarios: [], tarefas: [], usuarios: [] };
  if (!parse.success) return vazio;

  const texto = padraoLike(parse.data.toLowerCase());
  const digitos = somenteDigitos(parse.data);
  const porDigitos = digitos.length >= 3 ? `%${digitos}%` : null;

  // Cada grupo só é consultado se a pessoa pode ver o módulo dele (Fase 7C): quem não pode recebe a lista vazia, sem tocar o banco.
  const pode = {
    cliente: can(sessao, "ver", "cliente"),
    projeto: can(sessao, "ver", "projeto"),
    proposta: can(sessao, "ver", "proposta"),
    fornecedor: can(sessao, "ver", "fornecedor"),
    produto: can(sessao, "ver", "produto"),
    funcionario: can(sessao, "ver", "funcionario"),
    tarefa: can(sessao, "ver", "tarefa"),
    usuario: can(sessao, "ver", "usuario"),
  };
  const se = <T>(liberado: boolean, consulta: () => Promise<T[]>): Promise<T[]> => (liberado ? consulta() : Promise.resolve([]));

  const [clientes, projetos, propostas, fornecedores, produtos, funcionarios, tarefas, usuarios] = await Promise.all([
    se(pode.cliente, () => prisma.$queryRaw<{ id: string; nome: string; telefone: string | null; email: string | null }[]>`
      SELECT id, nome, coalesce(whatsapp, telefone) AS telefone, email FROM "Cliente"
       WHERE "deletadoEm" IS NULL
         AND ( public.f_unaccent(lower("nome" || ' ' || coalesce("nomeFantasia", ''))) LIKE public.f_unaccent(${texto})
            OR (${porDigitos}::text IS NOT NULL AND ("cpfCnpj" LIKE ${porDigitos} OR "telefone" LIKE ${porDigitos} OR "whatsapp" LIKE ${porDigitos})) )
       ORDER BY nome LIMIT ${POR_GRUPO}`),
    se(pode.projeto, () => prisma.$queryRaw<{ id: string; codigo: string; titulo: string; cliente: string }[]>`
      SELECT p.id, p.codigo, p.titulo, c.nome AS cliente FROM "Projeto" p
        JOIN "Cliente" c ON c.id = p."clienteId"
       WHERE p."deletadoEm" IS NULL
         AND ( public.f_unaccent(lower(p."codigo" || ' ' || p."titulo")) LIKE public.f_unaccent(${texto})
            OR public.f_unaccent(lower(c."nome" || ' ' || coalesce(c."nomeFantasia", ''))) LIKE public.f_unaccent(${texto}) )
       ORDER BY p."criadoEm" DESC LIMIT ${POR_GRUPO}`),
    se(pode.proposta, () => prisma.$queryRaw<{ id: string; numero: string; revisao: number; clienteNome: string; status: string }[]>`
      SELECT pr.id, pr."numero", pr."revisao", pr."clienteNome", pr.status::text AS status FROM "Proposta" pr
        JOIN "Projeto" p ON p.id = pr."projetoId"
       WHERE pr."deletadoEm" IS NULL AND p."deletadoEm" IS NULL
         AND public.f_unaccent(lower(pr."numero" || ' ' || pr."clienteNome")) LIKE public.f_unaccent(${texto})
       ORDER BY pr."numeroSequencial" DESC, pr."revisao" DESC LIMIT ${POR_GRUPO}`),
    se(pode.fornecedor, () => prisma.$queryRaw<{ id: string; razaoSocial: string }[]>`
      SELECT id, "razaoSocial" FROM "Fornecedor"
       WHERE "deletadoEm" IS NULL
         AND ( public.f_unaccent(lower("razaoSocial" || ' ' || coalesce("nomeFantasia", ''))) LIKE public.f_unaccent(${texto})
            OR (${porDigitos}::text IS NOT NULL AND "cnpj" LIKE ${porDigitos}) )
       ORDER BY "razaoSocial" LIMIT ${POR_GRUPO}`),
    se(pode.produto, () => prisma.$queryRaw<{ id: string; codigo: string; descricao: string }[]>`
      SELECT id, codigo, descricao FROM "Produto"
       WHERE "deletadoEm" IS NULL AND public.f_unaccent(lower("codigo" || ' ' || "descricao")) LIKE public.f_unaccent(${texto})
       ORDER BY codigo LIMIT ${POR_GRUPO}`),
    se(pode.funcionario, () => prisma.$queryRaw<{ id: string; nome: string; cargo: string | null }[]>`
      SELECT id, nome, cargo FROM "Funcionario"
       WHERE "deletadoEm" IS NULL AND public.f_unaccent(lower("nome")) LIKE public.f_unaccent(${texto})
       ORDER BY nome LIMIT ${POR_GRUPO}`),
    se(pode.tarefa, () => prisma.$queryRaw<{ id: string; titulo: string; status: string }[]>`
      SELECT id, titulo, status::text AS status FROM "Tarefa"
       WHERE "deletadoEm" IS NULL AND public.f_unaccent(lower("titulo")) LIKE public.f_unaccent(${texto})
       ORDER BY "criadoEm" DESC LIMIT ${POR_GRUPO}`),
    se(pode.usuario, () => prisma.$queryRaw<{ id: string; nome: string; login: string }[]>`
      SELECT id, nome, login FROM "Usuario"
       WHERE "deletadoEm" IS NULL AND (unaccent(nome) ILIKE unaccent(${texto}) OR login ILIKE ${texto})
       ORDER BY nome LIMIT ${POR_GRUPO}`),
  ]);

  return {
    clientes: clientes.map((c) => ({ id: c.id, nome: c.nome, detalhe: c.telefone ?? c.email })),
    projetos,
    propostas: propostas.map((p) => ({ id: p.id, numero: p.numero, revisao: p.revisao, cliente: p.clienteNome, status: p.status })),
    fornecedores: fornecedores.map((f) => ({ id: f.id, nome: f.razaoSocial })),
    produtos,
    funcionarios,
    tarefas: tarefas.map((t) => ({ id: t.id, titulo: t.titulo, concluida: t.status === "CONCLUIDA" })),
    usuarios,
  };
}
