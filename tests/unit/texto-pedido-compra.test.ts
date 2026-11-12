import { describe, expect, it } from "vitest";

import { montarTextoDoPedido } from "../../src/lib/dominio/texto-pedido-compra";

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
