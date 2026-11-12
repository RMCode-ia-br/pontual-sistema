/**
 * Preço e totais da proposta (R1). Tudo em centavos inteiros; percentuais em "pontos-base" inteiros
 * (1% = 100; 5,25% = 525), sem ponto flutuante em dinheiro. Divisões com BigInt, arredondando meio para cima.
 *
 * Regras do dono (Marcelo, 2026-11-13; prevalecem sobre a especificação):
 * - O preço é o que ele definir (manual é o uso principal; sem markup).
 * - Composição: preço = custo × (1 + markup), markup sobre o custo (padrão 80%; 100% para guarda-corpo e vidro temperado).
 * - Proposta COM nota fiscal: total × (1 + acréscimo%), acréscimo padrão 5% (Configurações), em linha separada,
 *   sempre DEPOIS do markup (nunca em divisor).
 * - Comissões (arquiteto, indicação) começam em zero, são editáveis e só informativas (não alteram o preço).
 */

import { lerEscalado } from "../validadores/numero-br";

export type ModoPreco = "MANUAL" | "TABELA" | "COMPOSICAO";
export type TipoCobranca = "POR_M2" | "POR_UNIDADE" | "POR_METRO_LINEAR";

export const PONTOS_BASE_100 = 10000;
/** Teto de segurança para valores em centavos (Int de 32 bits do PostgreSQL). */
export const MAXIMO_CENTAVOS = 2_147_483_647;

/** Divisão inteira com arredondamento meio para cima (valores não negativos). */
export function dividirArredondando(numerador: bigint, denominador: bigint): bigint {
  return (numerador * BigInt(2) + denominador) / (denominador * BigInt(2));
}

/**
 * "6,5" / "1.234,56" / 6.5 → 650 / 123456 / 650 pontos-base. Aceita no máximo 2 casas. Texto pela regra única de leitura
 * (`lerNumeroBr`); número já vem pronto. Devolve null se inválido.
 */
export function percentualParaPontosBase(percentual: number | string | null | undefined): number | null {
  if (percentual === null || percentual === undefined || percentual === "") return null;
  if (typeof percentual === "string") return lerEscalado(percentual, { casas: 2 });
  const n = percentual;
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

// ----- Composição (custo × (1 + markup)) -----

export type ResultadoComposicao = { ok: true; precoCentavos: number } | { ok: false; erro: string };

/** Teto do markup: 1.000% (evita digitação absurda; em pontos-base). */
export const MARKUP_MAXIMO_PB = 100_000;

/**
 * Markup SOBRE O CUSTO (regra do dono, 2026-11-13): preço = custo × (1 + markup).
 * Ordem do cálculo: custo → × (1 + markup) → preço do item. O acréscimo da nota fiscal vem DEPOIS,
 * sobre o total (calcularTotais), e nunca entra antes do markup nem em divisor.
 * O markup só se aplica ao modo COMPOSICAO: manual e tabela usam o preço informado.
 */
export function precoPorComposicao(custoTotalCentavos: number, markupPb: number): ResultadoComposicao {
  if (!Number.isInteger(custoTotalCentavos) || custoTotalCentavos < 0) return { ok: false, erro: "O custo total é inválido." };
  if (!Number.isInteger(markupPb) || markupPb < 0 || markupPb > MARKUP_MAXIMO_PB) {
    return { ok: false, erro: "O markup precisa estar entre 0% e 1.000%." };
  }
  const preco = dividirArredondando(BigInt(custoTotalCentavos) * BigInt(PONTOS_BASE_100 + markupPb), BigInt(PONTOS_BASE_100));
  if (preco > BigInt(MAXIMO_CENTAVOS)) return { ok: false, erro: "O preço calculado passa do valor máximo aceito." };
  return { ok: true, precoCentavos: Number(preco) };
}

export type CategoriaMarkup = "PADRAO" | "VIDRO_TEMPERADO";

/**
 * Qual markup vale para o item. Precedência: item > proposta > categoria da tipologia > padrão.
 * Os valores padrão (80% e 100% para guarda-corpo/vidro temperado) vêm de Configurações, nunca do código.
 */
export function resolverMarkup(entrada: {
  itemPb?: number | null;
  propostaPb?: number | null;
  categoria: CategoriaMarkup;
  config: { padraoPb: number; vidroTemperadoPb: number };
}): { markupPb: number; origem: "ITEM" | "PROPOSTA" | "CATEGORIA" | "PADRAO" } {
  if (entrada.itemPb != null) return { markupPb: entrada.itemPb, origem: "ITEM" };
  if (entrada.propostaPb != null) return { markupPb: entrada.propostaPb, origem: "PROPOSTA" };
  if (entrada.categoria === "VIDRO_TEMPERADO") return { markupPb: entrada.config.vidroTemperadoPb, origem: "CATEGORIA" };
  return { markupPb: entrada.config.padraoPb, origem: "PADRAO" };
}

/** Análise interna (nunca vai ao PDF): lucro em R$, margem real sobre o preço (%) e preço por m². */
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
