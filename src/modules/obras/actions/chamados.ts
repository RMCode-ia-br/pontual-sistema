"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { executar, falha, falhaDeValidacao, formDataParaObjeto, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { extrairIp } from "@/lib/auth/autenticar";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { STATUS_DE_CHAMADO, TIPOS_DE_PROBLEMA } from "@/lib/dominio/chamados";
import { dataLocalDoInstante, parseMoedaParaCentavos } from "@/lib/formatadores";
import { can } from "@/lib/permissoes";
import { campoIdObrigatorio, campoIdOpcional } from "@/lib/validadores/campos";

import { abrirChamado, ajustarChamado, avaliarGarantia, gerarCobrancaDoChamado, mudarStatusDoChamado } from "../servico-chamados";

const idSchema = campoIdObrigatorio();

const novoSchema = z.object({
  clienteId: campoIdObrigatorio("Escolha o cliente."),
  projetoId: campoIdOpcional,
  tipoProblema: z.enum(TIPOS_DE_PROBLEMA, { message: "Escolha o tipo do problema." }),
  descricao: z.string().trim().min(3, "Descreva o problema em poucas palavras.").max(2000, "Use no máximo 2.000 caracteres."),
});

function revalidar() {
  revalidatePath("/obras", "layout");
  revalidatePath("/clientes", "layout");
  revalidatePath("/agenda");
  revalidatePath("/");
}

/** Abre o chamado (formulário). A classificação é calculada pelo servidor, nunca pelo navegador. */
export async function criarChamado(_anterior: ResultadoAcao<{ id: string }> | null, formData: FormData): Promise<ResultadoAcao<{ id: string }>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "criar", "chamado")) return falha("Sem permissão.");
  const lido = novoSchema.safeParse(formDataParaObjeto(formData));
  if (!lido.success) return falhaDeValidacao(lido.error);
  return executar("chamados.criar", async () => {
    const ip = extrairIp(await headers());
    const r = await prisma.$transaction((tx) => abrirChamado(tx, { ...lido.data, projetoId: lido.data.projetoId ?? null, usuario: sessao, ip }), { timeout: 30_000 });
    revalidar();
    return sucesso({ id: r.id }, `Chamado aberto: ${r.classificacao === "EM_GARANTIA" ? "em garantia" : "fora da garantia"}.`);
  });
}

/** Obras do cliente que aceitam chamado (já aprovadas), para o seletor do formulário. */
export async function listarObrasDoClienteParaChamado(clienteIdBruto: string): Promise<ResultadoAcao<{ id: string; rotulo: string }[]>> {
  await exigirSessao();
  const lido = campoIdObrigatorio().safeParse(clienteIdBruto);
  if (!lido.success) return falha("Cliente inválido.");
  const obras = await prisma.projeto.findMany({
    where: { clienteId: lido.data, deletadoEm: null, status: { in: ["APROVADO", "EM_EXECUCAO", "CONCLUIDO"] } },
    orderBy: { criadoEm: "desc" },
    take: 100,
    select: { id: true, codigo: true, titulo: true },
  });
  return sucesso(obras.map((o) => ({ id: o.id, rotulo: `${o.codigo} · ${o.titulo}` })));
}

const previaSchema =z.object({ projetoId: campoIdOpcional, tipoProblema: z.enum(TIPOS_DE_PROBLEMA) });

/** Prévia da classificação enquanto o formulário é preenchido (não grava nada). */
export async function preverClassificacao(entrada: unknown): Promise<ResultadoAcao<{ classificacao: "EM_GARANTIA" | "FORA_DA_GARANTIA"; motivo: string }>> {
  await exigirSessao();
  const lido = previaSchema.safeParse(entrada);
  if (!lido.success) return falhaDeValidacao(lido.error);
  const r = await avaliarGarantia(prisma, { projetoId: lido.data.projetoId ?? null, tipoProblema: lido.data.tipoProblema, abertoEm: dataLocalDoInstante(new Date()) });
  return sucesso({ classificacao: r.classificacao, motivo: r.motivo });
}

const ajusteSchema = z.object({
  id: idSchema,
  classificacao: z.enum(["EM_GARANTIA", "FORA_DA_GARANTIA"]).optional(),
  cobrarVisita: z.boolean().optional(),
  /** Valor digitado em reais ("150", "150,00"); vazio limpa. */
  valorCobrado: z.string().trim().max(20).optional(),
  descricao: z.string().trim().max(2000).optional(),
});

/** Sobrescreve a classificação, decide a cobrança, registra o valor ou corrige a descrição. */
export async function ajustarChamadoAcao(entrada: unknown): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "chamado")) return falha("Sem permissão.");
  const lido = ajusteSchema.safeParse(entrada);
  if (!lido.success) return falhaDeValidacao(lido.error);
  const { valorCobrado, ...resto } = lido.data;
  let valorCobradoCentavos: number | null | undefined;
  if (valorCobrado !== undefined) {
    if (valorCobrado === "") valorCobradoCentavos = null;
    else {
      const centavos = parseMoedaParaCentavos(valorCobrado);
      if (centavos === null) return falha("Informe um valor válido, como 150 ou 150,00.", { valorCobradoCentavos: "Informe um valor válido, como 150,00." });
      valorCobradoCentavos = centavos;
    }
  }
  return executar("chamados.ajustar", async () => {
    const ip = extrairIp(await headers());
    await prisma.$transaction((tx) => ajustarChamado(tx, { ...resto, ...(valorCobradoCentavos === undefined ? {} : { valorCobradoCentavos }), usuario: sessao, ip }));
    revalidar();
    return sucesso(undefined, "Chamado atualizado.");
  });
}

const situacaoSchema = z.object({ id: idSchema, para: z.enum(STATUS_DE_CHAMADO, { message: "Situação inválida." }), solucao: z.string().trim().max(2000).optional() });

export async function mudarSituacaoDoChamado(entrada: unknown): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "chamado")) return falha("Sem permissão.");
  const lido = situacaoSchema.safeParse(entrada);
  if (!lido.success) return falhaDeValidacao(lido.error);
  return executar("chamados.situacao", async () => {
    const ip = extrairIp(await headers());
    await prisma.$transaction((tx) => mudarStatusDoChamado(tx, { ...lido.data, usuario: sessao, ip }));
    revalidar();
    return sucesso(undefined, { ABERTO: "Chamado reaberto.", AGENDADO: "Visita marcada como agendada.", EM_ATENDIMENTO: "Chamado em atendimento.", RESOLVIDO: "Chamado resolvido.", CANCELADO: "Chamado cancelado." }[lido.data.para]);
  });
}

const cobrancaSchema = z.object({ id: idSchema, vencimento: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe um vencimento válido.").optional() });

/** Gera a conta a receber da visita cobrada (uma vez só). */
export async function gerarCobranca(entrada: unknown): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "chamado")) return falha("Sem permissão.");
  const lido = cobrancaSchema.safeParse(entrada);
  if (!lido.success) return falhaDeValidacao(lido.error);
  return executar("chamados.cobranca", async () => {
    const ip = extrairIp(await headers());
    await prisma.$transaction((tx) => gerarCobrancaDoChamado(tx, { ...lido.data, usuario: sessao, ip }));
    revalidar();
    return sucesso(undefined, "Cobrança gerada: a visita virou conta a receber da obra.");
  });
}
