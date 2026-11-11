import "server-only";

import { z } from "zod";

/**
 * Consultas opcionais a serviços públicos (ViaCEP e BrasilAPI) para PREENCHER formulários.
 * Regra da spec (seção 4): falha silenciosa. O cadastro manual nunca pode depender destes serviços,
 * então qualquer problema (rede, tempo esgotado, resposta estranha) devolve `null`.
 * O servidor chama os hosts fixos abaixo, só com dígitos validados, e nunca repassa a resposta bruta.
 */

const TEMPO_LIMITE_MS = 3500;

async function buscarJson(url: string): Promise<unknown | null> {
  try {
    const resposta = await fetch(url, {
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!resposta.ok) return null;
    return await resposta.json();
  } catch {
    return null;
  }
}

export type EnderecoPorCep = { logradouro: string; bairro: string; cidade: string; uf: string };

const viaCepSchema = z.object({
  erro: z.unknown().optional(),
  logradouro: z.string().max(200).optional().default(""),
  bairro: z.string().max(120).optional().default(""),
  localidade: z.string().max(120).optional().default(""),
  uf: z.string().length(2).optional().default(""),
});

/** `cep` precisa ter exatamente 8 dígitos (a validação é de quem chama). */
export async function consultarCep(cep: string): Promise<EnderecoPorCep | null> {
  if (!/^\d{8}$/.test(cep)) return null;
  const bruto = await buscarJson(`https://viacep.com.br/ws/${cep}/json/`);
  const lido = viaCepSchema.safeParse(bruto);
  if (!lido.success || lido.data.erro) return null;
  const d = lido.data;
  if (!d.localidade && !d.logradouro) return null;
  return { logradouro: d.logradouro, bairro: d.bairro, cidade: d.localidade, uf: d.uf.toUpperCase() };
}

export type DadosDeCnpj = {
  razaoSocial: string;
  nomeFantasia: string;
  telefone: string;
  email: string;
};

const brasilApiSchema = z.object({
  razao_social: z.string().max(200).optional().default(""),
  nome_fantasia: z.string().max(200).nullish(),
  ddd_telefone_1: z.string().max(30).nullish(),
  email: z.string().max(200).nullish(),
});

/** `cnpj` precisa ter exatamente 14 dígitos válidos (a validação é de quem chama). */
export async function consultarCnpj(cnpj: string): Promise<DadosDeCnpj | null> {
  if (!/^\d{14}$/.test(cnpj)) return null;
  const bruto = await buscarJson(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
  const lido = brasilApiSchema.safeParse(bruto);
  if (!lido.success || !lido.data.razao_social) return null;
  const d = lido.data;
  return {
    razaoSocial: d.razao_social,
    nomeFantasia: d.nome_fantasia ?? "",
    telefone: d.ddd_telefone_1 ?? "",
    email: (d.email ?? "").toLowerCase(),
  };
}
