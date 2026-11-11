import "server-only";

import { prisma } from "@/lib/db";
import { hojeCalendario } from "@/lib/formatadores";
import { MESES_SEM_CONTATO } from "@/modules/clientes/queries";
import { DIAS_CUSTO_DESATUALIZADO } from "@/modules/produtos/queries";

export type ResumoDeCadastros = {
  clientesAtivos: number;
  clientesNovosNoMes: number;
  parceiros: number;
  clientesSemContato: number;
  produtosSemCusto: number;
  produtosComCustoAntigo: number;
};

/**
 * Números do painel (Fase 1). Cada um tem a definição mostrada na tela e leva à lista já filtrada.
 * Tudo conta só cadastros ativos e fora da lixeira.
 */
export async function resumoDeCadastros(): Promise<ResumoDeCadastros> {
  const agora = new Date();
  const hoje = hojeCalendario(agora);
  const inicioDoMes = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1));
  const limiteContato = new Date(agora);
  limiteContato.setMonth(limiteContato.getMonth() - MESES_SEM_CONTATO);
  const limiteCusto = new Date(agora.getTime() - DIAS_CUSTO_DESATUALIZADO * 86_400_000);

  const clientes = { deletadoEm: null, ativo: true };
  const produtos = { deletadoEm: null, ativo: true };
  const [clientesAtivos, clientesNovosNoMes, parceiros, clientesSemContato, produtosSemCusto, produtosComCustoAntigo] = await Promise.all([
    prisma.cliente.count({ where: clientes }),
    prisma.cliente.count({ where: { ...clientes, criadoEm: { gte: inicioDoMes } } }),
    prisma.cliente.count({ where: { ...clientes, OR: [{ arquiteto: true }, { construtora: true }] } }),
    prisma.cliente.count({
      where: { ...clientes, criadoEm: { lt: limiteContato }, interacoes: { none: { deletadoEm: null, tipo: { not: "SISTEMA" }, criadoEm: { gte: limiteContato } } } },
    }),
    prisma.produto.count({ where: { ...produtos, custoUnitarioCentavos: null } }),
    prisma.produto.count({ where: { ...produtos, custoUnitarioCentavos: { not: null }, custoAtualizadoEm: { lt: limiteCusto } } }),
  ]);
  return { clientesAtivos, clientesNovosNoMes, parceiros, clientesSemContato, produtosSemCusto, produtosComCustoAntigo };
}
