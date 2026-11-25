import { describe, expect, it } from "vitest";

import { montarFormasDePagamento, type FormaExtraEntrada, type ParcelaForma } from "@/lib/dominio/alternativas-pagamento";
import { compararRevisoes, type ConteudoComparavel } from "@/lib/dominio/ciclo-proposta";
import { linhasDaForma } from "@/lib/dominio/texto-proposta";

const parcela = (percentualPb: number, extra: Partial<ParcelaForma> = {}): ParcelaForma => ({ descricao: "Parcela", percentualPb, gatilho: "CONFIRMACAO", forma: null, diasApos: null, dataFixa: null, parcelasCartao: null, ...extra });
const cartao = (n: number): ParcelaForma[] => [parcela(10000, { descricao: "No cartão", forma: "CARTAO_CREDITO", parcelasCartao: n })];
const extra = (nome: string, resto: Partial<FormaExtraEntrada> = {}): FormaExtraEntrada => ({ nome, modoAjuste: "PERCENTUAL", ajustePb: 0, repasseCartao: false, textoLivre: null, parcelas: [parcela(10000)], totais: [], ...resto });
const opcao = (id: string, base: number, nota = 0) => ({ id, nome: id.toUpperCase(), baseCentavos: base, acrescimoNotaCentavos: nota, totalCentavos: base + nota });
const principal = { textoLivre: null, parcelas: [parcela(5000), parcela(5000, { gatilho: "ENTREGA_E_INSTALACAO" })] };
const espacos = (t: string) => t.replace(/\s/g, " ");

describe("montarFormasDePagamento", () => {
  it("sem formas extras devolve lista vazia (snapshot idêntico ao de antes)", () => {
    expect(montarFormasDePagamento({ nomePrincipal: null, principal, extras: [], opcoes: [opcao("a", 100000)], comNotaFiscal: false, acrescimoNotaPb: 500 })).toEqual({ ok: true, formas: [] });
  });

  it("a principal vem primeiro, com o nome dado (ou 'Forma A') e ajuste zero", () => {
    const r = montarFormasDePagamento({ nomePrincipal: "À vista", principal, extras: [extra("Cartão")], opcoes: [opcao("a", 1_536_000)], comNotaFiscal: false, acrescimoNotaPb: 500 });
    expect(r.ok && r.formas[0]).toMatchObject({ nome: "À vista", principal: true, porOpcao: [{ opcaoId: "a", ajusteCentavos: 0, totalCentavos: 1_536_000 }] });
    const semNome = montarFormasDePagamento({ nomePrincipal: "  ", principal, extras: [extra("Cartão")], opcoes: [opcao("a", 1000)], comNotaFiscal: false, acrescimoNotaPb: 500 });
    expect(semNome.ok && semNome.formas[0].nome).toBe("Forma A");
  });

  it("1260-26: à vista 15.360 (principal) e cartões 3x/6x/10x com total digitado", () => {
    const r = montarFormasDePagamento({
      nomePrincipal: "À vista",
      principal,
      extras: [3, 6, 10].map((n, i) => extra(`Cartão ${n}x`, { modoAjuste: "TOTAL_DIGITADO", repasseCartao: true, parcelas: cartao(n), totais: [{ opcaoId: "a", baseCentavos: [1_620_000, 1_665_000, 1_735_000][i] }] })),
      opcoes: [opcao("a", 1_536_000)],
      comNotaFiscal: false,
      acrescimoNotaPb: 500,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.formas.map((f) => f.porOpcao[0].totalCentavos)).toEqual([1_536_000, 1_620_000, 1_665_000, 1_735_000]);
    expect(r.formas.map((f) => f.porOpcao[0].ajusteCentavos)).toEqual([0, 84_000, 129_000, 199_000]);
    expect(r.formas.slice(1).every((f) => f.repasseCartao)).toBe(true);
  });

  it("com nota: a nota entra por último, sobre a base ajustada, em cada forma", () => {
    const r = montarFormasDePagamento({ nomePrincipal: null, principal, extras: [extra("Pix", { ajustePb: -500 })], opcoes: [opcao("a", 1_000_000, 50_000)], comNotaFiscal: true, acrescimoNotaPb: 500 });
    expect(r.ok && r.formas[1].porOpcao[0]).toEqual({ opcaoId: "a", referenciaCentavos: 1_000_000, ajusteCentavos: -50_000, baseCentavos: 950_000, acrescimoNotaCentavos: 47_500, totalCentavos: 997_500 });
    expect(r.ok && r.formas[0].porOpcao[0].totalCentavos).toBe(1_050_000); // a principal é o total da opção, como sempre foi
  });

  it("duas opções: um total digitado por opção; faltando um, lista o que impede", () => {
    const f = extra("Cartão 10x", { modoAjuste: "TOTAL_DIGITADO", parcelas: cartao(10), totais: [{ opcaoId: "a", baseCentavos: 1_100_000 }] });
    const r = montarFormasDePagamento({ nomePrincipal: null, principal, extras: [f], opcoes: [opcao("a", 1_000_000), opcao("b", 800_000)], comNotaFiscal: false, acrescimoNotaPb: 500 });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.problemas.join(" ")).toMatch(/Cartão 10x.*opção "B"/);
  });

  it("recusa total longe da opção e opção sem valor, em português", () => {
    const longe = montarFormasDePagamento({ nomePrincipal: null, principal, extras: [extra("Longe", { modoAjuste: "TOTAL_DIGITADO", totais: [{ opcaoId: "a", baseCentavos: 2_000_000 }] })], opcoes: [opcao("a", 1_000_000)], comNotaFiscal: false, acrescimoNotaPb: 500 });
    expect(!longe.ok && longe.problemas[0]).toMatch(/50%/);
    const vazia = montarFormasDePagamento({ nomePrincipal: null, principal, extras: [extra("X")], opcoes: [opcao("a", 0)], comNotaFiscal: false, acrescimoNotaPb: 500 });
    expect(!vazia.ok && vazia.problemas[0]).toMatch(/ainda não tem valor/);
  });
});

