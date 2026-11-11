/**
 * Cria o bucket privado de anexos no Supabase (idempotente). Uso: `npm run storage:setup`.
 * Mostra só o resultado; nunca imprime chaves.
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main() {
  // `server-only` não existe fora do Next; importa o criador direto do SDK.
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_SECRET_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "anexos";
  if (!url || !chave) throw new Error("SUPABASE_URL/SUPABASE_SECRET_KEY ausentes no .env.local");

  const sb = createClient(url, chave, { auth: { persistSession: false } });
  const { data, error } = await sb.storage.listBuckets();
  if (error) throw new Error(`Não foi possível listar buckets (${error.name})`);

  const existente = data.find((b) => b.name === bucket);
  if (existente) {
    console.log(`Bucket "${bucket}": já existe (${existente.public ? "PÚBLICO — corrija!" : "privado"}).`);
    process.exitCode = existente.public ? 1 : 0;
    return;
  }
  const { error: erroCriar } = await sb.storage.createBucket(bucket, { public: false, fileSizeLimit: 10 * 1024 * 1024 });
  if (erroCriar) throw new Error(`Falha ao criar o bucket (${erroCriar.name})`);
  console.log(`Bucket "${bucket}": criado (privado, limite de 10 MB por arquivo).`);
}

main().catch((erro: unknown) => {
  console.error(`Falha: ${erro instanceof Error ? erro.message : "erro desconhecido"}`);
  process.exitCode = 1;
});
