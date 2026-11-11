"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { ErroNegocio, executar, falha, falhaDeValidacao, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { extrairIp } from "@/lib/auth/autenticar";
import { exigirSessao } from "@/lib/auth/sessao";
import { can } from "@/lib/permissoes";

import { aplicarReajusteNoBanco, ErroDePrevia, montarPrevia, type Previa } from "../reajuste";
import { aplicarReajusteSchema, reajusteSchema } from "../schemas";

/** Quantos itens a prévia leva para a tela (o resumo e a assinatura sempre valem para TODOS). */
const ITENS_NA_TELA = 500;

export type PreviaParaTela = Omit<Previa, "itens"> & { itens: Previa["itens"]; itensOmitidos: number };

/** Passo 1: mostra, sem gravar nada, o que o reajuste faria produto a produto. */
export async function preverReajuste(entrada: unknown): Promise<ResultadoAcao<PreviaParaTela>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "produto")) return falha("Sem permissão.");

  const dados = reajusteSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error);

  return executar("produtos.reajuste.previa", async () => {
    try {
      const previa = await montarPrevia(dados.data);
      // Os que serão reajustados primeiro; os ignorados (com o motivo) logo depois.
      const ordenados = [...previa.itens].sort((a, b) => Number(a.custoNovoCentavos === null) - Number(b.custoNovoCentavos === null));
      return sucesso({ ...previa, itens: ordenados.slice(0, ITENS_NA_TELA), itensOmitidos: Math.max(0, ordenados.length - ITENS_NA_TELA) });
    } catch (erro) {
      if (erro instanceof ErroDePrevia) throw new ErroNegocio(erro.message, { valor: erro.message });
      throw erro;
    }
  });
}

/**
 * Passo 2: aplica. O servidor RECALCULA tudo (nunca confia nos números do navegador) e só segue se o
 * resultado for idêntico ao da prévia que a pessoa viu (mesma assinatura). Tudo numa transação: o custo
 * muda, o histórico é gravado e a auditoria registra o lote; se algo falhar, nada fica pela metade.
 */
export async function aplicarReajuste(entrada: unknown): Promise<ResultadoAcao<{ afetados: number }>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "produto")) return falha("Sem permissão.");

  const dados = aplicarReajusteSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error);
  const { assinatura, ...pedido } = dados.data;

  return executar("produtos.reajuste.aplicar", async () => {
    const ip = extrairIp(await headers());
    const r = await aplicarReajusteNoBanco({ usuario: { id: sessao.id, nome: sessao.nome }, pedido, assinatura, ip });
    revalidatePath("/produtos");
    revalidatePath("/", "layout");
    return sucesso({ afetados: r.afetados }, `${r.afetados} ${r.afetados === 1 ? "produto reajustado" : "produtos reajustados"} (${r.descricaoDaRegra}).`);
  });
}
