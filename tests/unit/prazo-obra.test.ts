import { describe, expect, it } from "vitest";

import { MODELO_PADRAO_DE_ETAPAS } from "../../prisma/seed-obras";
import { datasDeFeriado, somarDiasDoTipo, somarDiasUteis } from "../../src/lib/dominio/dias-uteis";
import { etapasDoModelo } from "../../src/lib/dominio/etapas";
import {
  calcularPrazoFinal,
  diasDePausaJustificada,
  distribuirDatas,
  prazoDaProposta,
  repartirDias,
  sugerirReprogramacao,
  type EtapaComDatas,
  type EtapaParaDatas,
  type PrazoResolvido,
} from "../../src/lib/dominio/prazo-obra";

const NENHUM = new Set<string>();

/** Etapas do modelo padrão, com o tipo como id (para ler os resultados). */
function etapas(temEsquadria = true): EtapaParaDatas[] {
  return etapasDoModelo(MODELO_PADRAO_DE_ETAPAS, temEsquadria).map((e) => ({
    id: e.tipo,
    tipo: e.tipo,
    ordem: e.ordem,
    grupoPrazo: e.grupoPrazo,
    peso: e.peso,
    dispensada: e.status === "DISPENSADA",
  }));
}

const intervalo = (r: { id: string; inicio: string | null; fim: string | null }[], id: string) => {
  const e = r.find((x) => x.id === id)!;
  return [e.inicio, e.fim];
};

describe("prazoDaProposta", () => {
  it("prazo total simples usa o MÁXIMO (ex.: 20 a 35 dias)", () => {
    expect(prazoDaProposta({ modo: "TOTAL", totalMinDias: 20, totalMaxDias: 35 })).toEqual({ modo: "TOTAL", diasTotais: 35, porGrupo: null });
  });
  it("só o mínimo preenchido: usa o mínimo", () => {
    expect(prazoDaProposta({ modo: "TOTAL", totalMinDias: 20, totalMaxDias: null })?.diasTotais).toBe(20);
  });
  it("por etapa: soma dos três grupos (30 + 40 + 20)", () => {
    expect(prazoDaProposta({ modo: "POR_ETAPA", materialDias: 30, execucaoDias: 40, vidrosDias: 20 })).toEqual({
      modo: "POR_ETAPA",
      diasTotais: 90,
      porGrupo: { MATERIAL: 30, EXECUCAO: 40, VIDROS_FINALIZACAO: 20 },
    });
  });
  it("por etapa com grupo vazio vale zero naquele grupo", () => {
    expect(prazoDaProposta({ modo: "POR_ETAPA", materialDias: 10, execucaoDias: null, vidrosDias: null })?.porGrupo).toEqual({
      MATERIAL: 10,
      EXECUCAO: 0,
      VIDROS_FINALIZACAO: 0,
    });
  });
  it("sem prazo (nenhum, vazio ou zerado) devolve null: a obra avisa 'Defina o prazo'", () => {
    expect(prazoDaProposta({ modo: "NENHUM" })).toBeNull();
    expect(prazoDaProposta({ modo: "TOTAL", totalMinDias: null, totalMaxDias: null })).toBeNull();
    expect(prazoDaProposta({ modo: "TOTAL", totalMaxDias: 0 })).toBeNull();
    expect(prazoDaProposta({ modo: "POR_ETAPA", materialDias: 0, execucaoDias: null, vidrosDias: -5 })).toBeNull();
  });
});

describe("repartirDias", () => {
  it("5 dias entre 3 etapas iguais: sobra para as primeiras (2, 2, 1)", () => {
    expect(repartirDias(5, [1, 1, 1])).toEqual([2, 2, 1]);
  });
  it("proporcional ao peso: 10 dias com pesos 1 e 2 → 3 e 7 (o maior resto fica com o maior peso)", () => {
    expect(repartirDias(10, [1, 2])).toEqual([3, 7]);
  });
  it("a soma é sempre o total", () => {
    for (let total = 0; total <= 60; total++) {
      expect(repartirDias(total, [1, 2, 3, 1]).reduce((a, b) => a + b, 0), `total=${total}`).toBe(total);
    }
  });
  it("sem etapas devolve vazio; pesos zerados são erro", () => {
    expect(repartirDias(5, [])).toEqual([]);
    expect(() => repartirDias(5, [0, 0])).toThrow(RangeError);
  });
});

