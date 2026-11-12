import { periodoSchema } from "./schemas";

/** Período do extrato a partir da URL: padrão do dia 1 do mês de hoje até hoje; datas inválidas ou invertidas são corrigidas. */
export function lerPeriodoDoExtrato(bruto: Record<string, string | string[] | undefined>, hoje: string): { de: string; ate: string } {
  const primeiro = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const lido = periodoSchema.parse({ de: primeiro(bruto.de), ate: primeiro(bruto.ate) });
  const de = lido.de ?? `${hoje.slice(0, 7)}-01`;
  const ate = lido.ate ?? hoje;
  return de <= ate ? { de, ate } : { de: ate, ate: de };
}
