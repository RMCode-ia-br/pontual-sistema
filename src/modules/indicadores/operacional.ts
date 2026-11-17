import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { ocupacaoDaFabrica } from "@/lib/dominio/indicadores";
import { limitesEmInstantes, type Periodo } from "@/lib/periodo";

/**
 * Indicadores operacionais da Fase 7B (Bloco 7): m² produzidos por mês × capacidade, pedidos de avaliação no Google × obras
 * entregues e obras em andamento. Datas de calendário (`@db.Date`) comparam direto; instantes seguem o horário de São Paulo.
 */

const num = (v: unknown) => Number(v ?? 0);
export const LIMITE_DE_OBRAS_EM_ANDAMENTO = 1000;
export const LIMITE_DE_ENTREGAS_NA_LISTA = 500;

// ---------------------------------------------------------------------------------------------------------------------
// Produção por mês
// ---------------------------------------------------------------------------------------------------------------------

export type MesDeProducao = { mes: string; m2: number; obras: number; ocupacaoPercentual: number | null };

/**
 * m² por mês de FABRICAÇÃO CONCLUÍDA (data real de fim da etapa), de cada obra com a etapa concluída no período, contra a
 * capacidade mensal de Configurações. Os m² vêm da opção aprovada, como no retrato de hoje. Mês sem nada concluído mostra 0 m²
 * (é um fato: nada saiu da fábrica). Capacidade não informada: percentual vazio, nunca inventado.
 */
export async function producaoPorMes(p: Periodo): Promise<{ meses: MesDeProducao[]; capacidadeM2: number | null; obrasSemArea: number }> {
  const [linhas, config] = await Promise.all([
    prisma.$queryRaw<{ mes: string; m2: Prisma.Decimal | null; obras: number; sem_area: number }[]>`
      WITH fim AS (
        SELECT e."projetoId", max(e."fimReal") AS fim
          FROM "EtapaProjeto" e JOIN "Projeto" j ON j.id = e."projetoId" AND j."deletadoEm" IS NULL
         WHERE e.tipo = 'FABRICACAO' AND e.status = 'CONCLUIDA' AND e."deletadoEm" IS NULL AND e."fimReal" IS NOT NULL
           AND e."fimReal" >= ${p.de}::date AND e."fimReal" <= ${p.ate}::date
         GROUP BY e."projetoId"),
      area AS (
        SELECT fim."projetoId", to_char(fim.fim, 'YYYY-MM') AS mes,
               (SELECT sum((o->'totais'->>'areaM2')::numeric) FROM "Proposta" pr, jsonb_array_elements(pr.snapshot->'opcoes') o
                 WHERE pr."projetoId" = fim."projetoId" AND pr.status = 'APROVADA' AND pr."deletadoEm" IS NULL AND o->>'id' = pr."opcaoAprovadaId") AS m2
          FROM fim)
      SELECT mes, COALESCE(sum(m2), 0) AS m2, count(*)::int AS obras, count(*) FILTER (WHERE m2 IS NULL)::int AS sem_area FROM area GROUP BY mes ORDER BY mes`,
    prisma.configuracaoEmpresa.findUnique({ where: { id: "singleton" }, select: { capacidadeProducaoM2Mes: true } }),
  ]);
  const capacidadeM2 = config?.capacidadeProducaoM2Mes ?? null;
  const porMes = new Map(linhas.map((l) => [l.mes, l]));
  const meses: MesDeProducao[] = [];
  for (let mes = p.de.slice(0, 7); mes <= p.ate.slice(0, 7); mes = proximoMes(mes)) {
    const l = porMes.get(mes);
    const m2 = Math.round(num(l?.m2) * 100) / 100;
    meses.push({ mes, m2, obras: l?.obras ?? 0, ocupacaoPercentual: ocupacaoDaFabrica(m2, capacidadeM2) });
  }
  return { meses, capacidadeM2, obrasSemArea: linhas.reduce((s, l) => s + l.sem_area, 0) };
}

function proximoMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Avaliações no Google × obras entregues
// ---------------------------------------------------------------------------------------------------------------------

export type SituacaoDoPedido = "FEITO" | "ABERTO" | "CANCELADO" | "SEM_TAREFA";
export type EntregaParaAvaliar = { projetoId: string; codigo: string; titulo: string; cliente: string; entregueEm: Date; situacao: SituacaoDoPedido; pedidoFeitoEm: Date | null };
export type Avaliacoes = {
  obrasEntregues: number;
  pedidosFeitos: number;
  pedidosEmAberto: number;
  pedidosVencidos: number;
  linhas: EntregaParaAvaliar[];
  truncado: boolean;
};

/**
 * Obras entregues no período (etapa de entrega concluída) e o pedido de avaliação de cada uma. "Pedido feito" = a tarefa
 * "Pedir avaliação no Google" foi marcada como concluída (o sistema não sabe se a mensagem saiu; é o que a pessoa marcou).
 * `pedidosFeitos` conta pela data em que a tarefa foi concluída, e por isso pode incluir obras entregues antes do período.
 */
export async function avaliacoesDoGoogle(p: Periodo, hoje: string): Promise<Avaliacoes> {
  const { inicio, fimExclusivo } = limitesEmInstantes(p);
  const [linhas, resumo] = await Promise.all([
    prisma.$queryRaw<{ id: string; codigo: string; titulo: string; cliente: string; entregue: Date; status: string | null; concluida: Date | null }[]>`
      WITH ent AS (
        SELECT e."projetoId", max(e."fimReal") AS entregue
          FROM "EtapaProjeto" e JOIN "Projeto" j ON j.id = e."projetoId" AND j."deletadoEm" IS NULL
         WHERE e.tipo = 'ENTREGA' AND e.status = 'CONCLUIDA' AND e."deletadoEm" IS NULL AND e."fimReal" >= ${p.de}::date AND e."fimReal" <= ${p.ate}::date
         GROUP BY e."projetoId")
      SELECT j.id, j.codigo, j.titulo, c.nome AS cliente, ent.entregue, t.status::text AS status, t."concluidaEm" AS concluida
        FROM ent JOIN "Projeto" j ON j.id = ent."projetoId" JOIN "Cliente" c ON c.id = j."clienteId"
        LEFT JOIN LATERAL (SELECT status, "concluidaEm" FROM "Tarefa" WHERE "projetoId" = j.id AND tipo = 'PEDIR_AVALIACAO' AND "deletadoEm" IS NULL
                            ORDER BY (status = 'CANCELADA'), "criadoEm" DESC LIMIT 1) t ON true
       ORDER BY ent.entregue DESC, j.id LIMIT ${LIMITE_DE_ENTREGAS_NA_LISTA + 1}`,
    prisma.$queryRaw<{ entregues: number; feitos: number; abertos: number; vencidos: number }[]>`
      SELECT (SELECT count(DISTINCT e."projetoId") FROM "EtapaProjeto" e JOIN "Projeto" j ON j.id = e."projetoId" AND j."deletadoEm" IS NULL
               WHERE e.tipo = 'ENTREGA' AND e.status = 'CONCLUIDA' AND e."deletadoEm" IS NULL AND e."fimReal" >= ${p.de}::date AND e."fimReal" <= ${p.ate}::date)::int AS entregues,
             (SELECT count(DISTINCT "projetoId") FROM "Tarefa" WHERE tipo = 'PEDIR_AVALIACAO' AND status = 'CONCLUIDA' AND "deletadoEm" IS NULL
               AND "concluidaEm" >= ${inicio} AND "concluidaEm" < ${fimExclusivo})::int AS feitos,
             (SELECT count(*) FROM "Tarefa" WHERE tipo = 'PEDIR_AVALIACAO' AND status = 'ABERTA' AND "deletadoEm" IS NULL)::int AS abertos,
             (SELECT count(*) FROM "Tarefa" WHERE tipo = 'PEDIR_AVALIACAO' AND status = 'ABERTA' AND "deletadoEm" IS NULL AND vencimento < ${hoje}::date)::int AS vencidos`,
  ]);
  const situacao = (s: string | null): SituacaoDoPedido => (s === "CONCLUIDA" ? "FEITO" : s === "ABERTA" ? "ABERTO" : s === "CANCELADA" ? "CANCELADO" : "SEM_TAREFA");
  return {
    obrasEntregues: resumo[0]?.entregues ?? 0,
    pedidosFeitos: resumo[0]?.feitos ?? 0,
    pedidosEmAberto: resumo[0]?.abertos ?? 0,
    pedidosVencidos: resumo[0]?.vencidos ?? 0,
    linhas: linhas.slice(0, LIMITE_DE_ENTREGAS_NA_LISTA).map((l) => ({ projetoId: l.id, codigo: l.codigo, titulo: l.titulo, cliente: l.cliente, entregueEm: l.entregue, situacao: situacao(l.status), pedidoFeitoEm: l.concluida })),
    truncado: linhas.length > LIMITE_DE_ENTREGAS_NA_LISTA,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Obras em andamento
// ---------------------------------------------------------------------------------------------------------------------

export type ObraEmAndamento = {
  projetoId: string;
  codigo: string;
  titulo: string;
  cliente: string;
  status: string;
  etapaAtual: string | null;
  etapaBloqueada: boolean;
  fimPrevistoDaEtapa: Date | null;
  etapasConcluidas: number;
  etapasTotal: number;
};

/** Obras aprovadas ou em execução, com a etapa em que estão (a primeira em andamento, senão a primeira pendente) e quantas etapas já terminaram. */
export async function obrasEmAndamento(): Promise<{ linhas: ObraEmAndamento[]; truncado: boolean }> {
  const linhas = await prisma.$queryRaw<{ id: string; codigo: string; titulo: string; cliente: string; status: string; etapa: string | null; bloqueada: boolean | null; fim: Date | null; concluidas: number; total: number }[]>`
    SELECT j.id, j.codigo, j.titulo, c.nome AS cliente, j.status::text AS status,
           atual.nome AS etapa, (atual.status = 'BLOQUEADA') AS bloqueada, atual."fimPrevisto" AS fim,
           COALESCE(cont.concluidas, 0)::int AS concluidas, COALESCE(cont.total, 0)::int AS total
      FROM "Projeto" j JOIN "Cliente" c ON c.id = j."clienteId"
      LEFT JOIN LATERAL (SELECT nome, status, "fimPrevisto" FROM "EtapaProjeto" WHERE "projetoId" = j.id AND "deletadoEm" IS NULL AND status IN ('EM_ANDAMENTO', 'BLOQUEADA', 'PENDENTE')
                          ORDER BY (CASE status WHEN 'EM_ANDAMENTO' THEN 0 WHEN 'BLOQUEADA' THEN 1 ELSE 2 END), ordem LIMIT 1) atual ON true
      LEFT JOIN LATERAL (SELECT count(*) FILTER (WHERE status = 'CONCLUIDA') AS concluidas, count(*) AS total FROM "EtapaProjeto" WHERE "projetoId" = j.id AND "deletadoEm" IS NULL AND status <> 'DISPENSADA') cont ON true
     WHERE j."deletadoEm" IS NULL AND j.status IN ('APROVADO', 'EM_EXECUCAO')
     ORDER BY j.codigo LIMIT ${LIMITE_DE_OBRAS_EM_ANDAMENTO + 1}`;
  return {
    linhas: linhas.slice(0, LIMITE_DE_OBRAS_EM_ANDAMENTO).map((l) => ({ projetoId: l.id, codigo: l.codigo, titulo: l.titulo, cliente: l.cliente, status: l.status, etapaAtual: l.etapa, etapaBloqueada: l.bloqueada === true, fimPrevistoDaEtapa: l.fim, etapasConcluidas: l.concluidas, etapasTotal: l.total })),
    truncado: linhas.length > LIMITE_DE_OBRAS_EM_ANDAMENTO,
  };
}
