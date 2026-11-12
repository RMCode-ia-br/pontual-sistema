// Perfil de alumínio comprado por kg (Fase 6). Funções puras; dinheiro em centavos; peso por metro em MILÉSIMOS de kg por
// metro (0,500 kg/m = 500) e quantidades em milésimos, para nunca somar ponto flutuante.
//
// Nada é inventado: preço do kg, peso por metro e comprimento da barra vazios deixam o custo derivado "não informado", com o
// motivo ("informe o peso por metro"), e quem usa mostra o aviso em vez de zero.

export type DadosDoPerfil = {
  /** Preço do kg do acabamento, em centavos; null = sem preço do kg. */
  custoKgCentavos: number | null;
  /** Peso por metro em milésimos de kg (0,5 kg/m = 500); null = não informado. */
  pesoMilesimosKgPorMetro: number | null;
  comprimentoBarraMm: number | null;
};

export type CustoDoPerfil = {
  porKgCentavos: number | null;
  porMetroCentavos: number | null;
  porBarraCentavos: number | null;
  /** O que falta informar para derivar tudo (vazio quando está completo). */
  faltando: string[];
};

/** Custo por kg, por metro (= kg × peso/m) e por barra (= kg × peso/m × comprimento), arredondados UMA vez, em centavos. */
export function custoDoPerfil(d: DadosDoPerfil): CustoDoPerfil {
  const faltando: string[] = [];
  if (d.custoKgCentavos === null) faltando.push("preço do kg");
  if (d.pesoMilesimosKgPorMetro === null) faltando.push("peso por metro");
  if (d.comprimentoBarraMm === null) faltando.push("comprimento da barra");

  const porKgCentavos = d.custoKgCentavos;
  const porMetroCentavos = d.custoKgCentavos !== null && d.pesoMilesimosKgPorMetro !== null ? Math.round((d.custoKgCentavos * d.pesoMilesimosKgPorMetro) / 1000) : null;
  const porBarraCentavos =
    d.custoKgCentavos !== null && d.pesoMilesimosKgPorMetro !== null && d.comprimentoBarraMm !== null
      ? Math.round((d.custoKgCentavos * d.pesoMilesimosKgPorMetro * d.comprimentoBarraMm) / 1_000_000)
      : null;
  return { porKgCentavos, porMetroCentavos, porBarraCentavos, faltando };
}

export type LinhaDePrecoKg = { acabamentoId: string; linhaId: string | null; custoKgCentavos: number | null };

/**
 * Preço do kg do perfil: a linha específica (acabamento + linha) vale mais que a genérica (acabamento, linha vazia).
 * Sem nenhuma, ou com a escolhida sem preço, devolve null ("sem preço do kg").
 */
export function precoKgDoPerfil(acabamentoId: string | null, linhaId: string | null, tabela: readonly LinhaDePrecoKg[]): number | null {
  if (!acabamentoId) return null;
  const especifica = linhaId ? tabela.find((t) => t.acabamentoId === acabamentoId && t.linhaId === linhaId) : undefined;
  const escolhida = especifica ?? tabela.find((t) => t.acabamentoId === acabamentoId && t.linhaId === null);
  return escolhida?.custoKgCentavos ?? null;
}

export type UnidadeDoProduto = "UN" | "M" | "M2" | "KG" | "BARRA" | "L" | "PAR" | "CJ";

/** Custo unitário do perfil NA UNIDADE do produto (barra, metro ou kg); outras unidades não têm custo por kg. */
export function custoUnitarioDoPerfil(unidade: UnidadeDoProduto, d: DadosDoPerfil): number | null {
  const c = custoDoPerfil(d);
  if (unidade === "BARRA") return c.porBarraCentavos;
  if (unidade === "M") return c.porMetroCentavos;
  if (unidade === "KG") return c.porKgCentavos;
  return null;
}

/** Peso nominal de `barrasMilesimos` barras, em milésimos de kg. Sem peso por metro ou comprimento, null. */
export function pesoDasBarras(barrasMilesimos: number, d: Pick<DadosDoPerfil, "pesoMilesimosKgPorMetro" | "comprimentoBarraMm">): number | null {
  if (d.pesoMilesimosKgPorMetro === null || d.comprimentoBarraMm === null) return null;
  return Math.round((barrasMilesimos * d.pesoMilesimosKgPorMetro * d.comprimentoBarraMm) / 1_000_000);
}

/** Quantas barras (em milésimos) correspondem ao peso `kgMilesimos`; null sem peso por metro ou comprimento. */
export function barrasDoPeso(kgMilesimos: number, d: Pick<DadosDoPerfil, "pesoMilesimosKgPorMetro" | "comprimentoBarraMm">): number | null {
  if (d.pesoMilesimosKgPorMetro === null || d.comprimentoBarraMm === null || d.pesoMilesimosKgPorMetro <= 0 || d.comprimentoBarraMm <= 0) return null;
  return Math.round((kgMilesimos * 1_000_000) / (d.pesoMilesimosKgPorMetro * d.comprimentoBarraMm));
}

/** Sugestão para o recebimento: barras inteiras mais próximas do peso cobrado (o gestor confirma). */
export function barrasInteirasSugeridas(kgMilesimos: number, d: Pick<DadosDoPerfil, "pesoMilesimosKgPorMetro" | "comprimentoBarraMm">): number | null {
  const b = barrasDoPeso(kgMilesimos, d);
  return b === null ? null : Math.round(b / 1000);
}

/**
 * Valor de uma entrega: quantidade (milésimos) × preço unitário na MESMA unidade (kg ou barra). Sem preço, null: o custo fica
 * "sem custo" e a margem da obra, incompleta.
 */
export function valorDaEntrega(quantidadeMilesimos: number, precoUnitarioCentavos: number | null): number | null {
  if (precoUnitarioCentavos === null) return null;
  return Math.round((quantidadeMilesimos * precoUnitarioCentavos) / 1000);
}
