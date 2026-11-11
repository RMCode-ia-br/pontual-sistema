import "server-only";

import { createHash } from "node:crypto";

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
