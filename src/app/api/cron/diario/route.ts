import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { prisma } from "@/lib/db";
import { dataLocalDoInstante } from "@/lib/formatadores";
import { estenderRecorrencias } from "@/modules/financeiro/servico-pagar";

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
 * dela para estar correto (estados como atrasado/vencido são calculados na consulta; o fluxo projetado também enxerga
 * as recorrências ainda não geradas); ela só faz manutenção e gera as recorrências do financeiro (notificações: Fase 8).
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

  // Recorrências do financeiro (aluguel, energia, DAS, salários): estende até o horizonte configurado. Idempotente:
  // a chave única (recorrência + competência) impede duplicar mesmo que a rotina rode atrasada ou duas vezes.
  const recorrencias = await prisma.$transaction((tx) => estenderRecorrencias(tx, dataLocalDoInstante(new Date())), { timeout: 60_000 });

  console.log(JSON.stringify({ evento: "cron.diario", tentativasRemovidas, ...recorrencias }));
  return NextResponse.json({ ok: true, tentativasRemovidas, recorrencias }, { headers: { "Cache-Control": "no-store" } });
}
