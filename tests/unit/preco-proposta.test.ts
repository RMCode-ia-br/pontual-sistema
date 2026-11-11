import { describe, expect, it } from "vitest";

import { aplicarPlural, formatarMedidas, gerarDescricao, valoresDoTemplate, variaveisDoTemplate } from "@/lib/dominio/descricao-item";
import { formatarNumeroProposta, lerNumeroProposta, proximoNumero } from "@/lib/dominio/numeracao-proposta";
import {
  acrescimoSobre,
  analisarMargem,
  areaM2,
  calcularTotais,
  metrosLineares,
  percentualParaPontosBase,
  precoPorComposicao,
  resolverMarkup,
  precoPorCobranca,
  quantidadeTotal,
} from "@/lib/dominio/preco";
import { gerarParcelas, validarParcelas, type ParcelaPlanejada } from "@/lib/dominio/parcelas";

describe("áreas e metros lineares", () => {
  it("m² = L × A × quantidade", () => {
    expect(areaM2([{ larguraMm: 2000, alturaMm: 1200, quantidade: 1 }])).toBeCloseTo(2.4, 10);
    expect(areaM2([{ larguraMm: 1000, alturaMm: 1000, quantidade: 3 }])).toBe(3);
  });
  it("várias medidas somam área e quantidade", () => {
    const m = [
      { larguraMm: 2000, alturaMm: 3600, quantidade: 1 },
      { larguraMm: 2000, alturaMm: 2600, quantidade: 2 },
    ];
    expect(areaM2(m)).toBeCloseTo(7.2 + 10.4, 10);
    expect(quantidadeTotal(m)).toBe(3);
  });
  it("metros lineares = largura × quantidade", () => {
    expect(metrosLineares([{ larguraMm: 1500, alturaMm: 1100, quantidade: 2 }])).toBe(3);
  });
});

describe("preço por tabela", () => {
  const m = [{ larguraMm: 1500, alturaMm: 1200, quantidade: 2 }]; // 3,6 m²
  it("por m²", () => expect(precoPorCobranca("POR_M2", 85000, m)).toBe(306000));
  it("por unidade (báscula)", () => expect(precoPorCobranca("POR_UNIDADE", 45000, m)).toBe(90000));
  it("por metro linear (guarda-corpo)", () => expect(precoPorCobranca("POR_METRO_LINEAR", 120000, m)).toBe(360000));
  it("arredonda meio centavo para cima, sem erro de ponto flutuante", () => {
    // 1 m × 1 m × R$ 0,015/m² não existe em centavos; usa 1,001 m²: 1001 x 1000 mm = 1.001.000 mm² × 3 cent / 1e6 = 3,003 → 3
    expect(precoPorCobranca("POR_M2", 3, [{ larguraMm: 1001, alturaMm: 1000, quantidade: 1 }])).toBe(3);
    // 0,5 centavo exato sobe: 500.000 mm² × 1 centavo = 0,5
    expect(precoPorCobranca("POR_M2", 1, [{ larguraMm: 1000, alturaMm: 500, quantidade: 1 }])).toBe(1);
  });
  it("valores grandes não estouram (BigInt)", () => {
    const grande = [{ larguraMm: 20000, alturaMm: 20000, quantidade: 1000 }];
    // produto intermediário 8e20 (> 2^53): sem BigInt perderia precisão
    expect(precoPorCobranca("POR_M2", 2_000_000_001, grande)).toBe(800_000_000_400_000);
  });
});

