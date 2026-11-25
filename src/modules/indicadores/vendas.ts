import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { ticketMedio } from "@/lib/dominio/indicadores";
import { limitesEmInstantes, type Periodo } from "@/lib/periodo";

import { exigirDadosDoAceite } from "./dados-do-aceite";

/**
 * Vendido (decisão 116): soma do valor aprovado de cada PROPOSTA aprovada, pela data do aceite. Cada parte de uma obra
 * entra no mês em que foi aprovada. O acréscimo da nota (do conteúdo congelado da opção aprovada) é o "repasse de
 * imposto, fora da margem", mostrado em linha própria; o valor aprovado já o inclui nas propostas com nota. O acréscimo de uma forma
 * de pagamento marcada como taxa da maquininha é o "repasse de taxa de cartão, fora da margem" (decisão 144). Os dois repasses são
 * LIDOS DAS COLUNAS gravadas no aceite (`acrescimoNotaAprovadoCentavos`, `repasseCartaoAprovadoCentavos`): fonte única, igual para o
 * painel, os relatórios e a margem por obra.
 */

/** A MESMA cláusula do painel, do relatório de vendas e da lista: propostas aprovadas no período. */
export function ondeVendas(p: Periodo): Prisma.PropostaWhereInput {
  const { inicio, fimExclusivo } = limitesEmInstantes(p);
  return { status: "APROVADA", deletadoEm: null, projeto: { deletadoEm: null }, aceitaEm: { gte: inicio, lt: fimExclusivo } };
}

export type Vendido = {
  totalCentavos: number;
  comNotaCentavos: number;
  semNotaCentavos: number;
  /** Parte das vendas COM nota que é o acréscimo da nota (repasse de imposto, fora da margem). */
  repasseDeImpostoCentavos: number;
  /** Parte das vendas (com ou sem nota) que é acréscimo de cartão repassado: taxa da maquininha, fora da margem. */
  repasseDeCartaoCentavos: number;
  propostas: number;
  /** Projetos distintos com aprovação no período (uma obra com duas partes aprovadas conta uma vez). */
  projetos: number;
  ticketMedioCentavos: number | null;
};

type LinhaDoSql = { comNota: boolean; propostas: number; total: bigint; repasse: bigint; repasseCartao: bigint; projetos: number; numerosIncompletos: string | null };

export async function vendidoNoPeriodo(p: Periodo): Promise<Vendido> {
  const { inicio, fimExclusivo } = limitesEmInstantes(p);
  const linhas = await prisma.$queryRaw<LinhaDoSql[]>`
    WITH v AS (
      SELECT pr."numero", pr."comNotaFiscal", pr."projetoId", pr."valorAprovadoCentavos" AS valor,
             pr."acrescimoNotaAprovadoCentavos"::bigint AS repasse,
             pr."repasseCartaoAprovadoCentavos"::bigint AS "repasseCartao",
             (pr."valorAprovadoCentavos" IS NOT NULL AND (pr."valorReferenciaAprovadoCentavos" IS NULL OR pr."ajusteAprovadoCentavos" IS NULL
              OR pr."acrescimoNotaAprovadoCentavos" IS NULL OR pr."repasseCartaoAprovadoCentavos" IS NULL)) AS incompleta
        FROM "Proposta" pr
        JOIN "Projeto" j ON j.id = pr."projetoId"
       WHERE pr.status = 'APROVADA' AND pr."deletadoEm" IS NULL AND j."deletadoEm" IS NULL
         AND pr."aceitaEm" >= ${inicio} AND pr."aceitaEm" < ${fimExclusivo}
    )
    SELECT "comNotaFiscal" AS "comNota", count(*)::int AS propostas,
           COALESCE(sum(valor), 0)::bigint AS total, COALESCE(sum(repasse), 0)::bigint AS repasse, COALESCE(sum("repasseCartao"), 0)::bigint AS "repasseCartao",
           (SELECT count(DISTINCT "projetoId") FROM v)::int AS projetos,
           string_agg("numero", ', ') FILTER (WHERE incompleta) AS "numerosIncompletos"
      FROM v GROUP BY "comNotaFiscal"`;
  // Coluna do aceite nula: recusa com erro claro, nunca soma zero em silêncio.
  exigirDadosDoAceite(linhas.flatMap((l) => (l.numerosIncompletos ? l.numerosIncompletos.split(", ") : [])));
  const com = linhas.find((l) => l.comNota);
  const sem = linhas.find((l) => !l.comNota);
  const comNotaCentavos = Number(com?.total ?? 0);
  const semNotaCentavos = Number(sem?.total ?? 0);
  const projetos = linhas[0]?.projetos ?? 0;
  const totalCentavos = comNotaCentavos + semNotaCentavos;
  return {
    totalCentavos,
    comNotaCentavos,
    semNotaCentavos,
    repasseDeImpostoCentavos: Number(com?.repasse ?? 0),
    repasseDeCartaoCentavos: linhas.reduce((s, l) => s + Number(l.repasseCartao ?? 0), 0),
    propostas: (com?.propostas ?? 0) + (sem?.propostas ?? 0),
    projetos,
    ticketMedioCentavos: ticketMedio(totalCentavos, projetos),
  };
}

export type LinhaDeVenda = {
  id: string;
  numero: string;
  projetoId: string;
  projetoCodigo: string;
  projetoTitulo: string;
  cliente: string;
  aceitaEm: Date;
  valorCentavos: number;
  comNotaFiscal: boolean;
};

export const LIMITE_DE_LINHAS_DE_VENDAS = 500;

/** As propostas do período (a lista que explica o número). Devolve também se foi cortada pelo limite. */
export async function listarVendas(p: Periodo): Promise<{ linhas: LinhaDeVenda[]; truncado: boolean }> {
  const encontradas = await prisma.proposta.findMany({
    where: ondeVendas(p),
    orderBy: [{ aceitaEm: "desc" }, { id: "asc" }],
    take: LIMITE_DE_LINHAS_DE_VENDAS + 1,
    select: { id: true, numero: true, revisao: true, aceitaEm: true, valorAprovadoCentavos: true, comNotaFiscal: true, projeto: { select: { id: true, codigo: true, titulo: true, cliente: { select: { nome: true } } } } },
  });
  const truncado = encontradas.length > LIMITE_DE_LINHAS_DE_VENDAS;
  return {
    truncado,
    linhas: encontradas.slice(0, LIMITE_DE_LINHAS_DE_VENDAS).map((x) => ({
      id: x.id,
      numero: x.revisao > 0 ? `${x.numero} (rev. ${x.revisao})` : x.numero,
      projetoId: x.projeto.id,
      projetoCodigo: x.projeto.codigo,
      projetoTitulo: x.projeto.titulo,
      cliente: x.projeto.cliente.nome,
      aceitaEm: x.aceitaEm!,
      valorCentavos: x.valorAprovadoCentavos ?? 0,
      comNotaFiscal: x.comNotaFiscal,
    })),
  };
}
