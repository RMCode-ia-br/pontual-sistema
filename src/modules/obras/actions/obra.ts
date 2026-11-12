"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import type { Prisma } from "@/generated/prisma/client";
import { executar, falha, falhaDeValidacao, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { extrairIp } from "@/lib/auth/autenticar";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import type { SugestaoDeData } from "@/lib/dominio/prazo-obra";
import { dataLocalDoInstante } from "@/lib/formatadores";
import { can } from "@/lib/permissoes";

import {
  abrirPausaSchema,
  aplicarDatasSchema,
  ajustarPausaSchema,
  editarEtapaSchema,
  encerrarPausaSchema,
  mudarEtapaSchema,
  pausaIdSchema,
  prazoDaObraSchema,
  projetoIdSchema,
} from "../schemas";
import {
  abrirPausa,
  aplicarDatasSugeridas,
  ajustarPausa,
  definirPrazoDaObra,
  editarEtapa,
  encerrarPausa,
  excluirPausa,
  gerarEtapasDeProjetoAprovado,
  marcarFachadaAprovada,
  mudarStatusDaEtapa,
  sugerirDatasDaObra,
  type ResultadoDaMudancaDeEtapa,
} from "../servico-execucao";

type Tx = Prisma.TransactionClient;

function revalidar() {
  revalidatePath("/obras", "layout");
  revalidatePath("/projetos", "layout");
  revalidatePath("/tarefas");
  revalidatePath("/");
}

/** Roda a mutação numa transação (serviço + auditoria juntos) e traduz erros de negócio em mensagem. */
async function rodar<T>(nome: string, fn: (tx: Tx, ip: string | null) => Promise<{ dados: T; mensagem: string }>): Promise<ResultadoAcao<T>> {
  return executar(nome, async () => {
    const ip = extrairIp(await headers());
    const r = await prisma.$transaction((tx) => fn(tx, ip), { timeout: 30_000 });
    revalidar();
    return sucesso(r.dados, r.mensagem);
  });
}

const MENSAGEM_DO_ESTADO = {
  PENDENTE: "Etapa voltou para pendente.",
  EM_ANDAMENTO: "Etapa em andamento.",
  CONCLUIDA: "Etapa concluída.",
  BLOQUEADA: "Etapa bloqueada.",
  DISPENSADA: "Etapa dispensada.",
} as const;

/** Iniciar, concluir, bloquear, desbloquear, dispensar, reabrir ou reativar uma etapa (R7). */
export async function mudarEtapa(entrada: unknown): Promise<ResultadoAcao<ResultadoDaMudancaDeEtapa>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "obra")) return falha("Sem permissão.");
  const lido = mudarEtapaSchema.safeParse(entrada);
  if (!lido.success) return falhaDeValidacao(lido.error);
  const v = lido.data;
  return rodar("obras.mudar_etapa", async (tx, ip) => {
    const r = await mudarStatusDaEtapa(tx, { ...v, usuario: sessao, ip });
    const partes = [
      MENSAGEM_DO_ESTADO[v.para],
      r.parcelasLiberadas > 0 ? `${r.parcelasLiberadas} parcela(s) liberada(s) para cobrança.` : null,
      r.parcelasRevertidas > 0 ? `${r.parcelasRevertidas} parcela(s) voltaram a aguardar a etapa.` : null,
      r.statusDoProjeto === "CONCLUIDO" ? "Obra concluída." : null,
    ].filter(Boolean);
    return { dados: r, mensagem: partes.join(" ") };
  });
}

export async function editarEtapaDaObra(entrada: unknown): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "obra")) return falha("Sem permissão.");
  const lido = editarEtapaSchema.safeParse(entrada);
  if (!lido.success) return falhaDeValidacao(lido.error);
  return rodar("obras.editar_etapa", async (tx, ip) => {
    await editarEtapa(tx, { ...lido.data, usuario: sessao, ip });
    return { dados: undefined, mensagem: "Etapa atualizada." };
  });
}

/** Calcula (sem gravar) as datas que o sistema propõe para as etapas abertas. */
export async function sugerirDatas(entrada: unknown): Promise<ResultadoAcao<{ base: string; itens: SugestaoDeData[] }>> {
  await exigirSessao();
  const lido = projetoIdSchema.safeParse(entrada);
  if (!lido.success) return falhaDeValidacao(lido.error);
  const r = await sugerirDatasDaObra(prisma, lido.data.projetoId, dataLocalDoInstante(new Date()));
  if ("erro" in r) return falha(r.erro);
  return sucesso(r);
}

