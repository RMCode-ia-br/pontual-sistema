import "server-only";

import { createHash } from "node:crypto";

import { renderToBuffer } from "@react-pdf/renderer";

import { prisma } from "@/lib/db";
import { criarUrlDeDownload, criarUrlsDeDownload } from "@/lib/storage";

import type { ConteudoProposta } from "../conteudo";
import { construirConteudo } from "../servico-ciclo";
import { CAIXAS_ATUAIS, ErroDesenhoIndisponivel, type CaixasDoDesenho, type ImagemCarregada, type ImagensDoDesenho } from "./imagens";
import { formatoDaImagem } from "./logo";
import { ProducaoPdf } from "./producao-pdf";
import { PropostaPdf, type LogoPdf } from "./proposta-pdf";

/** O react-pdf lê PNG e JPEG (WebP não): outro formato simplesmente fica sem logo no PDF. */
export async function carregarLogo(caminho: string | null): Promise<LogoPdf> {
  if (!caminho) return null;
  try {
    const url = await criarUrlDeDownload(caminho, 120);
    const resposta = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resposta.ok) return null;
    const data = Buffer.from(await resposta.arrayBuffer());
    const format = formatoDaImagem(data); // pelos bytes: a extensão do arquivo pode mentir
    return format ? { data, format } : null;
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

const TENTATIVAS_DA_IMAGEM = 2;
const ESPERA_MAXIMA_DA_IMAGEM_MS = 10_000;
const DOWNLOADS_AO_MESMO_TEMPO = 6;

type ReferenciaDaImagem = NonNullable<ConteudoProposta["opcoes"][number]["secoes"][number]["itens"][number]["desenhoImagem"]>;

/**
 * Baixa as imagens de desenho citadas no CONTEÚDO (o snapshot da proposta enviada: caminho e hash congelados, nunca a
 * referência atual do item). Cada arquivo é baixado uma vez (mesmo hash = mesma imagem) e conferido: o SHA-256 dos bytes
 * tem que ser o do snapshot e o formato, PNG ou JPG. Qualquer falha lança `ErroDesenhoIndisponivel` com o número do
 * primeiro item afetado: o PDF nunca sai com o desenho automático no lugar de uma imagem que existe.
 */
export async function carregarImagensDoDesenho(conteudo: ConteudoProposta, opcaoId: string | null = null): Promise<ImagensDoDesenho> {
  const unicas = new Map<string, { referencia: ReferenciaDaImagem; numero: number }>();
  for (const o of conteudo.opcoes.filter((x) => !opcaoId || x.id === opcaoId)) {
    for (const s of o.secoes) {
      for (const i of s.itens) if (i.desenhoImagem && !unicas.has(i.desenhoImagem.sha256)) unicas.set(i.desenhoImagem.sha256, { referencia: i.desenhoImagem, numero: i.numero });
    }
  }
  if (unicas.size === 0) return {};

  const lista = [...unicas.values()];
  let links: Map<string, string>;
  try {
    links = await criarUrlsDeDownload(
      lista.map((u) => u.referencia.caminho),
      300,
    );
  } catch {
    throw new ErroDesenhoIndisponivel(Math.min(...lista.map((u) => u.numero)));
  }

  async function baixar(u: (typeof lista)[number]): Promise<ImagemCarregada> {
    const url = links.get(u.referencia.caminho);
    if (!url) throw new ErroDesenhoIndisponivel(u.numero); // o arquivo sumiu do Storage
    for (let tentativa = 1; tentativa <= TENTATIVAS_DA_IMAGEM; tentativa++) {
      try {
        const resposta = await fetch(url, { signal: AbortSignal.timeout(ESPERA_MAXIMA_DA_IMAGEM_MS), cache: "no-store" });
        if (!resposta.ok) continue;
        const data = Buffer.from(await resposta.arrayBuffer());
        const format = formatoDaImagem(data);
        if (!format || createHash("sha256").update(data).digest("hex") !== u.referencia.sha256) break; // mexeram no arquivo: repetir não adianta
        return { data, format };
      } catch {
        // tempo esgotado ou rede: tenta de novo
      }
    }
    throw new ErroDesenhoIndisponivel(u.numero);
  }

  // No máximo alguns downloads ao mesmo tempo; guarda o resultado de cada um para avisar o item de MENOR número que falhou.
  const carregadas: (ImagemCarregada | null)[] = new Array(lista.length).fill(null);
  const falhas: number[] = [];
  let proximo = 0;
  await Promise.all(
    Array.from({ length: Math.min(DOWNLOADS_AO_MESMO_TEMPO, lista.length) }, async () => {
      while (proximo < lista.length) {
        const indice = proximo++;
        try {
          carregadas[indice] = await baixar(lista[indice]);
        } catch {
          falhas.push(lista[indice].numero);
        }
      }
    }),
  );
  if (falhas.length > 0) throw new ErroDesenhoIndisponivel(Math.min(...falhas));
  return Object.fromEntries(lista.map((u, k) => [u.referencia.sha256, carregadas[k] as ImagemCarregada]));
}

export async function gerarPdfDaProposta(conteudo: ConteudoProposta, aviso: string | null = null, opcoes: { caixas?: CaixasDoDesenho } = {}): Promise<Buffer> {
  const [logo, imagens] = await Promise.all([carregarLogo(conteudo.empresa.logoCaminho), carregarImagensDoDesenho(conteudo)]);
  return renderToBuffer(<PropostaPdf c={conteudo} logo={logo} aviso={aviso} imagens={imagens} caixas={opcoes.caixas ?? CAIXAS_ATUAIS} />);
}

export async function gerarPdfDeProducao(conteudo: ConteudoProposta, opcaoId: string | null, opcoes: { caixas?: CaixasDoDesenho } = {}): Promise<Buffer> {
  const [logo, imagens] = await Promise.all([carregarLogo(conteudo.empresa.logoCaminho), carregarImagensDoDesenho(conteudo, opcaoId)]);
  return renderToBuffer(<ProducaoPdf c={conteudo} logo={logo} opcaoId={opcaoId} imagens={imagens} caixas={opcoes.caixas ?? CAIXAS_ATUAIS} />);
}
