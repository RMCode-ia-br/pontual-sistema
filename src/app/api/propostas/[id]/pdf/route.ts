import { NextResponse, type NextRequest } from "next/server";

import { registrarAuditoria } from "@/lib/auditoria";
import { sessaoParaApi } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { conteudoParaPdf, gerarPdfDaProposta } from "@/modules/propostas/pdf/gerar";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const IDENTIFICADOR = /^[\w-]{1,64}$/;

/** PDF da proposta. Enviada/decidida: o conteúdo congelado; rascunho: o estado atual (com "-rascunho" no nome). */
export async function GET(_requisicao: NextRequest, contexto: { params: Promise<{ id: string }> }) {
  // Route Handlers checam a sessão por conta própria (não só o proxy).
  const usuario = await sessaoParaApi();
  if (!usuario) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  const { id } = await contexto.params;
  if (!IDENTIFICADOR.test(id)) return NextResponse.json({ erro: "Proposta inválida." }, { status: 400 });
  const dados = await conteudoParaPdf(id);
  if (!dados) return NextResponse.json({ erro: "Proposta não encontrada." }, { status: 404 });

  // Só a proposta enviada ou aprovada é um documento válido; as demais saem com aviso em todas as páginas.
  const avisos: Record<string, string> = {
    RASCUNHO: "RASCUNHO — ainda não enviada ao cliente",
    CANCELADA: "PROPOSTA CANCELADA — sem validade",
    RECUSADA: "PROPOSTA RECUSADA",
    SUBSTITUIDA: "SUBSTITUÍDA POR UMA REVISÃO MAIS RECENTE",
    EXPIRADA: "VALIDADE EXPIRADA",
  };
  const pdf = await gerarPdfDaProposta(dados.conteudo, avisos[dados.status] ?? null);
  await registrarAuditoria(prisma, { usuario, entidade: "Proposta", entidadeId: id, acao: "GERAR_PDF", depois: { tipo: "proposta", status: dados.status } });
  const nome = `proposta-${dados.conteudo.numero}${dados.conteudo.revisao > 0 ? `-rev${dados.conteudo.revisao}` : ""}${dados.status === "RASCUNHO" ? "-rascunho" : ""}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${nome}"`, "Cache-Control": "no-store" },
  });
}
