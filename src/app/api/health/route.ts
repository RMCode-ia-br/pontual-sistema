import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { verificarSharp } from "@/lib/imagem/saude";

export const dynamic = "force-dynamic";

/**
 * Verificação de saúde para monitores externos (UptimeRobot etc.).
 * Só confere a conexão com o banco e NÃO expõe dados nem detalhes de erro.
 * Ajuda a perceber um projeto Supabase pausado (plano gratuito pausa após 1 semana sem uso).
 *
 * `Server-Timing: db;dur=N` traz só o tempo (ms) da ida e volta ao banco (`SELECT 1`), para medir a latência entre a região da
 * função e o banco sem expor nada além de um número.
 */
export async function GET() {
  const inicio = performance.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const ms = Math.round((performance.now() - inicio) * 10) / 10;
    // Campo à parte: o processador de imagens (desenho do item) não é motivo para marcar o sistema como fora do ar.
    const sharp = await verificarSharp();
    return NextResponse.json({ status: "ok", sharp }, { headers: { "Cache-Control": "no-store", "Server-Timing": `db;dur=${ms}` } });
  } catch (erro) {
    // Log estruturado só com o tipo do erro (nunca a connection string).
    console.error(JSON.stringify({ evento: "health.falha", tipo: erro instanceof Error ? erro.name : "Erro" }));
    return NextResponse.json({ status: "erro" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
