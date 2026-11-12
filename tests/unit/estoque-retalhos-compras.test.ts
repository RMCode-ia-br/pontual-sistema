import { describe, expect, it } from "vitest";

import { atualizarCustoPeloUltimoRecebimento } from "../../src/lib/dominio/custo-produto";
import { conferirRecebimento, custoUnitarioDaEntrega, entregaAtrasada, numeroDaCompra, podeCancelarCompra, statusAposRecebimento, totalDoPedido } from "../../src/lib/dominio/compras";
import { abaixoDoMinimo, conferirSaida, formatarQuantidade, lerQuantidade, movimentoInverso, podeContarEstoqueInicial, saldoDosMovimentos, sinalDoTipo, valorDoMovimento } from "../../src/lib/dominio/estoque";
import { destinoDaSobra, pesoDaSucata, retalhosQueServem, saldoDeSucata } from "../../src/lib/dominio/retalhos";

describe("estoque", () => {
  it("o saldo é a soma dos movimentos (entradas +, saídas −)", () => {
    expect(saldoDosMovimentos([{ quantidadeMilesimos: 10_000 }, { quantidadeMilesimos: -2_500 }, { quantidadeMilesimos: 500 }])).toBe(8_000);
    expect(saldoDosMovimentos([])).toBe(0);
  });

  it("lê quantidades digitadas em pt-BR até 3 casas e recusa o resto", () => {
    expect(lerQuantidade("1.234,5")).toBe(1_234_500);
    expect(lerQuantidade("1,5")).toBe(1_500);
    expect(lerQuantidade("12")).toBe(12_000);
    expect(lerQuantidade("0,001")).toBe(1);
    for (const ruim of ["", "-1", "1,2345", "abc", "1,,5", "1e3", "2.5000", "1.23.4"]) expect(lerQuantidade(ruim)).toBeNull();
  });

  it("ponto só é milhar com agrupamento válido: '2.5' é 2,5 (nunca 25) e '1.234' é mil duzentos e trinta e quatro", () => {
    expect(lerQuantidade("2.5")).toBe(2_500);
    expect(lerQuantidade("0.75")).toBe(750);
    expect(lerQuantidade("1.234")).toBe(1_234_000);
    expect(lerQuantidade("1.234.567,5")).toBe(1_234_567_500);
    expect(formatarQuantidade(1_500)).toBe("1,5");
    expect(formatarQuantidade(12_000)).toBe("12");
  });

  it("saída com saldo passa; sem saldo exige confirmação E justificativa", () => {
    expect(conferirSaida({ saldoMilesimos: 5_000, quantidadeMilesimos: 5_000, confirmarSemSaldo: false, justificativa: null })).toEqual({ ok: true, semSaldo: false });
    const sem = conferirSaida({ saldoMilesimos: 5_000, quantidadeMilesimos: 5_001, confirmarSemSaldo: false, justificativa: null });
    expect(sem.ok).toBe(false);
    expect(!sem.ok && sem.erro).toMatch(/maior que o saldo/);
    const semJust = conferirSaida({ saldoMilesimos: 5_000, quantidadeMilesimos: 6_000, confirmarSemSaldo: true, justificativa: "  " });
    expect(!semJust.ok && semJust.erro).toMatch(/justificativa/);
    expect(conferirSaida({ saldoMilesimos: 5_000, quantidadeMilesimos: 6_000, confirmarSemSaldo: true, justificativa: "Chegou depois" })).toEqual({ ok: true, semSaldo: true });
  });

  it("recusa saída zero, negativa ou fracionada além dos milésimos", () => {
    for (const q of [0, -1, 1.5]) expect(conferirSaida({ saldoMilesimos: 10_000, quantidadeMilesimos: q, confirmarSemSaldo: false, justificativa: null }).ok).toBe(false);
  });

  it("valor da saída = quantidade × custo da época; sem custo é null, não zero", () => {
    expect(valorDoMovimento(-2_500, 1_000)).toBe(2_500); // 2,5 × R$ 10,00 = R$ 25,00
    expect(valorDoMovimento(2_500, 1_000)).toBe(2_500);
    expect(valorDoMovimento(-2_500, null)).toBeNull();
  });

  it("alerta de mínimo só existe quando o produto tem mínimo", () => {
    expect(abaixoDoMinimo(1_000, null)).toBe(false);
    expect(abaixoDoMinimo(1_000, 2_000)).toBe(true);
    expect(abaixoDoMinimo(2_000, 2_000)).toBe(false);
  });

  it("estorno é o movimento inverso, com o mesmo custo e a mesma obra", () => {
    expect(movimentoInverso({ tipo: "SAIDA_OBRA", quantidadeMilesimos: -3_000, custoUnitarioCentavos: 700, projetoId: "p1" })).toEqual({ tipo: "AJUSTE", quantidadeMilesimos: 3_000, custoUnitarioCentavos: 700, projetoId: "p1" });
  });

  it("sinais naturais por tipo; ajuste não tem", () => {
    expect([sinalDoTipo("INVENTARIO_INICIAL"), sinalDoTipo("ENTRADA_COMPRA"), sinalDoTipo("DEVOLUCAO")]).toEqual([1, 1, 1]);
    expect([sinalDoTipo("SAIDA_OBRA"), sinalDoTipo("PERDA")]).toEqual([-1, -1]);
    expect(sinalDoTipo("AJUSTE")).toBeNull();
  });

  it("a contagem inicial só vale para produto sem movimentos", () => {
    expect(podeContarEstoqueInicial(0)).toBe(true);
    expect(podeContarEstoqueInicial(1)).toBe(false);
  });
});

