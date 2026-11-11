"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { ErroNegocio, executar, falha, falhaDeValidacao, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { registrarAuditoria } from "@/lib/auditoria";
import { extrairIp } from "@/lib/auth/autenticar";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissoes";

import { ErroDePrevia, montarPrevia, type Previa } from "../reajuste";
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
    let previa: Previa;
    try {
      previa = await montarPrevia(pedido);
    } catch (erro) {
      if (erro instanceof ErroDePrevia) throw new ErroNegocio(erro.message);
      throw erro;
    }
    if (previa.assinatura !== assinatura) {
      throw new ErroNegocio("Os produtos ou os custos mudaram desde a prévia. Veja a prévia de novo antes de aplicar.");
    }
    const alvos = previa.itens.filter((i) => i.custoNovoCentavos !== null && i.custoAtualCentavos !== null);
    if (alvos.length === 0) throw new ErroNegocio("Nenhum produto seria reajustado.");

    const ip = extrairIp(await headers());
    const observacao = `${previa.descricaoDaRegra} · ${previa.escopoRotulo}`;
    const ids = alvos.map((i) => i.id);
    const antes = alvos.map((i) => i.custoAtualCentavos as number);
    const novos = alvos.map((i) => i.custoNovoCentavos as number);

    await prisma.$transaction(
      async (tx) => {
        // Uma instrução só, com conferência do custo anterior: se alguém mexeu num produto entre a prévia e
        // agora, a contagem não bate e a transação inteira volta atrás.
        const alterados = await tx.$executeRaw`
          UPDATE "Produto" AS p
             SET "custoUnitarioCentavos" = v.novo,
                 "custoAtualizadoEm" = now(),
                 "atualizadoPorId" = ${sessao.id},
                 "atualizadoEm" = now()
            FROM (SELECT unnest(${ids}::text[]) AS id, unnest(${antes}::int[]) AS antes, unnest(${novos}::int[]) AS novo) AS v
           WHERE p.id = v.id AND p."custoUnitarioCentavos" = v.antes AND p."deletadoEm" IS NULL`;
        if (alterados !== alvos.length) throw new ErroNegocio("Algum produto foi alterado enquanto o reajuste era aplicado. Nada foi gravado; veja a prévia de novo.");

        await tx.historicoPreco.createMany({
          data: alvos.map((i) => ({
            produtoId: i.id,
            custoAnteriorCentavos: i.custoAtualCentavos,
            custoNovoCentavos: i.custoNovoCentavos as number,
            origem: "REAJUSTE_LOTE" as const,
            fornecedorId: i.fornecedorId,
            usuarioId: sessao.id,
            observacao,
            criadoPorId: sessao.id,
            atualizadoPorId: sessao.id,
          })),
        });

        await registrarAuditoria(tx, {
          usuario: sessao,
          entidade: "Produto",
          entidadeId: "reajuste-lote",
          acao: "REAJUSTE_LOTE",
          depois: {
            escopo: pedido.escopo,
            alvoId: pedido.alvoId,
            regra: previa.descricaoDaRegra,
            descricao: previa.escopoRotulo,
            produtos: alvos.length,
            ignorados: previa.ignorados,
            somaAntesCentavos: previa.somaAntesCentavos,
            somaDepoisCentavos: previa.somaDepoisCentavos,
            produtoIds: ids.slice(0, 500),
          },
          ip,
        });
      },
      { timeout: 30_000, maxWait: 10_000 },
    );

    revalidatePath("/produtos");
    revalidatePath("/", "layout");
    return sucesso({ afetados: alvos.length }, `${alvos.length} ${alvos.length === 1 ? "produto reajustado" : "produtos reajustados"} (${previa.descricaoDaRegra}).`);
  });
}