describe("preço por composição: custo × (1 + markup) sobre o custo", () => {
  const CONFIG = { padraoPb: 8000, vidroTemperadoPb: 10000 };

  it("(a) markup padrão 80%: custo R$ 1.000,00 → R$ 1.800,00", () => {
    expect(precoPorComposicao(100000, 8000)).toEqual({ ok: true, precoCentavos: 180000 });
  });
  it("(b) markup 100% (guarda-corpo / vidro temperado): custo R$ 1.000,00 → R$ 2.000,00", () => {
    expect(precoPorComposicao(100000, 10000)).toEqual({ ok: true, precoCentavos: 200000 });
  });
  it("markup 0% devolve o próprio custo", () => {
    expect(precoPorComposicao(12345, 0)).toEqual({ ok: true, precoCentavos: 12345 });
  });
  it("arredonda meio centavo para cima", () => {
    // 5 centavos × 1,1 = 5,5 → 6
    expect(precoPorComposicao(5, 1000)).toEqual({ ok: true, precoCentavos: 6 });
    // 3 centavos × 1,8 = 5,4 → 5
    expect(precoPorComposicao(3, 8000)).toEqual({ ok: true, precoCentavos: 5 });
  });
  it("recusa custo ou markup inválido e preço acima do teto", () => {
    expect(precoPorComposicao(-1, 8000).ok).toBe(false);
    expect(precoPorComposicao(1.5, 8000).ok).toBe(false);
    expect(precoPorComposicao(1000, -1).ok).toBe(false);
    expect(precoPorComposicao(1000, 100_001).ok).toBe(false);
    expect(precoPorComposicao(2_000_000_000, 10000).ok).toBe(false);
  });

  it("precedência do markup: item > proposta > categoria > padrão (valores vêm de Configurações)", () => {
    expect(resolverMarkup({ itemPb: 5000, propostaPb: 9000, categoria: "VIDRO_TEMPERADO", config: CONFIG })).toEqual({ markupPb: 5000, origem: "ITEM" });
    expect(resolverMarkup({ itemPb: 0, categoria: "PADRAO", config: CONFIG })).toEqual({ markupPb: 0, origem: "ITEM" });
    expect(resolverMarkup({ propostaPb: 9000, categoria: "VIDRO_TEMPERADO", config: CONFIG })).toEqual({ markupPb: 9000, origem: "PROPOSTA" });
    expect(resolverMarkup({ categoria: "VIDRO_TEMPERADO", config: CONFIG })).toEqual({ markupPb: 10000, origem: "CATEGORIA" });
    expect(resolverMarkup({ categoria: "PADRAO", config: CONFIG })).toEqual({ markupPb: 8000, origem: "PADRAO" });
    // Se o gestor mudar os padrões em Configurações, o resultado muda (nada fixo no código).
    expect(resolverMarkup({ categoria: "PADRAO", config: { padraoPb: 7000, vidroTemperadoPb: 9500 } }).markupPb).toBe(7000);
  });

  describe("(c) COM nota fiscal: o 5% vem DEPOIS do markup, em linha separada", () => {
    const um = [{ larguraMm: 1000, alturaMm: 1000, quantidade: 1 }];
    const totalDoItem = (custo: number, markupPb: number, comNota: boolean) => {
      const preco = precoPorComposicao(custo, markupPb);
      if (!preco.ok) throw new Error(preco.erro);
      return calcularTotais([{ opcaoId: "o", precoTotalCentavos: preco.precoCentavos, medidas: um }], [{ id: "o" }], comNota, 500)[0];
    };

    it("custo R$ 1.000,00 × 1,8 × 1,05 = R$ 1.890,00 (acréscimo R$ 90,00)", () => {
      const t = totalDoItem(100000, 8000, true);
      expect(t.baseCentavos).toBe(180000);
      expect(t.acrescimoNotaCentavos).toBe(9000);
      expect(t.totalCentavos).toBe(189000);
    });
    it("custo R$ 1.000,00 × 2 × 1,05 = R$ 2.100,00 (acréscimo R$ 100,00)", () => {
      const t = totalDoItem(100000, 10000, true);
      expect(t.baseCentavos).toBe(200000);
      expect(t.acrescimoNotaCentavos).toBe(10000);
      expect(t.totalCentavos).toBe(210000);
    });
    it("SEM nota: só o markup", () => {
      expect(totalDoItem(100000, 8000, false).totalCentavos).toBe(180000);
      expect(totalDoItem(100000, 10000, false).acrescimoNotaCentavos).toBe(0);
    });
    it("o 5% não altera o preço do item nem o markup (ordem: custo → markup → desconto → nota)", () => {
      const preco = precoPorComposicao(100000, 8000);
      expect(preco).toEqual({ ok: true, precoCentavos: 180000 });
      const [t] = calcularTotais([{ opcaoId: "o", precoTotalCentavos: 180000, medidas: um }], [{ id: "o", descontoCentavos: 18000 }], true, 500);
      expect(t.baseCentavos).toBe(162000);
      expect(t.totalCentavos).toBe(170100);
    });
  });

  it("modo MANUAL: o preço é o do Marcelo, sem markup; só os 5% se houver nota", () => {
    const um = [{ larguraMm: 1000, alturaMm: 1000, quantidade: 1 }];
    const item = [{ opcaoId: "o", precoTotalCentavos: 100000, medidas: um }];
    expect(calcularTotais(item, [{ id: "o" }], false, 500)[0].totalCentavos).toBe(100000);
    expect(calcularTotais(item, [{ id: "o" }], true, 500)[0].totalCentavos).toBe(105000);
  });
});