describe("distribuirDatas", () => {
  // 2026-06-01 é segunda-feira. Material 4 dias (2 etapas), execução 3 (1 etapa), vidros e finalização 5 (5 etapas).
  const porEtapa: PrazoResolvido = {
    modo: "POR_ETAPA",
    diasTotais: 12,
    porGrupo: { MATERIAL: 4, EXECUCAO: 3, VIDROS_FINALIZACAO: 5 },
  };

  it("por etapa, em dias úteis: cada grupo reparte os seus dias e o relógio parte do marco", () => {
    const r = distribuirDatas(etapas(), "2026-06-01", porEtapa, "UTEIS", NENHUM);
    expect(intervalo(r, "MEDICAO_EXATA")).toEqual(["2026-06-01", "2026-06-01"]);
    expect(intervalo(r, "PEDIDO_MATERIAL")).toEqual(["2026-06-02", "2026-06-03"]);
    expect(intervalo(r, "FABRICACAO")).toEqual(["2026-06-04", "2026-06-05"]);
    expect(intervalo(r, "INSTALACAO_ESQUADRIAS")).toEqual(["2026-06-08", "2026-06-10"]);
    expect(intervalo(r, "MEDICAO_VIDROS")).toEqual(["2026-06-11", "2026-06-11"]);
    expect(intervalo(r, "PEDIDO_VIDROS")).toEqual(["2026-06-12", "2026-06-12"]);
    expect(intervalo(r, "INSTALACAO_VIDROS")).toEqual(["2026-06-15", "2026-06-15"]);
    expect(intervalo(r, "ACABAMENTO")).toEqual(["2026-06-16", "2026-06-16"]);
    expect(intervalo(r, "ENTREGA")).toEqual(["2026-06-17", "2026-06-17"]);
  });

  it("o fim da última etapa coincide com o prazo total contado do marco", () => {
    const r = distribuirDatas(etapas(), "2026-06-01", porEtapa, "UTEIS", NENHUM);
    expect(intervalo(r, "ENTREGA")[1]).toBe(somarDiasUteis("2026-06-01", 12, NENHUM));
  });

  it("em dias corridos os fins de semana contam", () => {
    const r = distribuirDatas(etapas(), "2026-06-01", porEtapa, "CORRIDOS", NENHUM);
    expect(intervalo(r, "PEDIDO_MATERIAL")).toEqual(["2026-06-02", "2026-06-03"]);
    expect(intervalo(r, "INSTALACAO_ESQUADRIAS")).toEqual(["2026-06-06", "2026-06-08"]); // sábado a segunda
    expect(intervalo(r, "ENTREGA")).toEqual(["2026-06-13", "2026-06-13"]);
  });

  it("feriado cadastrado empurra as datas (quinta 02/04, sexta 03/04 é Sexta-feira Santa)", () => {
    const feriados = datasDeFeriado([{ data: "2026-04-03", tipo: "FERIADO" }]);
    const r = distribuirDatas(etapas(), "2026-04-02", porEtapa, "UTEIS", feriados);
    expect(intervalo(r, "PEDIDO_MATERIAL")).toEqual(["2026-04-06", "2026-04-07"]);
    expect(intervalo(r, "ENTREGA")[1]).toBe(somarDiasUteis("2026-04-02", 12, feriados));
  });

  it("prazo total simples reparte o total entre todas as etapas com grupo, pelo peso", () => {
    const total: PrazoResolvido = { modo: "TOTAL", diasTotais: 10, porGrupo: null };
    const r = distribuirDatas(etapas(), "2026-06-01", total, "UTEIS", NENHUM);
    // 10 dias entre 8 etapas iguais: as duas primeiras ficam com 2 dias, as demais com 1.
    expect(intervalo(r, "PEDIDO_MATERIAL")).toEqual(["2026-06-02", "2026-06-03"]);
    expect(intervalo(r, "FABRICACAO")).toEqual(["2026-06-04", "2026-06-05"]);
    expect(intervalo(r, "INSTALACAO_ESQUADRIAS")).toEqual(["2026-06-08", "2026-06-08"]);
    expect(intervalo(r, "ENTREGA")).toEqual(["2026-06-15", "2026-06-15"]);
    expect(intervalo(r, "ENTREGA")[1]).toBe(somarDiasUteis("2026-06-01", 10, NENHUM));
  });

  it("etapas dispensadas (obra sem esquadria) não recebem data nem dias", () => {
    const r = distribuirDatas(etapas(false), "2026-06-01", porEtapa, "UTEIS", NENHUM);
    expect(intervalo(r, "PEDIDO_MATERIAL")).toEqual([null, null]);
    expect(intervalo(r, "FABRICACAO")).toEqual([null, null]);
    expect(intervalo(r, "INSTALACAO_ESQUADRIAS")).toEqual([null, null]);
    expect(intervalo(r, "MEDICAO_EXATA")).toEqual(["2026-06-01", "2026-06-01"]);
    // Os vidros e a finalização partem logo depois do marco.
    expect(intervalo(r, "MEDICAO_VIDROS")).toEqual(["2026-06-02", "2026-06-02"]);
    expect(intervalo(r, "ENTREGA")).toEqual(["2026-06-08", "2026-06-08"]);
  });

  it("grupo com zero dia deixa a etapa no mesmo dia da anterior", () => {
    const semExecucao: PrazoResolvido = { modo: "POR_ETAPA", diasTotais: 9, porGrupo: { MATERIAL: 4, EXECUCAO: 0, VIDROS_FINALIZACAO: 5 } };
    const r = distribuirDatas(etapas(), "2026-06-01", semExecucao, "UTEIS", NENHUM);
    expect(intervalo(r, "INSTALACAO_ESQUADRIAS")).toEqual(["2026-06-05", "2026-06-05"]);
    expect(intervalo(r, "MEDICAO_VIDROS")).toEqual(["2026-06-08", "2026-06-08"]);
  });

  it("sem prazo, só o marco recebe data (o resto fica em branco, nunca inventado)", () => {
    const r = distribuirDatas(etapas(), "2026-06-01", null, "UTEIS", NENHUM);
    expect(intervalo(r, "MEDICAO_EXATA")).toEqual(["2026-06-01", "2026-06-01"]);
    for (const e of r.filter((x) => x.id !== "MEDICAO_EXATA")) expect([e.inicio, e.fim], e.id).toEqual([null, null]);
  });
});

