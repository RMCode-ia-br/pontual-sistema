import "server-only";

import { prisma } from "@/lib/db";
import { somarDias } from "@/lib/dominio/calendario";
import type { LancamentoDoFluxo, MovimentoDoFluxo } from "@/lib/dominio/fluxo-caixa";
import { ocorrenciasDaRecorrencia } from "@/lib/dominio/parcelamento";
import { contasSemSaldoInformado } from "@/lib/dominio/saldo";

import { listarContasFinanceiras, type ContaComSaldo } from "./queries";

const comoData = (texto: string): Date => new Date(`${texto}T00:00:00Z`);
const comoTexto = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

export type ResumoDeTitulos = {
  vencidoCentavos: number;
  hojeCentavos: number;
  proximosCentavos: number;
};

export type DadosDoFluxo = {
  contas: ContaComSaldo[];
  saldoAtualCentavos: number;
  contasSemSaldo: string[];
  /** Entradas previstas: parcelas em aberto (data = vencimento) e as que aguardam etapa (data = previsão da etapa). */
  aReceber: MovimentoDoFluxo[];
  /** Saídas previstas: contas em aberto e as ocorrências de recorrência ainda não geradas. */
  aPagar: MovimentoDoFluxo[];
  realizados: LancamentoDoFluxo[];
  resumoReceber: ResumoDeTitulos;
  resumoPagar: ResumoDeTitulos;
  /** Parcelas que aguardam etapa sem data prevista, ou com etapa atrasada. */
  semPrevisaoReceberCentavos: number;
  recorrenciasVirtuais: number;
};

function resumir(itens: { data: string; saldo: number }[], hoje: string, limite: string): ResumoDeTitulos {
  const r = { vencidoCentavos: 0, hojeCentavos: 0, proximosCentavos: 0 };
  for (const i of itens) {
    if (i.data < hoje) r.vencidoCentavos += i.saldo;
    else if (i.data === hoje) r.hojeCentavos += i.saldo;
    else if (i.data <= limite) r.proximosCentavos += i.saldo;
  }
  return r;
}

/**
 * Tudo o que o fluxo de caixa precisa, numa leitura só. `desde` é o começo da janela de realizado; `ate`, o fim do
 * horizonte (recorrências ainda não geradas entram como saídas previstas até ali, então o projetado fica certo mesmo
 * se a rotina diária não rodou).
 */
