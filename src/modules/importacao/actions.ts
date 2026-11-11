"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { executar, falha, falhaDeValidacao, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { extrairIp } from "@/lib/auth/autenticar";
import { exigirSessao } from "@/lib/auth/sessao";
import { LIMITES_PLANILHA } from "@/lib/csv/ler";
import { can } from "@/lib/permissoes";
import { campoIdObrigatorio } from "@/lib/validadores/campos";

import { aplicarImportacao, reverterLote, type ResultadoDaImportacao, type ResultadoDaReversao } from "./aplicar";
import { analisarImportacao, camposObrigatoriosSemColuna, type PedidoDeImportacao, type StatusDaLinha } from "./analisar";
import { CAMPOS_POR_TIPO, PERMITE_ATUALIZAR, TIPOS_DE_IMPORTACAO, type TipoDeImportacao } from "./campos";

const pedidoSchema = z.object({
  tipo: z.enum(TIPOS_DE_IMPORTACAO, { message: "Escolha o que está importando." }),
  nomeArquivo: z.string().trim().min(1, "Arquivo sem nome.").max(200),
  /** campo → índice da coluna (ou null). Conferido contra os campos do tipo mais abaixo. */
  mapeamento: z.record(z.string().max(40), z.number().int().min(0).max(LIMITES_PLANILHA.colunas - 1).nullable()),
  linhas: z
    .array(z.array(z.string().max(LIMITES_PLANILHA.caracteresPorCelula)).max(LIMITES_PLANILHA.colunas))
    .min(1, "A planilha não tem linhas de dados.")
    .max(LIMITES_PLANILHA.linhas, `A planilha passa de ${LIMITES_PLANILHA.linhas} linhas.`),
  modo: z.enum(["IGNORAR", "ATUALIZAR"]),
});

const confirmacaoSchema = pedidoSchema.extend({ importarValidas: z.boolean() });

type PedidoLido = z.infer<typeof pedidoSchema>;

/** Mapeamento só pode citar campos que existem no tipo; e só produtos aceitam "atualizar". */
function prepararPedido(lido: PedidoLido): { pedido: PedidoDeImportacao } | { erro: string } {
  const validos = new Set(CAMPOS_POR_TIPO[lido.tipo].map((c) => c.chave));
  const mapeamento: Record<string, number | null> = {};
  for (const [campo, indice] of Object.entries(lido.mapeamento)) {
    if (!validos.has(campo)) return { erro: "Mapeamento de colunas inválido." };
    mapeamento[campo] = indice;
  }
  const faltando = camposObrigatoriosSemColuna(lido.tipo, mapeamento);
  if (faltando.length > 0) return { erro: `Escolha a coluna de: ${faltando.join(", ")}.` };
  return {
    pedido: {
      tipo: lido.tipo,
      nomeArquivo: lido.nomeArquivo,
      mapeamento,
      linhas: lido.linhas,
      modo: PERMITE_ATUALIZAR[lido.tipo] ? lido.modo : "IGNORAR",
    },
  };
}

export type LinhaDaPrevia = { numero: number; status: StatusDaLinha; resumo: string; detalhe: string[] };

export type PreviaDaImportacao = {
  tipo: TipoDeImportacao;
  totais: { total: number; novas: number; atualizacoes: number; duplicadas: number; erros: number };
  /** Problemas e repetições (primeiro), seguidos de uma amostra das linhas novas. */
  linhas: LinhaDaPrevia[];
  /** Quantas linhas ficaram de fora da lista da tela (os totais valem para todas). */
  omitidas: number;
};

const MAX_LINHAS_NA_TELA = 300;
const AMOSTRA_DE_NOVAS = 15;

