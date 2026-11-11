import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const DIAS_DE_RETENCAO_TENTATIVAS = 30;

function segredoConfere(recebido: string | null, esperado: string): boolean {
  if (!recebido) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Rotina diária (Vercel Cron). Protegida por CRON_SECRET: a Vercel envia
 * `Authorization: Bearer <CRON_SECRET>` automaticamente quando a variável existe.
 *
 * É IDEMPOTENTE: pode rodar atrasada ou mais de uma vez sem duplicar nada. O sistema NÃO depende
 * dela para estar correto (estados como atrasado/vencido são calculados na consulta); ela só faz
 * manutenção e, nas próximas fases, gera notificações e recorrências.
 */
export async function GET(requisicao: NextRequest) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) {
    // Sem segredo configurado, recusa: nunca deixar a rotina aberta.
    return NextResponse.json({ erro: "Rotina desabilitada (CRON_SECRET não configurado)." }, { status: 503 });
  }

  const autorizacao = requisicao.headers.get("authorization");
  if (!segredoConfere(autorizacao?.replace(/^Bearer\s+/i, "") ?? null, segredo)) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  const limite = new Date(Date.now() - DIAS_DE_RETENCAO_TENTATIVAS * 24 * 60 * 60 * 1000);
  const { count: tentativasRemovidas } = await prisma.tentativaLogin.deleteMany({ where: { criadoEm: { lt: limite } } });

  console.log(JSON.stringify({ evento: "cron.diario", tentativasRemovidas }));
  return NextResponse.json({ ok: true, tentativasRemovidas }, { headers: { "Cache-Control": "no-store" } });
}
