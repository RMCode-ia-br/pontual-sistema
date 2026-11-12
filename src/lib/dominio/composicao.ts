/**
 * Custo da composição técnica (R2) e escolha da linha da tabela de preços (R1).
 *
 * Convenção das fórmulas: o resultado é a quantidade POR PEÇA; o sistema multiplica pela quantidade de cada
 * medida. `Q` continua disponível para fórmulas que mudam conforme a quantidade (ex.: `se(Q > 3; ...)`).
 * Nada é inventado: insumo ou mão de obra sem custo informado deixa o custo INCOMPLETO e o preço por
 * composição é recusado com a lista do que falta.
 */
import { ErroFormula, avaliarFormula } from "./formulas";
import { MAXIMO_CENTAVOS, type Medida } from "./preco";

export type InsumoComposicao = {
  /** Produto do cadastro (para a lista de materiais da obra); vazio quando o insumo é só texto. */
  produtoId?: string | null;
  /** Unidade em que a fórmula devolve a quantidade (M, UN, M2, KG...). */
  unidade?: string;
  descricao: string;
  formulaQuantidade: string;
  /** Pontos-base (5% = 500). */
  perdaPb: number;
  /** Custo unitário em centavos (do produto ou digitado na linha); null = não informado. */
  custoUnitarioCentavos: number | null;
};

export type MaoDeObraComposicao = {
  papel: "FABRICA" | "INSTALACAO";
  base: "HORAS_POR_M2" | "HORAS_POR_UNIDADE";
  /** Horas em centésimos (1,5 h = 150). */
  horasCentesimos: number;
  custoHoraCentavos: number | null;
};

export type ResultadoCustoComposicao =
  | { ok: true; custoCentavos: number; materiaisCentavos: number; maoDeObraCentavos: number }
  | { ok: false; erro: string; faltando: string[] };

export type ParametrosItem = { folhas: number | null };

/**
 * Quantidade de um insumo para UMA medida (com a quantidade de peças e a perda de corte), na unidade da fórmula.
 * É a mesma conta do custo e da lista de materiais: uma só regra. Lança ErroFormula se a fórmula não avalia.
 */
export function quantidadeDoInsumo(insumo: Pick<InsumoComposicao, "formulaQuantidade" | "perdaPb">, m: Medida, folhas: number | null): number {
  const quantidadePorPeca = avaliarFormula(insumo.formulaQuantidade, { L: m.larguraMm, A: m.alturaMm, F: folhas ?? 1, Q: m.quantidade });
  return quantidadePorPeca * m.quantidade * (1 + insumo.perdaPb / 10000);
}

/** Custo total do item (todas as medidas) = materiais (com perda) + mão de obra de fábrica e de instalação. */
export function custoDaComposicao(
  insumos: InsumoComposicao[],
  maoDeObra: MaoDeObraComposicao[],
  medidas: Medida[],
  item: ParametrosItem,
): ResultadoCustoComposicao {
  if (insumos.length === 0 && maoDeObra.length === 0) {
    return { ok: false, erro: "Esta tipologia ainda não tem composição cadastrada.", faltando: [] };
  }
  if (medidas.length === 0) return { ok: false, erro: "Informe ao menos uma medida.", faltando: [] };

  const faltando: string[] = [];
  let materiais = 0;

  for (const insumo of insumos) {
    if (insumo.custoUnitarioCentavos === null) {
      faltando.push(`custo de "${insumo.descricao}"`);
      continue;
    }
    for (const m of medidas) {
      let quantidade: number;
      try {
        quantidade = quantidadeDoInsumo(insumo, m, item.folhas);
      } catch (erro) {
        const motivo = erro instanceof ErroFormula ? erro.message : "fórmula inválida";
        return { ok: false, erro: `Fórmula de "${insumo.descricao}": ${motivo}`, faltando: [] };
      }
      materiais += quantidade * insumo.custoUnitarioCentavos;
    }
  }

  let mao = 0;
  for (const linha of maoDeObra) {
    if (linha.custoHoraCentavos === null) {
      faltando.push(`custo por hora da mão de obra de ${linha.papel === "FABRICA" ? "fábrica" : "instalação"}`);
      continue;
    }
    for (const m of medidas) {
      const areaM2 = (m.larguraMm * m.alturaMm) / 1_000_000;
      const horas = (linha.horasCentesimos / 100) * (linha.base === "HORAS_POR_M2" ? areaM2 * m.quantidade : m.quantidade);
      mao += horas * linha.custoHoraCentavos;
    }
  }

  if (faltando.length > 0) {
    return { ok: false, erro: `Falta informar: ${[...new Set(faltando)].join("; ")}.`, faltando: [...new Set(faltando)] };
  }
  const materiaisCentavos = Math.round(materiais);
  const maoDeObraCentavos = Math.round(mao);
  const custoCentavos = materiaisCentavos + maoDeObraCentavos;
  if (!Number.isFinite(custoCentavos) || custoCentavos > MAXIMO_CENTAVOS) {
    return { ok: false, erro: "O custo calculado passa do valor máximo aceito.", faltando: [] };
  }
  return { ok: true, custoCentavos, materiaisCentavos, maoDeObraCentavos };
}

