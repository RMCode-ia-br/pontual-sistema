import { describe, expect, it } from "vitest";

import { cortarMotivosDePerda, detalheDoTempoVisitaProposta, entraNaMediaDeDias, ordenarMotivosDePerda, limiteInformado, mediaDeDias, ocupacaoDaFabrica, percentualDaMeta, percentualDoLimite, taxaDeFechamento, ticketMedio } from "@/lib/dominio/indicadores";

describe("taxa de fechamento", () => {
  it("aprovados ÷ (aprovados + perdidos com proposta enviada)", () => {
    expect(taxaDeFechamento(3, 7)).toBe(30);
    expect(taxaDeFechamento(1, 2)).toBe(33.3);
    expect(taxaDeFechamento(5, 0)).toBe(100);
    expect(taxaDeFechamento(0, 4)).toBe(0); // houve decisões e nenhuma aprovada: 0% de verdade
  });

  it("sem nenhuma decisão não há taxa (null), nunca 0%", () => {
    expect(taxaDeFechamento(0, 0)).toBeNull();
  });
});

describe("ticket médio", () => {
  it("vendido ÷ projetos aprovados, em centavos", () => {
    expect(ticketMedio(10_000_000, 4)).toBe(2_500_000);
    expect(ticketMedio(1_000_001, 3)).toBe(333_334); // arredonda
  });

  it("sem projeto aprovado não há ticket", () => {
    expect(ticketMedio(0, 0)).toBeNull();
    expect(ticketMedio(5_000, 0)).toBeNull();
  });
});

describe("média de dias", () => {
  it("uma casa decimal", () => {
    expect(mediaDeDias([2, 3, 4])).toBe(3);
    expect(mediaDeDias([1, 2])).toBe(1.5);
    expect(mediaDeDias([1, 1, 2])).toBe(1.3);
  });

  it("sem casos, null", () => {
    expect(mediaDeDias([])).toBeNull();
  });
});

describe("limite do faturamento com nota (vazio E zero = não informado)", () => {
  it("limite vazio (null) ou ausente: sem percentual", () => {
    expect(limiteInformado(null)).toBeNull();
    expect(limiteInformado(undefined)).toBeNull();
    expect(percentualDoLimite(50_000_000, null)).toBeNull();
    expect(percentualDoLimite(50_000_000, undefined)).toBeNull();
  });

  it("limite ZERO: também 'não informado', sem divisão por zero", () => {
    expect(limiteInformado(0)).toBeNull();
    expect(percentualDoLimite(50_000_000, 0)).toBeNull();
    expect(percentualDoLimite(0, 0)).toBeNull();
    expect(Number.isNaN(percentualDoLimite(1, 0) ?? 0)).toBe(false);
  });

  it("limite negativo ou inválido também não vale", () => {
    expect(limiteInformado(-100)).toBeNull();
    expect(limiteInformado(Number.NaN)).toBeNull();
  });

  it("com o limite informado, mostra o percentual usado", () => {
    expect(percentualDoLimite(120_000_000, 480_000_000)).toBe(25);
    expect(percentualDoLimite(0, 480_000_000)).toBe(0); // limite informado e nada recebido com nota: 0% de verdade
    expect(percentualDoLimite(500_000_000, 480_000_000)).toBe(104.2); // passou do limite: o número aparece, sem alerta fiscal
  });
});

describe("ocupação da fábrica e meta", () => {
  it("m² ÷ capacidade; sem capacidade, null", () => {
    expect(ocupacaoDaFabrica(150, 300)).toBe(50);
    expect(ocupacaoDaFabrica(330, 300)).toBe(110);
    expect(ocupacaoDaFabrica(10, 0)).toBeNull();
    expect(ocupacaoDaFabrica(10, null)).toBeNull();
  });

  it("percentual da meta, sem meta positiva é null", () => {
    expect(percentualDaMeta(15_000_000, 30_000_000)).toBe(50);
    expect(percentualDaMeta(1, 0)).toBeNull();
    expect(percentualDaMeta(1, null)).toBeNull();
  });
});

describe("da visita à proposta: quem entra na média", () => {
  it("visita antes ou no mesmo dia da proposta entra; visita registrada depois fica de fora", () => {
    expect(entraNaMediaDeDias(0)).toBe(true);
    expect(entraNaMediaDeDias(7)).toBe(true);
    expect(entraNaMediaDeDias(-1)).toBe(false);
    expect(entraNaMediaDeDias(-30)).toBe(false);
    expect(entraNaMediaDeDias(Number.NaN)).toBe(false);
  });

  it("o texto diz quantos entraram e quantos ficaram de fora, e por quê", () => {
    expect(detalheDoTempoVisitaProposta(3, 0)).toBe("3 projeto(s)");
    expect(detalheDoTempoVisitaProposta(3, 2)).toBe("3 projeto(s) · 2 ficou(aram) de fora: visita registrada depois da proposta");
    expect(detalheDoTempoVisitaProposta(0, 0)).toBe("Sem dados neste período");
    expect(detalheDoTempoVisitaProposta(0, 1)).toBe("Sem dados neste período · 1 ficou(aram) de fora: visita registrada depois da proposta");
  });
});

describe("motivos de perda: ordem e corte", () => {
  const m = (nome: string, quantidade: number) => ({ motivoPerdaId: nome, nome, quantidade });

  it("ordena do mais frequente ao menos, e no empate pelo nome", () => {
    const r = ordenarMotivosDePerda([m("Prazo", 1), m("Preço", 3), m("Concorrente", 1), m("Distância", 3)]);
    expect(r.map((x) => x.nome)).toEqual(["Distância", "Preço", "Concorrente", "Prazo"]);
  });

  it("não altera a lista original", () => {
    const original = [m("B", 1), m("A", 2)];
    ordenarMotivosDePerda(original);
    expect(original.map((x) => x.nome)).toEqual(["B", "A"]);
  });

  it("corta nos primeiros e diz quantos motivos e projetos ficaram de fora", () => {
    const todos = ordenarMotivosDePerda([m("A", 5), m("B", 4), m("C", 3), m("D", 2), m("E", 1)]);
    const { mostrados, ocultos } = cortarMotivosDePerda(todos, 3);
    expect(mostrados.map((x) => x.nome)).toEqual(["A", "B", "C"]);
    expect(ocultos).toEqual({ motivos: 2, projetos: 3 });
  });

  it("sem corte quando cabe, e lista vazia dá zero ocultos", () => {
    expect(cortarMotivosDePerda([m("A", 1)], 6)).toEqual({ mostrados: [m("A", 1)], ocultos: { motivos: 0, projetos: 0 } });
    expect(cortarMotivosDePerda([], 6)).toEqual({ mostrados: [], ocultos: { motivos: 0, projetos: 0 } });
  });
});
