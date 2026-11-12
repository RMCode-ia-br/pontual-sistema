import { describe, expect, it } from "vitest";

import {
  dataValida,
  diasDoPeriodo,
  ehMesInteiro,
  lerPeriodo,
  limitesDeCalendario,
  limitesEmInstantes,
  parametrosDoPeriodo,
  periodoDeComparacao,
  periodoPronto,
  rotuloDoPeriodo,
  somarDias,
  somarMeses,
  ultimosMeses,
} from "@/lib/periodo";

const HOJE = "2026-11-12";

describe("datas de calendário", () => {
  it("valida datas reais", () => {
    expect(dataValida("2026-02-28")).toBe(true);
    expect(dataValida("2028-02-29")).toBe(true);
    expect(dataValida("2026-02-29")).toBe(false);
    expect(dataValida("2026-13-01")).toBe(false);
    expect(dataValida("12/11/2026")).toBe(false);
    expect(dataValida("")).toBe(false);
    expect(dataValida(null)).toBe(false);
  });

  it("soma dias atravessando mês e ano", () => {
    expect(somarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(somarDias("2026-03-01", -1)).toBe("2026-02-28");
    expect(somarDias("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("soma meses mantendo o dia ou o último dia do mês", () => {
    expect(somarMeses("2026-03-31", -1)).toBe("2026-02-28");
    expect(somarMeses("2026-01-31", 1)).toBe("2026-02-28");
    expect(somarMeses("2028-02-29", -12)).toBe("2027-02-28");
    expect(somarMeses("2026-01-15", -1)).toBe("2025-12-15");
    expect(somarMeses("2026-11-12", -12)).toBe("2025-11-12");
  });

  it("conta os dias do período com os dois extremos", () => {
    expect(diasDoPeriodo({ de: "2026-11-01", ate: "2026-11-30" })).toBe(30);
    expect(diasDoPeriodo({ de: "2026-11-12", ate: "2026-11-12" })).toBe(1);
    expect(diasDoPeriodo({ de: "2028-02-01", ate: "2028-02-29" })).toBe(29);
  });
});

describe("lerPeriodo (a URL)", () => {
  it("o padrão é o mês atual", () => {
    expect(lerPeriodo({}, HOJE)).toEqual({ periodo: { de: "2026-11-01", ate: "2026-11-30" }, tipo: "mes" });
  });

  it("lê o mês escolhido", () => {
    expect(lerPeriodo({ mes: "2026-02" }, HOJE)).toEqual({ periodo: { de: "2026-02-01", ate: "2026-02-28" }, tipo: "mes" });
    expect(lerPeriodo({ mes: "2028-02" }, HOJE).periodo.ate).toBe("2028-02-29");
  });

  it("lê as datas livres", () => {
    expect(lerPeriodo({ de: "2026-10-05", ate: "2026-10-20" }, HOJE)).toEqual({ periodo: { de: "2026-10-05", ate: "2026-10-20" }, tipo: "livre" });
  });

  it("lê os períodos prontos, contados até hoje", () => {
    expect(lerPeriodo({ periodo: "30d" }, HOJE).periodo).toEqual({ de: "2026-10-14", ate: HOJE });
    expect(lerPeriodo({ periodo: "90d" }, HOJE).periodo).toEqual({ de: "2026-08-15", ate: HOJE });
    expect(lerPeriodo({ periodo: "12m" }, HOJE).periodo).toEqual({ de: "2025-11-13", ate: HOJE });
    expect(lerPeriodo({ periodo: "ano" }, HOJE).periodo).toEqual({ de: "2026-01-01", ate: HOJE });
    expect(diasDoPeriodo(periodoPronto("12m", HOJE))).toBe(365);
    expect(diasDoPeriodo(periodoPronto("30d", HOJE))).toBe(30);
  });

  it("valor inválido volta ao mês atual com aviso, nunca derruba", () => {
    const mesAtual = { de: "2026-11-01", ate: "2026-11-30" };
    for (const ruim of [{ mes: "2026-13" }, { mes: "novembro" }, { periodo: "10d" }, { de: "2026-02-30", ate: "2026-03-01" }, { de: "2026-11-10" }, { de: "2026-11-20", ate: "2026-11-10" }, { de: "2000-01-01", ate: "2026-11-10" }]) {
      const r = lerPeriodo(ruim, HOJE);
      expect(r.periodo, JSON.stringify(ruim)).toEqual(mesAtual);
      expect(r.tipo).toBe("mes");
      expect(r.aviso, JSON.stringify(ruim)).toBeTruthy();
    }
  });

  it("aceita o parâmetro repetido (lista) usando o primeiro valor", () => {
    expect(lerPeriodo({ mes: ["2026-09", "2026-10"] }, HOJE).periodo.de).toBe("2026-09-01");
  });
});

describe("rótulo e parâmetros", () => {
  it("rotula mês inteiro e período livre", () => {
    expect(rotuloDoPeriodo({ de: "2026-11-01", ate: "2026-11-30" })).toBe("novembro de 2026");
    expect(rotuloDoPeriodo({ de: "2026-03-01", ate: "2026-03-31" })).toBe("março de 2026");
    expect(rotuloDoPeriodo({ de: "2026-11-01", ate: "2026-11-12" })).toBe("01/11/2026 a 12/11/2026");
  });

  it("os parâmetros de URL reproduzem o período", () => {
    expect(parametrosDoPeriodo({ de: "2026-11-01", ate: "2026-11-30" })).toEqual({ mes: "2026-11" });
    expect(parametrosDoPeriodo({ de: "2026-10-05", ate: "2026-10-20" })).toEqual({ de: "2026-10-05", ate: "2026-10-20" });
    const volta = lerPeriodo(parametrosDoPeriodo({ de: "2026-10-05", ate: "2026-10-20" }), HOJE);
    expect(volta.periodo).toEqual({ de: "2026-10-05", ate: "2026-10-20" });
  });

  it("reconhece o mês inteiro", () => {
    expect(ehMesInteiro({ de: "2026-02-01", ate: "2026-02-28" })).toBe(true);
    expect(ehMesInteiro({ de: "2026-02-01", ate: "2026-02-27" })).toBe(false);
    expect(ehMesInteiro({ de: "2026-02-02", ate: "2026-02-28" })).toBe(false);
  });
});

describe("periodoDeComparacao", () => {
  it("mês em andamento: compara até o MESMO DIA do mês anterior e do ano passado", () => {
    const c = periodoDeComparacao({ de: "2026-11-01", ate: "2026-11-30" }, HOJE);
    expect(c.emAndamento).toBe(true);
    expect(c.atual).toEqual({ de: "2026-11-01", ate: "2026-11-12" });
    expect(c.anterior).toEqual({ de: "2026-10-01", ate: "2026-10-12" });
    expect(c.anoPassado).toEqual({ de: "2025-11-01", ate: "2025-11-12" });
  });

  it("mês fechado: compara com o mês inteiro", () => {
    const c = periodoDeComparacao({ de: "2026-10-01", ate: "2026-10-31" }, HOJE);
    expect(c.emAndamento).toBe(false);
    expect(c.atual).toEqual({ de: "2026-10-01", ate: "2026-10-31" });
    expect(c.anterior).toEqual({ de: "2026-09-01", ate: "2026-09-30" });
    expect(c.anoPassado).toEqual({ de: "2025-10-01", ate: "2025-10-31" });
  });

  it("não passa do fim do mês anterior (dia 30/31 contra fevereiro)", () => {
    const emMarco = periodoDeComparacao({ de: "2026-03-01", ate: "2026-03-31" }, "2026-03-30");
    expect(emMarco.anterior).toEqual({ de: "2026-02-01", ate: "2026-02-28" });
    const noUltimoDia = periodoDeComparacao({ de: "2026-03-01", ate: "2026-03-31" }, "2026-03-31");
    expect(noUltimoDia.emAndamento).toBe(false); // o último dia já é "hoje": o mês fecha e compara com fevereiro inteiro
    expect(noUltimoDia.anterior).toEqual({ de: "2026-02-01", ate: "2026-02-28" });
  });

  it("ano passado em fevereiro bissexto", () => {
    const c = periodoDeComparacao({ de: "2028-02-01", ate: "2028-02-29" }, "2028-03-10");
    expect(c.anoPassado).toEqual({ de: "2027-02-01", ate: "2027-02-28" });
  });

  it("período livre: trecho de mesma duração logo antes e o mesmo trecho um ano antes", () => {
    const c = periodoDeComparacao({ de: "2026-10-05", ate: "2026-10-14" }, HOJE);
    expect(c.anterior).toEqual({ de: "2026-09-25", ate: "2026-10-04" });
    expect(c.anoPassado).toEqual({ de: "2025-10-05", ate: "2025-10-14" });
    expect(diasDoPeriodo(c.anterior)).toBe(10);
  });

  it("período livre em andamento: corta em hoje", () => {
    const c = periodoDeComparacao({ de: "2026-11-01", ate: "2026-11-20" }, HOJE);
    expect(c.emAndamento).toBe(true);
    expect(c.atual).toEqual({ de: "2026-11-01", ate: "2026-11-12" });
    expect(c.anterior).toEqual({ de: "2026-10-20", ate: "2026-10-31" });
  });
});

describe("limites para consulta", () => {
  it("colunas de calendário: meia-noite UTC, extremos inclusivos", () => {
    const { de, ate } = limitesDeCalendario({ de: "2026-11-01", ate: "2026-11-30" });
    expect(de.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(ate.toISOString()).toBe("2026-11-30T00:00:00.000Z");
  });

  it("colunas com hora: começo do dia em São Paulo (UTC−3) e começo do dia seguinte ao último", () => {
    const { inicio, fimExclusivo } = limitesEmInstantes({ de: "2026-11-01", ate: "2026-11-30" });
    expect(inicio.toISOString()).toBe("2026-11-01T03:00:00.000Z");
    expect(fimExclusivo.toISOString()).toBe("2026-12-01T03:00:00.000Z");
  });

  it("uma venda às 22h do último dia (01h UTC do dia seguinte) ainda cai no mês", () => {
    const { inicio, fimExclusivo } = limitesEmInstantes({ de: "2026-11-01", ate: "2026-11-30" });
    const venda = new Date("2026-12-01T01:00:00.000Z"); // 30/11 22:00 em São Paulo
    expect(venda >= inicio && venda < fimExclusivo).toBe(true);
    const naoEhDoMes = new Date("2026-12-01T03:00:00.000Z"); // 01/12 00:00 em São Paulo
    expect(naoEhDoMes < fimExclusivo).toBe(false);
  });
});

describe("ultimosMeses", () => {
  it("devolve os n meses até o mês de hoje, do mais antigo ao mais recente", () => {
    const m = ultimosMeses(HOJE, 12);
    expect(m).toHaveLength(12);
    expect(m[0]).toEqual({ mes: "2025-12", de: "2025-12-01", ate: "2025-12-31" });
    expect(m[11]).toEqual({ mes: "2026-11", de: "2026-11-01", ate: "2026-11-30" });
    expect(m.every((x) => ehMesInteiro(x))).toBe(true);
  });
});