describe("retalhos e sucata (R14)", () => {
  const barra = { comprimentoBarraMm: 6000, retalhoMinimoMm: 1000, pesoMilesimosKgPorMetro: 500 };

  it("sobra ≥ mínimo vira retalho: barra de 6.000, usou 4.200 → sobra 1.800 ≥ 1.000", () => {
    expect(destinoDaSobra({ ...barra, usadoMm: 4200 })).toEqual({ ok: true, destino: "RETALHO", sobraMm: 1800 });
  });
  it("sobra menor que o mínimo vira sucata em kg: usou 5.400 → sobra 600 × 0,5 kg/m = 0,300 kg", () => {
    expect(destinoDaSobra({ ...barra, usadoMm: 5400 })).toEqual({ ok: true, destino: "SUCATA", sobraMm: 600, pesoMilesimosKg: 300 });
  });
  it("sobra exatamente igual ao mínimo ainda é retalho (≥); uma a menos é sucata", () => {
    expect(destinoDaSobra({ ...barra, usadoMm: 5000 }).ok && (destinoDaSobra({ ...barra, usadoMm: 5000 }) as { destino: string }).destino).toBe("RETALHO");
    expect((destinoDaSobra({ ...barra, usadoMm: 5001 }) as { destino: string }).destino).toBe("SUCATA");
  });
  it("sem sobra, nada a guardar; usar a barra toda é válido", () => {
    expect(destinoDaSobra({ ...barra, usadoMm: 6000 })).toEqual({ ok: true, destino: "NENHUMA", sobraMm: 0 });
  });
  it("retalho mínimo NÃO definido: não decide sozinho (pergunta e avisa)", () => {
    const r = destinoDaSobra({ ...barra, retalhoMinimoMm: null, usadoMm: 4200 });
    expect(r).toMatchObject({ ok: true, destino: "DECIDIR", sobraMm: 1800, pesoMilesimosKg: 900 });
    expect(r.ok && r.destino === "DECIDIR" && r.aviso).toMatch(/Configurações/);
  });
  it("sem comprimento da barra, pede (não assume 6.000); uso inválido é recusado", () => {
    expect(destinoDaSobra({ ...barra, comprimentoBarraMm: null, usadoMm: 1000 })).toMatchObject({ ok: false });
    expect(destinoDaSobra({ ...barra, usadoMm: 6001 })).toMatchObject({ ok: false });
    expect(destinoDaSobra({ ...barra, usadoMm: 0 })).toMatchObject({ ok: false });
    expect(destinoDaSobra({ ...barra, usadoMm: 10.5 })).toMatchObject({ ok: false });
  });
  it("sem peso por metro, a sucata guarda só o comprimento (peso null)", () => {
    expect(destinoDaSobra({ ...barra, pesoMilesimosKgPorMetro: null, usadoMm: 5400 })).toEqual({ ok: true, destino: "SUCATA", sobraMm: 600, pesoMilesimosKg: null });
    expect(pesoDaSucata(600, null)).toBeNull();
    expect(pesoDaSucata(600, 0)).toBeNull(); // peso por metro zero não é peso: a sucata guarda o comprimento
    expect(pesoDaSucata(1000, 627)).toBe(627);
  });
  it("saldo de sucata: geração soma, venda subtrai; o que não tem peso fica à parte em mm", () => {
    expect(
      saldoDeSucata([
        { tipo: "GERACAO", pesoMilesimosKg: 300, comprimentoMm: 600 },
        { tipo: "GERACAO", pesoMilesimosKg: 1200, comprimentoMm: 2400 },
        { tipo: "VENDA", pesoMilesimosKg: 500, comprimentoMm: null },
        { tipo: "GERACAO", pesoMilesimosKg: null, comprimentoMm: 400 },
      ]),
    ).toEqual({ pesoMilesimosKg: 1000, comprimentoSemPesoMm: 400 });
  });
  it("retalhos que servem: disponíveis, do menor que serve ao maior", () => {
    const r = [
      { id: 1, comprimentoMm: 3000, status: "DISPONIVEL" },
      { id: 2, comprimentoMm: 1200, status: "DISPONIVEL" },
      { id: 3, comprimentoMm: 2000, status: "CONSUMIDO" },
      { id: 4, comprimentoMm: 800, status: "DISPONIVEL" },
    ];
    expect(retalhosQueServem(r, 1000).map((x) => x.id)).toEqual([2, 1]);
  });
});