describe("percentualParaPontosBase", () => {
  it("converte e valida", () => {
    expect(percentualParaPontosBase("5")).toBe(500);
    expect(percentualParaPontosBase("5,25")).toBe(525);
    expect(percentualParaPontosBase(12.5)).toBe(1250);
    expect(percentualParaPontosBase("5,255")).toBeNull();
    expect(percentualParaPontosBase("-1")).toBeNull();
    expect(percentualParaPontosBase("")).toBeNull();
    expect(percentualParaPontosBase("abc")).toBeNull();
  });
});

describe("totais da proposta e acréscimo da nota fiscal", () => {
  const medida = [{ larguraMm: 1000, alturaMm: 1000, quantidade: 1 }];
  const itens = [
    { opcaoId: "a", precoTotalCentavos: 413000, custoEstimadoCentavos: null, medidas: medida },
    { opcaoId: "a", precoTotalCentavos: 905000, custoEstimadoCentavos: null, medidas: medida },
    { opcaoId: "b", precoTotalCentavos: 100000, custoEstimadoCentavos: 60000, medidas: medida },
  ];

  it("sem nota: total = soma dos itens (nunca digitado)", () => {
    const [a, b] = calcularTotais(itens, [{ id: "a" }, { id: "b" }], false, 500);
    expect(a.totalCentavos).toBe(1318000);
    expect(a.acrescimoNotaCentavos).toBe(0);
    expect(b.totalCentavos).toBe(100000);
  });

  it("com nota: preço × 1,05 em linha separada", () => {
    const [a] = calcularTotais(itens, [{ id: "a" }], true, 500);
    expect(a.baseCentavos).toBe(1318000);
    expect(a.acrescimoNotaCentavos).toBe(65900);
    expect(a.totalCentavos).toBe(1383900);
  });

  it("desconto vale antes do acréscimo e nunca passa do subtotal", () => {
    const [a] = calcularTotais(itens, [{ id: "a", descontoCentavos: 18000 }], true, 500);
    expect(a.baseCentavos).toBe(1300000);
    expect(a.totalCentavos).toBe(1365000);
    const [b] = calcularTotais(itens, [{ id: "a", descontoCentavos: 99999999 }], true, 500);
    expect(b.totalCentavos).toBe(0);
  });

  it("acréscimo arredonda meio centavo para cima e aceita 2 casas", () => {
    expect(acrescimoSobre(10, 500)).toBe(1); // 0,5 → 1
    expect(acrescimoSobre(1000, 525)).toBe(53); // 52,5 → 53
    expect(acrescimoSobre(0, 500)).toBe(0);
    expect(acrescimoSobre(1000, 0)).toBe(0);
  });

  it("custo só aparece se todos os itens têm custo", () => {
    const [a, b] = calcularTotais(itens, [{ id: "a" }, { id: "b" }], false, 500);
    expect(a.custoCentavos).toBeNull();
    expect(a.itensSemCusto).toBe(2);
    expect(b.custoCentavos).toBe(60000);
  });

  it("margem interna em R$ e % e preço por m²", () => {
    const r = analisarMargem(100000, 60000, medida);
    expect(r).toEqual({ margemCentavos: 40000, margemPb: 4000, precoPorM2Centavos: 100000 });
    expect(analisarMargem(100000, null, medida).margemCentavos).toBeNull();
    expect(analisarMargem(50000, 60000, medida).margemPb).toBe(-2000);
  });
});

const CRONOGRAMA_50_25_25: ParcelaPlanejada[] = [
  { descricao: "Sinal na confirmação", percentualPb: 5000, gatilho: "CONFIRMACAO", forma: "PIX" },
  { descricao: "Entrega do material", percentualPb: 2500, gatilho: "ENTREGA_MATERIAL", forma: null },
  { descricao: "Entrega dos vidros e instalação", percentualPb: 2500, gatilho: "ENTREGA_E_INSTALACAO", forma: null },
];

