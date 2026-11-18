import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { entraNaMediaDeDias, mediaDeDias } from "@/lib/dominio/indicadores";
import { type CasoDePreco, type FaixasDePreco, dividirEmFaixas } from "@/lib/dominio/relatorios-comerciais";
import { formatarMoeda } from "@/lib/formatadores";
import { limitesEmInstantes, periodoPronto, type Periodo } from "@/lib/periodo";

/**
 * Tempos de resposta (proposta → decisão) e ganhas × perdidas por faixa de preço (Fase 7B, Bloco 6). A venda é a mesma
 * de `ondeVendas` (proposta APROVADA, pela data do aceite). Datas em horário de São Paulo. Nada aqui lê o relógio: janelas
 * relativas recebem a data de referência.
 */

const SP = (coluna: string) => Prisma.raw(`((${coluna} AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')::date`);
const num = (v: unknown) => Number(v ?? 0);

// ---------------------------------------------------------------------------------------------------------------------
// Proposta enviada → decisão
// ---------------------------------------------------------------------------------------------------------------------

export type DecisaoDaProposta = { projetoId: string; codigo: string; titulo: string; cliente: string; enviadaEm: Date; decididaEm: Date; dias: number; naMedia: boolean };

export type TemposDeDecisao = {
  /** Média, amostra e "fora da média" valem para TODAS as decisões do período; `linhas` traz até {@link LIMITE_DE_LINHAS_DE_DECISAO} (as mais recentes) e `totalDeLinhas` diz quantas existem. */
  aprovadas: { mediaDias: number | null; amostra: number; foraDaMedia: number; linhas: DecisaoDaProposta[]; totalDeLinhas: number };
  perdidas: { mediaDias: number | null; amostra: number; foraDaMedia: number; linhas: DecisaoDaProposta[]; totalDeLinhas: number; semPropostaEnviada: number };
  /** Propostas enviadas que ainda não foram decididas (hoje, de qualquer data). */
  emAbertoAgora: number;
};

type LinhaDoSql = { projetoId: string; codigo: string; titulo: string; cliente: string; enviadaEm: Date; decididaEm: Date; dias: number };

/** Linhas listadas (as mais recentes); a média, a amostra e o "fora da média" saem de TODOS os dias do período, não só dessas. */
export const LIMITE_DE_LINHAS_DE_DECISAO = 500;
const TETO_DE_DIAS_LIDOS = 100_000;

const montar = (linhas: LinhaDoSql[], todosOsDias: number[]) => {
  const lista = linhas.map((l): DecisaoDaProposta => ({ ...l, naMedia: entraNaMediaDeDias(l.dias) }));
  const dentro = todosOsDias.filter((d) => entraNaMediaDeDias(d));
  return { mediaDias: mediaDeDias(dentro), amostra: dentro.length, foraDaMedia: todosOsDias.length - dentro.length, linhas: lista, totalDeLinhas: todosOsDias.length };
};

/**
 * Aprovadas: dias entre o envio da proposta e o aceite, das propostas APROVADAS no período. Perdidas: dias entre o PRIMEIRO envio
 * de proposta e a perda, dos projetos perdidos no período que tiveram proposta enviada. Dias negativos (aceite anterior ao envio
 * registrado) ficam fora da média e são contados à parte.
 */
