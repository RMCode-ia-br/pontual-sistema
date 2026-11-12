import { describe, expect, it } from "vitest";

import { parseMoedaParaCentavos } from "@/lib/formatadores";
import { lerQuantidade } from "@/lib/dominio/estoque";
import { lerPercentualEmPb } from "@/lib/dominio/perfil-kg";
import { textoParaDecimal, textoParaInteiro, valorParaCentavos } from "@/lib/dominio/numeros";
import { percentualParaPontosBase } from "@/lib/dominio/preco";
import { lerNumeroBr } from "@/lib/validadores/numero-br";

/**
 * Tabela de leitura de números no padrão brasileiro (Fase 7, Bloco 0c). Cada leitor do sistema usa a MESMA regra
 * (`lerNumeroBr`): o texto é lido de forma correta ou recusado (null), nunca interpretado errado em silêncio.
 * Os cinco textos pedidos pelo dono: "2,5", "2.5", "1.234,56", "1234,56" e "R$ 1.234,56".
 */

type Caso = [texto: string, esperado: number | null];

function tabela(nome: string, leitor: (t: string) => number | null, casos: Caso[]) {
  describe(nome, () => {
    it.each(casos)("%j → %j", (texto, esperado) => {
      expect(leitor(texto)).toBe(esperado);
    });
  });
}

// Dinheiro: centavos inteiros.
const DINHEIRO: Caso[] = [
  ["2,5", 250],
  ["2.5", 250],
  ["1.234,56", 123456],
  ["1234,56", 123456],
  ["R$ 1.234,56", 123456],
  ["R$1.234,56", 123456],
  ["1.500", 150000], // convenção brasileira: mil e quinhentos reais, não R$ 1,50
  ["1234.56", 123456], // ponto decimal de planilha
  ["12", 1200],
  ["0,29", 29],
  ["19,99", 1999], // em ponto flutuante daria 1998,9999...
  ["0.125", null], // três casas não são centavos: recusa em vez de virar R$ 125,00
  ["12,345", null],
  ["1R2", null], // a letra R só vale no início, junto do cifrão
  ["1.23,45", null], // ponto fora do lugar
  ["1..000,00", null],
  ["1,2,3", null],
  ["-5,00", null],
  ["", null],
  ["abc", null],
  ["5,", null],
];
tabela("parseMoedaParaCentavos (dinheiro)", parseMoedaParaCentavos, DINHEIRO);
tabela("valorParaCentavos (dinheiro, importação)", valorParaCentavos, DINHEIRO);

// Quantidade, peso, kg e metro: decimal com até 3 casas.
tabela("textoParaDecimal (3 casas)", (t) => textoParaDecimal(t, 3), [
  ["2,5", 2.5],
  ["2.5", 2.5],
  ["1.234,56", 1234.56],
  ["1234,56", 1234.56],
  ["R$ 1.234,56", null], // "R$" só é aceito em campo de dinheiro
  ["0.125", 0.125],
  ["1.500", 1500], // o mesmo que em dinheiro e em quantidade (antes dava 1,5 aqui e 1500 lá)
  ["1,250", 1.25],
  ["1.25", 1.25],
  ["1,2345", null],
  ["1R2", null],
  ["-2,5", null],
  ["", null],
]);

// Percentual: 2 casas, devolvido como número (a conversão para pontos-base vem depois).
tabela("textoParaDecimal (2 casas, percentual)", (t) => textoParaDecimal(t, 2), [
  ["2,5", 2.5],
  ["2.5", 2.5],
  ["80", 80],
  ["0.125", null],
  ["12,345", null],
]);

// Quantidade de estoque e compra: milésimos inteiros.
tabela("lerQuantidade (milésimos)", lerQuantidade, [
  ["2,5", 2500],
  ["2.5", 2500], // o bug da Fase 6: "2.5" lido como 25
  ["1.234,56", 1234560],
  ["1234,56", 1234560],
  ["R$ 1.234,56", null],
  ["0.125", 125],
  ["1.500", 1500000], // milhar: mil e quinhentas unidades
  ["1.234", 1234000],
  ["0,001", 1],
  ["2.5000", null],
  ["1.23.4", null],
  ["1R2", null],
  ["-1", null],
  ["", null],
]);