describe("casos reais (fixtures da especificação, seção 12)", () => {
  it("1157-26 (Parte 02): 4.130 + 9.050 + (2.700 + 3.950) = R$ 19.830,00; 50% sinal + 50% na entrega e instalação", () => {
    const m = [{ larguraMm: 1000, alturaMm: 1000, quantidade: 1 }];
    const itens = [4130_00, 9050_00, 2700_00 + 3950_00].map((v) => ({ opcaoId: "u", precoTotalCentavos: v, medidas: m }));
    const [total] = calcularTotais(itens, [{ id: "u" }], false, 500);
    expect(total.totalCentavos).toBe(1983000);

    const parcelas = gerarParcelas(total.totalCentavos, [
      { descricao: "Sinal", percentualPb: 5000, gatilho: "CONFIRMACAO", forma: "PIX" },
      { descricao: "Entrega e instalação", percentualPb: 5000, gatilho: "ENTREGA_E_INSTALACAO", forma: null },
    ], "2026-11-13");
    expect(parcelas.map((p) => p.valorCentavos)).toEqual([991500, 991500]);
  });

  it("1127-26 (Parte 01): soma correta R$ 89.725,00 (o PDF imprimia 89.145,00); 50% + 25% + 25%", () => {
    // Valores de teste que reproduzem o total real (os 22 valores originais estão no PDF, fora do repositório).
    const valores = [
      12000_00, 9500_00, 8750_00, 7200_00, 6800_00, 6100_00, 5400_00, 4950_00, 4300_00, 3900_00, 3500_00, 3100_00, 2700_00, 2400_00,
      2100_00, 1800_00, 1500_00, 1300_00, 1100_00, 600_00, 400_00, 325_00,
    ];
    expect(valores).toHaveLength(22);
    const m = [{ larguraMm: 1000, alturaMm: 1000, quantidade: 1 }];
    const [total] = calcularTotais(valores.map((v) => ({ opcaoId: "u", precoTotalCentavos: v, medidas: m })), [{ id: "u" }], false, 500);
    expect(total.totalCentavos).toBe(8972500);
    expect(total.totalCentavos).not.toBe(8914500);

    const parcelas = gerarParcelas(total.totalCentavos, CRONOGRAMA_50_25_25, "2026-11-13");
    expect(parcelas.map((p) => p.valorCentavos)).toEqual([4486250, 2243125, 2243125]);
    expect(parcelas.reduce((s, p) => s + p.valorCentavos, 0)).toBe(8972500);
  });
});

