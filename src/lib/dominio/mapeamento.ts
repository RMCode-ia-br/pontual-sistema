/**
 * Mapeamento automático de colunas da planilha para os campos do sistema (passo 2 da importação).
 * A pessoa sempre pode corrigir; aqui só se sugere o mais provável.
 */

export type CampoImportavel = {
  chave: string;
  rotulo: string;
  /** Outros nomes que a coluna costuma ter nas planilhas do dia a dia. */
  sinonimos?: string[];
  obrigatorio?: boolean;
};

/** "Preço de Custo (R$)" → "precodecustor": minúsculas, sem acento e sem pontuação. */
export function normalizarCabecalho(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** campo → índice da coluna (ou null quando nenhuma combina). Uma coluna serve a um campo só. */
export function sugerirMapeamento(cabecalho: string[], campos: CampoImportavel[]): Record<string, number | null> {
  const colunas = cabecalho.map(normalizarCabecalho);
  const usadas = new Set<number>();
  const resultado: Record<string, number | null> = {};

  for (const campo of campos) {
    const nomes = [campo.chave, campo.rotulo, ...(campo.sinonimos ?? [])].map(normalizarCabecalho).filter(Boolean);
    const indice = colunas.findIndex((c, i) => !usadas.has(i) && nomes.includes(c));
    resultado[campo.chave] = indice >= 0 ? indice : null;
    if (indice >= 0) usadas.add(indice);
  }
  return resultado;
}

/** Campos obrigatórios que ficaram sem coluna (para avisar antes de seguir). */
export function camposObrigatoriosSemColuna(campos: CampoImportavel[], mapeamento: Record<string, number | null>): CampoImportavel[] {
  return campos.filter((c) => c.obrigatorio && (mapeamento[c.chave] === null || mapeamento[c.chave] === undefined));
}
