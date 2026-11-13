import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { limiteInformado, percentualDoLimite } from "@/lib/dominio/indicadores";
import { limitesDeCalendario, periodoPronto, type Periodo } from "@/lib/periodo";

/**
 * Recebido = soma dos pagamentos de contas a receber, pela data do pagamento, sem estornos. A marca "com nota fiscal" que
 * vale é a do PRÓPRIO pagamento (`Lancamento.comNotaFiscal`), não a da conta a receber, que guarda só a do último
 * pagamento (decisão 117).
 */

export type FiltroDeNota = "com" | "sem";

/** A MESMA cláusula do painel, do relatório e da lista de recebimentos. */
export function ondeRecebimentos(p: Periodo, nota?: FiltroDeNota): Prisma.LancamentoWhereInput {
  const { de, ate } = limitesDeCalendario(p);
  return {
    tipo: "ENTRADA",
    contaReceberId: { not: null },
    estornadoEm: null,
    deletadoEm: null,
    data: { gte: de, lte: ate },
    ...(nota ? { comNotaFiscal: nota === "com" } : {}),
  };
}

export type Recebido = { totalCentavos: number; comNotaCentavos: number; semNotaCentavos: number; quantidade: number };

export async function recebidoNoPeriodo(p: Periodo): Promise<Recebido> {
  const grupos = await prisma.lancamento.groupBy({ by: ["comNotaFiscal"], where: ondeRecebimentos(p), _sum: { valorCentavos: true }, _count: { _all: true } });
  const soma = (nota: boolean) => grupos.find((g) => g.comNotaFiscal === nota)?._sum.valorCentavos ?? 0;
  const comNotaCentavos = soma(true);
  const semNotaCentavos = soma(false);
  return { comNotaCentavos, semNotaCentavos, totalCentavos: comNotaCentavos + semNotaCentavos, quantidade: grupos.reduce((s, g) => s + g._count._all, 0) };
}

export type FaturamentoComNota = {
  periodo: Periodo;
  recebidoCentavos: number;
  pagamentos: number;
  /** Limite de Configurações; `null` = não informado (vazio ou zero). */
  limiteCentavos: number | null;
  /** Percentual do limite já recebido com nota; `null` sem limite informado. */
  percentualDoLimite: number | null;
  /** Entradas avulsas (sem conta a receber) marcadas com nota: ficam FORA da soma, e a tela avisa. */
  avulsasComNotaForaDaSoma: number;
};

/** "Recebido com nota fiscal nos últimos 12 meses": acompanhamento gerencial, não é apuração. Sem alíquota nem alerta fiscal. */
export async function faturamentoComNota(hoje: string): Promise<FaturamentoComNota> {
  const periodo = periodoPronto("12m", hoje);
  const { de, ate } = limitesDeCalendario(periodo);
  const [soma, config, avulsas] = await Promise.all([
    prisma.lancamento.aggregate({ where: ondeRecebimentos(periodo, "com"), _sum: { valorCentavos: true }, _count: { _all: true } }),
    prisma.configuracaoEmpresa.findUnique({ where: { id: "singleton" }, select: { limiteSimplesCentavos: true } }),
    prisma.lancamento.count({ where: { tipo: "ENTRADA", contaReceberId: null, transferenciaId: null, comNotaFiscal: true, estornadoEm: null, deletadoEm: null, data: { gte: de, lte: ate } } }),
  ]);
  const recebidoCentavos = soma._sum.valorCentavos ?? 0;
  const limiteCentavos = limiteInformado(config?.limiteSimplesCentavos);
  return { periodo, recebidoCentavos, pagamentos: soma._count._all, limiteCentavos, percentualDoLimite: percentualDoLimite(recebidoCentavos, limiteCentavos), avulsasComNotaForaDaSoma: avulsas };
}
