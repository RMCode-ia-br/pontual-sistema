/**
 * Sugestão do porte do projeto (R10). As faixas de valor são OPCIONAIS e vêm de Configurações; sem faixas
 * (ou sem valor) não há sugestão: o porte é sempre definido manualmente e o sistema nunca inventa faixas.
 */
export type Porte = "PEQUENO" | "MEDIO" | "GRANDE";

export type FaixasDePorte = {
  /** A partir deste valor (em centavos) o projeto é "médio". */
  medioMinimoCentavos: number | null;
  /** A partir deste valor (em centavos) o projeto é "grande". */
  grandeMinimoCentavos: number | null;
};

/** `null` quando as faixas são incoerentes (grande não pode começar antes do médio). */
export function faixasValidas(faixas: FaixasDePorte): boolean {
  const { medioMinimoCentavos: m, grandeMinimoCentavos: g } = faixas;
  if (m !== null && m < 0) return false;
  if (g !== null && g < 0) return false;
  return m === null || g === null || g > m;
}

export function sugerirPorte(valorCentavos: number | null | undefined, faixas: FaixasDePorte): Porte | null {
  if (valorCentavos === null || valorCentavos === undefined || valorCentavos < 0) return null;
  if (!faixasValidas(faixas)) return null;
  const { medioMinimoCentavos: medio, grandeMinimoCentavos: grande } = faixas;
  if (medio === null && grande === null) return null;
  if (grande !== null && valorCentavos >= grande) return "GRANDE";
  if (medio !== null && valorCentavos >= medio) return "MEDIO";
  // Abaixo do médio só é "pequeno" quando a faixa do médio existe; só com a faixa do grande não dá para saber.
  return medio !== null ? "PEQUENO" : null;
}
