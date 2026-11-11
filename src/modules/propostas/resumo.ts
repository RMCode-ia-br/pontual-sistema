import "server-only";

import { prisma } from "@/lib/db";
import { limitesDoDia } from "@/lib/dominio/agenda";
import { calcularTotais } from "@/lib/dominio/preco";
import { dataLocalDoInstante } from "@/lib/formatadores";
import { obterConfiguracao } from "@/modules/configuracoes/queries";

export type ResumoPropostas = {
  rascunhos: number;
  enviadas: number;
  /** Soma da MAIOR opção de cada proposta enviada (o que está na mesa), já com a nota fiscal quando houver. */
  enviadasValorCentavos: number;
  /** Enviadas há mais dias que o prazo "sem retorno" de Configurações. */
  semResposta: number;
  aprovadasNoMes: number;
  aprovadasNoMesValorCentavos: number;
  recusadasNoMes: number;
};

/**
 * Números do painel de propostas (definições mostradas na tela):
 * - enviadas: propostas com a situação "Enviada" (a revisão vigente de cada número);
 * - valor: soma, por proposta, da maior opção (com nota fiscal, se houver);
 * - sem resposta: enviadas há mais que o prazo configurado;
 * - aprovadas/recusadas do mês: decididas desde o dia 1º (data do aceite / da recusa).
 */
export async function resumoDePropostas(): Promise<ResumoPropostas> {
  const agora = new Date();
  const inicioDoMes = limitesDoDia(`${dataLocalDoInstante(agora).slice(0, 8)}01`).inicio;
  const config = await obterConfiguracao();
  const limite = new Date(agora.getTime() - (config?.diasSemRetornoProposta ?? 7) * 86_400_000);
  const base = { deletadoEm: null, projeto: { deletadoEm: null } } as const;

  const [rascunhos, enviadas, aprovadas, recusadas] = await Promise.all([
    prisma.proposta.count({ where: { ...base, status: "RASCUNHO" } }),
    prisma.proposta.findMany({
      where: { ...base, status: "ENVIADA" },
      take: 1000,
      select: {
        enviadaEm: true,
        comNotaFiscal: true,
        acrescimoNotaPb: true,
        opcoes: { where: { deletadoEm: null }, select: { id: true, descontoCentavos: true } },
        itens: { where: { deletadoEm: null }, select: { opcaoId: true, precoTotalCentavos: true } },
      },
    }),
    prisma.proposta.aggregate({ where: { ...base, status: "APROVADA", aceitaEm: { gte: inicioDoMes } }, _count: { _all: true }, _sum: { valorAprovadoCentavos: true } }),
    prisma.proposta.count({ where: { ...base, status: "RECUSADA", recusadaEm: { gte: inicioDoMes } } }),
  ]);

  let valor = 0;
  let semResposta = 0;
  for (const p of enviadas) {
    const totais = calcularTotais(p.itens.map((i) => ({ opcaoId: i.opcaoId, precoTotalCentavos: i.precoTotalCentavos, medidas: [] })), p.opcoes.map((o) => ({ id: o.id, descontoCentavos: o.descontoCentavos })), p.comNotaFiscal, p.acrescimoNotaPb);
    valor += Math.max(0, ...totais.map((t) => t.totalCentavos));
    if (p.enviadaEm && p.enviadaEm < limite) semResposta++;
  }
  return {
    rascunhos,
    enviadas: enviadas.length,
    enviadasValorCentavos: valor,
    semResposta,
    aprovadasNoMes: aprovadas._count._all,
    aprovadasNoMesValorCentavos: aprovadas._sum.valorAprovadoCentavos ?? 0,
    recusadasNoMes: recusadas,
  };
}
