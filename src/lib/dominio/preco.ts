/**
 * Preço e totais da proposta (R1). Tudo em centavos inteiros; percentuais em "pontos-base" inteiros
 * (1% = 100; 5,25% = 525), sem ponto flutuante em dinheiro. Divisões com BigInt, arredondando meio para cima.
 *
 * Regras do dono (Marcelo, 2026-11-13; prevalecem sobre a especificação):
 * - O preço é o que ele definir (manual é o uso principal).
 * - Proposta COM nota fiscal: preço × (1 + acréscimo%), acréscimo padrão 5% (Configurações), em linha separada.
 *   O imposto NÃO entra mais no divisor da composição.
 * - Comissões (arquiteto, indicação) começam em zero e são editáveis.
 */

export type ModoPreco = "MANUAL" | "TABELA" | "COMPOSICAO";
export type TipoCobranca = "POR_M2" | "POR_UNIDADE" | "POR_METRO_LINEAR";

export const PONTOS_BASE_100 = 10000;
/** Teto de segurança para valores em centavos (Int de 32 bits do PostgreSQL). */
export const MAXIMO_CENTAVOS = 2_147_483_647;

/** Divisão inteira com arredondamento meio para cima (valores não negativos). */
export function dividirArredondando(numerador: bigint, denominador: bigint): bigint {
  return (numerador * BigInt(2) + denominador) / (denominador * BigInt(2));
}

