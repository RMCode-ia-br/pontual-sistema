"use server";

import { falha, falhaDeValidacao, type ResultadoAcao } from "@/lib/acoes";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { PRECO_KG_MAXIMO_CENTAVOS, lerPercentualEmPb } from "@/lib/dominio/perfil-kg";
import { parseMoedaParaCentavos } from "@/lib/formatadores";
import { can } from "@/lib/permissoes";
import { rodarEstoque } from "@/modules/estoque/rodar";
import { z } from "zod";

import { aplicarReajusteKg, definirPrecosKgDoAcabamento, previaDoReajusteKg, type LinhaDoReajusteKg } from "../servico-preco-kg";

const bruto = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/**
 * Salva os preços do kg de UM acabamento. O formulário manda `acabamentoId` e um campo `preco:geral` e, opcionalmente, um
 * `preco:<linhaId>` por linha. Vazio = sem preço (nunca zero).
 */
export async function salvarPrecosKg(_anterior: ResultadoAcao | null, formData: FormData): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "precoKg")) return falha("Sem permissão.");
  const acabamentoId = bruto(formData.get("acabamentoId"));
  if (!acabamentoId || acabamentoId.length > 64) return falha("Acabamento inválido.");

  const precos: { linhaId: string | null; custoKgCentavos: number | null }[] = [];
  const campos: Record<string, string> = {};
  for (const [chave, valor] of formData.entries()) {
    if (!chave.startsWith("preco:")) continue;
    const alvo = chave.slice("preco:".length);
    const texto = bruto(valor);
    let custo: number | null = null;
    if (texto !== "") {
      custo = parseMoedaParaCentavos(texto);
      if (custo === null || custo <= 0 || custo > PRECO_KG_MAXIMO_CENTAVOS) {
        campos[chave] = "Informe um valor em reais maior que zero, ex.: 52,50.";
        continue;
      }
    }
    precos.push({ linhaId: alvo === "geral" ? null : alvo.slice(0, 64), custoKgCentavos: custo });
  }
  if (Object.keys(campos).length > 0) return falha("Confira os preços digitados.", campos);

  return rodarEstoque("precoKg.salvar", async (tx, ip) => {
    const r = await definirPrecosKgDoAcabamento(tx, { acabamentoId, precos }, { usuario: sessao, ip });
    const perfis = r.atualizados > 0 ? ` O custo de ${r.atualizados} ${r.atualizados === 1 ? "perfil" : "perfis"} foi recalculado.` : "";
    return { mensagem: `Preço do kg salvo.${perfis}` };
  });
}

const reajusteSchema = z.object({ percentual: z.string().trim().min(1, "Informe o percentual, ex.: 5 ou -3,5.").max(12) });

export type PreviaDoReajusteKg = { linhas: (Omit<LinhaDoReajusteKg, "id">)[]; percentualPb: number };

/** Mostra o que o reajuste faria, sem gravar nada. */
export async function preverReajusteKg(entrada: unknown): Promise<ResultadoAcao<PreviaDoReajusteKg>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "precoKg")) return falha("Sem permissão.");
  const dados = reajusteSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error);
  const pb = lerPercentualEmPb(dados.data.percentual);
  if (pb === null) return falha("Percentual inválido. Use números, por exemplo 5 ou -3,5.", { percentual: "Percentual inválido." });
  const linhas = await previaDoReajusteKg(prisma, pb);
  if (linhas.length === 0) return falha("Não há preço do kg informado para reajustar.");
  return { ok: true, dados: { linhas: linhas.map(({ id: _id, ...resto }) => resto), percentualPb: pb } };
}

/** Aplica o reajuste (o mesmo percentual em todos os preços do kg preenchidos) e recalcula os perfis. */
export async function aplicarReajusteDoKg(entrada: unknown): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "precoKg")) return falha("Sem permissão.");
  const dados = reajusteSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error);
  const pb = lerPercentualEmPb(dados.data.percentual);
  if (pb === null) return falha("Percentual inválido. Use números, por exemplo 5 ou -3,5.", { percentual: "Percentual inválido." });
  return rodarEstoque("precoKg.reajuste", async (tx, ip) => {
    const r = await aplicarReajusteKg(tx, pb, { usuario: sessao, ip });
    return { mensagem: `Reajuste aplicado em ${r.precos} preço${r.precos === 1 ? "" : "s"}; ${r.perfisAtualizados} ${r.perfisAtualizados === 1 ? "perfil" : "perfis"} recalculado${r.perfisAtualizados === 1 ? "" : "s"}.` };
  });
}
