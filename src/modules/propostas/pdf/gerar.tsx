import "server-only";

import { renderToBuffer } from "@react-pdf/renderer";

import { prisma } from "@/lib/db";
import { criarUrlDeDownload } from "@/lib/storage";

import type { ConteudoProposta } from "../conteudo";
import { construirConteudo } from "../servico-ciclo";
import { ProducaoPdf } from "./producao-pdf";
import { PropostaPdf, type LogoPdf } from "./proposta-pdf";

/** O react-pdf lê PNG e JPEG (WebP não): outro formato simplesmente fica sem logo no PDF. */
async function carregarLogo(caminho: string | null): Promise<LogoPdf> {
  if (!caminho) return null;
  const extensao = caminho.toLowerCase().split(".").pop();
  const format = extensao === "png" ? "png" : extensao === "jpg" || extensao === "jpeg" ? "jpg" : null;
  if (!format) return null;
  try {
    const url = await criarUrlDeDownload(caminho, 120);
    const resposta = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resposta.ok) return null;
    return { data: Buffer.from(await resposta.arrayBuffer()), format };
  } catch {
    return null;
  }
}

/**
 * Conteúdo que vira PDF: proposta enviada/decidida usa o SNAPSHOT congelado (o que o cliente recebeu);
 * rascunho usa o estado atual. Devolve null se não existir.
 */
export async function conteudoParaPdf(propostaId: string): Promise<{ conteudo: ConteudoProposta; status: string; opcaoAprovadaId: string | null } | null> {
  const p = await prisma.proposta.findFirst({ where: { id: propostaId, deletadoEm: null, projeto: { deletadoEm: null } }, select: { status: true, snapshot: true, opcaoAprovadaId: true } });
  if (!p) return null;
  const conteudo = p.status !== "RASCUNHO" && p.snapshot ? (p.snapshot as unknown as ConteudoProposta) : await construirConteudo(prisma, propostaId);
  return { conteudo, status: p.status, opcaoAprovadaId: p.opcaoAprovadaId };
}

export async function gerarPdfDaProposta(conteudo: ConteudoProposta): Promise<Buffer> {
  const logo = await carregarLogo(conteudo.empresa.logoCaminho);
  return renderToBuffer(<PropostaPdf c={conteudo} logo={logo} />);
}

export async function gerarPdfDeProducao(conteudo: ConteudoProposta, opcaoId: string | null): Promise<Buffer> {
  return renderToBuffer(<ProducaoPdf c={conteudo} opcaoId={opcaoId} />);
}
