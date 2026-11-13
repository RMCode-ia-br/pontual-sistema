import "server-only";

import { prisma } from "@/lib/db";
import { ocupacaoDaFabrica } from "@/lib/dominio/indicadores";
import { somarDias } from "@/lib/periodo";

/**
 * Ocupação da fábrica = m² das obras cuja etapa de FABRICAÇÃO está em andamento ou começa nos próximos 30 dias (inclui a
 * que já deveria ter começado e ainda não começou), ÷ a capacidade mensal em m² de Configurações. Os m² vêm da opção
 * APROVADA, do conteúdo congelado da proposta (a mesma conta do custo da obra). É um retrato de HOJE: não depende do
 * período escolhido no painel.
 */

export const DIAS_A_FRENTE_DA_FABRICA = 30;

export type ObraNaFabrica = {
  projetoId: string;
  codigo: string;
  titulo: string;
  cliente: string;
  m2: number;
  situacao: "EM_ANDAMENTO" | "A_COMECAR";
  inicioPrevisto: string | null;
};

export type Fabrica = {
  capacidadeM2: number | null;
  m2EmProducao: number;
  obras: ObraNaFabrica[];
  ocupacaoPercentual: number | null;
};

type LinhaDoSql = { projetoId: string; codigo: string; titulo: string; cliente: string; status: string; inicioPrevisto: Date | null; m2: string | number };

export async function ocupacaoAtualDaFabrica(hoje: string): Promise<Fabrica> {
  const limite = new Date(`${somarDias(hoje, DIAS_A_FRENTE_DA_FABRICA)}T00:00:00.000Z`);
  const [linhas, config] = await Promise.all([
    prisma.$queryRaw<LinhaDoSql[]>`
      SELECT j.id AS "projetoId", j.codigo, j.titulo, c.nome AS cliente, e.status::text AS status, e."inicioPrevisto",
             COALESCE((SELECT sum((o->'totais'->>'areaM2')::numeric)
                         FROM "Proposta" pr, jsonb_array_elements(pr.snapshot->'opcoes') o
                        WHERE pr."projetoId" = j.id AND pr.status = 'APROVADA' AND pr."deletadoEm" IS NULL
                          AND o->>'id' = pr."opcaoAprovadaId"), 0) AS m2
        FROM "EtapaProjeto" e
        JOIN "Projeto" j ON j.id = e."projetoId" AND j."deletadoEm" IS NULL
        JOIN "Cliente" c ON c.id = j."clienteId"
       WHERE e.tipo = 'FABRICACAO' AND e."deletadoEm" IS NULL AND j.status IN ('APROVADO', 'EM_EXECUCAO')
         AND (e.status = 'EM_ANDAMENTO' OR (e.status = 'PENDENTE' AND e."inicioPrevisto" IS NOT NULL AND e."inicioPrevisto" <= ${limite}))
       ORDER BY e.status, e."inicioPrevisto", j.id`,
    prisma.configuracaoEmpresa.findUnique({ where: { id: "singleton" }, select: { capacidadeProducaoM2Mes: true } }),
  ]);
  const jaVista = new Set<string>();
  const obras: ObraNaFabrica[] = linhas.filter((l) => (jaVista.has(l.projetoId) ? false : (jaVista.add(l.projetoId), true))).map((l) => ({
    projetoId: l.projetoId,
    codigo: l.codigo,
    titulo: l.titulo,
    cliente: l.cliente,
    m2: Math.round(Number(l.m2) * 100) / 100,
    situacao: l.status === "EM_ANDAMENTO" ? "EM_ANDAMENTO" : "A_COMECAR",
    inicioPrevisto: l.inicioPrevisto ? l.inicioPrevisto.toISOString().slice(0, 10) : null,
  }));
  const m2EmProducao = Math.round(obras.reduce((s, o) => s + o.m2, 0) * 100) / 100;
  const capacidadeM2 = config?.capacidadeProducaoM2Mes ?? null;
  return { capacidadeM2, m2EmProducao, obras, ocupacaoPercentual: ocupacaoDaFabrica(m2EmProducao, capacidadeM2) };
}
