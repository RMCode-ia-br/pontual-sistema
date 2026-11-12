/**
 * Endereço público do sistema, lido de variável de ambiente (nunca fixo no código).
 * Ordem: NEXT_PUBLIC_APP_URL, depois AUTH_URL. O Auth.js lê AUTH_URL sozinho; as duas devem ser iguais.
 *
 * ATENÇÃO: `process.env.NEXT_PUBLIC_APP_URL` precisa ser escrito por extenso, porque o Next troca esse texto
 * pelo valor na hora do build (também no código do navegador). Mudou na Vercel? Faça novo deploy.
 */

/** Só aceita http(s) e devolve a origem sem barra final; qualquer outra coisa vira null. */
export function normalizarOrigem(valor: string | undefined | null): string | null {
  const texto = (valor ?? "").trim();
  if (!texto) return null;
  try {
    const url = new URL(texto);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Origem pública do app (ex.: "https://sistema.exemplo.com.br") ou null se nenhuma variável estiver preenchida. */
export function urlBaseDoApp(): string | null {
  return normalizarOrigem(process.env.NEXT_PUBLIC_APP_URL) ?? normalizarOrigem(process.env.AUTH_URL);
}

/**
 * Monta o endereço completo de um caminho do app. No navegador, se nenhuma variável estiver preenchida, usa a
 * origem da página aberta (útil em desenvolvimento); no servidor sem variável devolve só o caminho.
 */
export function montarUrlDoApp(caminho: string): string {
  const relativo = caminho.startsWith("/") ? caminho : `/${caminho}`;
  const base = urlBaseDoApp() ?? (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}${relativo}`;
}