describe("pausas justificadas e prazo final prometido", () => {
  // 2026-04-06 é segunda-feira; prazo de 5 dias úteis termina na segunda 13.
  const inicio = "2026-04-06";

  it("sem pausas, o prazo final é só o prazo da proposta", () => {
    const r = calcularPrazoFinal(inicio, 5, [], "2026-04-10", "UTEIS", NENHUM);
    expect(r).toEqual({ semPausas: "2026-04-13", comPausas: "2026-04-13", diasPausaJustificada: 0 });
  });

  it("pausa justificada de 2 dias úteis empurra o prazo em 2 dias úteis", () => {
    const r = calcularPrazoFinal(inicio, 5, [{ inicio: "2026-04-08", fim: "2026-04-09", justificada: true }], "2026-04-20", "UTEIS", NENHUM);
    expect(r).toEqual({ semPausas: "2026-04-13", comPausas: "2026-04-15", diasPausaJustificada: 2 });
  });

  it("pausa NÃO justificada (culpa da Pontual) não estende o prazo", () => {
    const r = calcularPrazoFinal(inicio, 5, [{ inicio: "2026-04-08", fim: "2026-04-09", justificada: false }], "2026-04-20", "UTEIS", NENHUM);
    expect(r.comPausas).toBe("2026-04-13");
    expect(r.diasPausaJustificada).toBe(0);
  });

  it("pausas que se sobrepõem não contam duas vezes (08–09 e 09–10 = 3 dias úteis)", () => {
    const pausas = [
      { inicio: "2026-04-08", fim: "2026-04-09", justificada: true },
      { inicio: "2026-04-09", fim: "2026-04-10", justificada: true },
    ];
    const r = calcularPrazoFinal(inicio, 5, pausas, "2026-04-20", "UTEIS", NENHUM);
    expect(r.diasPausaJustificada).toBe(3);
    expect(r.comPausas).toBe("2026-04-16");
  });

  it("uma pausa de sexta a segunda cobre só 2 dias úteis (o fim de semana não conta)", () => {
    expect(diasDePausaJustificada([{ inicio: "2026-04-10", fim: "2026-04-13", justificada: true }], inicio, "2026-04-30", "UTEIS", NENHUM)).toBe(2);
  });

  it("pausa em curso conta até hoje", () => {
    const r = calcularPrazoFinal(inicio, 5, [{ inicio: "2026-04-08", fim: null, justificada: true }], "2026-04-10", "UTEIS", NENHUM);
    expect(r.diasPausaJustificada).toBe(3); // quarta, quinta e sexta
    expect(r.comPausas).toBe("2026-04-16");
  });

  it("pausa anterior ao início do relógio só vale do dia seguinte em diante", () => {
    const n = diasDePausaJustificada([{ inicio: "2026-04-01", fim: "2026-04-07", justificada: true }], inicio, "2026-04-30", "UTEIS", NENHUM);
    expect(n).toBe(1); // só terça 07
  });

  it("feriado dentro da pausa não conta como dia de pausa", () => {
    const feriados = datasDeFeriado([{ data: "2026-04-08", tipo: "FERIADO" }]);
    expect(diasDePausaJustificada([{ inicio: "2026-04-08", fim: "2026-04-09", justificada: true }], inicio, "2026-04-30", "UTEIS", feriados)).toBe(1);
  });

  it("em dias corridos a pausa conta todos os dias (inclusive fim de semana)", () => {
    const r = calcularPrazoFinal(inicio, 5, [{ inicio: "2026-04-10", fim: "2026-04-13", justificada: true }], "2026-04-30", "CORRIDOS", NENHUM);
    expect(r).toEqual({ semPausas: "2026-04-11", comPausas: "2026-04-15", diasPausaJustificada: 4 });
  });

  it("o prazo final com pausas é o prazo contado de novo com os dias somados", () => {
    const feriados = datasDeFeriado([{ data: "2026-04-21", tipo: "FERIADO" }]);
    const pausas = [{ inicio: "2026-04-14", fim: "2026-04-17", justificada: true }];
    const r = calcularPrazoFinal(inicio, 10, pausas, "2026-05-30", "UTEIS", feriados);
    expect(r.comPausas).toBe(somarDiasDoTipo(inicio, 10 + r.diasPausaJustificada, "UTEIS", feriados));
  });
});

