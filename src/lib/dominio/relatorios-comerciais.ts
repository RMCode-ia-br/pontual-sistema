/**
 * Contas puras dos relatórios comerciais (Fase 7B, Bloco 6). A consulta entrega as linhas; aqui só se divide em faixas,
 * confere somas e acha os quartis. Regra geral: sem base para a conta, o resultado é `null` ou uma lista vazia (a tela
 * explica), nunca um número inventado.
 */

/** Menos casos que isto: não dá para dividir em faixas, e a tela mostra uma tabela única com o aviso. */
export const MINIMO_DE_CASOS_PARA_FAIXAS = 12;

/** Quartis (Q1, Q2, Q3) pelo método do posto mais próximo (sempre devolve um valor que existe na lista). `null` com menos de 4 valores. */
export function quartis(valores: readonly number[]): [number, number, number] | null {
  if (valores.length < 4) return null;
  const o = [...valores].sort((a, b) => a - b);
  const em = (q: number) => o[Math.min(o.length - 1, Math.max(0, Math.ceil((q * o.length) / 4) - 1))];
  return [em(1), em(2), em(3)];
}

export type Faixa = {
  rotulo: string;
  /** Início inclusivo (centavos); `null` na primeira faixa. */
  deCentavos: number | null;
  /** Fim inclusivo (centavos); `null` na última faixa. */
  ateCentavos: number | null;
};

/** Faixas a partir dos cortes (crescentes): "até C1", "de C1+1 a C2", ..., "acima de Cn". O rótulo é montado por quem chama. */
export function faixasPorCortes(cortes: readonly number[], formatar: (centavos: number) => string): Faixa[] {
  const lista: Faixa[] = [];
  cortes.forEach((c, i) => {
    const anterior = i === 0 ? null : cortes[i - 1];
    lista.push({ rotulo: anterior === null ? `Até ${formatar(c)}` : `De ${formatar(anterior)} a ${formatar(c)}`, deCentavos: anterior === null ? null : anterior + 1, ateCentavos: c });
  });
  const ultimo = cortes[cortes.length - 1];
  lista.push({ rotulo: `Acima de ${formatar(ultimo)}`, deCentavos: ultimo + 1, ateCentavos: null });
  return lista;
}

/** Índice da faixa em que o valor cai (as faixas cobrem todos os valores). */
export function indiceDaFaixa(valorCentavos: number, cortes: readonly number[]): number {
  const i = cortes.findIndex((c) => valorCentavos <= c);
  return i === -1 ? cortes.length : i;
}

/**
 * Lê os cortes digitados no filtro ("30.000; 60.000; 120.000", em reais). Devolve `null` se algum valor for ilegível ou os
 * cortes não forem crescentes; aceita de 1 a 5 cortes. O leitor de valor vem de fora (a regra única de números).
 */
export function lerCortesDeFaixa(texto: string | null | undefined, lerReais: (t: string) => number | null): number[] | null {
  if (!texto || texto.trim() === "") return null;
  const partes = texto.split(/[;|]/).map((p) => p.trim()).filter((p) => p !== "");
  if (partes.length < 1 || partes.length > 5) return null;
  const cortes: number[] = [];
  for (const p of partes) {
    const c = lerReais(p);
    if (c === null || c <= 0 || (cortes.length > 0 && c <= cortes[cortes.length - 1])) return null;
    cortes.push(c);
  }
  return cortes;
}

export type CasoDePreco = { valorCentavos: number; ganha: boolean };
export type LinhaDeFaixa = { faixa: Faixa; ganhas: number; perdidas: number; taxaDeGanhoPercentual: number | null };

export type FaixasDePreco =
  | { tipo: "unica"; casos: number; ganhas: number; perdidas: number; taxaDeGanhoPercentual: number | null; motivo: "poucos-dados" }
  | { tipo: "faixas"; cortes: number[]; origemDosCortes: "quartis" | "digitados"; linhas: LinhaDeFaixa[]; casos: number };

const percentual = (parte: number, base: number): number | null => (base <= 0 ? null : Math.round((parte / base) * 1000) / 10);

/**
 * Ganhas × perdidas por faixa de preço. Cortes digitados valem sempre (mesmo com poucos casos); sem eles, os QUARTIS dos
 * casos (ganhas e perdidas juntas). Com menos de {@link MINIMO_DE_CASOS_PARA_FAIXAS} casos e sem cortes digitados: tabela única.
 */
export function dividirEmFaixas(casos: readonly CasoDePreco[], cortesDigitados: readonly number[] | null, formatar: (centavos: number) => string): FaixasDePreco {
  const ganhas = casos.filter((c) => c.ganha).length;
  const perdidas = casos.length - ganhas;
  let cortes: number[] | null = cortesDigitados && cortesDigitados.length > 0 ? [...cortesDigitados] : null;
  const origemDosCortes = cortes ? ("digitados" as const) : ("quartis" as const);
  if (!cortes) {
    if (casos.length < MINIMO_DE_CASOS_PARA_FAIXAS) return { tipo: "unica", casos: casos.length, ganhas, perdidas, taxaDeGanhoPercentual: percentual(ganhas, casos.length), motivo: "poucos-dados" };
    const q = quartis(casos.map((c) => c.valorCentavos));
    // Quartis repetidos (muitos casos com o mesmo valor) não formam faixas distintas: sem como dividir.
    if (!q || new Set(q).size < 3) return { tipo: "unica", casos: casos.length, ganhas, perdidas, taxaDeGanhoPercentual: percentual(ganhas, casos.length), motivo: "poucos-dados" };
    cortes = [...q];
  }
  const faixas = faixasPorCortes(cortes, formatar);
  const linhas: LinhaDeFaixa[] = faixas.map((faixa) => ({ faixa, ganhas: 0, perdidas: 0, taxaDeGanhoPercentual: null }));
  for (const c of casos) {
    const l = linhas[indiceDaFaixa(c.valorCentavos, cortes)];
    if (c.ganha) l.ganhas += 1;
    else l.perdidas += 1;
  }
  for (const l of linhas) l.taxaDeGanhoPercentual = percentual(l.ganhas, l.ganhas + l.perdidas);
  return { tipo: "faixas", cortes, origemDosCortes, linhas, casos: casos.length };
}

export type LinhaDoMix = { chave: string; nome: string; valorCentavos: number; m2: number };

/**
 * Fecha o mix com o vendido: as linhas somam o preço dos ITENS; o vendido tem também desconto da opção, acréscimo da nota e o
 * que mais o valor aprovado inclua. A diferença vira a linha "Outros e ajustes", para a soma de tudo bater com o vendido.
 */
export function fecharMixComOutros(linhas: readonly LinhaDoMix[], vendidoCentavos: number): { linhas: LinhaDoMix[]; outrosCentavos: number } {
  const soma = linhas.reduce((s, l) => s + l.valorCentavos, 0);
  return { linhas: [...linhas], outrosCentavos: vendidoCentavos - soma };
}

/** Preço médio por m² (centavos, arredondado); `null` sem m² (item sem medida não entra, nunca vira zero). */
export function precoPorM2(valorCentavos: number, m2: number): number | null {
  return m2 > 0 ? Math.round(valorCentavos / m2) : null;
}

/** Ticket médio = total ÷ projetos (centavos); `null` sem projetos. */
export function ticketDoGrupo(totalCentavos: number, projetos: number): number | null {
  return projetos > 0 ? Math.round(totalCentavos / projetos) : null;
}