// ----- Tabela de preços -----

export type LinhaTabelaPreco = {
  id: string;
  linhaId: string | null;
  acabamentoId: string | null;
  tipoVidroId: string | null;
  espessuraVidroMm: number | null;
  cobranca: "POR_M2" | "POR_UNIDADE" | "POR_METRO_LINEAR";
  valorCentavos: number;
  /** AAAA-MM-DD */
  vigenciaInicio: string | null;
  vigenciaFim: string | null;
  ativo: boolean;
};

export type ChaveTabelaPreco = {
  linhaId: string | null;
  acabamentoId: string | null;
  tipoVidroId: string | null;
  espessuraVidroMm: number | null;
};

/**
 * Escolhe a linha da tabela para o item. Coluna vazia na tabela = "qualquer"; vale a linha mais específica que
 * combina (mais colunas preenchidas e iguais); empate → a de vigência mais recente. Sem combinação → null
 * (o item cai em MANUAL com aviso, R1).
 */
export function escolherLinhaDaTabela(linhas: LinhaTabelaPreco[], chave: ChaveTabelaPreco, hoje: string): LinhaTabelaPreco | null {
  let melhor: { linha: LinhaTabelaPreco; pontos: number } | null = null;
  for (const l of linhas) {
    if (!l.ativo) continue;
    if (l.vigenciaInicio && l.vigenciaInicio > hoje) continue;
    if (l.vigenciaFim && l.vigenciaFim < hoje) continue;
    let pontos = 0;
    let combina = true;
    for (const campo of ["linhaId", "acabamentoId", "tipoVidroId", "espessuraVidroMm"] as const) {
      const valorDaLinha = l[campo];
      if (valorDaLinha === null) continue;
      if (valorDaLinha !== chave[campo]) {
        combina = false;
        break;
      }
      pontos++;
    }
    if (!combina) continue;
    const ganha =
      !melhor ||
      pontos > melhor.pontos ||
      (pontos === melhor.pontos && (l.vigenciaInicio ?? "") > (melhor.linha.vigenciaInicio ?? ""));
    if (ganha) melhor = { linha: l, pontos };
  }
  return melhor?.linha ?? null;
}

/**
 * Combinações linha × acabamento sem NENHUMA linha de preço vigente (aviso da grade). Coluna vazia na tabela
 * vale para qualquer valor; o vidro não entra aqui (uma linha para qualquer vidro ou para algum vidro basta).
 */
export function combinacoesSemPreco(
  linhas: { id: string }[],
  acabamentos: { id: string }[],
  tabela: LinhaTabelaPreco[],
  hoje: string,
): { linhaId: string; acabamentoId: string }[] {
  const vigentes = tabela.filter((t) => t.ativo && !(t.vigenciaInicio && t.vigenciaInicio > hoje) && !(t.vigenciaFim && t.vigenciaFim < hoje));
  const faltando: { linhaId: string; acabamentoId: string }[] = [];
  for (const l of linhas) {
    for (const a of acabamentos) {
      const achou = vigentes.some((t) => (t.linhaId === null || t.linhaId === l.id) && (t.acabamentoId === null || t.acabamentoId === a.id));
      if (!achou) faltando.push({ linhaId: l.id, acabamentoId: a.id });
    }
  }
  return faltando;
}
