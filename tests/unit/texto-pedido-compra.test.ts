import { describe, expect, it } from "vitest";

import { dataDoPedido, montarTextoDoPedido } from "../../src/lib/dominio/texto-pedido-compra";

describe("texto do pedido de compra", () => {
  it("lista os itens com quantidade, detalhes e preço só quando informado; usa o nome da empresa de Configurações", () => {
    const t = montarTextoDoPedido({
      empresa: "Pontual",
      fornecedor: "Vidraçaria X",
      numero: "C-0004",
      itens: [
        { descricao: "Vidro temperado 8 mm", quantidade: "2", unidade: "un", detalhe: "1180 × 980 mm · Temperado", preco: "R$ 195,00" },
        { descricao: "Perfil 25", quantidade: "30", unidade: "kg", detalhe: null, preco: null },
      ],
      previsaoEntrega: "01/12/2026",
      condicoes: "28 dias",
      observacao: null,
    });
    expect(t).toBe(
      [
        "Olá! Segue o pedido C-0004 da Pontual:",
        "",
        "1. Vidro temperado 8 mm — 2 un (1180 × 980 mm · Temperado · R$ 195,00 por un)",
        "2. Perfil 25 — 30 kg",
        "",
        "Previsão de entrega: 01/12/2026",
        "Condições: 28 dias",
        "",
        "Pode confirmar o recebimento e o prazo? Obrigado!",
      ].join("\n"),
    );
  });

  it("sem empresa, previsão, condições e observação, não inventa nada", () => {
    const t = montarTextoDoPedido({ empresa: null, fornecedor: "Y", numero: "C-0001", itens: [{ descricao: "Roldana", quantidade: "10", unidade: "un", detalhe: null, preco: null }], previsaoEntrega: null, condicoes: null, observacao: null });
    expect(t).not.toMatch(/Previsão|Condições|Obs\./);
    expect(t.startsWith("Olá! Segue o pedido C-0001:")).toBe(true);
  });
});

describe("data do pedido (fuso de São Paulo)", () => {
  it("mantém a data informada", () => {
    expect(dataDoPedido("2026-03-05", new Date("2026-03-10T12:00:00Z"))).toBe("2026-03-05");
  });

  // São Paulo é UTC−3: às 21h, 22h e 23h59 locais o dia em UTC já é o seguinte.
  it.each([
    ["21h", "2026-03-11T00:00:00Z"],
    ["22h", "2026-03-11T01:00:00Z"],
    ["23h59", "2026-03-11T02:59:00Z"],
  ])("sem data informada, às %s de 10/03 em São Paulo a data é 10/03 (não o dia seguinte em UTC)", (_hora, instante) => {
    expect(dataDoPedido(null, new Date(instante))).toBe("2026-03-10");
  });

  it("à 00h01 do dia 11 em São Paulo a data é 11/03", () => {
    expect(dataDoPedido(null, new Date("2026-03-11T03:01:00Z"))).toBe("2026-03-11");
  });
});