/** Passo 3: valida a planilha inteira e mostra o que cada linha viraria. Não grava nada. */
export async function analisarPlanilha(entrada: unknown): Promise<ResultadoAcao<PreviaDaImportacao>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "criar", "importacao")) return falha("Sem permissão.");
  const lido = pedidoSchema.safeParse(entrada);
  if (!lido.success) return falhaDeValidacao(lido.error);
  const preparado = prepararPedido(lido.data);
  if ("erro" in preparado) return falha(preparado.erro);

  return executar("importacao.analisar", async () => {
    const analise = await analisarImportacao(preparado.pedido);
    const paraTela = ({ numero, status, resumo, detalhe }: LinhaDaPrevia): LinhaDaPrevia => ({ numero, status, resumo, detalhe });
    const relevantes = analise.linhas.filter((l) => l.status !== "NOVA").map(paraTela);
    const novas = analise.linhas.filter((l) => l.status === "NOVA").slice(0, AMOSTRA_DE_NOVAS).map(paraTela);
    const todas = [...relevantes.slice(0, MAX_LINHAS_NA_TELA), ...novas];
    return sucesso({ tipo: analise.tipo, totais: analise.totais, linhas: todas, omitidas: analise.totais.total - todas.length });
  });
}

/** Passo 4: confirma. O servidor recalcula tudo; se houver erros, só segue com a escolha explícita de importar as válidas. */
export async function confirmarImportacao(entrada: unknown): Promise<ResultadoAcao<ResultadoDaImportacao>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "criar", "importacao")) return falha("Sem permissão.");
  const lido = confirmacaoSchema.safeParse(entrada);
  if (!lido.success) return falhaDeValidacao(lido.error);
  const { importarValidas, ...resto } = lido.data;
  const preparado = prepararPedido(resto);
  if ("erro" in preparado) return falha(preparado.erro);

  return executar(
    "importacao.confirmar",
    async () => {
      const ip = extrairIp(await headers());
      const r = await aplicarImportacao({ usuario: { id: sessao.id, nome: sessao.nome }, pedido: preparado.pedido, importarValidas, ip });
      for (const caminho of ["/clientes", "/parceiros", "/fornecedores", "/produtos", "/configuracoes/importacao"]) revalidatePath(caminho);
      revalidatePath("/", "layout");
      const partes = [`${r.criados} ${r.criados === 1 ? "criado" : "criados"}`];
      if (r.atualizados > 0) partes.push(`${r.atualizados} ${r.atualizados === 1 ? "atualizado" : "atualizados"}`);
      if (r.ignorados > 0) partes.push(`${r.ignorados} ${r.ignorados === 1 ? "ignorado" : "ignorados"}`);
      return sucesso(r, `Importação concluída: ${partes.join(", ")}.`);
    },
    "Alguma linha repete um cadastro que acabou de ser criado. Analise a planilha de novo.",
  );
}

/** Desfaz um lote: o que foi criado vai para a lixeira e o que foi atualizado volta ao valor anterior (se ninguém mexeu depois). */
export async function desfazerImportacao(loteId: string): Promise<ResultadoAcao<ResultadoDaReversao>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "excluir", "importacao")) return falha("Sem permissão.");
  const id = campoIdObrigatorio("Importação inválida.").safeParse(loteId);
  if (!id.success) return falha("Importação inválida.");

  return executar("importacao.desfazer", async () => {
    const ip = extrairIp(await headers());
    const r = await reverterLote({ usuario: { id: sessao.id, nome: sessao.nome }, loteId: id.data, ip });
    for (const caminho of ["/clientes", "/parceiros", "/fornecedores", "/produtos", "/configuracoes/importacao"]) revalidatePath(caminho);
    revalidatePath("/", "layout");
    const partes = [`${r.removidos} ${r.removidos === 1 ? "registro enviado" : "registros enviados"} para a lixeira`];
    if (r.restaurados > 0) partes.push(`${r.restaurados} ${r.restaurados === 1 ? "restaurado" : "restaurados"} ao valor anterior`);
    if (r.naoRemovidos > 0) partes.push(`${r.naoRemovidos} ${r.naoRemovidos === 1 ? "ficou" : "ficaram"} porque já foram alterados ou usados depois`);
    if (r.naoRestaurados > 0) partes.push(`${r.naoRestaurados} não restaurados porque já foram alterados depois`);
    return sucesso(r, `Importação desfeita: ${partes.join("; ")}.`);
  });
}
