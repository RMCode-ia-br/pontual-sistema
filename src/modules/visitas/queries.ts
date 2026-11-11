import "server-only";

import { prisma } from "@/lib/db";

export type MedidaDoVao = {
  id: string;
  eventoId: string | null;
  ambiente: string | null;
  tipologia: string | null;
  larguraMm: number | null;
  alturaMm: number | null;
  quantidade: number;
  observacao: string | null;
};

/** Medidas-rascunho de um projeto, na ordem em que foram anotadas. */
export async function listarMedidasDoProjeto(projetoId: string): Promise<MedidaDoVao[]> {
  return prisma.medidaRascunho.findMany({
    where: { projetoId, deletadoEm: null },
    orderBy: [{ ordem: "asc" }, { criadoEm: "asc" }],
    take: 200,
    select: { id: true, eventoId: true, ambiente: true, tipologia: true, larguraMm: true, alturaMm: true, quantidade: true, observacao: true },
  });
}

/**
 * Ponto de extensão da Fase 3 ("Importar medidas da visita para a proposta"): as medidas COMPLETAS (com largura e
 * altura) viram itens da proposta. Medidas sem largura ou altura ficam de fora e voltam em `incompletas`, para a
 * tela avisar quais faltam em vez de criar um item com valor inventado.
 */
export async function medidasParaProposta(projetoId: string): Promise<{ prontas: (MedidaDoVao & { larguraMm: number; alturaMm: number })[]; incompletas: MedidaDoVao[] }> {
  const todas = await listarMedidasDoProjeto(projetoId);
  const prontas: (MedidaDoVao & { larguraMm: number; alturaMm: number })[] = [];
  const incompletas: MedidaDoVao[] = [];
  for (const m of todas) {
    if (m.larguraMm !== null && m.alturaMm !== null) prontas.push({ ...m, larguraMm: m.larguraMm, alturaMm: m.alturaMm });
    else incompletas.push(m);
  }
  return { prontas, incompletas };
}

/** Dados da obra para a tela de visita: projeto, endereço da obra (com condomínio) e arquiteto. */
export async function obterDadosDaObra(projetoId: string) {
  const p = await prisma.projeto.findFirst({
    where: { id: projetoId, deletadoEm: null },
    select: {
      id: true,
      faseDaObra: true,
      prazoDesejado: true,
      investimentoPrevistoCentavos: true,
      arquiteto: { select: { id: true, nome: true } },
      enderecoObra: {
        select: { id: true, logradouro: true, numero: true, bairro: true, cidade: true, uf: true, condominio: true, condominioNome: true, exigeAprovacaoFachada: true, fachadaAprovada: true, horariosPermitidos: true, sindicoNome: true, sindicoTelefone: true },
      },
    },
  });
  return p;
}