describe("geração de parcelas (R6)", () => {
  it("a última parcela absorve a diferença do arredondamento", () => {
    const tres: ParcelaPlanejada[] = [
      { descricao: "1", percentualPb: 3333, gatilho: "CONFIRMACAO", forma: "PIX" },
      { descricao: "2", percentualPb: 3333, gatilho: "CONFIRMACAO", forma: "PIX" },
      { descricao: "3", percentualPb: 3334, gatilho: "CONFIRMACAO", forma: "PIX" },
    ];
    const p = gerarParcelas(10000, tres, "2026-11-13");
    expect(p.map((x) => x.valorCentavos)).toEqual([3333, 3333, 3334]);
    const q = gerarParcelas(10001, tres, "2026-11-13");
    expect(q.reduce((s, x) => s + x.valorCentavos, 0)).toBe(10001);
  });

  it("gatilhos de etapa ficam sem vencimento; os demais têm vencimento", () => {
    const p = gerarParcelas(100000, [
      { descricao: "a", percentualPb: 4000, gatilho: "CONFIRMACAO", forma: "PIX" },
      { descricao: "b", percentualPb: 2000, gatilho: "DIAS_APOS_APROVACAO", diasApos: 30, forma: "BOLETO" },
      { descricao: "c", percentualPb: 2000, gatilho: "DATA_FIXA", dataFixa: "2027-01-15", forma: null },
      { descricao: "d", percentualPb: 2000, gatilho: "ENTREGA_MATERIAL", forma: null },
    ], "2026-12-20");
    expect(p.map((x) => [x.status, x.vencimento])).toEqual([
      ["ABERTA", "2026-12-20"],
      ["ABERTA", "2027-01-19"],
      ["ABERTA", "2027-01-15"],
      ["AGUARDANDO_GATILHO", null],
    ]);
  });

  it("cartão em até 12x só informa o número de parcelas (sem juros)", () => {
    const p = gerarParcelas(120000, [{ descricao: "Cartão", percentualPb: 10000, gatilho: "CONFIRMACAO", forma: "CARTAO_CREDITO", parcelasCartao: 12 }], "2026-11-13");
    expect(p[0].valorCentavos).toBe(120000);
    expect(p[0].parcelasCartao).toBe(12);
  });

  it("com nota fiscal as parcelas dividem o total COM acréscimo", () => {
    const [t] = calcularTotais([{ opcaoId: "u", precoTotalCentavos: 100000, medidas: [] }], [{ id: "u" }], true, 500);
    const p = gerarParcelas(t.totalCentavos, CRONOGRAMA_50_25_25, "2026-11-13");
    expect(p.map((x) => x.valorCentavos)).toEqual([52500, 26250, 26250]);
  });

  it("valida o cronograma", () => {
    expect(validarParcelas([]).ok).toBe(false);
    expect(validarParcelas([{ descricao: "x", percentualPb: 9000, gatilho: "CONFIRMACAO", forma: null }]).ok).toBe(false);
    expect(validarParcelas([{ descricao: "x", percentualPb: 10000, gatilho: "DATA_FIXA", forma: null }]).ok).toBe(false);
    expect(validarParcelas([{ descricao: "x", percentualPb: 10000, gatilho: "DIAS_APOS_APROVACAO", forma: null }]).ok).toBe(false);
    expect(validarParcelas([{ descricao: "x", percentualPb: 10000, gatilho: "CONFIRMACAO", forma: "PIX", parcelasCartao: 3 }]).ok).toBe(false);
    expect(validarParcelas([{ descricao: "x", percentualPb: 10000, gatilho: "CONFIRMACAO", forma: "CARTAO_CREDITO", parcelasCartao: 13 }]).ok).toBe(false);
    expect(validarParcelas([{ descricao: "x", percentualPb: 0, gatilho: "CONFIRMACAO", forma: null }]).ok).toBe(false);
    expect(validarParcelas(CRONOGRAMA_50_25_25).ok).toBe(true);
  });

  it("gerarParcelas recusa cronograma que não soma 100%", () => {
    expect(() => gerarParcelas(1000, [{ descricao: "x", percentualPb: 5000, gatilho: "CONFIRMACAO", forma: null }], "2026-11-13")).toThrow();
  });
});

describe("numeração NNNN-AA", () => {
  it("formata e lê", () => {
    expect(formatarNumeroProposta(2000, 2026)).toBe("2000-26");
    expect(formatarNumeroProposta(7, 2027)).toBe("0007-27");
    expect(lerNumeroProposta("2000-26")).toEqual({ sequencial: 2000, ano: 2026 });
    expect(lerNumeroProposta("abc")).toBeNull();
  });
  it("começa em 2000 quando nada foi configurado e avança", () => {
    expect(proximoNumero({ proximo: null, anoDoContador: null, anoAtual: 2026, reiniciaPorAno: false })).toEqual({ sequencial: 2000, novoProximo: 2001 });
    expect(proximoNumero({ proximo: 2001, anoDoContador: 2026, anoAtual: 2026, reiniciaPorAno: false })).toEqual({ sequencial: 2001, novoProximo: 2002 });
  });
  it("não reinicia por ano por padrão; reinicia só se configurado", () => {
    expect(proximoNumero({ proximo: 2050, anoDoContador: 2026, anoAtual: 2027, reiniciaPorAno: false }).sequencial).toBe(2050);
    expect(proximoNumero({ proximo: 2050, anoDoContador: 2026, anoAtual: 2027, reiniciaPorAno: true }).sequencial).toBe(1);
  });
});

