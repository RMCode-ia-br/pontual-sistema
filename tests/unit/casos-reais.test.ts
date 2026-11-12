import { describe, expect, it } from "vitest";

import { TIPOLOGIAS } from "../../prisma/seed-propostas";
import { gerarDescricao, valoresDoTemplate } from "@/lib/dominio/descricao-item";
import { gerarParcelas } from "@/lib/dominio/parcelas";
import { acrescimoSobre, areaM2, calcularTotais, metrosLineares, precoPorCobranca, quantidadeTotal } from "@/lib/dominio/preco";

import { ITENS_1127, ITENS_1157, TOTAL_1127_CENTAVOS, TOTAL_1157_CENTAVOS, TOTAL_IMPRESSO_ERRADO_1127_CENTAVOS, type ItemReal } from "./fixtures-casos-reais";

const NOME_DA_TIPOLOGIA: Record<ItemReal["tipo"], string> = {
  JANELA: "Janela de correr",
  PORTA: "Porta de correr",
  BASCULA: "Báscula",
  PAINEL: "Painel fixo",
  BOX: "Box frontal de correr",
  GUARDA_CORPO: "Guarda-corpo",
};

/** Descrição gerada pelo MESMO template semeado no sistema (Apêndice B) e pelas mesmas regras da tela. */
function descricaoGerada(i: ItemReal, linha: string | null) {
  const modelo = TIPOLOGIAS.find((t) => t.nome === NOME_DA_TIPOLOGIA[i.tipo])!.templateDescricao;
  return gerarDescricao(
    modelo,
    valoresDoTemplate({ folhas: i.folhas ?? null, faces: i.faces ?? null, torresCm: i.torresCm ?? null, linha, tipoVidro: i.cor, espessuraMm: i.mm, acabamento: i.acabamento ?? null }),
    i.medidas,
  );
}

const totalDe = (itens: ItemReal[], comNota = false, descontoCentavos = 0) =>
  calcularTotais(
    itens.map((i) => ({ opcaoId: "o", precoTotalCentavos: i.valorCentavos, medidas: i.medidas })),
    [{ id: "o", descontoCentavos }],
    comNota,
    500,
  )[0];

