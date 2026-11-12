import { describe, expect, it } from "vitest";

import { detalharPorCategoria, mesesDoPeriodo, montarDre, type MovimentoParaDre } from "../../src/lib/dominio/dre";

const m = (data: string, tipo: "ENTRADA" | "SAIDA", valorCentavos: number, grupo: MovimentoParaDre["grupo"], categoriaId: string | null = null, categoriaNome: string | null = null): MovimentoParaDre => ({
  data,
  tipo,
  valorCentavos,
  grupo,
  categoriaId,
  categoriaNome,
});

const MESES = mesesDoPeriodo("2026-10-15", "2026-12-20");

const movimentos: MovimentoParaDre[] = [
  // Novembro
  m("2026-11-05", "ENTRADA", 100_000, "RECEITAS_OPERACIONAIS", "esq", "Venda de esquadrias"),
  m("2026-11-20", "ENTRADA", 20_000, "RECEITAS_OPERACIONAIS", "esq", "Venda de esquadrias"),
  m("2026-11-10", "SAIDA", 15_000, "IMPOSTOS", "das", "Impostos (DAS)"),
  m("2026-11-11", "SAIDA", 40_000, "CUSTOS_DIRETOS", "perfis", "Perfis de alumínio"),
  m("2026-11-12", "SAIDA", 8_000, "DESPESAS_FIXAS", "aluguel", "Aluguel"),
  m("2026-11-13", "SAIDA", 2_000, "DESPESAS_FINANCEIRAS", "tarifas", "Tarifas bancárias"),
  m("2026-11-14", "ENTRADA", 3_000, "OUTRAS_RECEITAS", "sucata", "Venda de sucata"),
  m("2026-11-15", "SAIDA", 500, null),
  // Outubro e dezembro
  m("2026-10-20", "ENTRADA", 10_000, "RECEITAS_OPERACIONAIS", "esq", "Venda de esquadrias"),
  m("2026-10-21", "SAIDA", 4_000, "CUSTOS_DIRETOS", "perfis", "Perfis de alumínio"),
  m("2026-12-02", "SAIDA", 1_000, "RECEITAS_OPERACIONAIS", "esq", "Venda de esquadrias"), // devolução de venda
  // Fora do período
  m("2027-01-05", "ENTRADA", 999_999, "RECEITAS_OPERACIONAIS", "esq", "Venda de esquadrias"),
];

describe("meses do período", () => {
  it("lista cada mês de ponta a ponta, atravessando o ano", () => {
    expect(MESES).toEqual(["2026-10", "2026-11", "2026-12"]);
    expect(mesesDoPeriodo("2026-11-30", "2027-02-01")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(mesesDoPeriodo("2026-11-01", "2026-11-30")).toEqual(["2026-11"]);
  });
});

describe("DRE gerencial", () => {
  const dre = montarDre(movimentos, MESES);
  const nov = dre.meses[1];

  it("novembro, conferido à mão: receita 120.000 − DAS 15.000 = 105.000; − custos 40.000 = 65.000; − despesas 10.000 + outras 3.000 − sem categoria 500 = 57.500", () => {
    expect(nov.receitaOperacionalCentavos).toBe(120_000);
    expect(nov.impostosCentavos).toBe(15_000);
    expect(nov.receitaLiquidaCentavos).toBe(105_000);
    expect(nov.custosDiretosCentavos).toBe(40_000);
    expect(nov.margemBrutaCentavos).toBe(65_000);
    expect(nov.despesasPorGrupoCentavos).toMatchObject({ DESPESAS_FIXAS: 8_000, DESPESAS_FINANCEIRAS: 2_000, DESPESAS_OPERACIONAIS: 0 });
    expect(nov.despesasTotalCentavos).toBe(10_000);
    expect(nov.outrasReceitasCentavos).toBe(3_000);
    expect(nov.semCategoriaCentavos).toBe(-500);
    expect(nov.resultadoCentavos).toBe(57_500);
  });

  it("o resultado é sempre entradas − saídas dos movimentos do período (o DRE bate com os lançamentos)", () => {
    for (const d of dre.meses) {
      const doMes = movimentos.filter((x) => x.data.startsWith(d.mes));
      const soma = doMes.reduce((s, x) => s + (x.tipo === "ENTRADA" ? x.valorCentavos : -x.valorCentavos), 0);
      expect(d.resultadoCentavos, d.mes).toBe(soma);
    }
    expect(dre.total.resultadoCentavos).toBe(dre.meses.reduce((s, d) => s + d.resultadoCentavos, 0));
    expect(dre.total.resultadoCentavos).toBe(6_000 + 57_500 - 1_000);
  });

  it("outubro e dezembro; devolução de venda reduz a receita (não é ignorada)", () => {
    expect(dre.meses[0].resultadoCentavos).toBe(6_000);
    expect(dre.meses[2].receitaOperacionalCentavos).toBe(-1_000);
    expect(dre.meses[2].resultadoCentavos).toBe(-1_000);
  });

  it("movimento fora dos meses pedidos não entra", () => {
    expect(dre.total.receitaOperacionalCentavos).toBe(129_000);
  });

  it("sem movimentos: tudo zero", () => {
    const vazio = montarDre([], ["2026-11"]);
    expect(vazio.total.resultadoCentavos).toBe(0);
    expect(vazio.meses[0].margemBrutaCentavos).toBe(0);
  });
});

describe("detalhe por categoria", () => {
  const linhas = detalharPorCategoria(movimentos, MESES);
  const achar = (nome: string) => linhas.find((l) => l.nome === nome)!;

  it("receita e despesa aparecem como número positivo, mês a mês", () => {
    expect(achar("Venda de esquadrias").porMesCentavos).toEqual([10_000, 120_000, -1_000]);
    expect(achar("Venda de esquadrias").totalCentavos).toBe(129_000);
    expect(achar("Perfis de alumínio").porMesCentavos).toEqual([4_000, 40_000, 0]);
    expect(achar("Aluguel").totalCentavos).toBe(8_000);
  });

  it("movimentos sem categoria ficam numa linha própria", () => {
    const sem = achar("Sem categoria");
    expect(sem.grupo).toBeNull();
    expect(sem.totalCentavos).toBe(-500);
  });
});