describe("linhasDaForma (estilo das propostas do Marcelo)", () => {
  it("cartão: '03X R$ 5.400,00 CARTÃO', sem perder centavo", () => {
    expect(espacos(linhasDaForma(1_620_000, cartao(3), null)[0])).toBe("03X R$ 5.400,00 CARTÃO");
    expect(espacos(linhasDaForma(1_735_000, cartao(10), null)[0])).toBe("10X R$ 1.735,00 CARTÃO");
    expect(espacos(linhasDaForma(10_000, cartao(3), null)[0])).toBe("03X R$ 33,33 CARTÃO (última R$ 33,34)");
  });

  it("à vista 50% + 50% mantém a redação de sempre; texto livre sai como está", () => {
    const l = linhasDaForma(1_536_000, principal.parcelas, null).map(espacos);
    expect(l[0]).toBe("50% (R$ 7.680,00) — Parcela"); // com descrição, ela já diz o gatilho (mesma regra de sempre)
    expect(linhasDaForma(100, [], "A combinar")).toEqual(["A combinar"]);
    expect(linhasDaForma(100, [], null)).toEqual([]);
  });

  it("cartão como parte do cronograma: saldo de 50% em 2x", () => {
    const l = linhasDaForma(1_000_000, [parcela(5000), parcela(5000, { forma: "CARTAO_CREDITO", parcelasCartao: 2, descricao: "Saldo no cartão" })], null).map(espacos);
    expect(l[1]).toBe("50% (R$ 5.000,00) — Saldo no cartão — 02X R$ 2.500,00 CARTÃO");
  });
});

describe("compararRevisoes: formas de pagamento", () => {
  const base = (formas?: ConteudoComparavel["formas"]): ConteudoComparavel => ({ numero: "1-26", revisao: 0, comNotaFiscal: false, opcoes: [{ nome: "Opção 1", totalCentavos: 100, itens: [] }], formas });

  it("sem formas dos dois lados: nada muda (comparação de sempre)", () => {
    const r = compararRevisoes(base(), base());
    expect(r.formas).toEqual([]);
    expect(r.semMudancas).toBe(true);
  });

  it("mostra a forma que entrou, a que saiu e a que mudou de total", () => {
    const antes = base([
      { nome: "À vista", totais: [{ opcaoNome: "Opção 1", totalCentavos: 1_536_000 }] },
      { nome: "Cartão 3x", totais: [{ opcaoNome: "Opção 1", totalCentavos: 1_620_000 }] },
    ]);
    const depois = base([
      { nome: "À vista", totais: [{ opcaoNome: "Opção 1", totalCentavos: 1_536_000 }] },
      { nome: "Cartão 3x", totais: [{ opcaoNome: "Opção 1", totalCentavos: 1_650_000 }] },
      { nome: "Cartão 10x", totais: [{ opcaoNome: "Opção 1", totalCentavos: 1_735_000 }] },
    ]);
    const r = compararRevisoes(antes, depois);
    expect(r.formas.map((f) => [f.nome, f.situacao, f.mudancas.length])).toEqual([["À vista", "MANTIDA", 0], ["Cartão 3x", "MANTIDA", 1], ["Cartão 10x", "NOVA", 1]]);
    expect(r.formas[1].mudancas[0]).toMatchObject({ opcaoNome: "Opção 1", antesCentavos: 1_620_000, depoisCentavos: 1_650_000 });
    expect(r.semMudancas).toBe(false);
    expect(compararRevisoes(depois, antes).formas.find((f) => f.nome === "Cartão 10x")?.situacao).toBe("REMOVIDA");
  });

  it("uma revisão sem formas extras contra uma com formas: todas contam como novas", () => {
    const r = compararRevisoes(base(), base([{ nome: "À vista", totais: [{ opcaoNome: "Opção 1", totalCentavos: 100 }] }, { nome: "Cartão", totais: [{ opcaoNome: "Opção 1", totalCentavos: 110 }] }]));
    expect(r.formas.every((f) => f.situacao === "NOVA")).toBe(true);
    expect(r.semMudancas).toBe(false);
  });
});
