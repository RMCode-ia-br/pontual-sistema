import "server-only";

import { createHash } from "node:crypto";

import { ErroNegocio } from "@/lib/acoes";
import { registrarAuditoria } from "@/lib/auditoria";
import { prisma } from "@/lib/db";
import { calcularReajuste, descreverRegra, validarRegra, type RegraReajuste } from "@/lib/dominio/reajuste";

import { LIMITE_REAJUSTE, lerRegraDeReajuste, type EntradaDeReajuste } from "./schemas";

export type ItemDaPrevia = {
  id: string;
  codigo: string;
  descricao: string;
  fornecedor: string | null;
  fornecedorId: string | null;
  custoAtualCentavos: number | null;
  /** Presente só quando o produto será reajustado. */
  custoNovoCentavos: number | null;
  /** Por que NÃO será reajustado (vazio quando será). */
  motivoIgnorado: string | null;
};

export type Previa = {
  escopoRotulo: string;
  descricaoDaRegra: string;
  itens: ItemDaPrevia[];
  afetados: number;
  ignorados: number;
  somaAntesCentavos: number;
  somaDepoisCentavos: number;
  /** Impressão digital do que foi mostrado: a confirmação só vale se o servidor recalcular o MESMO resultado. */
  assinatura: string;
};

export class ErroDePrevia extends Error {}

/**
 * Calcula, sem gravar nada, o que um reajuste faria. É a MESMA função usada na prévia e na confirmação,
 * então a tela nunca promete um número diferente do que será aplicado.
 */
export async function montarPrevia(entrada: EntradaDeReajuste): Promise<Previa> {
  const lida = lerRegraDeReajuste(entrada.modo, entrada.valor);
  if ("erro" in lida) throw new ErroDePrevia(lida.erro);
  const regra: RegraReajuste = lida.regra;
  const erroDaRegra = validarRegra(regra);
  if (erroDaRegra) throw new ErroDePrevia(erroDaRegra);

  let escopoRotulo: string;
  if (entrada.escopo === "FORNECEDOR") {
    const f = await prisma.fornecedor.findFirst({ where: { id: entrada.alvoId, deletadoEm: null }, select: { razaoSocial: true } });
    if (!f) throw new ErroDePrevia("O fornecedor escolhido não foi encontrado.");
    escopoRotulo = `Fornecedor ${f.razaoSocial}`;
  } else {
    const c = await prisma.categoriaProduto.findFirst({ where: { id: entrada.alvoId, deletadoEm: null }, select: { nome: true } });
    if (!c) throw new ErroDePrevia("A categoria escolhida não foi encontrada.");
    escopoRotulo = `Categoria ${c.nome}`;
  }

  const produtos = await prisma.produto.findMany({
    where: {
      deletadoEm: null,
      ativo: true,
      ...(entrada.escopo === "FORNECEDOR" ? { fornecedorPrincipalId: entrada.alvoId } : { categoriaId: entrada.alvoId }),
    },
    orderBy: { codigo: "asc" },
    take: LIMITE_REAJUSTE + 1,
    select: { id: true, codigo: true, descricao: true, custoUnitarioCentavos: true, fornecedorPrincipalId: true, fornecedorPrincipal: { select: { razaoSocial: true } } },
  });
  if (produtos.length > LIMITE_REAJUSTE) {
    throw new ErroDePrevia(`Esse reajuste atingiria mais de ${LIMITE_REAJUSTE} produtos. Divida por categoria ou por fornecedor.`);
  }

  const itens: ItemDaPrevia[] = produtos.map((p) => {
    const r = calcularReajuste(p.custoUnitarioCentavos, regra);
    return {
      id: p.id,
      codigo: p.codigo,
      descricao: p.descricao,
      fornecedor: p.fornecedorPrincipal?.razaoSocial ?? null,
      fornecedorId: p.fornecedorPrincipalId,
      custoAtualCentavos: p.custoUnitarioCentavos,
      custoNovoCentavos: r.ok ? r.novoCentavos : null,
      motivoIgnorado: r.ok ? null : r.motivo,
    };
  });

  const aplicaveis = itens.filter((i) => i.custoNovoCentavos !== null);
  const assinatura = createHash("sha256")
    .update(JSON.stringify([entrada.escopo, entrada.alvoId, regra, aplicaveis.map((i) => [i.id, i.custoAtualCentavos, i.custoNovoCentavos])]))
    .digest("hex");

  return {
    escopoRotulo,
    descricaoDaRegra: descreverRegra(regra),
    itens,
    afetados: aplicaveis.length,
    ignorados: itens.length - aplicaveis.length,
    somaAntesCentavos: aplicaveis.reduce((s, i) => s + (i.custoAtualCentavos ?? 0), 0),
    somaDepoisCentavos: aplicaveis.reduce((s, i) => s + (i.custoNovoCentavos ?? 0), 0),
    assinatura,
  };
}

/**
 * Aplica o reajuste (núcleo testável, sem sessão): recalcula, confere a assinatura da prévia e grava tudo numa
 * transação: custo (um UPDATE que confere o custo anterior), histórico por produto e auditoria do lote.
 */
export async function aplicarReajusteNoBanco(entrada: {
  usuario: { id: string; nome: string };
  pedido: EntradaDeReajuste;
  assinatura: string;
  ip?: string | null;
}): Promise<{ afetados: number; descricaoDaRegra: string }> {
  const { usuario, pedido, assinatura, ip } = entrada;
  let previa: Previa;
  try {
    previa = await montarPrevia(pedido);
  } catch (erro) {
    if (erro instanceof ErroDePrevia) throw new ErroNegocio(erro.message);
    throw erro;
  }
  if (previa.assinatura !== assinatura) throw new ErroNegocio("Os produtos ou os custos mudaram desde a prévia. Veja a prévia de novo antes de aplicar.");
  const alvos = previa.itens.filter((i) => i.custoNovoCentavos !== null && i.custoAtualCentavos !== null);
  if (alvos.length === 0) throw new ErroNegocio("Nenhum produto seria reajustado.");

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
               "atualizadoPorId" = ${usuario.id},
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
          usuarioId: usuario.id,
          observacao,
          criadoPorId: usuario.id,
          atualizadoPorId: usuario.id,
        })),
      });

      await registrarAuditoria(tx, {
        usuario,
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
  return { afetados: alvos.length, descricaoDaRegra: previa.descricaoDaRegra };
}
