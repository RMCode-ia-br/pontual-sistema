import "server-only";

import { cache } from "react";

import { prisma } from "@/lib/db";
import { criarUrlDeDownload } from "@/lib/storage";

/** Configuração da empresa (singleton). Uma leitura por requisição. */
export const obterConfiguracao = cache(async () => {
  return prisma.configuracaoEmpresa.findUnique({ where: { id: "singleton" } });
});

/** Nome e logo para o cabeçalho. Nunca derruba a página se o Storage falhar. */
export const obterMarca = cache(async (): Promise<{ nome: string; logoUrl: string | null }> => {
  const cfg = await obterConfiguracao();
  const nome = cfg?.nomeFantasia?.trim() || "Pontual";
  if (!cfg?.logoCaminho) return { nome, logoUrl: null };
  try {
    return { nome, logoUrl: await criarUrlDeDownload(cfg.logoCaminho, 60 * 60) };
  } catch {
    return { nome, logoUrl: null };
  }
});
