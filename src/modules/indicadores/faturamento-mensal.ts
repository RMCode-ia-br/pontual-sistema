import "server-only";

import { prisma } from "@/lib/db";
import { limitesDeCalendario, limitesEmInstantes, ultimosMeses, type Periodo } from "@/lib/periodo";

/**
 * Faturamento mensal dos últimos 12 meses, com nota e sem nota separados (sem RBT12, sem imposto calculado).
 * Vendido = valor aprovado das propostas pela data do aceite; Recebido = pagamentos pela data do pagamento. Os dois usam
 * as MESMAS regras dos indicadores do painel (`ondeVendas`, `ondeRecebimentos`), só agrupadas por mês.
 */

export type MesDoFaturamento = {
  mes: string;
  de: string;
  ate: string;
  vendidoComNotaCentavos: number;
  vendidoSemNotaCentavos: number;
  /** Parte do vendido com nota que é o acréscimo da nota (repasse de imposto, fora da margem). */
  repasseDeImpostoCentavos: number;
  recebidoComNotaCentavos: number;
  recebidoSemNotaCentavos: number;
};

type LinhaVendas = { mes: string; comNota: boolean; total: bigint; repasse: bigint };
type LinhaRecebido = { mes: string; comNota: boolean; total: bigint };

export async function faturamentoMensal(hoje: string, meses = 12): Promise<{ periodo: Periodo; meses: MesDoFaturamento[] }> {
  const lista = ultimosMeses(hoje, meses);
  const periodo: Periodo = { de: lista[0].de, ate: lista[lista.length - 1].ate };
  const { inicio, fimExclusivo } = limitesEmInstantes(periodo);
  const { de, ate } = limitesDeCalendario(periodo);

  const [vendas, recebidos] = await Promise.all([
    prisma.$queryRaw<LinhaVendas[]>`
      SELECT to_char((pr."aceitaEm" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') AS mes, pr."comNotaFiscal" AS "comNota",
             COALESCE(sum(pr."valorAprovadoCentavos"), 0)::bigint AS total,
             COALESCE(sum((SELECT (o->'totais'->>'acrescimoNotaCentavos')::bigint FROM jsonb_array_elements(pr.snapshot->'opcoes') o WHERE o->>'id' = pr."opcaoAprovadaId")), 0)::bigint AS repasse
        FROM "Proposta" pr JOIN "Projeto" j ON j.id = pr."projetoId"
       WHERE pr.status = 'APROVADA' AND pr."deletadoEm" IS NULL AND j."deletadoEm" IS NULL
         AND pr."aceitaEm" >= ${inicio} AND pr."aceitaEm" < ${fimExclusivo}
       GROUP BY 1, 2`,
    prisma.$queryRaw<LinhaRecebido[]>`
      SELECT to_char(l.data, 'YYYY-MM') AS mes, l."comNotaFiscal" AS "comNota", COALESCE(sum(l."valorCentavos"), 0)::bigint AS total
        FROM "Lancamento" l
       WHERE l.tipo = 'ENTRADA' AND l."contaReceberId" IS NOT NULL AND l."estornadoEm" IS NULL AND l."deletadoEm" IS NULL
         AND l.data >= ${de} AND l.data <= ${ate}
       GROUP BY 1, 2`,
  ]);

  const v = (mes: string, nota: boolean) => vendas.find((x) => x.mes === mes && x.comNota === nota);
  const r = (mes: string, nota: boolean) => Number(recebidos.find((x) => x.mes === mes && x.comNota === nota)?.total ?? 0);
  return {
    periodo,
    meses: lista.map((m) => ({
      mes: m.mes,
      de: m.de,
      ate: m.ate,
      vendidoComNotaCentavos: Number(v(m.mes, true)?.total ?? 0),
      vendidoSemNotaCentavos: Number(v(m.mes, false)?.total ?? 0),
      repasseDeImpostoCentavos: Number(v(m.mes, true)?.repasse ?? 0),
      recebidoComNotaCentavos: r(m.mes, true),
      recebidoSemNotaCentavos: r(m.mes, false),
    })),
  };
}
