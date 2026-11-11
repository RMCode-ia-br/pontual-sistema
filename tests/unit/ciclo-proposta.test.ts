import { describe, expect, it } from "vitest";

import { compararRevisoes, podeCriarRevisao, podeTransitar, problemasParaEnviar, type ConteudoComparavel } from "@/lib/dominio/ciclo-proposta";

describe("transições da proposta", () => {
  it("rascunho pode ser enviado, aprovado (congelando) ou cancelado; aprovada é final", () => {
    expect(podeTransitar("RASCUNHO", "ENVIADA")).toBe(true);
    expect(podeTransitar("RASCUNHO", "APROVADA")).toBe(true);
    expect(podeTransitar("RASCUNHO", "RECUSADA")).toBe(false);
    expect(podeTransitar("APROVADA", "CANCELADA")).toBe(false);
    expect(podeTransitar("SUBSTITUIDA", "APROVADA")).toBe(false);
    expect(podeTransitar("ENVIADA", "RECUSADA")).toBe(true);
  });
  it("revisão só de proposta enviada, recusada ou expirada", () => {
    expect(podeCriarRevisao("ENVIADA")).toBe(true);
    expect(podeCriarRevisao("RASCUNHO")).toBe(false);
    expect(podeCriarRevisao("APROVADA")).toBe(false);
  });
});

describe("problemasParaEnviar", () => {
  const ok = {
    clienteNome: "Fulano",
    condicao: { temParcelas: true, textoLivre: null },
    opcoes: [{ nome: "Opção 1", itens: [{ descricao: "JANELA", precoTotalCentavos: 100, medidas: 1 }] }],
  };
  it("proposta completa não tem problemas", () => expect(problemasParaEnviar(ok)).toEqual([]));
  it("lista item sem valor, sem medida, sem descrição e opção vazia", () => {
    const p = problemasParaEnviar({
      ...ok,
      opcoes: [
        { nome: "A", itens: [{ descricao: "x", precoTotalCentavos: 0, medidas: 1 }, { descricao: " ", precoTotalCentavos: 5, medidas: 0 }] },
        { nome: "B", itens: [] },
      ],
    });
    expect(p).toEqual(expect.arrayContaining(['Adicione ao menos um item da opção "B".', '1 item está sem valor da opção "A".', '1 item está sem medida da opção "A".', '1 item está sem descrição da opção "A".']));
  });
  it("exige condição de pagamento (parcelas ou texto livre) e cliente", () => {
    expect(problemasParaEnviar({ ...ok, condicao: { temParcelas: false, textoLivre: null } })).toHaveLength(1);
    expect(problemasParaEnviar({ ...ok, condicao: { temParcelas: false, textoLivre: "A combinar" } })).toEqual([]);
    expect(problemasParaEnviar({ ...ok, clienteNome: " " })).toHaveLength(1);
  });
});

describe("compararRevisoes", () => {
  const base: ConteudoComparavel = {
    numero: "2000-26",
    revisao: 0,
    comNotaFiscal: false,
    opcoes: [{ nome: "Opção 1", totalCentavos: 1000, itens: [{ descricao: "JANELA A", medidas: "2000 X 1200", precoTotalCentavos: 600 }, { descricao: "PORTA B", medidas: "800 X 2100", precoTotalCentavos: 400 }] }],
  };
  it("sem mudanças", () => expect(compararRevisoes(base, { ...base, revisao: 1 }).semMudancas).toBe(true));
  it("detecta preço alterado, item removido e item novo", () => {
    const depois: ConteudoComparavel = {
      ...base,
      revisao: 1,
      opcoes: [{ nome: "Opção 1", totalCentavos: 1300, itens: [{ descricao: "JANELA A", medidas: "2000 X 1200", precoTotalCentavos: 700 }, { descricao: "BOX C", medidas: "1000 X 1900", precoTotalCentavos: 600 }] }],
    };
    const r = compararRevisoes(base, depois);
    expect(r.semMudancas).toBe(false);
    expect(r.opcoes[0].totalAntesCentavos).toBe(1000);
    expect(r.opcoes[0].totalDepoisCentavos).toBe(1300);
    expect(r.opcoes[0].itens.map((i) => [i.tipo, i.descricao])).toEqual([["ALTERADO", "JANELA A"], ["REMOVIDO", "PORTA B"], ["ADICIONADO", "BOX C"]]);
  });
  it("opção nova, opção removida e mudança de nota fiscal", () => {
    const depois: ConteudoComparavel = { ...base, comNotaFiscal: true, opcoes: [{ nome: "Gold", totalCentavos: 5, itens: [{ descricao: "X", medidas: "1 X 1", precoTotalCentavos: 5 }] }] };
    const r = compararRevisoes(base, depois);
    expect(r.notaFiscalMudou).toBe(true);
    expect(r.opcoes.map((o) => [o.nome, o.situacao])).toEqual([["Opção 1", "REMOVIDA"], ["Gold", "NOVA"]]);
  });
  it("itens iguais repetidos não se confundem (casamento 1 a 1)", () => {
    const dois = { descricao: "J", medidas: "1 X 1", precoTotalCentavos: 10 };
    const a: ConteudoComparavel = { ...base, opcoes: [{ nome: "O", totalCentavos: 20, itens: [dois, dois] }] };
    const d: ConteudoComparavel = { ...base, opcoes: [{ nome: "O", totalCentavos: 10, itens: [dois] }] };
    expect(compararRevisoes(a, d).opcoes[0].itens.map((i) => i.tipo)).toEqual(["REMOVIDO"]);
  });
});
