// Retalhos e sucata (R14). Medidas em mm (Int), peso por metro em milésimos de kg/m, peso em milésimos de kg. Funções puras.
//
// Ao baixar um perfil para a obra por barra cortada, a sobra ≥ retalhoMinimoMm (Configurações) vira retalho DISPONIVEL; a menor
// vira sucata (kg). NADA é inventado: sem retalho mínimo configurado o sistema NÃO decide sozinho (pergunta); sem comprimento
// da barra, pede; sem peso por metro, a sucata guarda só o comprimento ("peso não informado").

export type EntradaDoCorte = {
  /** Comprimento da barra do produto; null = não informado (pede, sem assumir 6.000). */
  comprimentoBarraMm: number | null;
  /** Comprimento usado na obra, em mm (de uma barra). */
  usadoMm: number;
  /** Configurações; null = não definido. */
  retalhoMinimoMm: number | null;
  pesoMilesimosKgPorMetro: number | null;
};

export type ResultadoDoCorte =
  | { ok: false; erro: string }
  | { ok: true; destino: "NENHUMA"; sobraMm: 0 }
  | { ok: true; destino: "RETALHO"; sobraMm: number }
  | { ok: true; destino: "SUCATA"; sobraMm: number; pesoMilesimosKg: number | null }
  /** Sem retalho mínimo definido: a pessoa escolhe, e o sistema avisa para definir em Configurações. */
  | { ok: true; destino: "DECIDIR"; sobraMm: number; aviso: string; pesoMilesimosKg: number | null };

/** Peso da sucata de `comprimentoMm` mm do perfil; null sem peso por metro. */
export function pesoDaSucata(comprimentoMm: number, pesoMilesimosKgPorMetro: number | null): number | null {
  if (pesoMilesimosKgPorMetro === null) return null;
  return Math.round((comprimentoMm * pesoMilesimosKgPorMetro) / 1000);
}

/** O que fazer com a sobra de uma barra depois de cortar `usadoMm`. */
export function destinoDaSobra(e: EntradaDoCorte): ResultadoDoCorte {
  if (e.comprimentoBarraMm === null || e.comprimentoBarraMm <= 0) return { ok: false, erro: "Informe o comprimento da barra (o produto não tem)." };
  if (!Number.isInteger(e.usadoMm) || e.usadoMm <= 0) return { ok: false, erro: "Informe o comprimento usado, em mm." };
  if (e.usadoMm > e.comprimentoBarraMm) return { ok: false, erro: `O comprimento usado (${e.usadoMm} mm) passa do tamanho da barra (${e.comprimentoBarraMm} mm).` };
  const sobraMm = e.comprimentoBarraMm - e.usadoMm;
  if (sobraMm === 0) return { ok: true, destino: "NENHUMA", sobraMm: 0 };
  const pesoMilesimosKg = pesoDaSucata(sobraMm, e.pesoMilesimosKgPorMetro);
  if (e.retalhoMinimoMm === null) {
    return { ok: true, destino: "DECIDIR", sobraMm, pesoMilesimosKg, aviso: "O retalho mínimo aproveitável não está definido em Configurações: escolha se a sobra é retalho ou sucata." };
  }
  if (sobraMm >= e.retalhoMinimoMm) return { ok: true, destino: "RETALHO", sobraMm };
  return { ok: true, destino: "SUCATA", sobraMm, pesoMilesimosKg };
}

export type MovimentoDeSucata = { tipo: "GERACAO" | "VENDA" | "AJUSTE"; pesoMilesimosKg: number | null; comprimentoMm: number | null };

/**
 * Saldo de sucata: kg (GERACAO +, VENDA −, AJUSTE com sinal já no valor) e, à parte, o comprimento que não tem peso por
 * metro (não dá para converter em kg sem inventar).
 */
export function saldoDeSucata(movimentos: readonly MovimentoDeSucata[]): { pesoMilesimosKg: number; comprimentoSemPesoMm: number } {
  let peso = 0;
  let semPeso = 0;
  for (const m of movimentos) {
    const sinal = m.tipo === "VENDA" ? -1 : 1;
    if (m.pesoMilesimosKg !== null) peso += sinal * m.pesoMilesimosKg;
    else if (m.comprimentoMm !== null) semPeso += sinal * m.comprimentoMm;
  }
  return { pesoMilesimosKg: peso, comprimentoSemPesoMm: semPeso };
}

/** Retalhos que servem para um corte de `necessarioMm`: disponíveis, do mesmo produto, do menor que serve para o maior. */
export function retalhosQueServem<T extends { comprimentoMm: number; status: string }>(retalhos: readonly T[], necessarioMm: number): T[] {
  return retalhos.filter((r) => r.status === "DISPONIVEL" && r.comprimentoMm >= necessarioMm).sort((a, b) => a.comprimentoMm - b.comprimentoMm);
}
