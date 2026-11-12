/**
 * Logo padrão da empresa (Fase 3.5). Idempotente e seguro para produção:
 * só age se `ConfiguracaoEmpresa.logoCaminho` ainda estiver vazio, então nunca sobrescreve a logo que o gestor
 * enviou em Configurações. Envia `public/marca/logo-pontual.png` (gerada por `npm run icones`) ao bucket privado,
 * no mesmo caminho e com o mesmo registro de Anexo que o upload pela tela cria; telas e PDFs leem pelo
 * `logoCaminho` como sempre. Sem Storage configurado, avisa e segue (a logo se define pela tela).
 * Nunca imprime chaves nem URLs: só o resultado.
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { PrismaClient } from "../src/generated/prisma/client";

const ARQUIVO = path.join("public", "marca", "logo-pontual.png");
const ASSINATURA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

export async function semearLogoPadrao(prisma: PrismaClient): Promise<string> {
  const cfg = await prisma.configuracaoEmpresa.findUnique({ where: { id: "singleton" }, select: { logoCaminho: true } });
  if (!cfg) return "logo padrão: configuração da empresa ausente (rode o seed de novo)";
  if (cfg.logoCaminho) return "logo padrão: a empresa já tem logo, nada a fazer";

  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_SECRET_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "anexos";
  if (!url || !chave) return "logo padrão: Storage não configurado (SUPABASE_URL/SUPABASE_SECRET_KEY); envie a logo em Configurações > Empresa";
  if (!fs.existsSync(ARQUIVO)) return `logo padrão: ${ARQUIVO} não encontrado (rode npm run icones)`;

  const arquivo = fs.readFileSync(ARQUIVO);
  if (!arquivo.subarray(0, 4).equals(ASSINATURA_PNG)) return `logo padrão: ${ARQUIVO} não é um PNG válido`;

  // `server-only` não existe fora do Next; usa o SDK direto, como scripts/storage-setup.ts.
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
  const caminho = `ConfiguracaoEmpresa/singleton/${randomUUID()}.png`;

  const { error } = await sb.storage.from(bucket).upload(caminho, arquivo, { contentType: "image/png", upsert: false });
  if (error) return `logo padrão: falha ao enviar ao Storage (${error.name}); rode npm run storage:setup e tente de novo`;

  try {
    const gravou = await prisma.$transaction(async (tx) => {
      // Reconfere dentro da transação: se o gestor definiu uma logo no meio tempo, não sobrescreve.
      const atualizadas = await tx.configuracaoEmpresa.updateMany({ where: { id: "singleton", logoCaminho: null }, data: { logoCaminho: caminho } });
      if (atualizadas.count === 0) return false;
      await tx.anexo.create({
        data: {
          entidadeTipo: "ConfiguracaoEmpresa",
          entidadeId: "singleton",
          categoria: "logo",
          nome: "logo-pontual.png",
          caminho,
          mime: "image/png",
          tamanhoBytes: arquivo.length,
          usarNoPortfolio: false,
        },
      });
      return true;
    });
    if (!gravou) {
      await sb.storage.from(bucket).remove([caminho]);
      return "logo padrão: a empresa passou a ter logo durante o seed, nada a fazer";
    }
  } catch (erro) {
    await sb.storage.from(bucket).remove([caminho]); // não deixa objeto órfão no bucket
    throw erro;
  }
  return "logo padrão: enviada e definida como logo da empresa";
}
