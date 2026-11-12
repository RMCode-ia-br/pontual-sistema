"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { executar, falha, falhaDeValidacao, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { extrairIp } from "@/lib/auth/autenticar";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { parseMoedaParaCentavos } from "@/lib/formatadores";
import { can } from "@/lib/permissoes";

import { informarCustoDeMaterial } from "../servico-custo-material";

const id = z.string().trim().min(1).max(64);
const valor = z.string().trim().max(24);

const schema = z.object({
  propostaId: id,
  opcaoId: id,
  total: valor,
  itens: z.array(z.object({ itemId: id, valor })).max(300),
});

/** "" → null (apagar/não informado); "1.234,56" → centavos; inválido → undefined. */
function lerValor(texto: string): number | null | undefined {
  if (texto === "") return null;
  const c = parseMoedaParaCentavos(texto);
  return c === null ? undefined : c;
}

/** Custo de material informado (programa de corte): só interno, em qualquer status da proposta, sem criar revisão. */
export async function salvarCustoDeMaterial(entrada: unknown): Promise<ResultadoAcao<{ alterados: number }>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "proposta")) return falha("Sem permissão.");
  const dados = schema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error);
  const d = dados.data;

  const total = lerValor(d.total);
  if (total === undefined) return falha("Total: informe um valor em reais, ex.: 1.234,56.", { total: "Informe um valor em reais, ex.: 1.234,56." });
  const itens: { itemId: string; custoCentavos: number | null }[] = [];
  const campos: Record<string, string> = {};
  for (const i of d.itens) {
    const c = lerValor(i.valor);
    if (c === undefined) campos[`item:${i.itemId}`] = "Informe um valor em reais.";
    else itens.push({ itemId: i.itemId, custoCentavos: c });
  }
  if (Object.keys(campos).length > 0) return falha("Confira os valores digitados.", campos);

  return executar("propostas.custo-material", async () => {
    const ip = extrairIp(await headers());
    const r = await prisma.$transaction((tx) => informarCustoDeMaterial(tx, { propostaId: d.propostaId, opcaoId: d.opcaoId, totalCentavos: total, itens }, { usuario: sessao, ip }), { timeout: 30_000 });
    revalidatePath(`/propostas/${d.propostaId}`);
    revalidatePath("/propostas");
    return sucesso(r, "Custo de material salvo. Ele aparece só para você.");
  });
}
