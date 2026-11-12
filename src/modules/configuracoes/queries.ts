import "server-only";

import { cache } from "react";

import { prisma } from "@/lib/db";
import { criarUrlDeDownload } from "@/lib/storage";

/** Configuração da empresa (singleton). Uma leitura por requisição. */
export const obterConfiguracao = cache(async () => {
  return prisma.configuracaoEmpresa.findUnique({ where: { id: "singleton" } });
});

export type Marca = { nome: string; logoUrl: string | null; corPrimaria: string | null };

/** Nome, logo e cor para o cabeçalho e o tema. Nunca derruba a página se o Storage falhar. */
export const obterMarca = cache(async (): Promise<Marca> => {
  const cfg = await obterConfiguracao();
  const nome = cfg?.nomeFantasia?.trim() || "Pontual";
  const corPrimaria = cfg?.corPrimaria ?? null;
  if (!cfg?.logoCaminho) return { nome, logoUrl: null, corPrimaria };
  try {
    return { nome, logoUrl: await criarUrlDeDownload(cfg.logoCaminho, 60 * 60), corPrimaria };
  } catch {
    return { nome, logoUrl: null, corPrimaria };
  }
});

/** Para o layout raiz e a tela de login: se o banco falhar, a página ainda abre com a marca padrão. */
export async function obterMarcaOuPadrao(): Promise<Marca> {
  try {
    return await obterMarca();
  } catch {
    return { nome: "Pontual", logoUrl: null, corPrimaria: null };
  }
}
