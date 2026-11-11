/**
 * Valida o destino pós-login (parâmetro `de`), aceitando SOMENTE caminhos internos do próprio site.
 *
 * Barra o redirecionamento aberto, inclusive truques como "/\t/evil.com" (o navegador remove TAB, CR
 * e LF e a URL vira "//evil.com"), barras invertidas e esquemas ("https:", "javascript:").
 * Função pura, sem dependências do servidor, para ser testada.
 */
const ORIGEM_FALSA = "http://interno.invalid";
const BARRA_INVERTIDA = String.fromCharCode(92);

export function destinoSeguro(destino: string | undefined | null, padrao = "/"): string {
  if (!destino) return padrao;
  if (destino.length > 500) return padrao;
  if (!destino.startsWith("/") || destino.startsWith("//")) return padrao;

  // Qualquer caractere de controle (inclui TAB, CR e LF) ou barra invertida invalida o destino.
  for (const caractere of destino) {
    if (caractere.charCodeAt(0) < 32 || caractere.charCodeAt(0) === 127 || caractere === BARRA_INVERTIDA) return padrao;
  }

  try {
    const url = new URL(destino, ORIGEM_FALSA);
    if (url.origin !== ORIGEM_FALSA) return padrao;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return padrao;
  }
}