export async function carregarDadosDoFluxo(hoje: string, opcoes: { desde: string; ate: string; diasEmBreve: number }): Promise<DadosDoFluxo> {
  const [contasAtivas, realizados, titulosReceber, titulosPagar, recorrencias] = await Promise.all([
    listarContasFinanceiras(hoje),
    prisma.lancamento.findMany({
      // Só contas ativas, como o saldo do mesmo cartão: realizado e saldo falam das mesmas contas.
      where: { estornadoEm: null, deletadoEm: null, transferenciaId: null, contaFinanceira: { ativo: true, deletadoEm: null }, data: { gte: comoData(opcoes.desde), lte: comoData(hoje) } },
      select: { data: true, tipo: true, valorCentavos: true },
    }),
    prisma.contaReceber.findMany({
      where: { deletadoEm: null, status: { in: ["ABERTA", "PARCIAL", "AGUARDANDO_GATILHO"] } },
      select: { projetoId: true, gatilho: true, status: true, vencimento: true, valorCentavos: true, valorPagoCentavos: true },
    }),
    prisma.contaPagar.findMany({
      where: { deletadoEm: null, status: { in: ["ABERTA", "PARCIAL"] } },
      select: { vencimento: true, valorCentavos: true, valorPagoCentavos: true },
    }),
    prisma.recorrenciaPagar.findMany({ where: { deletadoEm: null, ativo: true } }),
  ]);

  // Previsão pela etapa das parcelas que aguardam: a data prevista de fim da etapa que as libera.
  const projetos = [...new Set(titulosReceber.filter((t) => t.status === "AGUARDANDO_GATILHO" && t.projetoId).map((t) => t.projetoId!))];
  const etapas = projetos.length
    ? await prisma.etapaProjeto.findMany({
        where: { projetoId: { in: projetos }, liberaGatilho: { not: null }, deletadoEm: null, status: { notIn: ["CONCLUIDA", "DISPENSADA"] } },
        select: { projetoId: true, liberaGatilho: true, fimPrevisto: true },
      })
    : [];
  const previsaoDaEtapa = new Map(etapas.map((e) => [`${e.projetoId}|${e.liberaGatilho}`, comoTexto(e.fimPrevisto)]));

  const aReceber: MovimentoDoFluxo[] = [];
  const emAbertoReceber: { data: string; saldo: number }[] = [];
  let semPrevisao = 0;
  for (const t of titulosReceber) {
    const saldo = t.valorCentavos - t.valorPagoCentavos;
    if (saldo <= 0) continue;
    if (t.status === "AGUARDANDO_GATILHO") {
      const previsao = t.projetoId && t.gatilho ? (previsaoDaEtapa.get(`${t.projetoId}|${t.gatilho}`) ?? null) : null;
      // Etapa atrasada (previsão já passou) ou sem data: não dá para dizer quando entra.
      if (previsao && previsao >= hoje) aReceber.push({ data: previsao, valorCentavos: saldo, previsto: true });
      else {
        aReceber.push({ data: null, valorCentavos: saldo });
        semPrevisao += saldo;
      }
      continue;
    }
    const vencimento = comoTexto(t.vencimento);
    if (!vencimento) continue;
    aReceber.push({ data: vencimento, valorCentavos: saldo });
    emAbertoReceber.push({ data: vencimento, saldo });
  }

  const aPagar: MovimentoDoFluxo[] = [];
  const emAbertoPagar: { data: string; saldo: number }[] = [];
  for (const t of titulosPagar) {
    const saldo = t.valorCentavos - t.valorPagoCentavos;
    if (saldo <= 0) continue;
    const vencimento = comoTexto(t.vencimento)!;
    aPagar.push({ data: vencimento, valorCentavos: saldo });
    emAbertoPagar.push({ data: vencimento, saldo });
  }

  // Ocorrências de recorrência que a rotina ainda não gerou (inclusive canceladas: não se "ressuscita" o que se cancelou).
  let virtuais = 0;
  if (recorrencias.length > 0) {
    const existentes = await prisma.contaPagar.findMany({
      // Só interessam as competências que ainda podem virar ocorrência virtual (do mês de hoje em diante).
      where: { recorrenciaId: { in: recorrencias.map((r) => r.id) }, deletadoEm: null, competencia: { gte: comoData(`${hoje.slice(0, 7)}-01`) } },
      select: { recorrenciaId: true, competencia: true },
    });
    const jaExiste = new Set(existentes.map((e) => `${e.recorrenciaId}|${comoTexto(e.competencia)}`));
    for (const r of recorrencias) {
      const ocorrencias = ocorrenciasDaRecorrencia(
        { diaVencimento: r.diaVencimento, periodicidade: r.periodicidade, inicio: comoTexto(r.inicio)!, fim: comoTexto(r.fim) },
        hoje,
        opcoes.ate,
      );
      for (const o of ocorrencias) {
        if (jaExiste.has(`${r.id}|${o.competencia}`)) continue;
        aPagar.push({ data: o.vencimento, valorCentavos: r.valorCentavos });
        virtuais += 1;
      }
    }
  }

  const limite = somarDias(hoje, opcoes.diasEmBreve);
  return {
    contas: contasAtivas,
    saldoAtualCentavos: contasAtivas.reduce((s, c) => s + c.saldoAtualCentavos, 0),
    contasSemSaldo: contasSemSaldoInformado(contasAtivas).map((c) => c.nome),
    aReceber,
    aPagar,
    realizados: realizados.map((l) => ({ data: l.data.toISOString().slice(0, 10), tipo: l.tipo, valorCentavos: l.valorCentavos })),
    resumoReceber: resumir(emAbertoReceber, hoje, limite),
    resumoPagar: resumir(emAbertoPagar, hoje, limite),
    semPrevisaoReceberCentavos: semPrevisao,
    recorrenciasVirtuais: virtuais,
  };
}
