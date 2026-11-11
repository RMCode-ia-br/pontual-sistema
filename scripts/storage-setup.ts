/**
 * Cria (ou ajusta) o bucket privado de anexos no Supabase. Idempotente. Uso: `npm run storage:setup`.
 * Fixa no próprio bucket o tamanho máximo e os tipos permitidos (defesa além da validação do app).
 * Mostra só o resultado; nunca imprime chaves.
 */
import { config } from "dotenv";

import { TAMANHO_MAXIMO_BYTES, TIPOS_PERMITIDOS } from "../src/lib/storage/regras";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main() {
  // `server-only` não existe fora do Next; importa o criador direto do SDK.
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_SECRET_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "anexos";
  if (!url || !chave) throw new Error("SUPABASE_URL/SUPABASE_SECRET_KEY ausentes no .env.local");

  const opcoes = {
    public: false,
    fileSizeLimit: TAMANHO_MAXIMO_BYTES,
    allowedMimeTypes: Object.keys(TIPOS_PERMITIDOS),
  };

  const sb = createClient(url, chave, { auth: { persistSession: false } });
  const { data, error } = await sb.storage.listBuckets();
  if (error) throw new Error(`Não foi possível listar buckets (${error.name})`);

  const existente = data.find((b) => b.name === bucket);
  if (existente) {
    // Reaplica as regras: um bucket criado antes (ou ajustado à mão) volta a ficar privado e limitado.
    const { error: erroAtualizar } = await sb.storage.updateBucket(bucket, opcoes);
    if (erroAtualizar) throw new Error(`Falha ao atualizar o bucket (${erroAtualizar.name})`);
    console.log(`Bucket "${bucket}": já existia, regras reaplicadas (privado, ${TAMANHO_MAXIMO_BYTES / 1024 / 1024} MB, ${opcoes.allowedMimeTypes.length} tipos).`);
    return;
  }

  const { error: erroCriar } = await sb.storage.createBucket(bucket, opcoes);
  if (erroCriar) throw new Error(`Falha ao criar o bucket (${erroCriar.name})`);
  console.log(`Bucket "${bucket}": criado (privado, ${TAMANHO_MAXIMO_BYTES / 1024 / 1024} MB, ${opcoes.allowedMimeTypes.length} tipos).`);
}

main().catch((erro: unknown) => {
  console.error(`Falha: ${erro instanceof Error ? erro.message : "erro desconhecido"}`);
  process.exitCode = 1;
});
