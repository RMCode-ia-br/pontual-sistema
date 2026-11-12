import { normalizarOrigem } from "./url-base";

/**
 * CORS da API pública para o site institucional. As origens permitidas vêm de SITE_ALLOWED_ORIGINS (lista separada
 * por vírgula, ex.: "https://pontualmacae.com.br"); nada de endereço fixo no código e nunca "*".
 * Origem que não estiver na lista não recebe cabeçalho CORS nenhum (o navegador bloqueia a resposta).
 */

export function origensPermitidasDoSite(): string[] {
  const lista = (process.env.SITE_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => normalizarOrigem(o))
    .filter((o): o is string => o !== null);
  return [...new Set(lista)];
}

/** Cabeçalhos CORS para a origem da requisição (cabeçalho `Origin`); vazio se a origem não é permitida. */
export function cabecalhosCors(origem: string | null | undefined, metodos = "POST, OPTIONS"): Record<string, string> {
  // `Vary` sempre: a resposta muda conforme a origem e não pode ser guardada em cache como se fosse a mesma.
  const base: Record<string, string> = { Vary: "Origin" };
  const normalizada = normalizarOrigem(origem);
  if (!normalizada || !origensPermitidasDoSite().includes(normalizada)) return base;
  return {
    ...base,
    "Access-Control-Allow-Origin": normalizada,
    "Access-Control-Allow-Methods": metodos,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600",
  };
}
