import "server-only";

import { prisma } from "@/lib/db";
import { somarDias } from "@/lib/dominio/calendario";
import { calcularFunil, type LinhaDoFunil, type ResultadoDoFunil } from "@/lib/dominio/relatorio-funil";
import { dataLocalDoInstante, inputParaData } from "@/lib/formatadores";
import type { ParametrosBrutos } from "@/lib/listas/parametros";
import { filtroDeProjetos, lerFiltrosProjetos, type FiltrosProjetos } from "@/modules/projetos/queries";

/** Dias da janela padrão do relatório (a spec usa 90 dias para fechamento). */
export const DIAS_DA_JANELA_PADRAO = 90;
const LIMITE_DA_COORTE = 20_000;

export type FiltrosDoRelatorio = Pick<FiltrosProjetos, "origem" | "responsavelId" | "porte"> & { de: string; ate: string };

export function lerFiltrosDoRelatorio(brutos: ParametrosBrutos): FiltrosDoRelatorio {
  const f = lerFiltrosProjetos(brutos);
  const hoje = dataLocalDoInstante(new Date());
  const ate = f.ate && inputParaData(f.ate) ? f.ate : hoje;
  const de = f.de && inputParaData(f.de) ? f.de : somarDias(ate, -(DIAS_DA_JANELA_PADRAO - 1));
  return { de: de <= ate ? de : ate, ate, origem: f.origem, responsavelId: f.responsavelId, porte: f.porte };
}

export type RelatorioDoFunil = ResultadoDoFunil & {
  motivos: { nome: string; quantidade: number }[];
  /** Projetos (de qualquer data) em "Proposta enviada"/"Negociação" parados além do prazo configurado. */
  semRetorno: number;
  truncado: boolean;
};

/** Coorte = projetos criados no período (e que passam pelos filtros). Cada projeto traz o histórico de fases e a 1ª visita. */
export async function carregarRelatorioDoFunil(filtros: FiltrosDoRelatorio): Promise<RelatorioDoFunil> {
  const where = await filtroDeProjetos({ busca: "" }, { ...filtros });
  const base: LinhaDoFunil[] = [];
  let truncado = false;
  if (where) {
    const projetos = await prisma.projeto.findMany({
      where,
      take: LIMITE_DA_COORTE + 1,
      orderBy: { criadoEm: "desc" },
      select: {
        origem: true,
        status: true,
        valorEstimadoCentavos: true,
        motivoPerdaId: true,
        historicoFases: { select: { para: true, criadoEm: true } },
        eventos: { where: { tipo: "VISITA_TECNICA", realizadoEm: { not: null }, deletadoEm: null }, orderBy: { realizadoEm: "asc" }, take: 1, select: { realizadoEm: true } },
      },
    });
    truncado = projetos.length > LIMITE_DA_COORTE;
    for (const p of projetos.slice(0, LIMITE_DA_COORTE)) {
      base.push({
        origem: p.origem,
        status: p.status,
        valorEstimadoCentavos: p.valorEstimadoCentavos,
        motivoPerdaId: p.motivoPerdaId,
        fases: p.historicoFases.map((h) => ({ para: h.para, em: h.criadoEm })),
        primeiraVisitaRealizadaEm: p.eventos[0]?.realizadoEm ?? null,
      });
    }
  }

  const resultado = calcularFunil(base);
  const ids = resultado.motivosDePerda.map((m) => m.motivoPerdaId).filter((i): i is string => !!i);
  const nomes = ids.length ? await prisma.motivoPerda.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } }) : [];
  const nomePorId = new Map(nomes.map((n) => [n.id, n.nome]));
  const motivos = resultado.motivosDePerda.map((m) => ({ nome: m.motivoPerdaId ? (nomePorId.get(m.motivoPerdaId) ?? "Motivo removido") : "Sem motivo informado", quantidade: m.quantidade }));

  const semRetornoWhere = await filtroDeProjetos({ busca: "" }, { semRetorno: true });
  const semRetorno = semRetornoWhere ? await prisma.projeto.count({ where: semRetornoWhere }) : 0;

  return { ...resultado, motivos, semRetorno, truncado };
}