/** "6,5" / 6.5 → 650 pontos-base. Aceita no máximo 2 casas. Devolve null se inválido. */
export function percentualParaPontosBase(percentual: number | string | null | undefined): number | null {
  if (percentual === null || percentual === undefined || percentual === "") return null;
  const n = typeof percentual === "number" ? percentual : Number(String(percentual).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  const pb = Math.round(n * 100);
  return Math.abs(n * 100 - pb) < 1e-6 ? pb : null;
}

export function pontosBaseParaPercentual(pb: number): string {
  const inteiro = Math.trunc(pb / 100);
  const frac = pb % 100;
  return frac === 0 ? String(inteiro) : `${inteiro},${String(frac).padStart(2, "0").replace(/0$/, "")}`;
}

// ----- Medidas -----

export type Medida = { larguraMm: number; alturaMm: number; quantidade: number };

/** Área total em m² (só para exibição; cálculos de preço usam mm² inteiros). */
export function areaM2(medidas: Medida[]): number {
  return Number(areaMm2(medidas)) / 1_000_000;
}

export function areaMm2(medidas: Medida[]): bigint {
  return medidas.reduce((s, m) => s + BigInt(m.larguraMm) * BigInt(m.alturaMm) * BigInt(m.quantidade), BigInt(0));
}

/** Metros lineares: largura × quantidade (guarda-corpo é cobrado pela extensão). */
export function metrosLineares(medidas: Medida[]): number {
  return medidas.reduce((s, m) => s + m.larguraMm * m.quantidade, 0) / 1000;
}

export function quantidadeTotal(medidas: Medida[]): number {
  return medidas.reduce((s, m) => s + m.quantidade, 0);
}

/** Preço pela tabela: valor unitário × (m², unidades ou metros lineares). */
export function precoPorCobranca(cobranca: TipoCobranca, valorUnitarioCentavos: number, medidas: Medida[]): number {
  const valor = BigInt(valorUnitarioCentavos);
  switch (cobranca) {
    case "POR_M2":
      return Number(dividirArredondando(areaMm2(medidas) * valor, BigInt(1_000_000)));
    case "POR_METRO_LINEAR": {
      const mm = medidas.reduce((s, m) => s + BigInt(m.larguraMm) * BigInt(m.quantidade), BigInt(0));
      return Number(dividirArredondando(mm * valor, BigInt(1000)));
    }
    default:
      return Number(valor * BigInt(quantidadeTotal(medidas)));
  }
}

// ----- Composição (custo + margem) -----

export type ResultadoComposicao = { ok: true; precoCentavos: number } | { ok: false; erro: string };

/**
 * Método do divisor "por dentro": preço = custo ÷ (1 − margem% − comissões%).
 * O imposto da nota fiscal NÃO entra aqui (é um acréscimo separado sobre o preço).
 * Bloqueia se margem + comissões ≥ 100%.
 */
export function precoPorComposicao(custoTotalCentavos: number, margemPb: number, comissaoPb = 0): ResultadoComposicao {
  if (!Number.isInteger(custoTotalCentavos) || custoTotalCentavos < 0) return { ok: false, erro: "O custo total é inválido." };
  const retido = margemPb + comissaoPb;
  if (retido >= PONTOS_BASE_100) {
    return { ok: false, erro: "Margem e comissões somam 100% ou mais: o preço não pode ser calculado. Reduza a margem ou as comissões." };
  }
  const preco = dividirArredondando(BigInt(custoTotalCentavos) * BigInt(PONTOS_BASE_100), BigInt(PONTOS_BASE_100 - retido));
  if (preco > BigInt(MAXIMO_CENTAVOS)) return { ok: false, erro: "O preço calculado passa do valor máximo aceito." };
  return { ok: true, precoCentavos: Number(preco) };
}

/** Análise interna (nunca vai ao PDF): margem em R$ e %, e preço por m². */
export function analisarMargem(precoCentavos: number, custoCentavos: number | null, medidas: Medida[]) {
  const m2 = areaM2(medidas);
  const precoPorM2Centavos = m2 > 0 ? Math.round(precoCentavos / m2) : null;
  if (custoCentavos === null || precoCentavos <= 0) return { margemCentavos: null, margemPb: null, precoPorM2Centavos };
  const margemCentavos = precoCentavos - custoCentavos;
  const margemPb = Number(dividirArredondando(BigInt(Math.abs(margemCentavos)) * BigInt(10000), BigInt(precoCentavos))) * (margemCentavos < 0 ? -1 : 1);
  return { margemCentavos, margemPb, precoPorM2Centavos };
}

// ----- Totais da proposta -----

export type ItemParaTotal = { opcaoId: string; precoTotalCentavos: number; custoEstimadoCentavos?: number | null; medidas: Medida[] };
export type OpcaoParaTotal = { id: string; descontoCentavos?: number };

export type TotalOpcao = {
  opcaoId: string;
  itensCentavos: number;
  descontoCentavos: number;
  /** Subtotal depois do desconto (base do acréscimo). */
  baseCentavos: number;
  acrescimoNotaCentavos: number;
  totalCentavos: number;
  areaM2: number;
  /** Custo estimado só se TODOS os itens têm custo; senão null (não mostra custo parcial como se fosse total). */
  custoCentavos: number | null;
  itensSemCusto: number;
};

/**
 * Total por opção = soma dos itens − desconto + acréscimo da nota (se a proposta é com nota).
 * O total é SEMPRE calculado aqui, nunca digitado.
 */
export function calcularTotais(itens: ItemParaTotal[], opcoes: OpcaoParaTotal[], comNotaFiscal: boolean, acrescimoNotaPb: number): TotalOpcao[] {
  return opcoes.map((opcao) => {
    const daOpcao = itens.filter((i) => i.opcaoId === opcao.id);
    const itensCentavos = daOpcao.reduce((s, i) => s + i.precoTotalCentavos, 0);
    const descontoCentavos = Math.min(opcao.descontoCentavos ?? 0, itensCentavos);
    const baseCentavos = itensCentavos - descontoCentavos;
    const acrescimoNotaCentavos = comNotaFiscal ? acrescimoSobre(baseCentavos, acrescimoNotaPb) : 0;
    const semCusto = daOpcao.filter((i) => i.custoEstimadoCentavos === null || i.custoEstimadoCentavos === undefined).length;
    return {
      opcaoId: opcao.id,
      itensCentavos,
      descontoCentavos,
      baseCentavos,
      acrescimoNotaCentavos,
      totalCentavos: baseCentavos + acrescimoNotaCentavos,
      areaM2: areaM2(daOpcao.flatMap((i) => i.medidas)),
      custoCentavos: daOpcao.length > 0 && semCusto === 0 ? daOpcao.reduce((s, i) => s + (i.custoEstimadoCentavos ?? 0), 0) : null,
      itensSemCusto: semCusto,
    };
  });
}

/** Acréscimo da nota fiscal: base × pontos-base ÷ 10.000, meio centavo para cima. */
export function acrescimoSobre(baseCentavos: number, acrescimoPb: number): number {
  if (baseCentavos <= 0 || acrescimoPb <= 0) return 0;
  return Number(dividirArredondando(BigInt(baseCentavos) * BigInt(acrescimoPb), BigInt(PONTOS_BASE_100)));
}

/** Soma dos preços dos itens deve caber no Int do banco. */
export function somaCabeNoBanco(valores: number[]): boolean {
  return valores.reduce((s, v) => s + v, 0) <= MAXIMO_CENTAVOS;
}
