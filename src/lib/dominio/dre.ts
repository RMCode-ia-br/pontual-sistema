// DRE gerencial (não é contábil): resultado por mês a partir de movimentos classificados por categoria.
// Funções puras. Quem chama monta os movimentos:
//  - regime de CAIXA (padrão): lançamentos não estornados, sem transferências, pela data do lançamento;
//  - regime de COMPETÊNCIA: contas a receber/pagar não canceladas pelo mês de competência (ou vencimento),
//    mais lançamentos avulsos (sem conta) pela data.
// Imposto não é calculado: é a despesa real "Impostos (DAS)", lançada à mão (decisão do dono).
//
// Sinais: o movimento é ENTRADA (+) ou SAÍDA (−). Cada grupo mostra a despesa como número positivo. O resultado é
// sempre Σ entradas − Σ saídas dos movimentos incluídos, então o DRE bate com os lançamentos por construção.

export type GrupoDreChave =
  | "RECEITAS_OPERACIONAIS"
  | "OUTRAS_RECEITAS"
  | "IMPOSTOS"
  | "CUSTOS_DIRETOS"
  | "DESPESAS_FIXAS"
  | "DESPESAS_OPERACIONAIS"
  | "DESPESAS_COMERCIAIS"
  | "DESPESAS_ADMINISTRATIVAS"
  | "DESPESAS_FINANCEIRAS";

export const ROTULO_GRUPO_DRE: Record<GrupoDreChave, string> = {
  RECEITAS_OPERACIONAIS: "Receitas operacionais",
  OUTRAS_RECEITAS: "Outras receitas",
  IMPOSTOS: "Impostos (DAS)",
  CUSTOS_DIRETOS: "Custos diretos",
  DESPESAS_FIXAS: "Despesas fixas",
  DESPESAS_OPERACIONAIS: "Despesas operacionais",
  DESPESAS_COMERCIAIS: "Despesas comerciais",
  DESPESAS_ADMINISTRATIVAS: "Despesas administrativas",
  DESPESAS_FINANCEIRAS: "Despesas financeiras",
};

export const TODOS_OS_GRUPOS_DRE = Object.keys(ROTULO_GRUPO_DRE) as GrupoDreChave[];

/** Receita só usa grupos de receita; despesa, os de despesa (o banco também confere). */
export function grupoCombinaComTipo(tipo: "RECEITA" | "DESPESA", grupo: GrupoDreChave): boolean {
  const ehGrupoDeReceita = grupo === "RECEITAS_OPERACIONAIS" || grupo === "OUTRAS_RECEITAS";
  return tipo === "RECEITA" ? ehGrupoDeReceita : !ehGrupoDeReceita;
}

/** Grupos de despesa depois da margem bruta, na ordem em que aparecem. */
export const GRUPOS_DE_DESPESA: readonly GrupoDreChave[] = ["DESPESAS_FIXAS", "DESPESAS_OPERACIONAIS", "DESPESAS_COMERCIAIS", "DESPESAS_ADMINISTRATIVAS", "DESPESAS_FINANCEIRAS"];

export const GRUPOS_DE_RECEITA: readonly GrupoDreChave[] = ["RECEITAS_OPERACIONAIS", "OUTRAS_RECEITAS"];

export type MovimentoParaDre = {
  /** "aaaa-mm-dd" (data do lançamento, ou o mês de competência no regime de competência). */
  data: string;
  tipo: "ENTRADA" | "SAIDA";
  valorCentavos: number;
  /** `null` = sem categoria (aparece à parte, nunca é descartado). */
  grupo: GrupoDreChave | null;
  categoriaId: string | null;
  categoriaNome: string | null;
};

export type DreDoMes = {
  /** "aaaa-mm". */
  mes: string;
  receitaOperacionalCentavos: number;
  impostosCentavos: number;
  receitaLiquidaCentavos: number;
  custosDiretosCentavos: number;
  /** Receita líquida − custos diretos. */
  margemBrutaCentavos: number;
  despesasPorGrupoCentavos: Record<string, number>;
  despesasTotalCentavos: number;
  outrasReceitasCentavos: number;
  /** Movimentos sem categoria (entradas − saídas). */
  semCategoriaCentavos: number;
  resultadoCentavos: number;
};

