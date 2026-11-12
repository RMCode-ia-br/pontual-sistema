"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { executar, falha, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { extrairIp } from "@/lib/auth/autenticar";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissoes";

import { lerModeloDeEtapas } from "../schemas";
import { modeloPadraoId, substituirItensDoModelo } from "../servico";

/**
 * Salva o modelo de etapas padrão (R7). Mudar o modelo NÃO altera obras já criadas: cada obra guarda a sua cópia.
 * Se a seed ainda não criou o modelo, cria na primeira gravação.
 */
export async function salvarModeloDeEtapas(entrada: unknown): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "modelo-etapas")) return falha("Sem permissão.");

  const lido = lerModeloDeEtapas(entrada);
  if ("erro" in lido) return falha(lido.erro);

  return executar("obras.modelo_etapas", async () => {
    const ip = extrairIp(await headers());
    await prisma.$transaction(async (tx) => {
      let modeloId = await modeloPadraoId(tx);
      if (!modeloId) {
        modeloId = (await tx.modeloEtapas.create({ data: { nome: "Modelo padrão", padrao: true, criadoPorId: sessao.id, atualizadoPorId: sessao.id }, select: { id: true } })).id;
      }
      await substituirItensDoModelo(tx, { modeloId, itens: lido.itens, usuario: sessao, ip });
    });
    revalidatePath("/configuracoes/modelo-etapas");
    return sucesso(undefined, "Modelo de etapas salvo. As obras que já existem não mudam.");
  });
}
