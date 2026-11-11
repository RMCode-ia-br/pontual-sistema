import { describe, expect, it } from "vitest";

import { calcularFunil, type LinhaDoFunil } from "@/lib/dominio/relatorio-funil";

const d = (iso: string) => new Date(`${iso}T15:00:00Z`);
const linha = (over: Partial<LinhaDoFunil> = {}): LinhaDoFunil => ({ origem: "GOOGLE", status: "NOVO_LEAD", valorEstimadoCentavos: null, motivoPerdaId: null, fases: [], primeiraVisitaRealizadaEm: null, ...over });

describe("funil comercial: indicadores", () => {
  it("sem projetos, tudo zerado e sem percentuais inventados", () => {
    const r = calcularFunil([]);
    expect(r.total).toBe(0);
    expect(r.porFase.every((f) => f.quantidade === 0 && f.valorCentavos === 0)).toBe(true);
    expect(r.conversao.every((c) => c.percentualDoTotal === null)).toBe(true);
    expect(r.taxaDeFechamento).toBeNull();
    expect(r.ticketMedioCentavos).toBeNull();
    expect(r.tempoVisitaPropostaDias).toBeNull();
    expect(r.porOrigem).toEqual([]);
  });

  it("conta por fase atual e soma o valor estimado em centavos (sem valor = 0, nunca inventado)", () => {
    const r = calcularFunil([
      linha({ status: "NOVO_LEAD", valorEstimadoCentavos: 100_000 }),
      linha({ status: "NOVO_LEAD" }),
      linha({ status: "NEGOCIACAO", valorEstimadoCentavos: 250_050 }),
    ]);
    expect(r.porFase.find((f) => f.status === "NOVO_LEAD")).toMatchObject({ quantidade: 2, valorCentavos: 100_000 });
    expect(r.porFase.find((f) => f.status === "NEGOCIACAO")).toMatchObject({ quantidade: 1, valorCentavos: 250_050 });
  });

  it("conversão usa o HISTÓRICO: quem avançou e depois foi perdido continua contando como tendo chegado lá", () => {
    const r = calcularFunil([
      linha({ status: "PERDIDO", fases: [{ para: "VISITA_AGENDADA", em: d("2026-11-01") }, { para: "PROPOSTA_ENVIADA", em: d("2026-11-10") }, { para: "PERDIDO", em: d("2026-11-20") }] }),
      linha({ status: "VISITA_AGENDADA", fases: [{ para: "VISITA_AGENDADA", em: d("2026-11-02") }] }),
      linha({ status: "NOVO_LEAD" }),
      linha({ status: "NOVO_LEAD" }),
    ]);
    const por = (etapa: string) => r.conversao.find((c) => c.etapa === etapa)!;
    expect(por("NOVO_LEAD")).toMatchObject({ chegaram: 4, percentualDoTotal: 100, percentualDaAnterior: null });
    expect(por("VISITA_AGENDADA")).toMatchObject({ chegaram: 2, percentualDaAnterior: 50 });
    // "Elaborando proposta" foi pulada (0 chegaram): não há base para a conversão, e o sistema não inventa 100%.
    expect(por("ELABORANDO_PROPOSTA")).toMatchObject({ chegaram: 0, percentualDaAnterior: 0 });
    expect(por("PROPOSTA_ENVIADA")).toMatchObject({ chegaram: 1, percentualDaAnterior: null, percentualDoTotal: 25 });
    expect(por("NEGOCIACAO")).toMatchObject({ chegaram: 0, percentualDaAnterior: 0 });
  });

  it("origem: leads, visitas, propostas, aprovados e perdidos por canal, do maior para o menor", () => {
    const r = calcularFunil([
      linha({ origem: "GOOGLE", status: "PROPOSTA_ENVIADA", fases: [{ para: "VISITA_AGENDADA", em: d("2026-11-01") }, { para: "PROPOSTA_ENVIADA", em: d("2026-11-05") }] }),
      linha({ origem: "GOOGLE", status: "PERDIDO", motivoPerdaId: "m1" }),
      linha({ origem: "INDICACAO_CLIENTE" }),
      linha({ origem: null, status: "APROVADO" }),
    ]);
    expect(r.porOrigem[0]).toEqual({ origem: "GOOGLE", leads: 2, comVisita: 1, comPropostaEnviada: 1, aprovados: 0, perdidos: 1 });
    expect(r.porOrigem.map((o) => o.origem)).toEqual(["GOOGLE", "INDICACAO_CLIENTE", null].sort((a, b) => (a === "GOOGLE" ? -1 : b === "GOOGLE" ? 1 : 0)));
    expect(r.porOrigem.find((o) => o.origem === null)).toMatchObject({ leads: 1, aprovados: 1 });
  });

  it("motivos de perda: só os perdidos, do mais frequente ao menos", () => {
    const r = calcularFunil([
      linha({ status: "PERDIDO", motivoPerdaId: "preco" }),
      linha({ status: "PERDIDO", motivoPerdaId: "preco" }),
      linha({ status: "PERDIDO", motivoPerdaId: "prazo" }),
      linha({ status: "NEGOCIACAO", motivoPerdaId: "preco" }),
    ]);
    expect(r.motivosDePerda).toEqual([{ motivoPerdaId: "preco", quantidade: 2 }, { motivoPerdaId: "prazo", quantidade: 1 }]);
  });

  it("tempo visita → proposta: média em dias de calendário, só com as duas datas, sem negativo", () => {
    const r = calcularFunil([
      linha({ primeiraVisitaRealizadaEm: d("2026-11-01"), fases: [{ para: "PROPOSTA_ENVIADA", em: d("2026-11-04") }] }), // 3
      linha({ primeiraVisitaRealizadaEm: d("2026-11-01"), fases: [{ para: "PROPOSTA_ENVIADA", em: d("2026-11-06") }, { para: "PROPOSTA_ENVIADA", em: d("2026-11-20") }] }), // 5 (a primeira)
      linha({ primeiraVisitaRealizadaEm: d("2026-11-10"), fases: [{ para: "PROPOSTA_ENVIADA", em: d("2026-11-08") }] }), // antes da visita: 0
      linha({ primeiraVisitaRealizadaEm: d("2026-11-01") }), // sem proposta: fora
      linha({ fases: [{ para: "PROPOSTA_ENVIADA", em: d("2026-11-04") }] }), // sem visita: fora
    ]);
    expect(r.tempoVisitaPropostaDias).toEqual({ media: 2.7, amostra: 3 });
  });

  it("taxa de fechamento só existe com decisões; ticket médio usa o valor dos aprovados", () => {
    const sem = calcularFunil([linha({ status: "PROPOSTA_ENVIADA", fases: [{ para: "PROPOSTA_ENVIADA", em: d("2026-11-04") }] })]);
    expect(sem.taxaDeFechamento).toBeNull();
    expect(sem.ticketMedioCentavos).toBeNull();

    const r = calcularFunil([
      linha({ status: "APROVADO", valorEstimadoCentavos: 1_000_000 }),
      linha({ status: "EM_EXECUCAO", valorEstimadoCentavos: 2_000_001 }),
      linha({ status: "PERDIDO", fases: [{ para: "PROPOSTA_ENVIADA", em: d("2026-11-04") }] }), // decidido com proposta: conta
      linha({ status: "PERDIDO" }), // perdido sem proposta: não entra na taxa
    ]);
    expect(r.taxaDeFechamento).toBe(66.7); // 2 aprovados ÷ (2 + 1)
    expect(r.ticketMedioCentavos).toBe(1_500_001); // (1.000.000 + 2.000.001) ÷ 2, arredondado
  });
});