describe("sugerirReprogramacao", () => {
  const base: EtapaComDatas[] = [
    { id: "A", ordem: 1, status: "CONCLUIDA", inicioPrevisto: "2026-06-01", fimPrevisto: "2026-06-03" },
    { id: "B", ordem: 2, status: "PENDENTE", inicioPrevisto: "2026-06-04", fimPrevisto: "2026-06-05" },
    { id: "C", ordem: 3, status: "PENDENTE", inicioPrevisto: "2026-06-08", fimPrevisto: "2026-06-10" },
    { id: "D", ordem: 4, status: "DISPENSADA", inicioPrevisto: null, fimPrevisto: null },
    { id: "E", ordem: 5, status: "PENDENTE", inicioPrevisto: null, fimPrevisto: null },
  ];

  it("etapa concluída 2 dias úteis depois do previsto: sugere deslocar as seguintes em 2 dias úteis", () => {
    const s = sugerirReprogramacao(base, "A", "2026-06-05", "UTEIS", NENHUM);
    expect(s).toEqual([
      { id: "B", inicioPrevisto: "2026-06-04", fimPrevisto: "2026-06-05", novoInicio: "2026-06-08", novoFim: "2026-06-09" },
      { id: "C", inicioPrevisto: "2026-06-08", fimPrevisto: "2026-06-10", novoInicio: "2026-06-10", novoFim: "2026-06-12" },
    ]);
  });

  it("concluída no dia previsto: nada a sugerir", () => {
    expect(sugerirReprogramacao(base, "A", "2026-06-03", "UTEIS", NENHUM)).toEqual([]);
  });

  it("concluída 1 dia útil antes: sugere adiantar, sem passar da data de conclusão", () => {
    const s = sugerirReprogramacao(base, "A", "2026-06-02", "UTEIS", NENHUM);
    expect(s[0]).toMatchObject({ id: "B", novoInicio: "2026-06-03", novoFim: "2026-06-04" });
    for (const x of s) {
      expect(x.novoInicio! >= "2026-06-02").toBe(true);
      expect(x.novoFim! >= "2026-06-02").toBe(true);
    }
  });

  it("só mexe em etapa que ainda não terminou, tem data e vem depois da concluída", () => {
    const etapasMistas: EtapaComDatas[] = [
      { id: "A", ordem: 2, status: "CONCLUIDA", inicioPrevisto: "2026-06-01", fimPrevisto: "2026-06-03" },
      { id: "ANTES", ordem: 1, status: "PENDENTE", inicioPrevisto: "2026-05-28", fimPrevisto: "2026-05-29" },
      { id: "FEITA", ordem: 3, status: "CONCLUIDA", inicioPrevisto: "2026-06-04", fimPrevisto: "2026-06-05" },
      { id: "SEMDATA", ordem: 4, status: "PENDENTE", inicioPrevisto: null, fimPrevisto: null },
      { id: "VAI", ordem: 5, status: "BLOQUEADA", inicioPrevisto: "2026-06-08", fimPrevisto: "2026-06-09" },
    ];
    expect(sugerirReprogramacao(etapasMistas, "A", "2026-06-04", "UTEIS", NENHUM).map((s) => s.id)).toEqual(["VAI"]);
  });

  it("etapa concluída sem data prevista ou inexistente: nada a sugerir", () => {
    expect(sugerirReprogramacao(base, "E", "2026-06-05", "UTEIS", NENHUM)).toEqual([]);
    expect(sugerirReprogramacao(base, "ZZ", "2026-06-05", "UTEIS", NENHUM)).toEqual([]);
  });
});