describe("caso real 1127-26 (Parte 01): 22 itens", () => {
  it("tem 22 itens e a soma calculada é R$ 89.725,00 (o PDF imprimia R$ 89.145,00 por erro manual)", () => {
    expect(ITENS_1127).toHaveLength(22);
    const t = totalDe(ITENS_1127);
    expect(t.totalCentavos).toBe(TOTAL_1127_CENTAVOS);
    expect(t.totalCentavos).toBe(8972500);
    expect(t.totalCentavos).not.toBe(TOTAL_IMPRESSO_ERRADO_1127_CENTAVOS);
    expect(t.totalCentavos - TOTAL_IMPRESSO_ERRADO_1127_CENTAVOS).toBe(58000); // o erro do original: R$ 580,00
  });

  it("pagamento 50% + 25% + 25%: R$ 44.862,50 + R$ 22.431,25 + R$ 22.431,25, somando o total", () => {
    const p = gerarParcelas(
      TOTAL_1127_CENTAVOS,
      [
        { descricao: "Sinal na confirmação", percentualPb: 5000, gatilho: "CONFIRMACAO", forma: null },
        { descricao: "Entrega do material (esquadrias)", percentualPb: 2500, gatilho: "ENTREGA_MATERIAL", forma: null },
        { descricao: "Entrega dos vidros e instalação", percentualPb: 2500, gatilho: "ENTREGA_E_INSTALACAO", forma: null },
      ],
      "2025-10-03",
    );
    expect(p.map((x) => x.valorCentavos)).toEqual([4486250, 2243125, 2243125]);
    expect(p.reduce((s, x) => s + x.valorCentavos, 0)).toBe(8972500);
    expect(p.map((x) => x.status)).toEqual(["ABERTA", "AGUARDANDO_GATILHO", "AGUARDANDO_GATILHO"]);
  });

  it("com nota fiscal: R$ 89.725,00 × 1,05 = R$ 94.211,25 (acréscimo R$ 4.486,25 em linha separada)", () => {
    const t = totalDe(ITENS_1127, true);
    expect(t.baseCentavos).toBe(8972500);
    expect(t.acrescimoNotaCentavos).toBe(448625);
    expect(t.acrescimoNotaCentavos).toBe(acrescimoSobre(8972500, 500));
    expect(t.totalCentavos).toBe(9421125);
  });

  it("quantidade por item = a coluna impressa no original (02, 01 × 16, 02, 02, 03, 02, 01): 28 unidades", () => {
    const porItem = ITENS_1127.map((i) => quantidadeTotal(i.medidas));
    expect(porItem).toEqual([2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 3, 2, 1]);
    expect(porItem.reduce((soma, q) => soma + q, 0)).toBe(28);
    expect(totalDe(ITENS_1127).areaM2).toBeCloseTo(ITENS_1127.reduce((soma, i) => soma + areaM2(i.medidas), 0), 10);
  });

  it("báscula é preço por UNIDADE: as 7 custam R$ 580,00 cada, qualquer tamanho", () => {
    const bascula = ITENS_1127.filter((i) => i.tipo === "BASCULA");
    expect(bascula).toHaveLength(7);
    for (const b of bascula) expect(precoPorCobranca("POR_UNIDADE", 58000, b.medidas)).toBe(b.valorCentavos);
    expect(bascula.reduce((s, b) => s + b.valorCentavos, 0)).toBe(406000);
  });

  it("as 3 portas de correr de 2.100 × 2.200 custam R$ 4.100,00 cada", () => {
    const portas = ITENS_1127.filter((i) => i.tipo === "PORTA" && i.medidas[0].larguraMm === 2100);
    expect(portas).toHaveLength(3);
    expect(portas.every((p) => p.valorCentavos === 410000)).toBe(true);
  });

  it("tabela por m²: R$ 990,00/m² reproduz o preço real das 2 janelas de 1.000 × 1.000 (R$ 1.980,00)", () => {
    expect(precoPorCobranca("POR_M2", 99000, ITENS_1127[0].medidas)).toBe(ITENS_1127[0].valorCentavos);
  });

  describe("descrição gerada × texto real (a única diferença é o erro de gênero do original, 'COMPLETA E INSTALADO')", () => {
    const d = (n: number) => descricaoGerada(ITENS_1127[n - 1], "SUPREMA");

    it("janelas no plural (item 1) e medidas com quantidade (item 20: = 02)", () => {
      expect(d(1).texto).toBe(
        "JANELAS DE CORRER COM 02 FOLHAS EM ALUMÍNIO LINHA SUPREMA, COM VIDRO TEMPERADO INCOLOR DE 06MM, COMPLETAS E INSTALADAS COM TODOS OS ACESSÓRIOS PADRÃO PARA SEU FUNCIONAMENTO, MED. 1000 X 1000",
      );
      expect(d(20).texto).toBe(
        "JANELAS DE CORRER COM 02 FOLHAS EM ALUMÍNIO LINHA SUPREMA, COM VIDRO TEMPERADO INCOLOR DE 06MM, COMPLETAS E INSTALADAS COM TODOS OS ACESSÓRIOS PADRÃO PARA SEU FUNCIONAMENTO, MED. 2000 X 1800 = 02 / 2000 X 2150",
      );
    });
    it("janela no singular (item 5)", () => {
      expect(d(5).texto).toBe("JANELA DE CORRER COM 02 FOLHAS EM ALUMÍNIO LINHA SUPREMA, COM VIDRO TEMPERADO INCOLOR DE 06MM, COMPLETA E INSTALADA COM TODOS OS ACESSÓRIOS PADRÃO PARA SEU FUNCIONAMENTO, MED. 1300 X 1750");
    });
    it("báscula com 01 FACE (item 4)", () => {
      expect(d(4).texto).toBe(
        "BÁSCULA EM ALUMÍNIO ANODIZADO PRETO, LINHA SUPREMA, COM 01 FACE, COM VIDRO TEMPERADO INCOLOR DE 06MM, COMPLETA E INSTALADA COM TODOS OS ACESSÓRIOS NECESSÁRIOS PARA SEU FUNCIONAMENTO, MED. 700 X 700",
      );
    });
    it("painel fixo no singular (item 9) e no plural com 2 medidas (item 18)", () => {
      expect(d(9).texto).toBe("PAINEL FIXO EM VIDRO TEMPERADO INCOLOR DE 08MM, COM PERFIS EM ALUMÍNIO (LINHA SUPREMA), MED. 2000 X 1500");
      expect(d(18).texto).toBe("PAINÉIS FIXOS EM VIDRO TEMPERADO INCOLOR DE 08MM, COM PERFIS EM ALUMÍNIO (LINHA SUPREMA), MED. 1500 X 3600 / 1500 X 2600");
    });
    it("portas de 4 folhas no plural (item 21)", () => {
      expect(d(21).texto).toBe(
        "PORTAS DE CORRER COM 04 FOLHAS EM ALUMÍNIO LINHA SUPREMA, COM VIDRO TEMPERADO INCOLOR DE 06MM, COMPLETAS E INSTALADAS COM TODOS OS ACESSÓRIOS PADRÃO PARA SEU FUNCIONAMENTO, MED. 2500 X 5800 / 2500 X 2900",
      );
    });
    it("nenhum dos 22 itens fica com variável do modelo sem valor", () => {
      for (let n = 1; n <= 22; n++) expect(d(n).faltando, `item ${n}`).toEqual([]);
    });
  });
});

