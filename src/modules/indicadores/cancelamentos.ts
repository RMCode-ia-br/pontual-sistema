import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { limitesEmInstantes, type Periodo } from "@/lib/periodo";

/**
 * "Cancelado depois de aprovado" (decisão do Marcelo, 2026-11-13, decisão 130): a venda de um projeto que depois
 * CANCELA continua no "Vendido" do mês em que foi aprovada (os meses passados nunca mudam); o cancelamento aparece em linha
 * própria, no mês em que aconteceu. Uma obra cancelada = o projeto está CANCELADO, tem proposta ainda APROVADA e entrou em
 * "Cancelado" dentro do período (pelo histórico de fases, em horário de São Paulo).
 *
 * Isto NÃO é a "aprovação desfeita" da Fase 7A.1: desfazer uma aprovação deixa a proposta de ser aprovada (deixa de
 * contar como venda), então o projeto não tem mais proposta aprovada e não entra aqui.
 *
 * Hoje nenhuma tela do sistema leva uma obra aprovada a "Cancelado" (PENDENCIAS); a linha fica pronta e testada (o teste
 * grava o histórico direto) para quando esse caminho existir.
 */
export function ondeCanceladosDepoisDeAprovados(p: Periodo): Prisma.ProjetoWhereInput {
  const { inicio, fimExclusivo } = limitesEmInstantes(p);
  return {
    deletadoEm: null,
    status: "CANCELADO",
    historicoFases: { some: { para: "CANCELADO", criadoEm: { gte: inicio, lt: fimExclusivo } } },
    propostas: { some: { status: "APROVADA", deletadoEm: null } },
  };
}

export type CanceladoDepoisDeAprovado = {
  projetoId: string;
  codigo: string;
  titulo: string;
  cliente: string;
  canceladoEm: Date;
  /** Soma das propostas aprovadas do projeto: o mesmo valor que entrou no Vendido, no mês de cada aprovação. */
  valorAprovadoCentavos: number;
  /** Data do primeiro aceite (o mês em que a venda foi contada). */
  aprovadoEm: Date | null;
};

export const LIMITE_DE_CANCELAMENTOS = 500;

export type ResumoDosCancelamentos = { projetos: number; valorAprovadoCentavos: number };

/** Quantas obras e quanto (valor aprovado) foram canceladas no período, pela MESMA cláusula da lista. */
export async function cancelamentosNoPeriodo(p: Periodo): Promise<ResumoDosCancelamentos> {
  const onde = ondeCanceladosDepoisDeAprovados(p);
  const [projetos, soma] = await Promise.all([
    prisma.projeto.count({ where: onde }),
    prisma.proposta.aggregate({ where: { status: "APROVADA", deletadoEm: null, projeto: onde }, _sum: { valorAprovadoCentavos: true } }),
  ]);
  return { projetos, valorAprovadoCentavos: soma._sum.valorAprovadoCentavos ?? 0 };
}

/** A lista que explica o número: cada obra cancelada no período, com o valor que tinha sido vendido. */
export async function listarCancelamentos(p: Periodo): Promise<{ linhas: CanceladoDepoisDeAprovado[]; truncado: boolean }> {
  const { inicio, fimExclusivo } = limitesEmInstantes(p);
  const encontrados = await prisma.projeto.findMany({
    where: ondeCanceladosDepoisDeAprovados(p),
    // Ordem estável no banco: se passar do limite, ficam as obras mexidas mais recentemente (o cancelamento é a última mudança).
    orderBy: [{ atualizadoEm: "desc" }, { id: "asc" }],
    take: LIMITE_DE_CANCELAMENTOS + 1,
    select: {
      id: true,
      codigo: true,
      titulo: true,
      cliente: { select: { nome: true } },
      historicoFases: { where: { para: "CANCELADO", criadoEm: { gte: inicio, lt: fimExclusivo } }, orderBy: { criadoEm: "desc" }, take: 1, select: { criadoEm: true } },
      propostas: { where: { status: "APROVADA", deletadoEm: null }, select: { valorAprovadoCentavos: true, aceitaEm: true } },
    },
  });
  const linhas = encontrados
    .map((x): CanceladoDepoisDeAprovado => {
      const aceites = x.propostas.map((pr) => pr.aceitaEm).filter((d): d is Date => d !== null);
      return {
        projetoId: x.id,
        codigo: x.codigo,
        titulo: x.titulo,
        cliente: x.cliente.nome,
        canceladoEm: x.historicoFases[0]!.criadoEm,
        valorAprovadoCentavos: x.propostas.reduce((s, pr) => s + (pr.valorAprovadoCentavos ?? 0), 0),
        aprovadoEm: aceites.length ? new Date(Math.min(...aceites.map((d) => d.getTime()))) : null,
      };
    })
    .sort((a, b) => b.canceladoEm.getTime() - a.canceladoEm.getTime() || a.projetoId.localeCompare(b.projetoId));
  return { truncado: linhas.length > LIMITE_DE_CANCELAMENTOS, linhas: linhas.slice(0, LIMITE_DE_CANCELAMENTOS) };
}
