"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { ErroNegocio, executar, falha, falhaDeValidacao, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { extrairIp } from "@/lib/auth/autenticar";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { caminhoDoOriginal, caminhoDoOriginalEhValido, concluirEnvioDeImagem } from "@/lib/imagem/envio";
import { LIMITE_BYTES_IMAGEM, TIPOS_DE_IMAGEM_ACEITOS } from "@/lib/imagem/validar";
import { can } from "@/lib/permissoes";
import { criarUrlDeUpload } from "@/lib/storage";
import { campoIdObrigatorio } from "@/lib/validadores/campos";

import { definirDesenhoDoItem, removerDesenhoDoItem } from "../servico-desenho";

const itemSchema = z.object({ propostaId: campoIdObrigatorio("Proposta inválida."), itemId: campoIdObrigatorio("Item inválido.") });
const iniciarSchema = itemSchema.extend({ mime: z.string().min(1).max(100), tamanhoBytes: z.number().int().positive() });
const concluirSchema = itemSchema.extend({ caminho: z.string().min(1).max(300) });

export type DesenhoEnviado = { anexoId: string; larguraPx: number; alturaPx: number };

const PREFIXO = "ItemProposta";

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
    const caminho = caminhoDoOriginal(PREFIXO, dados.data.itemId, extensao);
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
  if (!caminhoDoOriginalEhValido(PREFIXO, itemId, caminhoOriginal)) return falha("Arquivo inválido.");

  return executar("propostas.desenho.concluir", async () => {
    const ip = extrairIp(await headers());
    const r = await concluirEnvioDeImagem({
      prefixo: PREFIXO,
      id: itemId,
      caminhoOriginal,
      conferirDono: () => itemDoRascunho(propostaId, itemId),
      registrar: async (imagem) => {
        const feito = await prisma.$transaction((tx) => definirDesenhoDoItem(tx, { usuario: sessao, propostaId, itemId, ip, imagem }));
        return { ...feito, imagem };
      },
    });
    revalidar(propostaId, r.projetoId);
    return sucesso({ anexoId: r.anexoId, larguraPx: r.imagem.larguraPx, alturaPx: r.imagem.alturaPx }, "Desenho personalizado salvo.");
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
