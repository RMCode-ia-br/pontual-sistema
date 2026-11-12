import { describe, expect, it } from "vitest";

import { diasDaPausa, resumirAssistencias, resumirAtrasosDasEtapas, resumirPausasPorMotivo, type ChamadoDoRelatorio, type EtapaDoRelatorio } from "@/lib/dominio/relatorio-obras";

const HOJE = "2026-06-30";
const DE = "2026-06-01";
const ATE = "2026-06-30";

const etapa = (e: Partial<EtapaDoRelatorio> & Pick<EtapaDoRelatorio, "tipo">): EtapaDoRelatorio => ({ status: "CONCLUIDA", fimPrevisto: null, fimReal: null, ...e });

describe("atrasos por etapa", () => {
  it("conta só as concluídas dentro do período e avalia as que tinham data prevista", () => {
    const linhas = resumirAtrasosDasEtapas(
      [
        etapa({ tipo: "FABRICACAO", fimPrevisto: "2026-06-10", fimReal: "2026-06-10" }), // no dia: pontual
        etapa({ tipo: "FABRICACAO", fimPrevisto: "2026-06-10", fimReal: "2026-06-13" }), // 3 dias
        etapa({ tipo: "FABRICACAO", fimPrevisto: "2026-06-20", fimReal: "2026-06-26" }), // 6 dias
        etapa({ tipo: "FABRICACAO", fimPrevisto: null, fimReal: "2026-06-15" }), // sem data prevista: conta como concluída, não avalia
        etapa({ tipo: "FABRICACAO", fimPrevisto: "2026-05-01", fimReal: "2026-05-30" }), // antes do período
        etapa({ tipo: "FABRICACAO", fimPrevisto: "2026-06-01", fimReal: "2026-07-02" }), // depois do período
      ],
      HOJE,
      DE,
      ATE,
    );
    expect(linhas).toEqual([{ tipo: "FABRICACAO", concluidasNoPeriodo: 4, comPrazo: 3, comAtraso: 2, atrasoMedioDias: 4.5, abertasAtrasadas: 0 }]);
  });

  it("os limites do período valem (inclusive) e o atraso médio usa uma casa", () => {
    const [linha] = resumirAtrasosDasEtapas(
      [
        etapa({ tipo: "ENTREGA", fimPrevisto: "2026-05-31", fimReal: "2026-06-01" }), // 1 dia, no primeiro dia do período
        etapa({ tipo: "ENTREGA", fimPrevisto: "2026-06-27", fimReal: "2026-06-30" }), // 3 dias, no último
        etapa({ tipo: "ENTREGA", fimPrevisto: "2026-06-26", fimReal: "2026-06-29" }), // 3 dias
      ],
      HOJE,
      DE,
      ATE,
    );
    expect(linha.concluidasNoPeriodo).toBe(3);
    expect(linha.atrasoMedioDias).toBe(2.3); // 7 / 3 = 2,33
  });

  it("etapas abertas só contam como atrasadas depois da data prevista; dispensada e concluída não", () => {
    const linhas = resumirAtrasosDasEtapas(
      [
        etapa({ tipo: "INSTALACAO_ESQUADRIAS", status: "EM_ANDAMENTO", fimPrevisto: "2026-06-29" }), // atrasada
        etapa({ tipo: "INSTALACAO_ESQUADRIAS", status: "PENDENTE", fimPrevisto: HOJE }), // vence hoje: ainda não está atrasada
        etapa({ tipo: "INSTALACAO_ESQUADRIAS", status: "BLOQUEADA", fimPrevisto: "2026-06-01" }), // atrasada
        etapa({ tipo: "INSTALACAO_ESQUADRIAS", status: "PENDENTE", fimPrevisto: null }), // sem data
        etapa({ tipo: "INSTALACAO_ESQUADRIAS", status: "DISPENSADA", fimPrevisto: "2026-06-01" }),
      ],
      HOJE,
      DE,
      ATE,
    );
    expect(linhas).toEqual([{ tipo: "INSTALACAO_ESQUADRIAS", concluidasNoPeriodo: 0, comPrazo: 0, comAtraso: 0, atrasoMedioDias: null, abertasAtrasadas: 2 }]);
  });

  it("tipos sem nada a mostrar ficam de fora, na ordem do fluxo", () => {
    const linhas = resumirAtrasosDasEtapas(
      [etapa({ tipo: "ENTREGA", fimPrevisto: "2026-06-10", fimReal: "2026-06-10" }), etapa({ tipo: "MEDICAO_EXATA", fimPrevisto: "2026-06-02", fimReal: "2026-06-02" })],
      HOJE,
      DE,
      ATE,
    );
    expect(linhas.map((l) => l.tipo)).toEqual(["MEDICAO_EXATA", "ENTREGA"]);
    expect(resumirAtrasosDasEtapas([], HOJE, DE, ATE)).toEqual([]);
  });
});

