"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { ErroNegocio, executar, falha, falhaDeValidacao, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { registrarAuditoria } from "@/lib/auditoria";
import { extrairIp } from "@/lib/auth/autenticar";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissoes";
import { criarUrlDeDownload, criarUrlDeUpload, infoDoObjeto, lerPrimeirosBytes, removerObjeto } from "@/lib/storage";
import { assinaturaConfere, ENTIDADES_COM_ANEXO, sanitizarNomeArquivo, validarArquivo } from "@/lib/storage/regras";

const entidadeSchema = z.object({
  entidadeTipo: z.enum(ENTIDADES_COM_ANEXO),
  entidadeId: z.string().min(1).max(64),
});

const arquivoSchema = entidadeSchema.extend({
  nome: z.string().min(1).max(300),
  mime: z.string().min(1).max(100),
  tamanhoBytes: z.number().int().positive(),
});

const concluirSchema = arquivoSchema.extend({
  caminho: z.string().min(1).max(300),
  categoria: z.string().trim().max(60).optional(),
});

/** Confirma que a entidade existe antes de aceitar anexo (nunca confiar em IDs vindos do cliente). */
async function entidadeExiste(tipo: (typeof ENTIDADES_COM_ANEXO)[number], id: string): Promise<boolean> {
  const filtro = { where: { id, deletadoEm: null }, select: { id: true } } as const;
  switch (tipo) {
    case "ConfiguracaoEmpresa":
      return id === "singleton";
    case "Tarefa":
      return !!(await prisma.tarefa.findFirst(filtro));
    case "Cliente":
      return !!(await prisma.cliente.findFirst(filtro));
    case "Fornecedor":
      return !!(await prisma.fornecedor.findFirst(filtro));
    case "Produto":
      return !!(await prisma.produto.findFirst(filtro));
    case "Funcionario":
      return !!(await prisma.funcionario.findFirst(filtro));
  }
}

export type UploadPreparado = { url: string; caminho: string };

/** Passo 1: valida e devolve uma URL assinada para o navegador enviar o arquivo direto ao Storage. */
export async function iniciarUploadAnexo(entrada: unknown): Promise<ResultadoAcao<UploadPreparado>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "criar", "anexo")) return falha("Sem permissão.");

  const dados = arquivoSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error);

  const validacao = validarArquivo(dados.data.mime, dados.data.tamanhoBytes);
  if (!validacao.valido) return falha(validacao.motivo);

  return executar("anexos.iniciar", async () => {
    if (!(await entidadeExiste(dados.data.entidadeTipo, dados.data.entidadeId))) {
      throw new ErroNegocio("O item ao qual o arquivo pertence não foi encontrado.");
    }
    const caminho = `${dados.data.entidadeTipo}/${dados.data.entidadeId}/${randomUUID()}.${validacao.extensao}`;
    const { url } = await criarUrlDeUpload(caminho);
    return sucesso({ url, caminho });
  });
}

/** Passo 2: depois do upload, confere o objeto no Storage e registra o anexo no banco. */
export async function concluirUploadAnexo(entrada: unknown): Promise<ResultadoAcao<{ id: string }>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "criar", "anexo")) return falha("Sem permissão.");

  const dados = concluirSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error);
  const { entidadeTipo, entidadeId, caminho, nome, categoria } = dados.data;

  return executar("anexos.concluir", async () => {
    // O caminho tem que ser exatamente um dos gerados no passo 1 para ESTA entidade.
    const padrao = new RegExp(`^${entidadeTipo}/${entidadeId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/[0-9a-f-]{36}\\.[a-z]{3,4}$`);
    if (!padrao.test(caminho)) throw new ErroNegocio("Arquivo inválido.");
    if (!(await entidadeExiste(entidadeTipo, entidadeId))) throw new ErroNegocio("O item ao qual o arquivo pertence não foi encontrado.");

    const info = await infoDoObjeto(caminho);
    if (!info) throw new ErroNegocio("O envio do arquivo não foi concluído. Tente de novo.");

    // Vale o tamanho/tipo reais do objeto, não o declarado pelo navegador.
    const validacao = validarArquivo(info.mime, info.tamanhoBytes);
    if (!validacao.valido) {
      await removerObjeto(caminho);
      throw new ErroNegocio(validacao.motivo);
    }

    // O tipo declarado vem do navegador: confere os primeiros bytes reais antes de aceitar.
    if (!assinaturaConfere(info.mime, await lerPrimeirosBytes(caminho))) {
      await removerObjeto(caminho);
      throw new ErroNegocio("O conteúdo do arquivo não corresponde ao tipo informado. Envie o arquivo original.");
    }

    const ip = extrairIp(await headers());
    const anexo = await prisma.$transaction(async (tx) => {
      const criado = await tx.anexo.create({
        data: {
          entidadeTipo,
          entidadeId,
          categoria: categoria || null,
          nome: sanitizarNomeArquivo(nome),
          caminho,
          mime: info.mime,
          tamanhoBytes: info.tamanhoBytes,
          criadoPorId: sessao.id,
          atualizadoPorId: sessao.id,
        },
        select: { id: true, entidadeTipo: true, entidadeId: true, nome: true, categoria: true, mime: true, tamanhoBytes: true },
      });
      await registrarAuditoria(tx, { usuario: sessao, entidade: "Anexo", entidadeId: criado.id, acao: "CRIAR", depois: criado, ip });
      return criado;
    });

    revalidatePath("/", "layout");
    return sucesso({ id: anexo.id });
  });
}

/** Link de download com validade de 60 s (bucket privado). */
export async function urlDeDownloadAnexo(idBruto: string): Promise<ResultadoAcao<{ url: string }>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "ver", "anexo")) return falha("Sem permissão.");

  const id = z.string().min(1).max(64).safeParse(idBruto);
  if (!id.success) return falha("Arquivo inválido.");

  return executar("anexos.download", async () => {
    const anexo = await prisma.anexo.findFirst({ where: { id: id.data, deletadoEm: null }, select: { caminho: true, nome: true } });
    if (!anexo) throw new ErroNegocio("Arquivo não encontrado.");
    return sucesso({ url: await criarUrlDeDownload(anexo.caminho, 60, anexo.nome) });
  });
}

/** Exclusão lógica: o registro some das telas, mas o arquivo e o histórico são preservados. */
export async function excluirAnexo(idBruto: string): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "excluir", "anexo")) return falha("Sem permissão.");

  const id = z.string().min(1).max(64).safeParse(idBruto);
  if (!id.success) return falha("Arquivo inválido.");

  return executar("anexos.excluir", async () => {
    const ip = extrairIp(await headers());
    await prisma.$transaction(async (tx) => {
      const antes = await tx.anexo.findFirst({
        where: { id: id.data, deletadoEm: null },
        select: { id: true, nome: true, entidadeTipo: true, entidadeId: true },
      });
      if (!antes) throw new ErroNegocio("Arquivo não encontrado.");
      await tx.anexo.update({ where: { id: antes.id }, data: { deletadoEm: new Date(), atualizadoPorId: sessao.id } });
      await registrarAuditoria(tx, { usuario: sessao, entidade: "Anexo", entidadeId: antes.id, acao: "EXCLUIR", antes, ip });
    });
    revalidatePath("/", "layout");
    return sucesso(undefined, "Arquivo removido.");
  });
}
