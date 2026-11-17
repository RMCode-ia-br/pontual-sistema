import "server-only";

import { unstable_cache } from "next/cache";
import { cache } from "react";

import { prisma } from "@/lib/db";
import { criarUrlDeDownload } from "@/lib/storage";

/** Configuração da empresa (singleton). Uma leitura por requisição. */
export const obterConfiguracao = cache(async () => {
  return prisma.configuracaoEmpresa.findUnique({ where: { id: "singleton" } });
});

/** Etiqueta de cache da logo: a ação que troca a logo ou salva a empresa a invalida (`updateTag`). */
export const ETIQUETA_DA_MARCA = "marca";

/**
 * URL assinada da logo, guardada por 50 min (a URL vale 60): sem isso, cada página gerava uma ida ao Storage só para o
 * cabeçalho. A chave inclui o caminho do arquivo, então trocar a logo muda a chave sozinho; a etiqueta cobre o resto.
 * Erro do Storage NÃO é guardado (a próxima página tenta de novo).
 */
const urlDaLogoEmCache = unstable_cache((caminho: string) => criarUrlDeDownload(caminho, 60 * 60), ["url-da-logo"], { revalidate: 50 * 60, tags: [ETIQUETA_DA_MARCA] });

/** Cor da marca guardada pela mesma etiqueta (layout, viewport e manifesto a pedem em TODA requisição). */
const corDaMarcaEmCache = unstable_cache(async () => (await prisma.configuracaoEmpresa.findUnique({ where: { id: "singleton" }, select: { corPrimaria: true } }))?.corPrimaria ?? null, ["cor-da-marca"], {
  revalidate: 50 * 60,
  tags: [ETIQUETA_DA_MARCA],
});

export type Marca = { nome: string; logoUrl: string | null; corPrimaria: string | null };

/** Nome, logo e cor para o cabeçalho e o tema. Nunca derruba a página se o Storage falhar. */
export const obterMarca = cache(async (): Promise<Marca> => {
  const cfg = await obterConfiguracao();
  const nome = cfg?.nomeFantasia?.trim() || "Pontual";
  const corPrimaria = cfg?.corPrimaria ?? null;
  if (!cfg?.logoCaminho) return { nome, logoUrl: null, corPrimaria };
  try {
    return { nome, logoUrl: await urlDaLogoEmCache(cfg.logoCaminho), corPrimaria };
  } catch {
    return { nome, logoUrl: null, corPrimaria };
  }
});

/**
 * Só a cor da marca, sem tocar no Storage: o layout raiz, o viewport e o manifesto precisam dela em toda
 * requisição, mas não da URL (assinada) da logo. Reaproveita a leitura de `obterConfiguracao`; se o banco falhar, null.
 */
export async function obterCorDaMarca(): Promise<string | null> {
  try {
    // Teto de 3 s: com o banco pausado (plano gratuito) ou a rede travada, a página abre com a cor padrão
    // em vez de ficar presa esperando a conexão (esta leitura está no caminho de TODA página).
    return await Promise.race([corDaMarcaEmCache(), new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000))]);
  } catch {
    return null;
  }
}

/** Para a tela de login e a área logada: se o banco falhar, a página ainda abre com a marca padrão. */
export async function obterMarcaOuPadrao(): Promise<Marca> {
  try {
    return await obterMarca();
  } catch {
    return { nome: "Pontual", logoUrl: null, corPrimaria: null };
  }
}
