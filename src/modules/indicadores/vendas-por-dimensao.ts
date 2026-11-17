import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { ticketDoGrupo } from "@/lib/dominio/relatorios-comerciais";
import { limitesEmInstantes, somarMeses, ultimosMeses, type Periodo } from "@/lib/periodo";

/**
 * Relatórios de VENDAS por dimensão (Fase 7B, Bloco 6): origem, parceiro, tipo de serviço e porte, e ano contra ano.
 * Todos usam a MESMA definição de venda de `ondeVendas`/`vendidoNoPeriodo` (proposta APROVADA, a vigente, pelo instante do
 * aceite, projeto e proposta não excluídos); aprovação desfeita não é venda e projeto cancelado depois continua sendo.
 * Datas em SQL sempre em horário de São Paulo: `(coluna AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo'`.
 */

/** As vendas do período (uma linha por proposta aprovada) com os campos do projeto que as dimensões usam. */
function vendasDoPeriodo(p: Periodo): Prisma.Sql {
  const { inicio, fimExclusivo } = limitesEmInstantes(p);
  return Prisma.sql`
    SELECT pr.id AS "propostaId", pr."projetoId", pr."valorAprovadoCentavos" AS valor, j."clienteId", j.origem::text AS origem, j.porte::text AS porte,
           j."tiposServico"::text[] AS tipos, j."arquitetoId", j."construtoraId"
      FROM "Proposta" pr JOIN "Projeto" j ON j.id = pr."projetoId"
     WHERE pr.status = 'APROVADA' AND pr."deletadoEm" IS NULL AND j."deletadoEm" IS NULL
       AND pr."aceitaEm" >= ${inicio} AND pr."aceitaEm" < ${fimExclusivo}`;
}

const num = (v: unknown) => Number(v ?? 0);

// ---------------------------------------------------------------------------------------------------------------------
// Origem com faturamento
// ---------------------------------------------------------------------------------------------------------------------

export type LinhaDeOrigem = {
  /** Código da origem (`null` = não informada). */
  origem: string | null;
  /** Projetos criados no período. */
  leads: number;
  /** Projetos com proposta enviada no período. */
  comProposta: number;
  /** Projetos com venda no período. */
  fechados: number;
  vendidoCentavos: number;
};

/** Leads, propostas, fechamentos e R$ vendido por origem do contato, no período. */
export async function vendasPorOrigem(p: Periodo): Promise<LinhaDeOrigem[]> {
  const { inicio, fimExclusivo } = limitesEmInstantes(p);
  const linhas = await prisma.$queryRaw<{ origem: string | null; leads: number; enviadas: number; fechados: number; total: bigint }[]>`
    WITH v AS (${vendasDoPeriodo(p)}),
    vend AS (SELECT origem, count(DISTINCT "projetoId")::int AS fechados, COALESCE(sum(valor), 0)::bigint AS total FROM v GROUP BY origem),
    leads AS (SELECT origem::text AS origem, count(*)::int AS n FROM "Projeto" WHERE "deletadoEm" IS NULL AND "criadoEm" >= ${inicio} AND "criadoEm" < ${fimExclusivo} GROUP BY origem),
    env AS (SELECT j.origem::text AS origem, count(DISTINCT pr."projetoId")::int AS n
              FROM "Proposta" pr JOIN "Projeto" j ON j.id = pr."projetoId"
             WHERE pr."deletadoEm" IS NULL AND j."deletadoEm" IS NULL AND pr."enviadaEm" >= ${inicio} AND pr."enviadaEm" < ${fimExclusivo} GROUP BY j.origem)
    SELECT o.origem, COALESCE(leads.n, 0)::int AS leads, COALESCE(env.n, 0)::int AS enviadas, COALESCE(vend.fechados, 0)::int AS fechados, COALESCE(vend.total, 0)::bigint AS total
      FROM (SELECT origem FROM vend UNION SELECT origem FROM leads UNION SELECT origem FROM env) o
      LEFT JOIN leads ON leads.origem IS NOT DISTINCT FROM o.origem
      LEFT JOIN env ON env.origem IS NOT DISTINCT FROM o.origem
      LEFT JOIN vend ON vend.origem IS NOT DISTINCT FROM o.origem
     ORDER BY total DESC, leads DESC, o.origem NULLS LAST`;
  return linhas.map((l) => ({ origem: l.origem, leads: l.leads, comProposta: l.enviadas, fechados: l.fechados, vendidoCentavos: num(l.total) }));
}

