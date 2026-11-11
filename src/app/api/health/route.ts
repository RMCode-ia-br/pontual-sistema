import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Verificação de saúde para monitores externos (UptimeRobot etc.).
 * Só confere a conexão com o banco e NÃO expõe dados nem detalhes de erro.
 * Ajuda a perceber um projeto Supabase pausado (plano gratuito pausa após 1 semana sem uso).
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch (erro) {
    // Log estruturado só com o tipo do erro (nunca a connection string).
    console.error(JSON.stringify({ evento: "health.falha", tipo: erro instanceof Error ? erro.name : "Erro" }));
    return NextResponse.json({ status: "erro" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