describe("compras e recebimento", () => {
  it("numera C-0001", () => {
    expect(numeroDaCompra(1)).toBe("C-0001");
    expect(numeroDaCompra(12345)).toBe("C-12345");
  });

  it("o status segue o recebido: nada → pedido; parte → parcial; tudo → recebida; rascunho e cancelada não mudam", () => {
    const itens = [
      { quantidadeMilesimos: 10_000, recebidaMilesimos: 10_000 },
      { quantidadeMilesimos: 5_000, recebidaMilesimos: 0 },
    ];
    expect(statusAposRecebimento("PEDIDO", itens)).toBe("RECEBIDO_PARCIAL");
    expect(statusAposRecebimento("RECEBIDO_PARCIAL", [{ quantidadeMilesimos: 10_000, recebidaMilesimos: 10_000 }, { quantidadeMilesimos: 5_000, recebidaMilesimos: 5_000 }])).toBe("RECEBIDO");
    expect(statusAposRecebimento("RECEBIDO", [{ quantidadeMilesimos: 10_000, recebidaMilesimos: 0 }])).toBe("PEDIDO"); // recebimento estornado
    expect(statusAposRecebimento("RASCUNHO", itens)).toBe("RASCUNHO");
    expect(statusAposRecebimento("CANCELADO", itens)).toBe("CANCELADO");
  });

  it("o recebimento nunca passa do pedido", () => {
    expect(conferirRecebimento({ quantidadeMilesimos: 10_000, recebidaMilesimos: 4_000, recebeMilesimos: 6_000 })).toEqual({ ok: true, restanteMilesimos: 0 });
    expect(conferirRecebimento({ quantidadeMilesimos: 10_000, recebidaMilesimos: 4_000, recebeMilesimos: 2_000 })).toEqual({ ok: true, restanteMilesimos: 4_000 });
    const passa = conferirRecebimento({ quantidadeMilesimos: 10_000, recebidaMilesimos: 4_000, recebeMilesimos: 6_001 });
    expect(!passa.ok && passa.erro).toMatch(/Passa do pedido: faltam receber 6/);
    expect(conferirRecebimento({ quantidadeMilesimos: 10_000, recebidaMilesimos: 0, recebeMilesimos: 0 }).ok).toBe(false);
  });

  it("total do pedido soma só o que tem preço e conta à parte o que não tem (nunca zero)", () => {
    expect(
      totalDoPedido([
        { quantidadeMilesimos: 30_000, precoUnitarioCentavos: 5000 }, // 30 kg × R$ 50 = R$ 1.500
        { quantidadeMilesimos: 2_500, precoUnitarioCentavos: 1_000 }, // 2,5 × R$ 10 = R$ 25
        { quantidadeMilesimos: 1_000, precoUnitarioCentavos: null },
      ]),
    ).toEqual({ totalCentavos: 152_500, itensSemPreco: 1 });
  });

  it("entrega atrasada é derivada: só pedido feito ou parcial, com a previsão no passado", () => {
    expect(entregaAtrasada({ status: "PEDIDO", previsaoEntrega: "2026-11-10" }, "2026-11-12")).toBe(true);
    expect(entregaAtrasada({ status: "RECEBIDO_PARCIAL", previsaoEntrega: "2026-11-11" }, "2026-11-12")).toBe(true);
    expect(entregaAtrasada({ status: "PEDIDO", previsaoEntrega: "2026-11-12" }, "2026-11-12")).toBe(false); // hoje ainda não atrasou
    expect(entregaAtrasada({ status: "PEDIDO", previsaoEntrega: null }, "2026-11-12")).toBe(false);
    expect(entregaAtrasada({ status: "RECEBIDO", previsaoEntrega: "2026-01-01" }, "2026-11-12")).toBe(false);
    expect(entregaAtrasada({ status: "CANCELADO", previsaoEntrega: "2026-01-01" }, "2026-11-12")).toBe(false);
  });

  it("custo por unidade do estoque = valor ÷ o que entrou: R$ 1.500 por 10 barras = R$ 150 a barra", () => {
    expect(custoUnitarioDaEntrega(150_000, 10_000)).toBe(15_000);
    expect(custoUnitarioDaEntrega(100, 3_000)).toBe(33); // R$ 1,00 ÷ 3 = R$ 0,33
    expect(custoUnitarioDaEntrega(null, 10_000)).toBeNull();
    expect(custoUnitarioDaEntrega(150_000, 0)).toBeNull();
  });

  it("só cancela quem não recebeu nada", () => {
    expect(podeCancelarCompra("PEDIDO", 0)).toEqual({ ok: true });
    expect(podeCancelarCompra("RASCUNHO", 0)).toEqual({ ok: true });
    expect(podeCancelarCompra("RECEBIDO_PARCIAL", 1)).toMatchObject({ ok: false });
    expect(podeCancelarCompra("CANCELADO", 0)).toMatchObject({ ok: false });
  });
});

describe("custo do produto = último custo", () => {
  it("muda para o custo da compra recebida e guarda o anterior", () => {
    expect(atualizarCustoPeloUltimoRecebimento(15_000, 16_500)).toEqual({ muda: true, anteriorCentavos: 15_000, novoCentavos: 16_500 });
    expect(atualizarCustoPeloUltimoRecebimento(null, 16_500)).toEqual({ muda: true, anteriorCentavos: null, novoCentavos: 16_500 });
  });
  it("recebimento sem preço, zero ou igual ao custo atual não mexe", () => {
    expect(atualizarCustoPeloUltimoRecebimento(15_000, null)).toEqual({ muda: false, motivo: "SEM_PRECO" });
    expect(atualizarCustoPeloUltimoRecebimento(15_000, 0)).toEqual({ muda: false, motivo: "SEM_PRECO" });
    expect(atualizarCustoPeloUltimoRecebimento(15_000, 15_000)).toEqual({ muda: false, motivo: "IGUAL" });
  });
});