// ---------------------------------------------------------------------------------------------------------------------
// Desempenho por parceiro (arquiteto ou construtora)
// ---------------------------------------------------------------------------------------------------------------------

export type PapelDeParceiro = "arquiteto" | "construtora";

export type LinhaDeParceiro = {
  parceiroId: string;
  nome: string;
  indicados: number;
  comProposta: number;
  fechados: number;
  vendidoCentavos: number;
};

/** Por parceiro: projetos indicados (criados no período), com proposta enviada, fechados e R$ vendido. */
export async function desempenhoPorParceiro(p: Periodo, papel: PapelDeParceiro): Promise<LinhaDeParceiro[]> {
  const { inicio, fimExclusivo } = limitesEmInstantes(p);
  const coluna = Prisma.raw(papel === "arquiteto" ? `"arquitetoId"` : `"construtoraId"`);
  const colunaJ = Prisma.raw(papel === "arquiteto" ? `j."arquitetoId"` : `j."construtoraId"`);
  const linhas = await prisma.$queryRaw<{ id: string; nome: string; indicados: number; enviadas: number; fechados: number; total: bigint }[]>`
    WITH v AS (${vendasDoPeriodo(p)}),
    vend AS (SELECT ${coluna} AS parceiro, count(DISTINCT "projetoId")::int AS fechados, COALESCE(sum(valor), 0)::bigint AS total FROM v WHERE ${coluna} IS NOT NULL GROUP BY ${coluna}),
    ind AS (SELECT ${coluna} AS parceiro, count(*)::int AS n FROM "Projeto" WHERE "deletadoEm" IS NULL AND ${coluna} IS NOT NULL AND "criadoEm" >= ${inicio} AND "criadoEm" < ${fimExclusivo} GROUP BY ${coluna}),
    env AS (SELECT ${colunaJ} AS parceiro, count(DISTINCT pr."projetoId")::int AS n
              FROM "Proposta" pr JOIN "Projeto" j ON j.id = pr."projetoId"
             WHERE pr."deletadoEm" IS NULL AND j."deletadoEm" IS NULL AND ${colunaJ} IS NOT NULL AND pr."enviadaEm" >= ${inicio} AND pr."enviadaEm" < ${fimExclusivo} GROUP BY ${colunaJ})
    SELECT c.id, c.nome, COALESCE(ind.n, 0)::int AS indicados, COALESCE(env.n, 0)::int AS enviadas, COALESCE(vend.fechados, 0)::int AS fechados, COALESCE(vend.total, 0)::bigint AS total
      FROM (SELECT parceiro FROM vend UNION SELECT parceiro FROM ind UNION SELECT parceiro FROM env) x
      JOIN "Cliente" c ON c.id = x.parceiro
      LEFT JOIN ind ON ind.parceiro = x.parceiro LEFT JOIN env ON env.parceiro = x.parceiro LEFT JOIN vend ON vend.parceiro = x.parceiro
     ORDER BY total DESC, indicados DESC, c.nome`;
  return linhas.map((l) => ({ parceiroId: l.id, nome: l.nome, indicados: l.indicados, comProposta: l.enviadas, fechados: l.fechados, vendidoCentavos: num(l.total) }));
}

// ---------------------------------------------------------------------------------------------------------------------
// Ticket médio por tipo de serviço e por porte
// ---------------------------------------------------------------------------------------------------------------------

export type LinhaDeTicket = { chave: string | null; projetos: number; vendidoCentavos: number; ticketCentavos: number | null };

const comTicket = (l: { chave: string | null; projetos: number; total: bigint }): LinhaDeTicket => ({
  chave: l.chave,
  projetos: l.projetos,
  vendidoCentavos: num(l.total),
  ticketCentavos: ticketDoGrupo(num(l.total), l.projetos),
});

/**
 * Ticket médio (vendido ÷ projetos com venda) por TIPO de serviço. Obra com vários tipos entra em CADA um deles (por isso a
 * soma das linhas passa do total), e obra sem tipo informado entra em "Não informado".
 */
export async function ticketPorTipoDeServico(p: Periodo): Promise<LinhaDeTicket[]> {
  const linhas = await prisma.$queryRaw<{ chave: string | null; projetos: number; total: bigint }[]>`
    WITH v AS (${vendasDoPeriodo(p)})
    SELECT t.tipo AS chave, count(DISTINCT v."projetoId")::int AS projetos, COALESCE(sum(v.valor), 0)::bigint AS total
      FROM v CROSS JOIN LATERAL (SELECT unnest(v.tipos) AS tipo UNION ALL SELECT NULL WHERE cardinality(v.tipos) = 0) t
     GROUP BY t.tipo ORDER BY total DESC, chave NULLS LAST`;
  return linhas.map(comTicket);
}

