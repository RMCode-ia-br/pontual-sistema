/**
 * CSV de relatório com colunas TIPADAS. Bloco genérico: quem monta o relatório diz o tipo de cada coluna e este módulo
 * formata do jeito que o Excel em português lê e soma:
 * - data: dd/mm/aaaa (a data de calendário "aaaa-mm-dd" ou a coluna `@db.Date` nunca anda um dia por causa de fuso);
 * - dinheiro: centavos inteiros → "1234,56" (vírgula decimal, sem símbolo e sem ponto de milhar, para o Excel somar);
 *   ponha "(R$)" no título da coluna;
 * - número e percentual: vírgula decimal, sem zeros sobrando;
 * - vazio é vazio, nunca zero ("Incompleta", "sem custo" o relatório escreve como texto);
 * - acentos preservados (BOM UTF-8) e fórmulas neutralizadas (`celulaCsv`);
 * - coluna `interna` (custo, margem...) só sai quando a pessoa pode ver custo: assim nenhum arquivo que possa ir para
 *   o cliente vaza dado interno por esquecimento;
 * - exportação truncada leva um AVISO na primeira linha (e a tela mostra o mesmo aviso).
 */
import { formatarDataCalendario, formatarDataHora } from "../formatadores";
import { celulaCsv, gerarCsv } from "./index";

const BOM = "\uFEFF";

export type TipoDeColuna = "texto" | "data" | "dataHora" | "dinheiro" | "numero" | "inteiro" | "percentual";

export type ColunaDeCsv<L> = {
  titulo: string;
  tipo: TipoDeColuna;
  valor: (linha: L) => string | number | Date | null | undefined;
  /** Dado interno (custo, margem, custo informado): some do arquivo sem a permissão `ver custo`. */
  interna?: boolean;
  /** Casas decimais de "numero" (padrão 3) e "percentual" (padrão 1). */
  casas?: number;
};

export type OpcoesDoCsv = {
  /** Resultado de `can(usuario, "ver", "custo")`. */
  podeVerInterno: boolean;
  /** Aviso de truncamento ou de dado incompleto, escrito na primeira linha. */
  aviso?: string | null;
};

/** Centavos → "1234,56" (negativo com "-"). */
export function centavosParaCsv(centavos: number): string {
  const absoluto = Math.abs(Math.trunc(centavos));
  return `${centavos < 0 ? "-" : ""}${Math.floor(absoluto / 100)},${String(absoluto % 100).padStart(2, "0")}`;
}

function decimalParaCsv(n: number, casas: number): string {
  if (!Number.isFinite(n)) return "";
  return n.toFixed(casas).replace(/\.?0+$/, "").replace(".", ",") || "0";
}

/** Formata UM valor segundo o tipo da coluna. Devolve null quando não há valor (a célula sai vazia). */
export function valorDeCsv(tipo: TipoDeColuna, valor: string | number | Date | null | undefined, casas?: number): string | null {
  if (valor === null || valor === undefined || valor === "") return null;
  switch (tipo) {
    case "texto":
      return String(valor);
    case "data":
      if (valor instanceof Date) return formatarDataCalendario(valor);
      return /^\d{4}-\d{2}-\d{2}$/.test(String(valor)) ? formatarDataCalendario(`${valor}T00:00:00Z`) : String(valor);
    case "dataHora":
      return valor instanceof Date || typeof valor === "string" || typeof valor === "number" ? formatarDataHora(valor) : null;
    case "dinheiro":
      return typeof valor === "number" ? centavosParaCsv(valor) : null;
    case "inteiro":
      return typeof valor === "number" && Number.isFinite(valor) ? String(Math.trunc(valor)) : null;
    case "numero":
      return typeof valor === "number" ? decimalParaCsv(valor, casas ?? 3) : null;
    case "percentual":
      return typeof valor === "number" ? decimalParaCsv(valor, casas ?? 1) : null;
  }
}

/** Monta o CSV do relatório: só as colunas permitidas, na ordem dada, com o aviso (se houver) na primeira linha. */
export function csvDoRelatorio<L>(colunas: readonly ColunaDeCsv<L>[], linhas: readonly L[], { podeVerInterno, aviso }: OpcoesDoCsv): string {
  const visiveis = colunas.filter((c) => !c.interna || podeVerInterno);
  const corpo = linhas.map((l) => visiveis.map((c) => valorDeCsv(c.tipo, c.valor(l), c.casas)));
  const csv = gerarCsv(
    visiveis.map((c) => c.titulo),
    corpo,
  );
  // O aviso entra logo depois do BOM, antes do cabeçalho (função na troca: "$" no texto do aviso não é especial).
  return aviso ? csv.replace(BOM, () => `${BOM}${celulaCsv(`AVISO: ${aviso}`)}\r\n`) : csv;
}