export async function temposDeDecisao(p: Periodo): Promise<TemposDeDecisao> {
  const { inicio, fimExclusivo } = limitesEmInstantes(p);
  const [aprovadas, perdidas, semProposta, aberto, diasAprovadas, diasPerdidas] = await Promise.all([
    prisma.$queryRaw<LinhaDoSql[]>`
      SELECT j.id AS "projetoId", j.codigo, j.titulo, c.nome AS cliente, pr."enviadaEm", pr."aceitaEm" AS "decididaEm",
             (${SP('pr."aceitaEm"')} - ${SP('pr."enviadaEm"')})::int AS dias
        FROM "Proposta" pr JOIN "Projeto" j ON j.id = pr."projetoId" JOIN "Cliente" c ON c.id = j."clienteId"
       WHERE pr.status = 'APROVADA' AND pr."deletadoEm" IS NULL AND j."deletadoEm" IS NULL AND pr."enviadaEm" IS NOT NULL
         AND pr."aceitaEm" >= ${inicio} AND pr."aceitaEm" < ${fimExclusivo}
       ORDER BY pr."aceitaEm" DESC, pr.id LIMIT ${LIMITE_DE_LINHAS_DE_DECISAO}`,
    prisma.$queryRaw<LinhaDoSql[]>`
      WITH env AS (SELECT "projetoId", min("enviadaEm") AS enviada FROM "Proposta" WHERE "deletadoEm" IS NULL AND "enviadaEm" IS NOT NULL GROUP BY "projetoId")
      SELECT j.id AS "projetoId", j.codigo, j.titulo, c.nome AS cliente, env.enviada AS "enviadaEm", j."perdidoEm" AS "decididaEm",
             (${SP('j."perdidoEm"')} - ${SP("env.enviada")})::int AS dias
        FROM "Projeto" j JOIN env ON env."projetoId" = j.id JOIN "Cliente" c ON c.id = j."clienteId"
       WHERE j."deletadoEm" IS NULL AND j.status = 'PERDIDO' AND j."perdidoEm" >= ${inicio} AND j."perdidoEm" < ${fimExclusivo}
       ORDER BY j."perdidoEm" DESC, j.id LIMIT ${LIMITE_DE_LINHAS_DE_DECISAO}`,
    prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM "Projeto" j
       WHERE j."deletadoEm" IS NULL AND j.status = 'PERDIDO' AND j."perdidoEm" >= ${inicio} AND j."perdidoEm" < ${fimExclusivo}
         AND NOT EXISTS (SELECT 1 FROM "Proposta" pr WHERE pr."projetoId" = j.id AND pr."deletadoEm" IS NULL AND pr."enviadaEm" IS NOT NULL)`,
    prisma.proposta.count({ where: { status: "ENVIADA", deletadoEm: null, projeto: { deletadoEm: null } } }),
    // Só os dias de TODAS as decisões do período (um inteiro por linha): é daqui que saem a média e as contagens.
    prisma.$queryRaw<{ dias: number }[]>`
      SELECT (${SP('pr."aceitaEm"')} - ${SP('pr."enviadaEm"')})::int AS dias
        FROM "Proposta" pr JOIN "Projeto" j ON j.id = pr."projetoId"
       WHERE pr.status = 'APROVADA' AND pr."deletadoEm" IS NULL AND j."deletadoEm" IS NULL AND pr."enviadaEm" IS NOT NULL
         AND pr."aceitaEm" >= ${inicio} AND pr."aceitaEm" < ${fimExclusivo} LIMIT ${TETO_DE_DIAS_LIDOS}`,
    prisma.$queryRaw<{ dias: number }[]>`
      WITH env AS (SELECT "projetoId", min("enviadaEm") AS enviada FROM "Proposta" WHERE "deletadoEm" IS NULL AND "enviadaEm" IS NOT NULL GROUP BY "projetoId")
      SELECT (${SP('j."perdidoEm"')} - ${SP("env.enviada")})::int AS dias
        FROM "Projeto" j JOIN env ON env."projetoId" = j.id
       WHERE j."deletadoEm" IS NULL AND j.status = 'PERDIDO' AND j."perdidoEm" >= ${inicio} AND j."perdidoEm" < ${fimExclusivo} LIMIT ${TETO_DE_DIAS_LIDOS}`,
  ]);
  return {
    aprovadas: montar(aprovadas, diasAprovadas.map((d) => d.dias)),
    perdidas: { ...montar(perdidas, diasPerdidas.map((d) => d.dias)), semPropostaEnviada: semProposta[0]?.n ?? 0 },
    emAbertoAgora: aberto,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Ganhas × perdidas por faixa de preço
// ---------------------------------------------------------------------------------------------------------------------

export type FaixasDoRelatorio = {
  janela: Periodo;
  casos: CasoDePreco[];
  resultado: FaixasDePreco;
  /** Projetos perdidos na janela que NÃO tiveram proposta enviada: ficam fora (não há valor para comparar). */
  perdidasSemProposta: number;
  /** Perdidos com proposta enviada, mas sem valor no conteúdo congelado: também ficam fora. */
  perdidasSemValor: number;
};

/**
 * Janela = os 12 meses que terminam em `referencia`. Ganha: proposta APROVADA na janela, pelo valor aprovado. Perdida: projeto
 * perdido na janela; o valor é o da ÚLTIMA proposta enviada, pelo maior total entre as opções do conteúdo congelado (o sistema não
 * guarda uma opção "recomendada"). Faixas por quartis dos casos (ganhas e perdidas juntas), ou pelos cortes digitados.
 */
export async function ganhasEPerdidasPorFaixa(referencia: string, cortes: readonly number[] | null): Promise<FaixasDoRelatorio> {
  const janela = periodoPronto("12m", referencia);
  const { inicio, fimExclusivo } = limitesEmInstantes(janela);
  const [ganhas, perdidas] = await Promise.all([
    prisma.$queryRaw<{ valor: bigint }[]>`
      SELECT pr."valorAprovadoCentavos"::bigint AS valor FROM "Proposta" pr JOIN "Projeto" j ON j.id = pr."projetoId"
       WHERE pr.status = 'APROVADA' AND pr."deletadoEm" IS NULL AND j."deletadoEm" IS NULL AND pr."aceitaEm" >= ${inicio} AND pr."aceitaEm" < ${fimExclusivo}`,
    prisma.$queryRaw<{ tem: boolean; valor: bigint | null }[]>`
      WITH ult AS (
        SELECT DISTINCT ON (pr."projetoId") pr."projetoId", pr.snapshot FROM "Proposta" pr
         WHERE pr."deletadoEm" IS NULL AND pr."enviadaEm" IS NOT NULL ORDER BY pr."projetoId", pr."enviadaEm" DESC, pr.id DESC)
      SELECT (ult."projetoId" IS NOT NULL) AS tem,
             (SELECT max((o->'totais'->>'totalCentavos')::bigint) FROM jsonb_array_elements(COALESCE(ult.snapshot->'opcoes', '[]'::jsonb)) o) AS valor
        FROM "Projeto" j LEFT JOIN ult ON ult."projetoId" = j.id
       WHERE j."deletadoEm" IS NULL AND j.status = 'PERDIDO' AND j."perdidoEm" >= ${inicio} AND j."perdidoEm" < ${fimExclusivo}`,
  ]);
  const casos: CasoDePreco[] = [
    ...ganhas.filter((g) => num(g.valor) > 0).map((g) => ({ valorCentavos: num(g.valor), ganha: true })),
    ...perdidas.filter((l) => l.tem && l.valor !== null && num(l.valor) > 0).map((l) => ({ valorCentavos: num(l.valor), ganha: false })),
  ];
  return {
    janela,
    casos,
    resultado: dividirEmFaixas(casos, cortes, formatarMoeda),
    perdidasSemProposta: perdidas.filter((l) => !l.tem).length,
    perdidasSemValor: perdidas.filter((l) => l.tem && (l.valor === null || num(l.valor) <= 0)).length,
  };
}