describe("descrição com plural", () => {
  const um = [{ larguraMm: 2000, alturaMm: 1200, quantidade: 1 }];
  const dois = [{ larguraMm: 2000, alturaMm: 1200, quantidade: 2 }];
  const template = "JANELA(S) DE CORRER COM {FOLHAS} FOLHAS EM ALUMÍNIO LINHA {LINHA}, COM VIDRO TEMPERADO {COR} DE {MM}MM, COMPLETA(S) E INSTALADA(S), MED. {MEDIDAS}";
  const valores = { FOLHAS: "02", LINHA: "SUPREMA", COR: "INCOLOR", MM: 8 };

  it("singular pela quantidade 1", () => {
    expect(gerarDescricao(template, valores, um).texto).toBe(
      "JANELA DE CORRER COM 02 FOLHAS EM ALUMÍNIO LINHA SUPREMA, COM VIDRO TEMPERADO INCOLOR DE 8MM, COMPLETA E INSTALADA, MED. 2000 X 1200",
    );
  });
  it("plural pela quantidade total das medidas", () => {
    expect(gerarDescricao(template, valores, dois).texto).toContain("JANELAS DE CORRER");
    expect(gerarDescricao(template, valores, dois).texto).toContain("COMPLETAS E INSTALADAS");
    const duas = [{ larguraMm: 1, alturaMm: 1, quantidade: 1 }, { larguraMm: 2, alturaMm: 2, quantidade: 1 }];
    expect(gerarDescricao("PORTA(S)", {}, duas).texto).toBe("PORTAS");
  });
  it("várias medidas separadas por ' / '", () => {
    const m = [{ larguraMm: 2000, alturaMm: 3600, quantidade: 1 }, { larguraMm: 2000, alturaMm: 2600, quantidade: 1 }];
    expect(formatarMedidas(m)).toBe("2000 X 3600 / 2000 X 2600");
  });
  it("PAINEL(IS) → PAINÉIS", () => {
    expect(aplicarPlural("PAINEL(IS) FIXO(S)", 1)).toBe("PAINEL FIXO");
    expect(aplicarPlural("PAINEL(IS) FIXO(S)", 3)).toBe("PAINÉIS FIXOS");
  });
  it("PORTÃO(ÕES) → PORTÕES", () => {
    expect(aplicarPlural("PORTÃO(ÕES) EM ALUMÍNIO", 1)).toBe("PORTÃO EM ALUMÍNIO");
    expect(aplicarPlural("PORTÃO(ÕES) EM ALUMÍNIO", 2)).toBe("PORTÕES EM ALUMÍNIO");
  });
  it("variável sem valor é listada e não inventada", () => {
    const r = gerarDescricao("LINHA {LINHA} COR {COR}", { LINHA: "GOLD" }, um);
    expect(r.faltando).toEqual(["COR"]);
    expect(r.texto).toBe("LINHA GOLD COR");
  });
  it("variáveis desconhecidas do template são apontadas", () => {
    expect(variaveisDoTemplate("{LINHA} {XYZ} {MM}")).toEqual({ validas: ["LINHA", "MM"], desconhecidas: ["XYZ"] });
  });
});

describe("valoresDoTemplate (descrição regerada ao duplicar opção)", () => {
  const modelo = "JANELA(S) COM {FOLHAS} FOLHAS LINHA {LINHA}, VIDRO {COR} DE {MM}MM, ACABAMENTO {ACABAMENTO}, MED. {MEDIDAS}";
  const medidas = [{ larguraMm: 2000, alturaMm: 1200, quantidade: 1 }];
  const base = { folhas: 2, faces: null, torresCm: null, linha: "Suprema", tipoVidro: "Incolor", espessuraMm: 8, acabamento: "Branco" };
  it("troca de linha e vidro muda o texto", () => {
    expect(gerarDescricao(modelo, valoresDoTemplate(base), medidas).texto).toBe("JANELA COM 02 FOLHAS LINHA Suprema, VIDRO Incolor DE 8MM, ACABAMENTO Branco, MED. 2000 X 1200");
    const gold = gerarDescricao(modelo, valoresDoTemplate({ ...base, linha: "Gold", tipoVidro: "Fumê", espessuraMm: 10 }), medidas).texto;
    expect(gold).toContain("LINHA Gold");
    expect(gold).toContain("VIDRO Fumê DE 10MM");
    expect(gold).not.toContain("Suprema");
  });
  it("faces trazem a palavra no singular e no plural; vazio fica em branco", () => {
    expect(valoresDoTemplate({ ...base, faces: 1 }).FACES).toBe("01 FACE");
    expect(valoresDoTemplate({ ...base, faces: 2 }).FACES).toBe("02 FACES");
    expect(valoresDoTemplate({ ...base, folhas: null, linha: null }).FOLHAS).toBe("");
  });
});