/** Ticket médio por PORTE do projeto (cada obra tem um porte; sem porte informado, "Não informado"). */
export async function ticketPorPorte(p: Periodo): Promise<LinhaDeTicket[]> {
  const linhas = await prisma.$queryRaw<{ chave: string | null; projetos: number; total: bigint }[]>`
    WITH v AS (${vendasDoPeriodo(p)})
    SELECT porte AS chave, count(DISTINCT "projetoId")::int AS projetos, COALESCE(sum(valor), 0)::bigint AS total FROM v GROUP BY porte ORDER BY total DESC, chave NULLS LAST`;
  return linhas.map(comTicket);
}

// ---------------------------------------------------------------------------------------------------------------------
// Ano contra ano (sazonalidade)
// ---------------------------------------------------------------------------------------------------------------------

export type MesDoAno = { vendidoCentavos: number; propostasEnviadas: number; novosContatos: number };
export type LinhaDeSazonalidade = { mes: string; atual: MesDoAno; anoAnterior: MesDoAno };

const SP = (coluna: string) => Prisma.raw(`to_char((${coluna} AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM')`);

/**
 * Os 12 meses que terminam no mês de `referencia` contra os mesmos meses de um ano antes: vendido (pela data do aceite),
 * propostas enviadas (pela data do envio) e novos contatos (projetos criados). `referencia` é um parâmetro (aaaa-mm-dd):
 * nada aqui lê o relógio, para os testes não dependerem do dia em que rodam.
 */
export async function sazonalidade(referencia: string): Promise<{ meses: LinhaDeSazonalidade[]; periodoAtual: Periodo; periodoAnterior: Periodo }> {
  const atuais = ultimosMeses(referencia, 12);
  const anteriores = ultimosMeses(somarMeses(referencia, -12), 12);
  const periodoAtual: Periodo = { de: atuais[0].de, ate: atuais[atuais.length - 1].ate };
  const periodoAnterior: Periodo = { de: anteriores[0].de, ate: anteriores[anteriores.length - 1].ate };
  const total: Periodo = { de: periodoAnterior.de, ate: periodoAtual.ate };
  const { inicio, fimExclusivo } = limitesEmInstantes(total);

  const [vendas, propostas, contatos] = await Promise.all([
    prisma.$queryRaw<{ mes: string; total: bigint }[]>`
      SELECT ${SP(`pr."aceitaEm"`)} AS mes, COALESCE(sum(pr."valorAprovadoCentavos"), 0)::bigint AS total
        FROM "Proposta" pr JOIN "Projeto" j ON j.id = pr."projetoId"
       WHERE pr.status = 'APROVADA' AND pr."deletadoEm" IS NULL AND j."deletadoEm" IS NULL AND pr."aceitaEm" >= ${inicio} AND pr."aceitaEm" < ${fimExclusivo} GROUP BY 1`,
    prisma.$queryRaw<{ mes: string; n: number }[]>`
      SELECT ${SP(`pr."enviadaEm"`)} AS mes, count(*)::int AS n
        FROM "Proposta" pr JOIN "Projeto" j ON j.id = pr."projetoId"
       WHERE pr."deletadoEm" IS NULL AND j."deletadoEm" IS NULL AND pr."enviadaEm" >= ${inicio} AND pr."enviadaEm" < ${fimExclusivo} GROUP BY 1`,
    prisma.$queryRaw<{ mes: string; n: number }[]>`
      SELECT ${SP(`"criadoEm"`)} AS mes, count(*)::int AS n FROM "Projeto" WHERE "deletadoEm" IS NULL AND "criadoEm" >= ${inicio} AND "criadoEm" < ${fimExclusivo} GROUP BY 1`,
  ]);
  const vendido = new Map(vendas.map((l) => [l.mes, num(l.total)]));
  const enviadas = new Map(propostas.map((l) => [l.mes, l.n]));
  const novos = new Map(contatos.map((l) => [l.mes, l.n]));
  const doMes = (mes: string): MesDoAno => ({ vendidoCentavos: vendido.get(mes) ?? 0, propostasEnviadas: enviadas.get(mes) ?? 0, novosContatos: novos.get(mes) ?? 0 });
  return {
    periodoAtual,
    periodoAnterior,
    meses: atuais.map((m, i) => ({ mes: m.mes, atual: doMes(m.mes), anoAnterior: doMes(anteriores[i].mes) })),
  };
}