export async function aplicarDatas(entrada: unknown): Promise<ResultadoAcao<{ aplicadas: number }>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "obra")) return falha("Sem permissão.");
  const lido = aplicarDatasSchema.safeParse(entrada);
  if (!lido.success) return falhaDeValidacao(lido.error);
  return rodar("obras.aplicar_datas", async (tx, ip) => {
    const aplicadas = await aplicarDatasSugeridas(tx, { ...lido.data, usuario: sessao, ip });
    return { dados: { aplicadas }, mensagem: aplicadas > 0 ? `Datas de ${aplicadas} etapa(s) atualizadas.` : "Nenhuma data precisou mudar." };
  });
}

export async function definirPrazo(entrada: unknown): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "obra")) return falha("Sem permissão.");
  const lido = prazoDaObraSchema.safeParse(entrada);
  if (!lido.success) return falhaDeValidacao(lido.error);
  return rodar("obras.definir_prazo", async (tx, ip) => {
    await definirPrazoDaObra(tx, { ...lido.data, usuario: sessao, ip });
    return { dados: undefined, mensagem: lido.data.modo === "NENHUM" ? "Prazo da obra removido." : "Prazo da obra salvo." };
  });
}

export async function pausarObra(entrada: unknown): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "obra")) return falha("Sem permissão.");
  const lido = abrirPausaSchema.safeParse(entrada);
  if (!lido.success) return falhaDeValidacao(lido.error);
  return rodar("obras.pausar", async (tx, ip) => {
    const p = await abrirPausa(tx, { ...lido.data, usuario: sessao, ip });
    return { dados: undefined, mensagem: p.justificada ? "Obra pausada. A pausa é justificada e estende o prazo prometido." : "Obra pausada. O prazo prometido não muda com este motivo." };
  });
}

export async function encerrarPausaDaObra(entrada: unknown): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "obra")) return falha("Sem permissão.");
  const lido = encerrarPausaSchema.safeParse(entrada);
  if (!lido.success) return falhaDeValidacao(lido.error);
  return rodar("obras.encerrar_pausa", async (tx, ip) => {
    await encerrarPausa(tx, { ...lido.data, usuario: sessao, ip });
    return { dados: undefined, mensagem: "Pausa encerrada." };
  });
}

export async function ajustarPausaDaObra(entrada: unknown): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "obra")) return falha("Sem permissão.");
  const lido = ajustarPausaSchema.safeParse(entrada);
  if (!lido.success) return falhaDeValidacao(lido.error);
  return rodar("obras.ajustar_pausa", async (tx, ip) => {
    await ajustarPausa(tx, { ...lido.data, usuario: sessao, ip });
    return { dados: undefined, mensagem: "Pausa atualizada." };
  });
}

export async function excluirPausaDaObra(entrada: unknown): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "excluir", "obra")) return falha("Sem permissão.");
  const lido = pausaIdSchema.safeParse(entrada);
  if (!lido.success) return falhaDeValidacao(lido.error);
  return rodar("obras.excluir_pausa", async (tx, ip) => {
    await excluirPausa(tx, { ...lido.data, usuario: sessao, ip });
    return { dados: undefined, mensagem: "Pausa removida do registro." };
  });
}

export async function aprovarFachadaDoCondominio(entrada: unknown): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "obra")) return falha("Sem permissão.");
  const lido = projetoIdSchema.safeParse(entrada);
  if (!lido.success) return falhaDeValidacao(lido.error);
  return rodar("obras.fachada_aprovada", async (tx, ip) => {
    await marcarFachadaAprovada(tx, { ...lido.data, usuario: sessao, ip });
    return { dados: undefined, mensagem: "Aprovação do condomínio registrada." };
  });
}

/** Para obras aprovadas antes de existir o modelo de etapas. */
export async function gerarEtapas(entrada: unknown): Promise<ResultadoAcao<{ criadas: number }>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "criar", "obra")) return falha("Sem permissão.");
  const lido = projetoIdSchema.safeParse(entrada);
  if (!lido.success) return falhaDeValidacao(lido.error);
  return rodar("obras.gerar_etapas", async (tx, ip) => {
    const criadas = await gerarEtapasDeProjetoAprovado(tx, { ...lido.data, usuario: sessao, ip });
    return { dados: { criadas }, mensagem: `${criadas} etapas da obra geradas.` };
  });
}
