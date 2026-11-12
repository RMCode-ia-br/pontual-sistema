/**
 * Descrição técnica do item gerada por template (Apêndice B), com plural pela quantidade.
 *
 * Marcas de plural: `JANELA(S)` → JANELA / JANELAS; `PAINEL(IS)` → PAINEL / PAINÉIS; `PORTÃO(ÕES)` → PORTÃO / PORTÕES; `(ES)` → +ES.
 * Variáveis entre chaves: {FOLHAS} {LINHA} {COR} {MM} {ACABAMENTO} {FACES} (já com a palavra: "1 FACE"/"2 FACES") {TORRES_CM} {MEDIDAS} {L} {A}.
 * Variável sem valor é deixada em branco e listada em `faltando` (a interface avisa; nunca inventa).
 */
import type { Medida } from "./preco";
import { quantidadeTotal } from "./preco";

export const VARIAVEIS_TEMPLATE = ["FOLHAS", "LINHA", "COR", "MM", "ACABAMENTO", "FACES", "TORRES_CM", "MEDIDAS", "L", "A"] as const;
export type VariavelTemplate = (typeof VARIAVEIS_TEMPLATE)[number];

/** Valores das variáveis do template a partir das escolhas do item (mesma regra na tela e no servidor). */
export function valoresDoTemplate(e: {
  folhas: number | null;
  faces: number | null;
  torresCm: number | null;
  linha: string | null;
  tipoVidro: string | null;
  espessuraMm: number | null;
  acabamento: string | null;
}): ValoresTemplate {
  return {
    FOLHAS: e.folhas ? String(e.folhas).padStart(2, "0") : "",
    LINHA: e.linha ?? "",
    COR: e.tipoVidro ?? "",
    // As propostas reais imprimem a espessura com dois dígitos ("06MM", "08MM", "10MM").
    MM: e.espessuraMm ? String(e.espessuraMm).padStart(2, "0") : "",
    ACABAMENTO: e.acabamento ?? "",
    FACES: e.faces ? `${String(e.faces).padStart(2, "0")} ${e.faces === 1 ? "FACE" : "FACES"}` : "",
    TORRES_CM: e.torresCm ?? "",
  };
}

export function aplicarPlural(texto: string, quantidade: number): string {
  const plural = quantidade !== 1;
  return texto.replace(/([\p{L}]+)\((IS|ES|ÕES|S)\)/gu, (_t, palavra: string, sufixo: string) => {
    if (!plural) return palavra;
    if (sufixo === "IS") {
      if (/EL$/i.test(palavra)) return palavra.slice(0, -2) + (palavra.endsWith("el") ? "éis" : "ÉIS");
      return palavra.replace(/L$/i, (l) => (l === "l" ? "is" : "IS"));
    }
    if (sufixo === "ÕES") return palavra.replace(/ÃO$/i, (t) => (t === "ão" ? "ões" : "ÕES"));
    if (sufixo === "ES") return palavra + "ES";
    return palavra + "S";
  });
}

/**
 * `2000 X 3600 / 2000 X 2600`. Com várias medidas e quantidade maior que 1 em alguma, essa medida leva
 * ` = NN` (como no original: `2000 X 1800 = 02 / 2000 X 2150`).
 */
export function formatarMedidas(medidas: Medida[]): string {
  const varias = medidas.length > 1;
  return medidas.map((m) => `${m.larguraMm} X ${m.alturaMm}${varias && m.quantidade > 1 ? ` = ${String(m.quantidade).padStart(2, "0")}` : ""}`).join(" / ");
}

export type ValoresTemplate = Partial<Record<Exclude<VariavelTemplate, "MEDIDAS" | "L" | "A">, string | number | null | undefined>>;

export function gerarDescricao(template: string, valores: ValoresTemplate, medidas: Medida[]): { texto: string; faltando: string[] } {
  const faltando = new Set<string>();
  const comMedidas: Record<string, string> = {
    MEDIDAS: formatarMedidas(medidas),
    L: medidas[0] ? String(medidas[0].larguraMm) : "",
    A: medidas[0] ? String(medidas[0].alturaMm) : "",
  };
  const preenchido = template.replace(/\{([A-Z_]+)\}/g, (_t, nome: string) => {
    const bruto = nome in comMedidas ? comMedidas[nome] : valores[nome as keyof ValoresTemplate];
    const valor = bruto === null || bruto === undefined ? "" : String(bruto).trim();
    if (valor === "") faltando.add(nome);
    return valor;
  });
  const texto = aplicarPlural(preenchido, quantidadeTotal(medidas)).replace(/\s{2,}/g, " ").replace(/\s+([,.;])/g, "$1").trim();
  return { texto, faltando: [...faltando] };
}

/** Variáveis citadas em um template (para o editor da tipologia validar e avisar). */
export function variaveisDoTemplate(template: string): { validas: string[]; desconhecidas: string[] } {
  const achadas = [...new Set([...template.matchAll(/\{([A-Za-z_]+)\}/g)].map((m) => m[1]))];
  return {
    validas: achadas.filter((n) => (VARIAVEIS_TEMPLATE as readonly string[]).includes(n)),
    desconhecidas: achadas.filter((n) => !(VARIAVEIS_TEMPLATE as readonly string[]).includes(n)),
  };
}