function dreVazio(mes: string): DreDoMes {
  return {
    mes,
    receitaOperacionalCentavos: 0,
    impostosCentavos: 0,
    receitaLiquidaCentavos: 0,
    custosDiretosCentavos: 0,
    margemBrutaCentavos: 0,
    despesasPorGrupoCentavos: Object.fromEntries(GRUPOS_DE_DESPESA.map((g) => [g, 0])),
    despesasTotalCentavos: 0,
    outrasReceitasCentavos: 0,
    semCategoriaCentavos: 0,
    resultadoCentavos: 0,
  };
}

const assinado = (m: Pick<MovimentoParaDre, "tipo" | "valorCentavos">) => (m.tipo === "ENTRADA" ? m.valorCentavos : -m.valorCentavos);

/** Lista de meses "aaaa-mm" de `de` a `ate` (inclusive). */
export function mesesDoPeriodo(de: string, ate: string): string[] {
  const meses: string[] = [];
  let [ano, mes] = de.slice(0, 7).split("-").map(Number);
  const [anoFim, mesFim] = ate.slice(0, 7).split("-").map(Number);
  while (ano < anoFim || (ano === anoFim && mes <= mesFim)) {
    meses.push(`${ano}-${String(mes).padStart(2, "0")}`);
    mes += 1;
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
    if (meses.length > 600) throw new RangeError("Período longo demais.");
  }
  return meses;
}

function fechar(d: DreDoMes): DreDoMes {
  d.receitaLiquidaCentavos = d.receitaOperacionalCentavos - d.impostosCentavos;
  d.margemBrutaCentavos = d.receitaLiquidaCentavos - d.custosDiretosCentavos;
  d.despesasTotalCentavos = GRUPOS_DE_DESPESA.reduce((s, g) => s + d.despesasPorGrupoCentavos[g], 0);
  d.resultadoCentavos = d.margemBrutaCentavos - d.despesasTotalCentavos + d.outrasReceitasCentavos + d.semCategoriaCentavos;
  return d;
}

/**
 * DRE mês a mês e total do período. Movimento fora dos meses pedidos é ignorado. Movimento com sentido contrário
 * ao do grupo (ex.: devolução de uma venda = saída numa categoria de receita) reduz o grupo, e não o ignora.
 */
export function montarDre(movimentos: readonly MovimentoParaDre[], meses: readonly string[]): { meses: DreDoMes[]; total: DreDoMes } {
  const porMes = new Map(meses.map((m) => [m, dreVazio(m)]));
  for (const mov of movimentos) {
    const d = porMes.get(mov.data.slice(0, 7));
    if (!d) continue;
    const valor = assinado(mov);
    switch (mov.grupo) {
      case null:
        d.semCategoriaCentavos += valor;
        break;
      case "RECEITAS_OPERACIONAIS":
        d.receitaOperacionalCentavos += valor;
        break;
      case "OUTRAS_RECEITAS":
        d.outrasReceitasCentavos += valor;
        break;
      case "IMPOSTOS":
        d.impostosCentavos -= valor;
        break;
      case "CUSTOS_DIRETOS":
        d.custosDiretosCentavos -= valor;
        break;
      default:
        d.despesasPorGrupoCentavos[mov.grupo] -= valor;
    }
  }
  const lista = meses.map((m) => fechar(porMes.get(m)!));
  const total = dreVazio("total");
  for (const d of lista) {
    total.receitaOperacionalCentavos += d.receitaOperacionalCentavos;
    total.impostosCentavos += d.impostosCentavos;
    total.custosDiretosCentavos += d.custosDiretosCentavos;
    total.outrasReceitasCentavos += d.outrasReceitasCentavos;
    total.semCategoriaCentavos += d.semCategoriaCentavos;
    for (const g of GRUPOS_DE_DESPESA) total.despesasPorGrupoCentavos[g] += d.despesasPorGrupoCentavos[g];
  }
  return { meses: lista, total: fechar(total) };
}

