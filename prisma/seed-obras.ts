/**
 * Dados e semeadura da Fase 4 (Obras): o modelo padrão de etapas (R7), editável em Configurações.
 * NENHUMA duração é gravada: os dias de cada grupo vêm da proposta (nada é inventado). O mapa
 * gatilho → etapa e o marco da garantia seguem o padrão da spec (R6/R12) e ficam em PENDENCIAS para o
 * Marcelo confirmar. Idempotente: se já existe qualquer modelo (inclusive na lixeira), nada é recriado.
 */
import type { PrismaClient } from "../src/generated/prisma/client";
import type { ItemDoModelo } from "../src/lib/dominio/etapas";

export const MODELO_PADRAO_DE_ETAPAS: ItemDoModelo[] = [
  { tipo: "MEDICAO_EXATA", nome: "Medição exata", ordem: 1, grupoPrazo: null, peso: 1, liberaGatilho: null, marcoGarantia: false, exigeEsquadria: false, ativo: true },
  { tipo: "PEDIDO_MATERIAL", nome: "Pedido de material", ordem: 2, grupoPrazo: "MATERIAL", peso: 1, liberaGatilho: null, marcoGarantia: false, exigeEsquadria: true, ativo: true },
  { tipo: "FABRICACAO", nome: "Fabricação", ordem: 3, grupoPrazo: "MATERIAL", peso: 1, liberaGatilho: "ENTREGA_MATERIAL", marcoGarantia: false, exigeEsquadria: true, ativo: true },
  { tipo: "INSTALACAO_ESQUADRIAS", nome: "Instalação das esquadrias", ordem: 4, grupoPrazo: "EXECUCAO", peso: 1, liberaGatilho: null, marcoGarantia: false, exigeEsquadria: true, ativo: true },
  { tipo: "MEDICAO_VIDROS", nome: "Medição dos vidros", ordem: 5, grupoPrazo: "VIDROS_FINALIZACAO", peso: 1, liberaGatilho: null, marcoGarantia: false, exigeEsquadria: false, ativo: true },
  { tipo: "PEDIDO_VIDROS", nome: "Pedido dos vidros", ordem: 6, grupoPrazo: "VIDROS_FINALIZACAO", peso: 1, liberaGatilho: null, marcoGarantia: false, exigeEsquadria: false, ativo: true },
  { tipo: "INSTALACAO_VIDROS", nome: "Instalação dos vidros", ordem: 7, grupoPrazo: "VIDROS_FINALIZACAO", peso: 1, liberaGatilho: "ENTREGA_E_INSTALACAO", marcoGarantia: true, exigeEsquadria: false, ativo: true },
  { tipo: "ACABAMENTO", nome: "Acabamento", ordem: 8, grupoPrazo: "VIDROS_FINALIZACAO", peso: 1, liberaGatilho: null, marcoGarantia: false, exigeEsquadria: false, ativo: true },
  { tipo: "ENTREGA", nome: "Entrega", ordem: 9, grupoPrazo: "VIDROS_FINALIZACAO", peso: 1, liberaGatilho: null, marcoGarantia: false, exigeEsquadria: false, ativo: true },
];

export async function semearObras(prisma: PrismaClient): Promise<string> {
  if ((await prisma.modeloEtapas.count()) > 0) return "modelo de etapas: já existe, nada a fazer";

  await prisma.modeloEtapas.create({
    data: {
      nome: "Modelo padrão",
      padrao: true,
      itens: { create: MODELO_PADRAO_DE_ETAPAS.map((i) => ({ ...i })) },
    },
  });
  return `modelo de etapas: criado com ${MODELO_PADRAO_DE_ETAPAS.length} etapas (sem durações)`;
}
