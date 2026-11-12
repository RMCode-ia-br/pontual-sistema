/**
 * Leitura ÚNICA de números digitados no padrão brasileiro (dinheiro, quantidade, kg, metro, percentual, importação).
 * Todos os leitores do sistema (`parseMoedaParaCentavos`, `valorParaCentavos`, `textoParaDecimal`, `textoParaInteiro`,
 * `lerQuantidade`, `percentualParaPontosBase`) delegam a esta função, para nenhum campo ler "2.5" de um jeito e outro
 * campo de outro. Regra: o número é lido de forma correta ou RECUSADO com uma mensagem clara, nunca interpretado errado
 * em silêncio. Sem ponto flutuante: o resultado é um inteiro escalado (centavos para 2 casas, milésimos para 3).
 *
 * - Com vírgula: a vírgula é o decimal; os pontos só valem como milhar quando o agrupamento é válido (`1.234.567,5`).
 * - Sem vírgula e com pontos que formam grupos de milhar válidos (`1.500`, `12.345`, `1.234.567`): é milhar.
 *   (Convenção brasileira: "1.500" é mil e quinhentos. Quem quer 1,5 digita "1,5".)
 * - Sem vírgula e com UM ponto que não forma milhar (`2.5`, `0.125`, `1234.56`): o ponto é decimal, desde que caiba nas casas.
 * - Qualquer outro arranjo (`1.23,45`, `1..000`, `1.2.3`, mais casas que o campo aceita): recusado.
 * - "R$" só é aceito no início e só em campo de dinheiro. Letras no meio ("1R2") são recusadas.
 */

export type OpcoesNumeroBr = {
  /** Casas decimais do campo: 0 = inteiro, 2 = dinheiro/percentual, 3 = quantidade/peso. */
  casas: number;
  /** Aceita o prefixo "R$". */
  moeda?: boolean;
  /** Aceita o sinal de menos no início (padrão: não). */
  negativo?: boolean;
};

export type ResultadoNumeroBr = { ok: true; escalado: number; casas: number } | { ok: false; erro: string };

/** Grupos de milhar válidos: 1 a 3 dígitos sem zero à esquerda, depois ".ddd" uma ou mais vezes. */
const MILHAR = /^[1-9]\d{0,2}(\.\d{3})+$/;

const ERRO_PONTOS = "Use ponto só para separar milhares (1.234) e vírgula para os decimais (1.234,56).";

function erroDeCasas(casas: number, moeda: boolean): string {
  if (casas === 0) return "Informe um número inteiro, sem vírgula.";
  if (moeda) return "Use vírgula para os centavos, com no máximo 2 casas (exemplo: 1.234,56).";
  return `Use no máximo ${casas} ${casas === 1 ? "casa" : "casas"} depois da vírgula.`;
}

export function lerNumeroBr(texto: string, { casas, moeda = false, negativo = false }: OpcoesNumeroBr): ResultadoNumeroBr {
  let t = texto.replace(/[\s ]/g, "");
  let sinal = 1;
  if (t.startsWith("-")) {
    if (!negativo) return { ok: false, erro: "O valor não pode ser negativo." };
    sinal = -1;
    t = t.slice(1);
  }
  if (moeda) t = t.replace(/^R\$/i, "");
  if (t === "") return { ok: false, erro: "Informe um número." };
  if (!/^[\d.,]+$/.test(t)) return { ok: false, erro: "Use só números, vírgula e ponto (exemplo: 1.234,56)." };

  const porVirgula = t.split(",");
  if (porVirgula.length > 2) return { ok: false, erro: ERRO_PONTOS };

  let inteiro: string;
  let fracao = "";
  if (porVirgula.length === 2) {
    const [parteInteira, parteFracao] = porVirgula;
    if (parteFracao === "") return { ok: false, erro: "Falta o número depois da vírgula." };
    if (parteInteira === "") inteiro = "0";
    else if (/^\d+$/.test(parteInteira)) inteiro = parteInteira;
    else if (MILHAR.test(parteInteira)) inteiro = parteInteira.replace(/\./g, "");
    else return { ok: false, erro: ERRO_PONTOS };
    fracao = parteFracao;
  } else if (!t.includes(".")) {
    inteiro = t;
  } else if (MILHAR.test(t)) {
    inteiro = t.replace(/\./g, "");
  } else {
    const porPonto = t.split(".");
    if (porPonto.length !== 2) return { ok: false, erro: ERRO_PONTOS };
    const [parteInteira, parteFracao] = porPonto;
    if (!/^\d*$/.test(parteInteira) || parteFracao === "") return { ok: false, erro: ERRO_PONTOS };
    inteiro = parteInteira === "" ? "0" : parteInteira;
    fracao = parteFracao;
  }

  if (fracao.length > casas) return { ok: false, erro: erroDeCasas(casas, moeda) };

  const escalado = BigInt(inteiro) * BigInt(10) ** BigInt(casas) + BigInt(fracao.padEnd(casas, "0") || "0");
  if (escalado > BigInt(Number.MAX_SAFE_INTEGER)) return { ok: false, erro: "Número grande demais." };
  // `|| 0` evita o "-0" de um zero negativo.
  return { ok: true, escalado: Number(escalado) * sinal || 0, casas };
}

/** Atalho: o inteiro escalado (centavos, milésimos...) ou null quando o texto é recusado. */
export function lerEscalado(texto: string, opcoes: OpcoesNumeroBr): number | null {
  const r = lerNumeroBr(texto, opcoes);
  return r.ok ? r.escalado : null;
}
