"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { executar, falha, falhaDeValidacao, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { extrairIp } from "@/lib/auth/autenticar";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { tentarDeNovoEmDeadlock } from "@/lib/db/deadlock";
import { can } from "@/lib/permissoes";
import { campoIdObrigatorio } from "@/lib/validadores/campos";

import { cancelarObraAprovada, previaDoCancelamento, type PreviaDoCancelamento, type ResultadoCancelarObra } from "../servico-cancelar";

const idSchema = campoIdObrigatorio("Obra inválida.");
const cancelarSchema = z.object({ projetoId: idSchema, motivo: z.string().trim().min(3, "Conte o motivo.").max(500, "Use no máximo 500 caracteres.") });

/** Prévia (só leitura) do que cancelar a obra muda e do que o sistema NÃO desfaz. O servidor recalcula tudo ao cancelar. */
export async function previaCancelarObraAcao(projetoIdBruto: string): Promise<ResultadoAcao<PreviaDoCancelamento>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "cancelar", "obra")) return falha("Sem permissão.");
  const id = idSchema.safeParse(projetoIdBruto);
  if (!id.success) return falha("Obra inválida.");
  return executar("obras.previaCancelar", async () => sucesso(await previaDoCancelamento(prisma, id.data)));
}

/** Cancela a obra já aprovada (ação destrutiva de Obras): motivo obrigatório; a venda do mês da aprovação não some. */
export async function cancelarObraAcao(entrada: z.input<typeof cancelarSchema>): Promise<ResultadoAcao<ResultadoCancelarObra>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "cancelar", "obra")) return falha("Sem permissão.");
  const lido = cancelarSchema.safeParse(entrada);
  if (!lido.success) return falhaDeValidacao(lido.error);
  const v = lido.data;
  return executar("obras.cancelar", async () => {
    const ip = extrairIp(await headers());
    const r = await tentarDeNovoEmDeadlock(() => prisma.$transaction((tx) => cancelarObraAprovada(tx, { usuario: sessao, projetoId: v.projetoId, motivo: v.motivo, ip }), { timeout: 30_000 }));
    revalidatePath(`/obras/${r.projetoId}`);
    revalidatePath(`/projetos/${r.projetoId}`);
    revalidatePath("/obras");
    revalidatePath("/funil");
    revalidatePath("/projetos");
    revalidatePath("/", "layout");
    return sucesso(r, `Obra ${r.codigo} cancelada.${r.parcelasQueFicam > 0 ? " O dinheiro já recebido continua registrado; devolver ao cliente é um estorno à parte em Financeiro." : ""}`);
  });
}
