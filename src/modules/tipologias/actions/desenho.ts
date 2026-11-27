"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { ErroNegocio, executar, falha, falhaDeValidacao, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { extrairIp } from "@/lib/auth/autenticar";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { lerTamanhoDoDesenho, TAMANHOS_DO_DESENHO, type TamanhoDoDesenho } from "@/lib/dominio/desenho-item";
import { caminhoDoOriginal, caminhoDoOriginalEhValido, concluirEnvioDeImagem } from "@/lib/imagem/envio";
import { LIMITE_BYTES_IMAGEM, TIPOS_DE_IMAGEM_ACEITOS } from "@/lib/imagem/validar";
import { can } from "@/lib/permissoes";
import { criarUrlDeDownload, criarUrlDeUpload } from "@/lib/storage";
import { campoIdObrigatorio } from "@/lib/validadores/campos";

import { TIPOS_DESENHO } from "../schemas";
import {
  definirDesenhoDaTipologia,
  marcarTipologiaComoRevisada,
  mudarTamanhoDoDesenhoDaTipologia,
  MENSAGEM_NOME_REPETIDO,
  removerDesenhoDaTipologia,
  salvarDesenhoComoNovaTipologia,
} from "../servico-desenho";

const PREFIXO = "Tipologia";

const tipologiaSchema = z.object({ tipologiaId: campoIdObrigatorio("Tipologia inválida.") });
const iniciarSchema = tipologiaSchema.extend({ mime: z.string().min(1).max(100), tamanhoBytes: z.number().int().positive() });
const concluirSchema = tipologiaSchema.extend({ caminho: z.string().min(1).max(300) });
const tamanhoSchema = tipologiaSchema.extend({ tamanho: z.enum(TAMANHOS_DO_DESENHO) });
const salvarComoSchema = z.object({
  itemId: campoIdObrigatorio("Item inválido."),
  nome: z.string().trim().min(1, "Informe o nome da tipologia.").max(120, "Nome muito longo."),
  tipoDesenho: z.enum(TIPOS_DESENHO, { message: "Escolha o tipo de desenho." }),
  templateDescricao: z.string().trim().min(5, "Escreva o modelo da descrição (pelo menos 5 letras).").max(1000, "Modelo muito longo."),
});

export type DesenhoDaTipologiaEnviado = { anexoId: string; larguraPx: number; alturaPx: number };

function revalidar(id: string) {
  revalidatePath("/tipologias");
  revalidatePath(`/tipologias/${id}`);
  revalidatePath("/propostas", "layout");
}

async function tipologiaViva(id: string) {
  const t = await prisma.tipologia.findFirst({ where: { id, deletadoEm: null }, select: { id: true } });
  if (!t) throw new ErroNegocio("Tipologia não encontrada.");
}

/** Passo 1 do envio: confere a tipologia, limita tipo e tamanho DECLARADOS e devolve a URL assinada do original. */
export async function iniciarUploadDesenhoDaTipologia(entrada: unknown): Promise<ResultadoAcao<{ url: string; caminho: string }>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "tipologia")) return falha("Sem permissão.");
  const dados = iniciarSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error);
  const extensao = TIPOS_DE_IMAGEM_ACEITOS[dados.data.mime];
  if (!extensao) return falha("Só aceitamos imagens PNG ou JPG. No Word, copie o desenho e cole aqui, ou salve como imagem.");
  if (dados.data.tamanhoBytes > LIMITE_BYTES_IMAGEM) return falha(`A imagem passa de ${LIMITE_BYTES_IMAGEM / 1024 / 1024} MB. Reduza o desenho e tente de novo.`);

  return executar("tipologias.desenho.iniciar", async () => {
    await tipologiaViva(dados.data.tipologiaId);
    const caminho = caminhoDoOriginal(PREFIXO, dados.data.tipologiaId, extensao);
    const { url } = await criarUrlDeUpload(caminho);
    return sucesso({ url, caminho });
  });
}

/** Passo 2: processa no servidor (mesmo processamento do item) e registra como o desenho da tipologia. */
export async function concluirUploadDesenhoDaTipologia(entrada: unknown): Promise<ResultadoAcao<DesenhoDaTipologiaEnviado>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "tipologia")) return falha("Sem permissão.");
  const dados = concluirSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error);
  const { tipologiaId, caminho: caminhoOriginal } = dados.data;
  if (!caminhoDoOriginalEhValido(PREFIXO, tipologiaId, caminhoOriginal)) return falha("Arquivo inválido.");

  return executar("tipologias.desenho.concluir", async () => {
    const ip = extrairIp(await headers());
    const r = await concluirEnvioDeImagem({
      prefixo: PREFIXO,
      id: tipologiaId,
      caminhoOriginal,
      conferirDono: () => tipologiaViva(tipologiaId),
      registrar: async (imagem) => {
        const feito = await prisma.$transaction((tx) => definirDesenhoDaTipologia(tx, { usuario: sessao, tipologiaId, imagem, ip }));
        return { ...feito, imagem };
      },
    });
    revalidar(tipologiaId);
    return sucesso({ anexoId: r.anexoId, larguraPx: r.imagem.larguraPx, alturaPx: r.imagem.alturaPx }, "Desenho da tipologia salvo.");
  });
}

