import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { padraoLike } from "@/lib/listas/parametros";

/**
 * Busca sem diferenciar acento nem maiúscula (Fase 7B, Bloco 8) para as listas que antes usavam `contains` do Prisma (que
 * ignora só a caixa: "macae" não achava "Macaé"). Cada função devolve os ids que combinam com o texto, e a lista aplica
 * `id: { in: ids }` junto dos demais filtros. As expressões são exatamente as dos índices trigram (`public.f_unaccent(lower(...))`,
 * migrações Cadastros, Comercial e Propostas; os índices novos estão na migração do Bloco 8), para o Postgres poder usá-los.
 */

export const LIMITE_DE_IDS_NA_BUSCA = 2000;

const projeto = (a: string) => Prisma.raw(`public.f_unaccent(lower(${a}."codigo" || ' ' || ${a}."titulo"))`);
const cliente = (a: string) => Prisma.raw(`public.f_unaccent(lower(${a}."nome" || ' ' || coalesce(${a}."nomeFantasia", '')))`);
const fornecedor = (a: string) => Prisma.raw(`public.f_unaccent(lower(${a}."razaoSocial" || ' ' || coalesce(${a}."nomeFantasia", '')))`);

/** O padrão "%texto%" sem acento e em minúsculas, com os curingas do LIKE escapados. */
function padrao(termo: string): Prisma.Sql {
  return Prisma.sql`public.f_unaccent(${padraoLike(termo.trim().toLowerCase())})`;
}

const ids = (linhas: { id: string }[]) => linhas.map((l) => l.id);

export async function idsDeProjetos(termo: string): Promise<string[]> {
  const t = padrao(termo);
  return ids(await prisma.$queryRaw<{ id: string }[]>`
    SELECT p.id FROM "Projeto" p JOIN "Cliente" c ON c.id = p."clienteId"
     WHERE p."deletadoEm" IS NULL AND (${projeto("p")} LIKE ${t} OR ${cliente("c")} LIKE ${t})
     LIMIT ${LIMITE_DE_IDS_NA_BUSCA}`);
}

export async function idsDePropostas(termo: string): Promise<string[]> {
  const t = padrao(termo);
  return ids(await prisma.$queryRaw<{ id: string }[]>`
    SELECT pr.id FROM "Proposta" pr JOIN "Projeto" p ON p.id = pr."projetoId"
     WHERE pr."deletadoEm" IS NULL
       AND (public.f_unaccent(lower(pr."numero" || ' ' || pr."clienteNome")) LIKE ${t} OR ${projeto("p")} LIKE ${t})
     LIMIT ${LIMITE_DE_IDS_NA_BUSCA}`);
}

export async function idsDeChamados(termo: string): Promise<string[]> {
  const t = padrao(termo);
  return ids(await prisma.$queryRaw<{ id: string }[]>`
    SELECT ch.id FROM "Chamado" ch JOIN "Cliente" c ON c.id = ch."clienteId" LEFT JOIN "Projeto" p ON p.id = ch."projetoId"
     WHERE ch."deletadoEm" IS NULL
       AND (public.f_unaccent(lower(ch."descricao")) LIKE ${t} OR ${cliente("c")} LIKE ${t} OR ${projeto("p")} LIKE ${t})
     LIMIT ${LIMITE_DE_IDS_NA_BUSCA}`);
}

export async function idsDeCompras(termo: string): Promise<string[]> {
  const t = padrao(termo);
  return ids(await prisma.$queryRaw<{ id: string }[]>`
    SELECT co.id FROM "Compra" co JOIN "Fornecedor" f ON f.id = co."fornecedorId" LEFT JOIN "Projeto" p ON p.id = co."projetoId"
     WHERE co."deletadoEm" IS NULL AND (${fornecedor("f")} LIKE ${t} OR ${projeto("p")} LIKE ${t})
     LIMIT ${LIMITE_DE_IDS_NA_BUSCA}`);
}

export async function idsDeContasAReceber(termo: string): Promise<string[]> {
  const t = padrao(termo);
  return ids(await prisma.$queryRaw<{ id: string }[]>`
    SELECT cr.id FROM "ContaReceber" cr JOIN "Cliente" c ON c.id = cr."clienteId" LEFT JOIN "Projeto" p ON p.id = cr."projetoId"
     WHERE cr."deletadoEm" IS NULL
       AND (public.f_unaccent(lower(cr."descricao")) LIKE ${t} OR ${cliente("c")} LIKE ${t} OR ${projeto("p")} LIKE ${t})
     LIMIT ${LIMITE_DE_IDS_NA_BUSCA}`);
}

export async function idsDeContasAPagar(termo: string): Promise<string[]> {
  const t = padrao(termo);
  return ids(await prisma.$queryRaw<{ id: string }[]>`
    SELECT cp.id FROM "ContaPagar" cp
      LEFT JOIN "Fornecedor" f ON f.id = cp."fornecedorId" LEFT JOIN "Funcionario" fu ON fu.id = cp."funcionarioId"
      LEFT JOIN "CategoriaFinanceira" cat ON cat.id = cp."categoriaId" LEFT JOIN "Projeto" p ON p.id = cp."projetoId"
     WHERE cp."deletadoEm" IS NULL
       AND (public.f_unaccent(lower(cp."descricao" || ' ' || coalesce(cp."favorecido", ''))) LIKE ${t}
         OR ${fornecedor("f")} LIKE ${t}
         OR public.f_unaccent(lower(fu."nome")) LIKE ${t}
         OR public.f_unaccent(lower(cat."nome")) LIKE ${t}
         OR ${projeto("p")} LIKE ${t})
     LIMIT ${LIMITE_DE_IDS_NA_BUSCA}`);
}

/** Fornecedores ATIVOS para o campo de escolha (até 8, por nome ou nome fantasia). */
export async function buscarFornecedoresSemAcento(termo: string, limite = 8): Promise<{ id: string; razaoSocial: string; nomeFantasia: string | null }[]> {
  const t = padrao(termo);
  return prisma.$queryRaw<{ id: string; razaoSocial: string; nomeFantasia: string | null }[]>`
    SELECT f.id, f."razaoSocial", f."nomeFantasia" FROM "Fornecedor" f
     WHERE f."ativo" AND f."deletadoEm" IS NULL AND ${fornecedor("f")} LIKE ${t}
     ORDER BY f."razaoSocial" ASC LIMIT ${limite}`;
}
