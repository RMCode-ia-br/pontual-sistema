"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { ErroNegocio, executar, falha, falhaDeValidacao, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { extrairIp } from "@/lib/auth/autenticar";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { processarImagemDeDesenho } from "@/lib/imagem/processar";
import { LIMITE_BYTES_IMAGEM, TIPOS_DE_IMAGEM_ACEITOS } from "@/lib/imagem/validar";
import { can } from "@/lib/permissoes";
import { baixarObjeto, criarUrlDeUpload, gravarObjeto, infoDoObjeto, removerObjeto } from "@/lib/storage";
import { campoIdObrigatorio } from "@/lib/validadores/campos";

import { definirDesenhoDoItem, removerDesenhoDoItem } from "../servico-desenho";

const itemSchema = z.object({ propostaId: campoIdObrigatorio("Proposta inválida."), itemId: campoIdObrigatorio("Item inválido.") });
const iniciarSchema = itemSchema.extend({ mime: z.string().min(1).max(100), tamanhoBytes: z.number().int().positive() });
const concluirSchema = itemSchema.extend({ caminho: z.string().min(1).max(300) });

export type DesenhoEnviado = { anexoId: string; larguraPx: number; alturaPx: number };

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function revalidar(propostaId: string, projetoId: string) {
  revalidatePath(`/propostas/${propostaId}`);
  revalidatePath(`/projetos/${projetoId}`);
}

/** Leitura (sem trava) só para recusar cedo: quem manda é a conferência dentro da transação, depois do travamento. */
async function itemDoRascunho(propostaId: string, itemId: string) {
  const item = await prisma.itemProposta.findFirst({
    where: { id: itemId, propostaId, deletadoEm: null, proposta: { deletadoEm: null, status: "RASCUNHO" } },
    select: { id: true },
  });
  if (!item) throw new ErroNegocio("Item não encontrado ou proposta já enviada. Só rascunho pode receber desenho.");
}

/**
 * Passo 1: confere o item e o rascunho, limita tipo e tamanho DECLARADOS e devolve a URL assinada para o navegador
 * enviar o original direto ao Storage (sem passar pela Server Action). O caminho é do sistema, nunca do usuário.
 */
export async function iniciarUploadDesenho(entrada: unknown): Promise<ResultadoAcao<{ url: string; caminho: string }>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "proposta")) return falha("Sem permissão.");
  const dados = iniciarSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error);
  const extensao = TIPOS_DE_IMAGEM_ACEITOS[dados.data.mime];
  if (!extensao) return falha("Só aceitamos imagens PNG ou JPG. No Word, copie o desenho e cole aqui, ou salve como imagem.");
  if (dados.data.tamanhoBytes > LIMITE_BYTES_IMAGEM) return falha(`A imagem passa de ${LIMITE_BYTES_IMAGEM / 1024 / 1024} MB. Reduza o desenho e tente de novo.`);

  return executar("propostas.desenho.iniciar", async () => {
    await itemDoRascunho(dados.data.propostaId, dados.data.itemId);
    const caminho = `ItemProposta/${dados.data.itemId}/${randomUUID()}-original.${extensao}`;
    const { url } = await criarUrlDeUpload(caminho);
    return sucesso({ url, caminho });
  });
}

/**
 * Passo 2: valida o original no Storage, processa no servidor (tipo pelos bytes, sRGB, redução, sem metadados), grava a
 * versão final, registra no item e apaga o original. O original nunca é referenciado por nada.
 */
export async function concluirUploadDesenho(entrada: unknown): Promise<ResultadoAcao<DesenhoEnviado>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "proposta")) return falha("Sem permissão.");
  const dados = concluirSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error);
  const { propostaId, itemId, caminho: caminhoOriginal } = dados.data;

  // O caminho tem que ser exatamente um dos gerados no passo 1 para ESTE item (o itemId do caminho é o do item editado).
  const padrao = new RegExp(`^ItemProposta/${escapar(itemId)}/[0-9a-f-]{36}-original\\.(png|jpg)$`);
  if (!padrao.test(caminhoOriginal)) return falha("Arquivo inválido.");

  return executar("propostas.desenho.concluir", async () => {
    let caminhoFinal: string | null = null;
    let gravado = false;
    try {
      await itemDoRascunho(propostaId, itemId);

      const info = await infoDoObjeto(caminhoOriginal);
      if (!info) throw new ErroNegocio("O envio da imagem não foi concluído. Tente de novo.");
      if (info.tamanhoBytes <= 0 || info.tamanhoBytes > LIMITE_BYTES_IMAGEM) throw new ErroNegocio(`A imagem passa de ${LIMITE_BYTES_IMAGEM / 1024 / 1024} MB. Reduza o desenho e tente de novo.`);
      if (!TIPOS_DE_IMAGEM_ACEITOS[info.mime]) throw new ErroNegocio("Só aceitamos imagens PNG ou JPG.");

      const original = await baixarObjeto(caminhoOriginal);
      if (original.length > LIMITE_BYTES_IMAGEM) throw new ErroNegocio(`A imagem passa de ${LIMITE_BYTES_IMAGEM / 1024 / 1024} MB. Reduza o desenho e tente de novo.`);
      const imagem = await processarImagemDeDesenho(original);

      caminhoFinal = `ItemProposta/${itemId}/${randomUUID()}.${imagem.formato}`;
      await gravarObjeto(caminhoFinal, imagem.bytes, imagem.mime);
      gravado = true;

      const ip = extrairIp(await headers());
      const r = await prisma.$transaction((tx) =>
        definirDesenhoDoItem(tx, {
          usuario: sessao,
          propostaId,
          itemId,
          ip,
          imagem: { caminho: caminhoFinal!, mime: imagem.mime, tamanhoBytes: imagem.bytes.length, sha256: imagem.sha256, larguraPx: imagem.larguraPx, alturaPx: imagem.alturaPx },
        }),
      );
      gravado = false; // a partir daqui o arquivo final é referenciado: nunca apagar
      revalidar(propostaId, r.projetoId);
      return sucesso({ anexoId: r.anexoId, larguraPx: imagem.larguraPx, alturaPx: imagem.alturaPx }, "Desenho personalizado salvo.");
    } finally {
      // O original nunca é usado; a versão final só é apagada se NÃO chegou a ser registrada (nenhuma linha aponta para ela).
      await removerObjeto(caminhoOriginal).catch(() => undefined);
      if (gravado && caminhoFinal) await removerObjeto(caminhoFinal).catch(() => undefined);
    }
  });
}

/** Volta ao desenho automático do item. */
export async function removerDesenhoDoItemAcao(entrada: unknown): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "proposta")) return falha("Sem permissão.");
  const dados = itemSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error);

  return executar("propostas.desenho.remover", async () => {
    const ip = extrairIp(await headers());
    const r = await prisma.$transaction((tx) => removerDesenhoDoItem(tx, { usuario: sessao, propostaId: dados.data.propostaId, itemId: dados.data.itemId, ip }));
    revalidar(dados.data.propostaId, r.projetoId);
    return sucesso(undefined, "Voltou ao desenho automático.");
  });
}
