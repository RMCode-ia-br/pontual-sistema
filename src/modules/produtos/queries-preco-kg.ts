import "server-only";

import { prisma } from "@/lib/db";

export type PrecoDoAcabamento = {
  id: string;
  nome: string;
  /** Preço para qualquer linha; null = sem preço do kg. */
  geralCentavos: number | null;
  porLinha: { linhaId: string; linhaNome: string; custoKgCentavos: number | null }[];
  /** Perfis por kg deste acabamento. */
  perfis: number;
  /** Perfis por kg deste acabamento ainda sem custo (falta preço do kg, peso por metro ou comprimento). */
  perfisSemCusto: number;
  /** Perfis que não têm peso por metro: sem ele o custo por barra e por metro não sai. */
  perfisSemPeso: number;
};

export type TelaDoPrecoKg = { acabamentos: PrecoDoAcabamento[]; linhas: { id: string; nome: string }[]; perfisSemAcabamento: number };

/** Tudo da tela "Preço do kg do alumínio": um cartão por acabamento ativo, com o preço geral, o por linha e os avisos. */
export async function carregarTelaDoPrecoKg(): Promise<TelaDoPrecoKg> {
  const ordem = [{ ordem: "asc" as const }, { nome: "asc" as const }];
  const [acabamentos, linhas, precos, perfis, semAcabamento] = await Promise.all([
    prisma.acabamentoAluminio.findMany({ where: { ativo: true, deletadoEm: null }, orderBy: ordem, select: { id: true, nome: true } }),
    prisma.linhaAluminio.findMany({ where: { ativo: true, deletadoEm: null }, orderBy: ordem, select: { id: true, nome: true } }),
    prisma.precoKgAluminio.findMany({ where: { deletadoEm: null }, select: { acabamentoId: true, linhaId: true, custoKgCentavos: true } }),
    prisma.produto.findMany({
      where: { custoPorKg: true, deletadoEm: null, ativo: true, acabamentoId: { not: null } },
      select: { acabamentoId: true, custoUnitarioCentavos: true, pesoKgPorMetro: true },
    }),
    prisma.produto.count({ where: { custoPorKg: true, deletadoEm: null, ativo: true, acabamentoId: null } }),
  ]);
  const nomeDaLinha = new Map(linhas.map((l) => [l.id, l.nome]));
  return {
    linhas,
    perfisSemAcabamento: semAcabamento,
    acabamentos: acabamentos.map((a) => {
      const meus = precos.filter((p) => p.acabamentoId === a.id);
      const deste = perfis.filter((p) => p.acabamentoId === a.id);
      return {
        id: a.id,
        nome: a.nome,
        geralCentavos: meus.find((p) => p.linhaId === null)?.custoKgCentavos ?? null,
        porLinha: meus.filter((p) => p.linhaId !== null && nomeDaLinha.has(p.linhaId)).map((p) => ({ linhaId: p.linhaId!, linhaNome: nomeDaLinha.get(p.linhaId!)!, custoKgCentavos: p.custoKgCentavos })),
        perfis: deste.length,
        perfisSemCusto: deste.filter((p) => p.custoUnitarioCentavos === null).length,
        perfisSemPeso: deste.filter((p) => p.pesoKgPorMetro === null).length,
      };
    }),
  };
}
