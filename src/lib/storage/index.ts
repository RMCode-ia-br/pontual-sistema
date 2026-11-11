import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Acesso ao Supabase Storage SOMENTE no servidor (usa a chave secreta).
 * O bucket é privado: o navegador só recebe URLs assinadas de curta duração.
 */
let cliente: SupabaseClient | undefined;

function supabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_SECRET_KEY;
  if (!url || !chave) throw new Error("Supabase não configurado (SUPABASE_URL/SUPABASE_SECRET_KEY).");
  cliente ??= createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
  return cliente;
}

export function nomeDoBucket(): string {
  return process.env.SUPABASE_STORAGE_BUCKET || "anexos";
}

/** URL para o navegador enviar o arquivo direto ao Storage (não passa pelo servidor do app). */
export async function criarUrlDeUpload(caminho: string): Promise<{ url: string; token: string }> {
  const { data, error } = await supabase().storage.from(nomeDoBucket()).createSignedUploadUrl(caminho);
  if (error || !data) throw new Error("Não foi possível preparar o envio do arquivo.");
  return { url: data.signedUrl, token: data.token };
}

/** URL de download com validade curta (padrão 60 s). */
export async function criarUrlDeDownload(caminho: string, segundos = 60, nomeParaBaixar?: string): Promise<string> {
  const { data, error } = await supabase()
    .storage.from(nomeDoBucket())
    .createSignedUrl(caminho, segundos, nomeParaBaixar ? { download: nomeParaBaixar } : undefined);
  if (error || !data) throw new Error("Não foi possível gerar o link do arquivo.");
  return data.signedUrl;
}

/** Tamanho e tipo REAIS do objeto no bucket (null se não existir): não confiar no que o navegador declarou. */
export async function infoDoObjeto(caminho: string): Promise<{ tamanhoBytes: number; mime: string } | null> {
  const pasta = caminho.split("/").slice(0, -1).join("/");
  const nome = caminho.split("/").pop() ?? "";
  const { data, error } = await supabase().storage.from(nomeDoBucket()).list(pasta, { search: nome, limit: 5 });
  const objeto = !error ? data?.find((o) => o.name === nome) : undefined;
  if (!objeto) return null;
  const meta = (objeto.metadata ?? {}) as { size?: number; mimetype?: string };
  return { tamanhoBytes: Number(meta.size ?? 0), mime: String(meta.mimetype ?? "") };
}

export async function removerObjeto(caminho: string): Promise<void> {
  await supabase().storage.from(nomeDoBucket()).remove([caminho]);
}

export async function garantirBucketPrivado(): Promise<"criado" | "ja-existia"> {
  const sb = supabase();
  const { data } = await sb.storage.listBuckets();
  if (data?.some((b) => b.name === nomeDoBucket())) return "ja-existia";
  const { error } = await sb.storage.createBucket(nomeDoBucket(), { public: false, fileSizeLimit: 10 * 1024 * 1024 });
  if (error) throw new Error(`Falha ao criar o bucket (${error.name}).`);
  return "criado";
}
