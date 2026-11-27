import { NextResponse, type NextRequest } from "next/server";

import { registrarAuditoria } from "@/lib/auditoria";
import { sessaoParaApi } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { ErroDesenhoIndisponivel } from "@/modules/propostas/pdf/imagens";
import { conteudoParaPdf, gerarPdfDeProducao } from "@/modules/propostas/pdf/gerar";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const IDENTIFICADOR = /^[\w-]{1,64}$/;

/** Folha de produção (SEM valores). Aprovada: só a opção aprovada; senão, todas as opções. */
export async function GET(_requisicao: NextRequest, contexto: { params: Promise<{ id: string }> }) {
  const usuario = await sessaoParaApi();
  if (!usuario) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  const { id } = await contexto.params;
  if (!IDENTIFICADOR.test(id)) return NextResponse.json({ erro: "Proposta inválida." }, { status: 400 });
  const dados = await conteudoParaPdf(id);
  if (!dados) return NextResponse.json({ erro: "Proposta não encontrada." }, { status: 404 });

  let pdf: Buffer;
  try {
    pdf = await gerarPdfDeProducao(dados.conteudo, dados.status === "APROVADA" ? dados.opcaoAprovadaId : null);
  } catch (erro) {
    // Imagem do desenho que não carrega ou não confere: erro legível (nunca o PDF com o desenho automático no lugar).
    if (erro instanceof ErroDesenhoIndisponivel) return NextResponse.json({ erro: erro.message }, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "5" } });
    throw erro;
  }
  await registrarAuditoria(prisma, { usuario, entidade: "Proposta", entidadeId: id, acao: "GERAR_PDF", depois: { tipo: "producao", status: dados.status } });
  return new NextResponse(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="producao-${dados.conteudo.numero}.pdf"`, "Cache-Control": "no-store" },
  });
}
