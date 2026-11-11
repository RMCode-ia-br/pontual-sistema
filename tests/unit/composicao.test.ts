import { describe, expect, it } from "vitest";

import { combinacoesSemPreco, custoDaComposicao, escolherLinhaDaTabela, type LinhaTabelaPreco } from "@/lib/dominio/composicao";

const medida = (larguraMm: number, alturaMm: number, quantidade = 1) => ({ larguraMm, alturaMm, quantidade });

describe("custoDaComposicao", () => {
  const perfil = { descricao: "Perfil", formulaQuantidade: "(L/1000)*2 + (A/1000)*2", perdaPb: 500, custoUnitarioCentavos: 5000 };
  const vidro = { descricao: "Vidro", formulaQuantidade: "(L/1000)*(A/1000)", perdaPb: 0, custoUnitarioCentavos: 20000 };

  it("materiais com perda: 1000×1000, perfil 4 m × R$ 50 × 1,05 + vidro 1 m² × R$ 200", () => {
    const r = custoDaComposicao([perfil, vidro], [], [medida(1000, 1000)], { folhas: 2 });
    expect(r).toEqual({ ok: true, custoCentavos: 21000 + 20000, materiaisCentavos: 41000, maoDeObraCentavos: 0 });
  });

  it("a fórmula é por peça: o sistema multiplica pela quantidade", () => {
    const r = custoDaComposicao([vidro], [], [medida(1000, 1000, 3)], { folhas: 2 });
    expect(r).toMatchObject({ ok: true, custoCentavos: 60000 });
  });

  it("várias medidas somam", () => {
    const r = custoDaComposicao([vidro], [], [medida(1000, 1000), medida(2000, 1000)], { folhas: 2 });
    expect(r).toMatchObject({ ok: true, custoCentavos: 60000 });
  });

  it("mão de obra por m² e por unidade", () => {
    const r = custoDaComposicao(
      [],
      [
        { papel: "FABRICA", base: "HORAS_POR_M2", horasCentesimos: 100, custoHoraCentavos: 3000 },
        { papel: "INSTALACAO", base: "HORAS_POR_UNIDADE", horasCentesimos: 150, custoHoraCentavos: 4000 },
      ],
      [medida(2000, 1000, 2)],
      { folhas: null },
    );
    // fábrica: 1 h/m² × 4 m² × R$ 30 = 120,00 ; instalação: 1,5 h × 2 un × R$ 40 = 120,00
    expect(r).toEqual({ ok: true, custoCentavos: 24000, materiaisCentavos: 0, maoDeObraCentavos: 24000 });
  });

  it("nunca inventa: custo ausente deixa a composição incompleta e lista o que falta", () => {
    const r = custoDaComposicao(
      [{ ...perfil, custoUnitarioCentavos: null }],
      [{ papel: "FABRICA", base: "HORAS_POR_M2", horasCentesimos: 100, custoHoraCentavos: null }],
      [medida(1000, 1000)],
      { folhas: 2 },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.faltando).toEqual(['custo de "Perfil"', "custo por hora da mão de obra de fábrica"]);
      expect(r.erro).toMatch(/Falta informar/);
    }
  });

  it("recusa tipologia sem composição, item sem medida e fórmula inválida", () => {
    expect(custoDaComposicao([], [], [medida(1, 1)], { folhas: 2 }).ok).toBe(false);
    expect(custoDaComposicao([perfil], [], [], { folhas: 2 }).ok).toBe(false);
    const ruim = custoDaComposicao([{ ...perfil, formulaQuantidade: "eval(1)" }], [], [medida(1000, 1000)], { folhas: 2 });
    expect(ruim.ok).toBe(false);
    if (!ruim.ok) expect(ruim.erro).toMatch(/Fórmula de "Perfil"/);
  });

  it("usa F (folhas) e Q (quantidade) nas fórmulas", () => {
    const r = custoDaComposicao(
      [{ descricao: "Roldana", formulaQuantidade: "F * 2", perdaPb: 0, custoUnitarioCentavos: 100 }],
      [],
      [medida(1000, 1000, 2)],
      { folhas: 3 },
    );
    expect(r).toMatchObject({ ok: true, custoCentavos: 6 * 2 * 100 });
  });
});

