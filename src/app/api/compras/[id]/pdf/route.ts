import { NextResponse, type NextRequest } from "next/server";

import { registrarAuditoria } from "@/lib/auditoria";
import { sessaoParaApi } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { dataLocalDoInstante } from "@/lib/formatadores";
import { gerarPdfDoPedido } from "@/modules/compras/pedido";
import { obterCompra } from "@/modules/compras/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const IDENTIFICADOR = /^[\w-]{1,64}$/;

/** Pedido de compra em PDF para enviar ao fornecedor. */
export async function GET(_requisicao: NextRequest, contexto: { params: Promise<{ id: string }> }) {
  const usuario = await sessaoParaApi();
  if (!usuario) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  const { id } = await contexto.params;
  if (!IDENTIFICADOR.test(id)) return NextResponse.json({ erro: "Compra inválida." }, { status: 400 });
  const compra = await obterCompra(id, dataLocalDoInstante(new Date()));
  if (!compra) return NextResponse.json({ erro: "Compra não encontrada." }, { status: 404 });

  const pdf = await gerarPdfDoPedido(compra);
  await registrarAuditoria(prisma, { usuario, entidade: "Compra", entidadeId: id, acao: "GERAR_PDF", depois: { numero: compra.numero, status: compra.status } });
  return new NextResponse(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="pedido-${compra.numero}.pdf"`, "Cache-Control": "no-store" },
  });
}