describe("pausas por motivo", () => {
  it("conta o primeiro e o último dia, e a pausa em curso vai até hoje", () => {
    expect(diasDaPausa({ inicio: "2026-06-10", fim: "2026-06-10" }, HOJE)).toBe(1);
    expect(diasDaPausa({ inicio: "2026-06-10", fim: "2026-06-14" }, HOJE)).toBe(5);
    expect(diasDaPausa({ inicio: "2026-06-28", fim: null }, HOJE)).toBe(3);
    expect(diasDaPausa({ inicio: "2026-07-05", fim: null }, HOJE)).toBe(0); // início no futuro não gera dias negativos
  });

  it("agrupa por motivo, soma os dias e ordena do que mais parou", () => {
    const r = resumirPausasPorMotivo(
      [
        { motivo: "Chuva", inicio: "2026-06-01", fim: "2026-06-02", justificada: true }, // 2
        { motivo: "Cliente", inicio: "2026-06-05", fim: "2026-06-09", justificada: false }, // 5
        { motivo: "Chuva", inicio: "2026-06-20", fim: "2026-06-22", justificada: true }, // 3
        { motivo: "Alvenaria", inicio: "2026-06-26", fim: null, justificada: true }, // 5 (até hoje)
      ],
      HOJE,
    );
    expect(r).toEqual([
      { motivo: "Alvenaria", quantidade: 1, justificadas: 1, dias: 5 }, // empate em 5 dias: ordem alfabética
      { motivo: "Chuva", quantidade: 2, justificadas: 2, dias: 5 },
      { motivo: "Cliente", quantidade: 1, justificadas: 0, dias: 5 },
    ]);
  });
});

const chamado = (c: Partial<ChamadoDoRelatorio> = {}): ChamadoDoRelatorio => ({
  classificacao: "EM_GARANTIA",
  tipoProblema: "REGULAGEM",
  status: "ABERTO",
  abertoEm: "2026-06-10",
  resolvidoEm: null,
  cobrarVisita: false,
  valorCobradoCentavos: null,
  temCobranca: false,
  ...c,
});

describe("assistências", () => {
  it("sem chamados tudo é zero e a média fica em branco", () => {
    expect(resumirAssistencias([])).toEqual({ total: 0, emGarantia: 0, foraDaGarantia: 0, porTipo: [], resolvidos: 0, diasMedioParaResolver: null, visitasCobradas: 0, valorCobradoCentavos: 0, cobrancasGeradas: 0 });
  });

  it("separa garantia, tipo, tempo de resolução e cobrança", () => {
    const r = resumirAssistencias([
      chamado({ status: "RESOLVIDO", abertoEm: "2026-06-01", resolvidoEm: "2026-06-04" }), // 3 dias
      chamado({ status: "RESOLVIDO", abertoEm: "2026-06-10", resolvidoEm: "2026-06-20" }), // 10 dias
      chamado({ status: "RESOLVIDO", abertoEm: "2026-06-12", resolvidoEm: "2026-06-12" }), // 0 dia
      chamado({ tipoProblema: "VIDRO", classificacao: "FORA_DA_GARANTIA", cobrarVisita: true, valorCobradoCentavos: 15000, temCobranca: true }),
      chamado({ tipoProblema: "VIDRO", classificacao: "FORA_DA_GARANTIA", cobrarVisita: true, valorCobradoCentavos: null }), // a cobrar, sem valor ainda
      chamado({ tipoProblema: "OUTRO", classificacao: "FORA_DA_GARANTIA", cobrarVisita: true, valorCobradoCentavos: 9000, status: "CANCELADO" }), // cancelado não conta como cobrança
    ]);
    expect(r.total).toBe(6);
    expect(r.emGarantia).toBe(3);
    expect(r.foraDaGarantia).toBe(3);
    expect(r.porTipo).toEqual([
      { tipo: "REGULAGEM", quantidade: 3 },
      { tipo: "VIDRO", quantidade: 2 },
      { tipo: "OUTRO", quantidade: 1 },
    ]);
    expect(r.resolvidos).toBe(3);
    expect(r.diasMedioParaResolver).toBe(4.3); // 13 / 3
    expect(r.visitasCobradas).toBe(2);
    expect(r.valorCobradoCentavos).toBe(15000);
    expect(r.cobrancasGeradas).toBe(1);
  });

  it("chamado resolvido sem data de resolução não entra na média", () => {
    const r = resumirAssistencias([chamado({ status: "RESOLVIDO", resolvidoEm: null })]);
    expect(r.resolvidos).toBe(0);
    expect(r.diasMedioParaResolver).toBeNull();
  });
});