describe("escolherLinhaDaTabela", () => {
  const base: LinhaTabelaPreco = {
    id: "x",
    linhaId: null,
    acabamentoId: null,
    tipoVidroId: null,
    espessuraVidroMm: null,
    cobranca: "POR_M2",
    valorCentavos: 100,
    vigenciaInicio: null,
    vigenciaFim: null,
    ativo: true,
  };
  const chave = { linhaId: "suprema", acabamentoId: "branco", tipoVidroId: "incolor", espessuraVidroMm: 8 };

  it("escolhe a linha mais específica", () => {
    const geral = { ...base, id: "geral", valorCentavos: 1 };
    const daLinha = { ...base, id: "linha", linhaId: "suprema", valorCentavos: 2 };
    const completa = { ...base, id: "completa", linhaId: "suprema", acabamentoId: "branco", tipoVidroId: "incolor", espessuraVidroMm: 8, valorCentavos: 3 };
    expect(escolherLinhaDaTabela([geral, daLinha, completa], chave, "2026-11-13")?.id).toBe("completa");
    expect(escolherLinhaDaTabela([geral, daLinha], chave, "2026-11-13")?.id).toBe("linha");
  });

  it("não usa linha que contradiz a chave (outra linha, outro vidro)", () => {
    const outra = { ...base, id: "gold", linhaId: "gold" };
    const outroVidro = { ...base, id: "fume", tipoVidroId: "fume" };
    expect(escolherLinhaDaTabela([outra, outroVidro], chave, "2026-11-13")).toBeNull();
  });

  it("sem linha correspondente devolve null (o item cai em manual com aviso)", () => {
    expect(escolherLinhaDaTabela([], chave, "2026-11-13")).toBeNull();
  });

  it("respeita vigência e situação", () => {
    const futura = { ...base, id: "f", vigenciaInicio: "2027-01-01" };
    const vencida = { ...base, id: "v", vigenciaFim: "2026-01-01" };
    const inativa = { ...base, id: "i", ativo: false };
    expect(escolherLinhaDaTabela([futura, vencida, inativa], chave, "2026-11-13")).toBeNull();
  });

  it("empate de especificidade: vigência mais recente", () => {
    const antiga = { ...base, id: "a", linhaId: "suprema", vigenciaInicio: "2026-01-01" };
    const nova = { ...base, id: "n", linhaId: "suprema", vigenciaInicio: "2026-06-01" };
    expect(escolherLinhaDaTabela([antiga, nova], chave, "2026-11-13")?.id).toBe("n");
  });
});

describe("combinacoesSemPreco", () => {
  it("aponta linha × acabamento sem nenhuma linha de preço vigente", () => {
    const linhas = [{ id: "suprema" }, { id: "gold" }];
    const acabamentos = [{ id: "branco" }, { id: "preto" }];
    const tabela: LinhaTabelaPreco[] = [
      { id: "1", linhaId: "suprema", acabamentoId: "branco", tipoVidroId: null, espessuraVidroMm: null, cobranca: "POR_M2", valorCentavos: 1, vigenciaInicio: null, vigenciaFim: null, ativo: true },
      { id: "2", linhaId: "gold", acabamentoId: null, tipoVidroId: null, espessuraVidroMm: null, cobranca: "POR_M2", valorCentavos: 1, vigenciaInicio: null, vigenciaFim: null, ativo: true },
    ];
    expect(combinacoesSemPreco(linhas, acabamentos, tabela, "2026-11-13")).toEqual([{ linhaId: "suprema", acabamentoId: "preto" }]);
  });
});
