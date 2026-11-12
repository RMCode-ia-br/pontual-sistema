// Custo real e margem por obra (R15). Funções puras; dinheiro em centavos, quantidades em milésimos.
//
// REGRA DE NÃO DUPLICAR (critério de aceite): o custo da obra lê a COMPRA recebida (destino OBRA) e as SAÍDAS de estoque —
// nunca a conta a pagar que nasce da compra. As despesas "outras" são só contas a pagar SEM compra e lançamentos avulsos
// (sem conta a pagar): o chamador já filtrou isso; aqui cada linha traz a sua origem para o gestor conferir.
//
// REGRA DE NÃO INVENTAR: custo desconhecido (recebimento sem preço, saída de produto sem custo, mão de obra por m² vazia) não
// vira zero: a margem fica INCOMPLETA, com a lista do que falta. IMPOSTO (opção B do dono): nenhuma alíquota; a receita da
// margem desconta o acréscimo de nota (repasse de imposto), mostrado em linha separada.

export type GrupoDeCusto = "COMPRAS_DA_OBRA" | "ESTOQUE" | "RETALHOS" | "OUTRAS_DESPESAS" | "MAO_DE_OBRA";

export const ROTULO_GRUPO_DE_CUSTO: Record<GrupoDeCusto, string> = {
  COMPRAS_DA_OBRA: "Compras para a obra",
  ESTOQUE: "Material do estoque",
  RETALHOS: "Retalhos usados",
  OUTRAS_DESPESAS: "Outras despesas da obra",
  MAO_DE_OBRA: "Mão de obra rateada",
};

export type LinhaDeCusto = {
  grupo: GrupoDeCusto;
  /** Registro de origem (para o link); null nas linhas calculadas. */
  id: string | null;
  descricao: string;
  /** Valor da linha; null = desconhecido ("sem custo"). */
  valorCentavos: number | null;
  /** De onde vem, em palavras ("Compra C-0004 recebida em 10/11"). */
  origem: string;
  /** Só informa (ex.: retalho de outra obra, custo já contado lá): não soma. */
  informativo?: boolean;
};

export type EntradaDoCustoDaObra = {
  /** Valor fechado das propostas aprovadas (inclui o acréscimo de nota); null = sem proposta aprovada. */
  receitaFechadaCentavos: number | null;
  /** Soma do acréscimo de nota das propostas aprovadas (repasse de imposto). */
  acrescimoNotaCentavos: number;
  /** Itens recebidos de compras com destino OBRA. */
  comprasDaObra: { id: string; descricao: string; origem: string; valorCentavos: number | null }[];
  /** Movimentos de estoque da obra: saída tem quantidade NEGATIVA, devolução POSITIVA. */
  movimentosDeEstoque: { id: string; produto: string; origem: string; quantidadeMilesimos: number; custoUnitarioCentavos: number | null }[];
  retalhosUsados: { id: string; descricao: string; origem: string }[];
  outrasDespesas: { id: string; descricao: string; origem: string; valorCentavos: number }[];
  maoDeObra: { areaM2: number | null; custoPorM2Centavos: number | null };
  /** Custo estimado na proposta (composição ou informado do programa); null = sem estimativa. */
  estimadoCentavos: number | null;
};

export type ResultadoDoCustoDaObra = {
  linhas: LinhaDeCusto[];
  /** Soma do que é conhecido. */
  custoConhecidoCentavos: number;
  incompleto: boolean;
  faltando: string[];
  /** Fechado − acréscimo de nota. null sem proposta aprovada. */
  receitaDaMargemCentavos: number | null;
  repasseDeImpostoCentavos: number;
  /** null quando incompleta: "Incompleta", nunca zero. */
  margemCentavos: number | null;
  margemPb: number | null;
  /** Receita − custo conhecido, só como referência enquanto está incompleta. */
  margemComOQueSeSabeCentavos: number | null;
  estimadoCentavos: number | null;
  /** Real − estimado (só com a margem completa e estimativa). */
  diferencaParaEstimadoCentavos: number | null;
};