describe("caso real 1157-26 (Parte 02, boxes e guarda-corpo): 3 itens", () => {
  it("itens 4.130,00 + 9.050,00 + 6.650,00 (guarda-corpo = 2.700,00 + 3.950,00) = R$ 19.830,00", () => {
    expect(ITENS_1157).toHaveLength(3);
    expect(ITENS_1157.map((i) => i.valorCentavos)).toEqual([413000, 905000, 665000]);
    expect(totalDe(ITENS_1157).totalCentavos).toBe(TOTAL_1157_CENTAVOS);
  });

  it("pagamento: 50% de sinal + o restante na entrega e instalação = R$ 9.915,00 + R$ 9.915,00", () => {
    const p = gerarParcelas(
      TOTAL_1157_CENTAVOS,
      [
        { descricao: "Sinal na confirmação", percentualPb: 5000, gatilho: "CONFIRMACAO", forma: null },
        { descricao: "Restante na entrega e instalação", percentualPb: 5000, gatilho: "ENTREGA_E_INSTALACAO", forma: null },
      ],
      "2025-10-14",
    );
    expect(p.map((x) => x.valorCentavos)).toEqual([991500, 991500]);
  });

  it("com nota fiscal: R$ 19.830,00 × 1,05 = R$ 20.821,50 (acréscimo R$ 991,50), parcelas de R$ 10.410,75", () => {
    const t = totalDe(ITENS_1157, true);
    expect(t.acrescimoNotaCentavos).toBe(99150);
    expect(t.totalCentavos).toBe(2082150);
    const p = gerarParcelas(t.totalCentavos, [
      { descricao: "Sinal", percentualPb: 5000, gatilho: "CONFIRMACAO", forma: null },
      { descricao: "Restante", percentualPb: 5000, gatilho: "ENTREGA_E_INSTALACAO", forma: null },
    ], "2025-10-14");
    expect(p.map((x) => x.valorCentavos)).toEqual([1041075, 1041075]);
  });

  it("guarda-corpo por METRO LINEAR: 9,5 m a R$ 700,00/m = R$ 6.650,00 (largura × quantidade)", () => {
    const g = ITENS_1157[2];
    expect(metrosLineares(g.medidas)).toBe(9.5);
    expect(precoPorCobranca("POR_METRO_LINEAR", 70000, g.medidas)).toBe(g.valorCentavos);
    expect(quantidadeTotal(g.medidas)).toBe(4);
  });

  it("composição com markup de 100% (guarda-corpo / vidro temperado): o preço real equivale a custo de R$ 3.325,00 × 2", () => {
    // Não é dado de custo da Pontual: só mostra que o preço real é alcançável pelo markup de 100%.
    expect(Math.round(665000 / 2)).toBe(332500);
  });

  describe("descrição gerada × texto real", () => {
    const d = (n: number) => descricaoGerada(ITENS_1157[n - 1], null);
    it("box de 2 folhas (item 2): igual ao original", () => {
      expect(d(2).texto).toBe(
        "BOX FRONTAL EM VIDROS TEMPERADOS INCOLOR DE 08MM, DE CORRER COM 02 FOLHAS, COMPLETO E INSTALADO COM PERFIS EM ALUMÍNIO BRILHANTE, PUXADOR DE ALÇA COM 30CM E TODOS OS ACESSÓRIOS NECESSÁRIOS PARA SEU FUNCIONAMENTO, MED. 2100 X 1400",
      );
    });
    it("box com duas medidas de quantidade 1 (item 1): lista as medidas sem '= NN'", () => {
      expect(d(1).texto).toContain("DE CORRER COM 03 FOLHAS");
      expect(d(1).texto).toContain("PERFIS EM ALUMÍNIO PRETO");
      expect(d(1).texto.endsWith("MED. 2100 X 2470 / 2100 X 1740")).toBe(true);
    });
    it("guarda-corpo (item 3): igual ao original; a observação da escada vai no campo próprio", () => {
      expect(d(3).texto).toBe("GUARDA CORPO EM VIDROS TEMPERADOS INCOLOR DE 10MM COM TORRES DE 40CM EM INOX COM CONECTORES DE FIXAÇÃO.");
      expect(ITENS_1157[2].observacoes).toBe("GUARDA CORPO DA ESCADA VIA MOLDE.");
    });
    it("nenhum item fica com variável do modelo sem valor", () => {
      for (let n = 1; n <= 3; n++) expect(d(n).faltando, `item ${n}`).toEqual([]);
    });
  });
});

describe("dados dos casos reais não vazam informação do cliente", () => {
  it("as fixtures não trazem telefone, e-mail, endereço nem nome de cliente", () => {
    const texto = JSON.stringify([ITENS_1127, ITENS_1157]);
    expect(texto).not.toMatch(/@|\(\+?55|\b\d{4,5}-\d{4}\b|BUZIOS|BÚZIOS|ELEOSINA|JEAN/i);
  });
});
