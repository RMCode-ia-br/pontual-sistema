import "server-only";

import { prisma } from "@/lib/db";

import type { TipoDaLixeira } from "./tipos";

export type ItemDaLixeira = { id: string; titulo: string; detalhe: string | null; removidoEm: string; removidoPor: string | null };

const LIMITE = 300;

/** Itens excluídos (mais recentes primeiro), com quem os removeu. */
export async function listarLixeira(tipo: TipoDaLixeira): Promise<ItemDaLixeira[]> {
  const where = { deletadoEm: { not: null } } as const;
  const orderBy = { deletadoEm: "desc" } as const;
  let brutos: { id: string; titulo: string; detalhe: string | null; deletadoEm: Date | null; atualizadoPorId: string | null }[];

  if (tipo === "clientes") {
    const r = await prisma.cliente.findMany({ where, orderBy, take: LIMITE, select: { id: true, nome: true, cpfCnpj: true, deletadoEm: true, atualizadoPorId: true } });
    brutos = r.map((x) => ({ id: x.id, titulo: x.nome, detalhe: x.cpfCnpj, deletadoEm: x.deletadoEm, atualizadoPorId: x.atualizadoPorId }));
  } else if (tipo === "fornecedores") {
    const r = await prisma.fornecedor.findMany({ where, orderBy, take: LIMITE, select: { id: true, razaoSocial: true, cnpj: true, deletadoEm: true, atualizadoPorId: true } });
    brutos = r.map((x) => ({ id: x.id, titulo: x.razaoSocial, detalhe: x.cnpj, deletadoEm: x.deletadoEm, atualizadoPorId: x.atualizadoPorId }));
  } else if (tipo === "funcionarios") {
    const r = await prisma.funcionario.findMany({ where, orderBy, take: LIMITE, select: { id: true, nome: true, cargo: true, deletadoEm: true, atualizadoPorId: true } });
    brutos = r.map((x) => ({ id: x.id, titulo: x.nome, detalhe: x.cargo, deletadoEm: x.deletadoEm, atualizadoPorId: x.atualizadoPorId }));
  } else if (tipo === "produtos") {
    const r = await prisma.produto.findMany({ where, orderBy, take: LIMITE, select: { id: true, codigo: true, descricao: true, deletadoEm: true, atualizadoPorId: true } });
    brutos = r.map((x) => ({ id: x.id, titulo: x.descricao, detalhe: x.codigo, deletadoEm: x.deletadoEm, atualizadoPorId: x.atualizadoPorId }));
  } else {
    const r = await prisma.equipe.findMany({ where, orderBy, take: LIMITE, select: { id: true, nome: true, descricao: true, deletadoEm: true, atualizadoPorId: true } });
    brutos = r.map((x) => ({ id: x.id, titulo: x.nome, detalhe: x.descricao, deletadoEm: x.deletadoEm, atualizadoPorId: x.atualizadoPorId }));
  }

  const ids = Array.from(new Set(brutos.map((b) => b.atualizadoPorId).filter((i): i is string => !!i)));
  const usuarios = ids.length ? await prisma.usuario.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } }) : [];
  const nomes = new Map(usuarios.map((u) => [u.id, u.nome]));
  return brutos.map((b) => ({
    id: b.id,
    titulo: b.titulo,
    detalhe: b.detalhe,
    removidoEm: (b.deletadoEm ?? new Date()).toISOString(),
    removidoPor: b.atualizadoPorId ? (nomes.get(b.atualizadoPorId) ?? null) : null,
  }));
}

export async function contarLixeira(): Promise<Record<TipoDaLixeira, number>> {
  const where = { deletadoEm: { not: null } } as const;
  const [clientes, fornecedores, funcionarios, produtos, equipes] = await Promise.all([
    prisma.cliente.count({ where }),
    prisma.fornecedor.count({ where }),
    prisma.funcionario.count({ where }),
    prisma.produto.count({ where }),
    prisma.equipe.count({ where }),
  ]);
  return { clientes, fornecedores, funcionarios, produtos, equipes };
}