// Inteiros: milímetros, dias, prazo.
tabela("textoParaInteiro", textoParaInteiro, [
  ["6000", 6000],
  ["6.000", 6000],
  ["1.200", 1200],
  ["2,5", null],
  ["2.5", null],
  ["1.234,56", null],
  ["1234,56", null],
  ["R$ 1.234,56", null],
  ["1R2", null],
  ["-3", null],
  ["", null],
]);

// Percentual em pontos-base (1% = 100): markup, acréscimo da nota, comissões.
tabela("percentualParaPontosBase (texto)", (t) => percentualParaPontosBase(t), [
  ["2,5", 250],
  ["2.5", 250],
  ["80", 8000],
  ["1.234,56", 123456],
  ["1234,56", 123456],
  ["R$ 1.234,56", null],
  ["0.125", null],
  ["-5", null],
  ["abc", null],
]);

tabela("lerPercentualEmPb (com sinal e %)", lerPercentualEmPb, [
  ["2,5", 250],
  ["2.5", 250],
  ["+5", 500],
  ["-3,5%", -350],
  ["5 %", 500],
  ["1.234,56", null], // acima de ±1.000%: recusa
  ["1234,56", null],
  ["R$ 1.234,56", null],
  ["0", null],
  ["1R2", null],
]);

describe("lerNumeroBr: mensagens claras e aritmética exata", () => {
  it("devolve o inteiro escalado, sem ponto flutuante", () => {
    expect(lerNumeroBr("1.234,56", { casas: 2, moeda: true })).toEqual({ ok: true, escalado: 123456, casas: 2 });
    expect(lerNumeroBr("0,1", { casas: 2 })).toEqual({ ok: true, escalado: 10, casas: 2 });
    expect(lerNumeroBr("2,5", { casas: 3 })).toEqual({ ok: true, escalado: 2500, casas: 3 });
    expect(lerNumeroBr(",5", { casas: 2 })).toEqual({ ok: true, escalado: 50, casas: 2 });
  });

  it("explica por que recusou, em português simples", () => {
    const erro = (texto: string, opcoes: Parameters<typeof lerNumeroBr>[1]) => {
      const r = lerNumeroBr(texto, opcoes);
      return r.ok ? null : r.erro;
    };
    expect(erro("0.125", { casas: 2, moeda: true })).toMatch(/vírgula para os centavos/);
    expect(erro("1.23,45", { casas: 2 })).toMatch(/ponto só para separar milhares/);
    expect(erro("1R2", { casas: 2 })).toMatch(/só números, vírgula e ponto/);
    expect(erro("-5", { casas: 2 })).toMatch(/não pode ser negativo/);
    expect(erro("1,5", { casas: 0 })).toMatch(/número inteiro/);
    expect(erro("1,2345", { casas: 3 })).toMatch(/no máximo 3 casas/);
    expect(erro("", { casas: 2 })).toMatch(/Informe um número/);
    expect(erro("5,", { casas: 2 })).toMatch(/depois da vírgula/);
    expect(erro("R$ 5", { casas: 2 })).toMatch(/só números/); // sem `moeda`, o cifrão não vale
  });

  it("aceita negativo só quando o campo permite, e nunca devolve -0", () => {
    expect(lerNumeroBr("-5,5", { casas: 2, negativo: true })).toEqual({ ok: true, escalado: -550, casas: 2 });
    const zero = lerNumeroBr("-0", { casas: 2, negativo: true });
    expect(zero.ok && Object.is(zero.escalado, -0)).toBe(false);
  });

  it("recusa número grande demais em vez de perder precisão", () => {
    expect(lerNumeroBr("99999999999999999999,99", { casas: 2 })).toEqual({ ok: false, erro: "Número grande demais." });
  });
});