export async function removerDesenhoDaTipologiaAcao(entrada: unknown): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "tipologia")) return falha("Sem permissão.");
  const dados = tipologiaSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error);
  return executar("tipologias.desenho.remover", async () => {
    const ip = extrairIp(await headers());
    await prisma.$transaction((tx) => removerDesenhoDaTipologia(tx, { usuario: sessao, tipologiaId: dados.data.tipologiaId, ip }));
    revalidar(dados.data.tipologiaId);
    return sucesso(undefined, "Voltou ao desenho automático.");
  });
}

export async function mudarTamanhoDoDesenhoDaTipologiaAcao(entrada: unknown): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "tipologia")) return falha("Sem permissão.");
  const dados = tamanhoSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error);
  return executar("tipologias.desenho.tamanho", async () => {
    const ip = extrairIp(await headers());
    await prisma.$transaction((tx) => mudarTamanhoDoDesenhoDaTipologia(tx, { usuario: sessao, tipologiaId: dados.data.tipologiaId, tamanho: dados.data.tamanho, ip }));
    revalidar(dados.data.tipologiaId);
    return sucesso(undefined, "Tamanho do desenho salvo.");
  });
}

export async function marcarTipologiaRevisadaAcao(entrada: unknown): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "tipologia")) return falha("Sem permissão.");
  const dados = tipologiaSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error);
  return executar("tipologias.revisada", async () => {
    const ip = extrairIp(await headers());
    await prisma.$transaction((tx) => marcarTipologiaComoRevisada(tx, { usuario: sessao, tipologiaId: dados.data.tipologiaId, ip }));
    revalidar(dados.data.tipologiaId);
    return sucesso(undefined, "Tipologia marcada como revisada.");
  });
}

/** "Salvar este desenho como nova tipologia" (a partir de um item com desenho personalizado). */
export async function salvarDesenhoComoTipologiaAcao(entrada: unknown): Promise<ResultadoAcao<{ tipologiaId: string }>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "criar", "tipologia")) return falha("Sem permissão.");
  const dados = salvarComoSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error);
  return executar(
    "tipologias.desenho.salvarComoNova",
    async () => {
      const ip = extrairIp(await headers());
      const r = await prisma.$transaction((tx) => salvarDesenhoComoNovaTipologia(tx, { usuario: sessao, ...dados.data, ip }));
      revalidatePath("/tipologias");
      return sucesso({ tipologiaId: r.tipologiaId }, r.jaExistia ? "Esta tipologia já tinha sido criada." : "Tipologia criada. Falta cadastrar a composição e os preços.");
    },
    MENSAGEM_NOME_REPETIDO,
  );
}

export type DesenhoDaTipologiaParaTela = { anexoId: string; larguraPx: number | null; alturaPx: number | null; url: string | null; tamanho: TamanhoDoDesenho } | null;

/**
 * Link da imagem de UMA tipologia, para o diálogo do item mostrar o desenho herdado quando a pessoa troca a tipologia
 * (o editor só assina as das tipologias já usadas pelos itens). Leitura; exige sessão. Sem desenho ou tipologia fora do ar: null.
 */
export async function desenhoDaTipologiaParaTelaAcao(entrada: unknown): Promise<ResultadoAcao<DesenhoDaTipologiaParaTela>> {
  await exigirSessao();
  const dados = tipologiaSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error);
  return executar("tipologias.desenho.paraTela", async () => {
    const t = await prisma.tipologia.findFirst({
      where: { id: dados.data.tipologiaId, deletadoEm: null },
      select: { desenhoConfig: true, desenhoAnexo: { select: { id: true, caminho: true, larguraPx: true, alturaPx: true } } },
    });
    if (!t?.desenhoAnexo) return sucesso(null);
    const url = await criarUrlDeDownload(t.desenhoAnexo.caminho, 1800).catch(() => null);
    return sucesso({ anexoId: t.desenhoAnexo.id, larguraPx: t.desenhoAnexo.larguraPx, alturaPx: t.desenhoAnexo.alturaPx, url, tamanho: lerTamanhoDoDesenho(t.desenhoConfig) });
  });
}
