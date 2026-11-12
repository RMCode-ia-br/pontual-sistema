import "server-only";

import { prisma } from "@/lib/db";
import type { GrupoDreChave } from "@/lib/dominio/dre";
import type { Prisma, PrismaClient } from "../../generated/prisma/client";

import type { ItemCatalogo, SlugCatalogo } from "./definicoes";

/**
 * Único ponto que "fala" com os 8 modelos de catálogo. Todos têm id, ativo, ordem e auditoria;
 * o cast abaixo é deliberado e restrito a esta interface mínima de operações.
 */
type Registro = Record<string, unknown>;
type Delegado = {
  findMany(args: object): Promise<Registro[]>;
  findFirst(args: object): Promise<Registro | null>;
  create(args: object): Promise<Registro>;
  update(args: object): Promise<Registro>;
};

type Db = PrismaClient | Prisma.TransactionClient;

/** Delegado do catálogo a partir do cliente informado: passe o `tx` para escrever DENTRO da transação. */
export function delegadoDoCatalogo(slug: SlugCatalogo, db: Db = prisma): Delegado {
  const mapa: Record<SlugCatalogo, unknown> = {
    linhas: db.linhaAluminio,
    acabamentos: db.acabamentoAluminio,
    "tipos-vidro": db.tipoVidro,
    "espessuras-vidro": db.espessuraVidro,
    "categorias-produto": db.categoriaProduto,
    "motivos-perda": db.motivoPerda,
    "motivos-bloqueio": db.motivoBloqueio,
    "categorias-financeiras": db.categoriaFinanceira,
  };
  return mapa[slug] as Delegado;
}

export function paraItem(slug: SlugCatalogo, r: Registro): ItemCatalogo {
  return {
    id: String(r.id),
    nome: slug === "espessuras-vidro" ? String(r.mm) : String(r.nome),
    ativo: Boolean(r.ativo),
    ordem: Number(r.ordem),
    ...(slug === "motivos-bloqueio" ? { justificado: Boolean(r.justificado) } : {}),
    ...(slug === "categorias-financeiras"
      ? { tipo: r.tipo as "RECEITA" | "DESPESA", grupo: (r.grupo as GrupoDreChave | null) ?? null }
      : {}),
  };
}

export async function listarCatalogo(slug: SlugCatalogo, db: Db = prisma): Promise<ItemCatalogo[]> {
  const ordenacao =
    slug === "categorias-financeiras" ? [{ tipo: "asc" }, { ordem: "asc" }, { nome: "asc" }] : [{ ordem: "asc" }, slug === "espessuras-vidro" ? { mm: "asc" } : { nome: "asc" }];
  const linhas = await delegadoDoCatalogo(slug, db).findMany({ where: { deletadoEm: null }, orderBy: ordenacao });
  return linhas.map((l) => paraItem(slug, l));
}