export function calcularCustoDaObra(e: EntradaDoCustoDaObra): ResultadoDoCustoDaObra {
  const linhas: LinhaDeCusto[] = [];
  const faltando: string[] = [];

  for (const c of e.comprasDaObra) {
    linhas.push({ grupo: "COMPRAS_DA_OBRA", id: c.id, descricao: c.descricao, valorCentavos: c.valorCentavos, origem: c.origem });
    if (c.valorCentavos === null) faltando.push(`preço de "${c.descricao}" (${c.origem})`);
  }
  for (const m of e.movimentosDeEstoque) {
    // saída (quantidade negativa) custa; devolução (positiva) abate.
    const bruto = m.custoUnitarioCentavos === null ? null : (-m.quantidadeMilesimos * m.custoUnitarioCentavos) / 1000;
    const valor = bruto === null ? null : Math.sign(bruto) * Math.round(Math.abs(bruto));
    linhas.push({ grupo: "ESTOQUE", id: m.id, descricao: m.produto, valorCentavos: valor, origem: m.origem });
    if (valor === null) faltando.push(`custo de "${m.produto}" (${m.origem})`);
  }
  for (const r of e.retalhosUsados) {
    linhas.push({ grupo: "RETALHOS", id: r.id, descricao: r.descricao, valorCentavos: 0, origem: `${r.origem}; custo já contado na obra de origem`, informativo: true });
  }
  for (const d of e.outrasDespesas) {
    linhas.push({ grupo: "OUTRAS_DESPESAS", id: d.id, descricao: d.descricao, valorCentavos: d.valorCentavos, origem: d.origem });
  }

  const { areaM2, custoPorM2Centavos } = e.maoDeObra;
  if (custoPorM2Centavos === null) {
    linhas.push({ grupo: "MAO_DE_OBRA", id: null, descricao: "Mão de obra", valorCentavos: null, origem: "Custo de mão de obra por m² não informado (Configurações)" });
    faltando.push("custo de mão de obra por m² (Configurações)");
  } else if (areaM2 === null || areaM2 <= 0) {
    linhas.push({ grupo: "MAO_DE_OBRA", id: null, descricao: "Mão de obra", valorCentavos: null, origem: "m² da obra não conhecidos" });
    faltando.push("m² da obra (propostas aprovadas)");
  } else {
    const valor = Math.round(areaM2 * custoPorM2Centavos);
    linhas.push({ grupo: "MAO_DE_OBRA", id: null, descricao: "Mão de obra", valorCentavos: valor, origem: `${areaM2.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m² × custo por m² de Configurações` });
  }

  let receitaDaMargem: number | null = null;
  if (e.receitaFechadaCentavos === null) faltando.push("valor fechado (a obra não tem proposta aprovada)");
  else receitaDaMargem = e.receitaFechadaCentavos - e.acrescimoNotaCentavos;

  const custoConhecido = linhas.filter((l) => !l.informativo).reduce((s, l) => s + (l.valorCentavos ?? 0), 0);
  const incompleto = faltando.length > 0;
  const linhasDeMaterial = linhas.filter((l) => l.grupo === "COMPRAS_DA_OBRA" || l.grupo === "ESTOQUE");
  const materialReal = linhasDeMaterial.some((l) => l.valorCentavos === null) ? null : linhasDeMaterial.reduce((s, l) => s + (l.valorCentavos ?? 0), 0);
  const margemComOQueSeSabe = receitaDaMargem === null ? null : receitaDaMargem - custoConhecido;
  const margemCentavos = incompleto ? null : margemComOQueSeSabe;
  const margemPb = margemCentavos !== null && receitaDaMargem !== null && receitaDaMargem > 0 ? Math.round((margemCentavos * 10000) / receitaDaMargem) : null;

  return {
    linhas,
    custoConhecidoCentavos: custoConhecido,
    incompleto,
    faltando,
    receitaDaMargemCentavos: receitaDaMargem,
    repasseDeImpostoCentavos: e.acrescimoNotaCentavos,
    margemCentavos,
    margemPb,
    margemComOQueSeSabeCentavos: margemComOQueSeSabe,
    estimadoCentavos: e.estimadoCentavos,
    // O estimado da proposta é só MATERIAL: compara com o material real (compras da obra + saídas do estoque), nunca com o total
    // (que inclui mão de obra e despesas). Só quando todo o material tem custo.
    diferencaParaEstimadoCentavos: materialReal !== null && e.estimadoCentavos !== null ? materialReal - e.estimadoCentavos : null,
  };
}

/**
 * Custo de material estimado de uma OPÇÃO da proposta (margem estimada interna): se a opção tem total informado à mão (do
 * programa do fornecedor), ele é o custo de material; senão, a soma dos itens (informado no item ou calculado pela composição).
 * Item sem nenhum custo torna a estimativa incompleta (null), nunca zero.
 */
export function custoEstimadoDeMaterialDaOpcao(
  totalInformadoCentavos: number | null,
  itens: readonly { custoInformadoCentavos: number | null; custoCalculadoCentavos: number | null }[],
): { custoCentavos: number | null; origem: "TOTAL_INFORMADO" | "ITENS" | "INCOMPLETO"; itensSemCusto: number } {
  if (totalInformadoCentavos !== null) return { custoCentavos: totalInformadoCentavos, origem: "TOTAL_INFORMADO", itensSemCusto: 0 };
  let soma = 0;
  let semCusto = 0;
  for (const i of itens) {
    const c = i.custoInformadoCentavos ?? i.custoCalculadoCentavos;
    if (c === null) semCusto += 1;
    else soma += c;
  }
  if (itens.length === 0 || semCusto > 0) return { custoCentavos: null, origem: "INCOMPLETO", itensSemCusto: semCusto };
  return { custoCentavos: soma, origem: "ITENS", itensSemCusto: 0 };
}