export type LinhaDeCategoria = {
  grupo: GrupoDreChave | null;
  categoriaId: string | null;
  nome: string;
  porMesCentavos: number[];
  totalCentavos: number;
};

/**
 * Detalhe por categoria (para expandir cada grupo). Receita aparece positiva e despesa positiva (como no DRE);
 * "sem categoria" mostra entradas − saídas.
 */
export function detalharPorCategoria(movimentos: readonly MovimentoParaDre[], meses: readonly string[]): LinhaDeCategoria[] {
  const indice = new Map(meses.map((m, i) => [m, i]));
  const linhas = new Map<string, LinhaDeCategoria>();
  for (const mov of movimentos) {
    const i = indice.get(mov.data.slice(0, 7));
    if (i === undefined) continue;
    const chave = `${mov.grupo ?? "-"}|${mov.categoriaId ?? "-"}`;
    let linha = linhas.get(chave);
    if (!linha) {
      linha = { grupo: mov.grupo, categoriaId: mov.categoriaId, nome: mov.categoriaNome ?? "Sem categoria", porMesCentavos: meses.map(() => 0), totalCentavos: 0 };
      linhas.set(chave, linha);
    }
    const receita = mov.grupo === null || mov.grupo === "RECEITAS_OPERACIONAIS" || mov.grupo === "OUTRAS_RECEITAS";
    const valor = receita ? assinado(mov) : -assinado(mov);
    linha.porMesCentavos[i] += valor;
    linha.totalCentavos += valor;
  }
  return [...linhas.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export type LinhaDaDemonstracao = {
  id: string;
  rotulo: string;
  /** "item" (soma/detalhe), "subtotal" (resultado parcial) ou "resultado" (a última linha). */
  tipo: "item" | "subtotal" | "resultado";
  /** Sinal para quem lê: "−" para o que é dedução, "+" para o que soma, "=" para subtotais. */
  marca: "+" | "−" | "=" | "";
  /** Um valor por mês, na ordem de `meses`, e o total do período. Despesas e deduções aparecem como número positivo. */
  porMesCentavos: number[];
  totalCentavos: number;
};

/** Monta a demonstração (linhas na ordem de leitura) a partir do DRE mês a mês. */
export function linhasDaDemonstracao(dre: { meses: DreDoMes[]; total: DreDoMes }): LinhaDaDemonstracao[] {
  const linha = (id: string, rotulo: string, tipo: LinhaDaDemonstracao["tipo"], marca: LinhaDaDemonstracao["marca"], valor: (d: DreDoMes) => number): LinhaDaDemonstracao => ({
    id,
    rotulo,
    tipo,
    marca,
    porMesCentavos: dre.meses.map(valor),
    totalCentavos: valor(dre.total),
  });
  const linhas: LinhaDaDemonstracao[] = [
    linha("receita", ROTULO_GRUPO_DRE.RECEITAS_OPERACIONAIS, "item", "+", (d) => d.receitaOperacionalCentavos),
    linha("impostos", ROTULO_GRUPO_DRE.IMPOSTOS, "item", "−", (d) => d.impostosCentavos),
    linha("receitaLiquida", "Receita líquida", "subtotal", "=", (d) => d.receitaLiquidaCentavos),
    linha("custos", ROTULO_GRUPO_DRE.CUSTOS_DIRETOS, "item", "−", (d) => d.custosDiretosCentavos),
    linha("margem", "Margem bruta", "subtotal", "=", (d) => d.margemBrutaCentavos),
    ...GRUPOS_DE_DESPESA.map((g) => linha(g, ROTULO_GRUPO_DRE[g], "item", "−", (d) => d.despesasPorGrupoCentavos[g])),
    linha("despesas", "Total de despesas", "subtotal", "=", (d) => d.despesasTotalCentavos),
    linha("outras", ROTULO_GRUPO_DRE.OUTRAS_RECEITAS, "item", "+", (d) => d.outrasReceitasCentavos),
    linha("semCategoria", "Sem categoria (entradas − saídas)", "item", "", (d) => d.semCategoriaCentavos),
    linha("resultado", "Resultado", "resultado", "=", (d) => d.resultadoCentavos),
  ];
  return linhas;
}
