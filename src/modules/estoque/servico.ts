import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { ErroNegocio } from "@/lib/acoes";
import { registrarAuditoria } from "@/lib/auditoria";
import type { UsuarioSessao } from "@/lib/auth/sessao";
import { atualizarCustoPeloUltimoRecebimento } from "@/lib/dominio/custo-produto";
import {
  conferirSaida,
  formatarQuantidade,
  paraMilesimos,
  podeContarEstoqueInicial,
  sinalDoTipo,
  type TipoDeMovimento,
} from "@/lib/dominio/estoque";
import { formatarMoeda } from "@/lib/formatadores";

import { saldoDaSucata, travarSucata } from "./sucata-base";

type Tx = Prisma.TransactionClient;
export type ContextoEstoque = {
  usuario: UsuarioSessao;
  ip: string | null;
  agora?: Date;
};

const comoData = (texto: string): Date => new Date(`${texto}T00:00:00Z`);
const decimalDeMilesimos = (m: number): string => (m / 1000).toFixed(3);
const milesimosDoDecimal = (d: { toString(): string }): number =>
  Math.round(Number(d.toString()) * 1000);

const STATUS_QUE_RECEBEM_MATERIAL = [
  "APROVADO",
  "EM_EXECUCAO",
  "CONCLUIDO",
] as const;

/** Trava a linha do produto (dois movimentos simultâneos nunca perdem saldo) e devolve o que as regras precisam. */
export async function travarProduto(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "Produto" WHERE "id" = ${id} AND "deletadoEm" IS NULL FOR UPDATE`;
  const p = await tx.produto.findFirst({
    where: { id, deletadoEm: null },
    select: {
      id: true,
      codigo: true,
      descricao: true,
      unidade: true,
      saldoCache: true,
      custoUnitarioCentavos: true,
      fornecedorPrincipalId: true,
    },
  });
  if (!p) throw new ErroNegocio("Produto não encontrado.");
  return p;
}

async function conferirObra(
  tx: Tx,
  projetoId: string,
): Promise<{ codigo: string }> {
  const projeto = await tx.projeto.findFirst({
    where: { id: projetoId, deletadoEm: null },
    select: { codigo: true, status: true },
  });
  if (!projeto)
    throw new ErroNegocio("Obra não encontrada.", {
      projetoId: "Escolha uma obra da lista.",
    });
  if (
    !(STATUS_QUE_RECEBEM_MATERIAL as readonly string[]).includes(projeto.status)
  ) {
    throw new ErroNegocio(
      "Só obras aprovadas, em execução ou concluídas recebem material.",
      { projetoId: "Escolha uma obra aprovada." },
    );
  }
  return projeto;
}

export type EntradaDeMovimento = {
  produtoId: string;
  tipo: TipoDeMovimento;
  /** Quantidade SEM sinal, em milésimos, na unidade do produto. */
  quantidadeMilesimos: number;
  /** Só para AJUSTE: +1 acrescenta, −1 retira. */
  sentido?: 1 | -1;
  data: string;
  projetoId?: string | null;
  /** Custo unitário a congelar; vazio = o custo atual do produto (nunca inventado: sem custo fica sem custo). */
  custoUnitarioCentavos?: number | null;
  itemRecebimentoId?: string | null;
  confirmarSemSaldo?: boolean;
  justificativa?: string | null;
  /** Custo digitado numa entrada avulsa ou na contagem inicial: aplica a regra do último custo no produto. */
  atualizarCustoDoProduto?: { origem: "MANUAL"; observacao: string } | null;
  estornoDeId?: string | null;
};

/**
 * Grava UM movimento de estoque na transação: confere saída sem saldo (confirmação + justificativa), obra obrigatória na
 * saída e na devolução, congela o custo da época e atualiza o saldo em cache no mesmo passo. Audita.
 */
export async function registrarMovimentoDeEstoque(
  tx: Tx,
  e: EntradaDeMovimento,
  ctx: ContextoEstoque,
) {
  if (!Number.isInteger(e.quantidadeMilesimos) || e.quantidadeMilesimos <= 0)
    throw new ErroNegocio("Informe uma quantidade maior que zero.", {
      quantidade: "Informe uma quantidade maior que zero.",
    });
  const produto = await travarProduto(tx, e.produtoId);

  const sinalNatural = sinalDoTipo(e.tipo);
  const sinal = sinalNatural ?? e.sentido;
  if (!sinal)
    throw new ErroNegocio("No ajuste, escolha se acrescenta ou retira.", {
      sentido: "Escolha acrescentar ou retirar.",
    });

  const exigeObra = e.tipo === "SAIDA_OBRA" || e.tipo === "DEVOLUCAO";
  let obra: { codigo: string } | null = null;
  if (exigeObra) {
    if (!e.projetoId)
      throw new ErroNegocio("Escolha a obra.", {
        projetoId: "Escolha a obra.",
      });
    obra = await conferirObra(tx, e.projetoId);
  } else if (e.projetoId) {
    obra = await conferirObra(tx, e.projetoId);
  }

  const saldoAntes = milesimosDoDecimal(produto.saldoCache);
  let semSaldo = false;
  if (sinal < 0) {
    const c = conferirSaida({
      saldoMilesimos: saldoAntes,
      quantidadeMilesimos: e.quantidadeMilesimos,
      confirmarSemSaldo: e.confirmarSemSaldo === true,
      justificativa: e.justificativa ?? null,
    });
    if (!c.ok) throw new ErroNegocio(c.erro, { quantidade: c.erro });
    semSaldo = c.semSaldo;
  }

  const custo =
    e.custoUnitarioCentavos !== undefined
      ? e.custoUnitarioCentavos
      : produto.custoUnitarioCentavos;
  const delta = sinal * e.quantidadeMilesimos;
  const movimento = await tx.movimentoEstoque.create({
    data: {
      produtoId: produto.id,
      tipo: e.tipo,
      quantidade: decimalDeMilesimos(delta),
      custoUnitarioCentavos: custo,
      data: comoData(e.data),
      projetoId: e.projetoId ?? null,
      itemRecebimentoId: e.itemRecebimentoId ?? null,
      estornoDeId: e.estornoDeId ?? null,
      semSaldoConfirmado: semSaldo,
      justificativa: e.justificativa?.trim() || null,
      criadoPorId: ctx.usuario.id,
      atualizadoPorId: ctx.usuario.id,
    },
  });
  const saldoDepois = saldoAntes + delta;
  await tx.produto.update({
    where: { id: produto.id },
    data: {
      saldoCache: decimalDeMilesimos(saldoDepois),
      atualizadoPorId: ctx.usuario.id,
    },
  });

  // Custo digitado (entrada avulsa, contagem inicial): vale a regra do último custo, com histórico.
  if (e.atualizarCustoDoProduto && e.custoUnitarioCentavos != null) {
    const mudanca = atualizarCustoPeloUltimoRecebimento(
      produto.custoUnitarioCentavos,
      e.custoUnitarioCentavos,
    );
    if (mudanca.muda) {
      await tx.produto.update({
        where: { id: produto.id },
        data: {
          custoUnitarioCentavos: mudanca.novoCentavos,
          custoAtualizadoEm: ctx.agora ?? new Date(),
        },
      });
      await tx.historicoPreco.create({
        data: {
          produtoId: produto.id,
          custoAnteriorCentavos: mudanca.anteriorCentavos,
          custoNovoCentavos: mudanca.novoCentavos,
          origem: e.atualizarCustoDoProduto.origem,
          fornecedorId: produto.fornecedorPrincipalId,
          usuarioId: ctx.usuario.id,
          observacao: e.atualizarCustoDoProduto.observacao,
          criadoPorId: ctx.usuario.id,
          atualizadoPorId: ctx.usuario.id,
        },
      });
    }
  }

  await registrarAuditoria(tx, {
    usuario: ctx.usuario,
    entidade: "MovimentoEstoque",
    entidadeId: movimento.id,
    acao: e.estornoDeId ? "ESTORNAR" : "CRIAR",
    depois: {
      produto: produto.codigo,
      tipo: e.tipo,
      quantidade: decimalDeMilesimos(delta),
      custoUnitarioCentavos: custo,
      obra: obra?.codigo ?? null,
      semSaldoConfirmado: semSaldo,
      justificativa: e.justificativa ?? null,
      saldoDepois: decimalDeMilesimos(saldoDepois),
    },
    ip: ctx.ip,
  });
  return { id: movimento.id, saldoDepoisMilesimos: saldoDepois, produto };
}

/**
 * Estorna um movimento: cria o movimento INVERSO (nunca edita nem apaga). Um movimento só é estornado uma vez, um estorno não
 * se estorna, e o que veio de um recebimento de compra se desfaz pelo recebimento (para o custo e a compra acompanharem).
 */
export async function estornarMovimentoDeEstoque(
  tx: Tx,
  movimentoId: string,
  motivo: string,
  ctx: ContextoEstoque,
) {
  const original = await tx.movimentoEstoque.findFirst({
    where: { id: movimentoId, deletadoEm: null },
    include: {
      estornadoPor: { select: { id: true } },
      retalhosGerados: { where: { deletadoEm: null }, select: { id: true, status: true } },
    },
  });
  if (!original) throw new ErroNegocio("Movimento não encontrado.");
  await travarProduto(tx, original.produtoId);
  if (original.estornoDeId)
    throw new ErroNegocio(
      "Este movimento já é um estorno: não se estorna de novo.",
    );
  if (original.estornadoPor)
    throw new ErroNegocio("Este movimento já foi estornado.");
  if (original.itemRecebimentoId)
    throw new ErroNegocio(
      "Este movimento veio do recebimento de uma compra: desfaça-o pelo recebimento.",
    );
  // Saída por corte de barra: o retalho gerado só se desfaz se ainda está disponível, e a sucata gerada se ainda não foi vendida.
  if (original.retalhosGerados.some((r) => r.status !== "DISPONIVEL"))
    throw new ErroNegocio(
      "Esta saída gerou um retalho que já foi usado ou descartado: não dá para estornar.",
    );
  if (motivo.trim().length < 3)
    throw new ErroNegocio("Informe o motivo do estorno.", {
      motivo: "Informe o motivo.",
    });
  const sucatas = await tx.movimentoSucata.findMany({
    where: { observacao: { startsWith: `mov:${original.id}` }, tipo: "GERACAO", deletadoEm: null },
    select: { id: true, pesoKg: true, comprimentoMm: true, produtoId: true, projetoId: true },
  });
  if (sucatas.length > 0) {
    await travarSucata(tx);
    const saldo = await saldoDaSucata(tx);
    const kg = sucatas.reduce((s, x) => s + (x.pesoKg ? Math.round(Number(x.pesoKg.toString()) * 1000) : 0), 0);
    const mm = sucatas.reduce((s, x) => s + (x.pesoKg ? 0 : (x.comprimentoMm ?? 0)), 0);
    if (saldo.pesoMilesimosKg < kg || saldo.comprimentoSemPesoMm < mm)
      throw new ErroNegocio("A sucata gerada por esta saída já foi vendida ou ajustada: não dá para estornar.");
  }

  const delta = milesimosDoDecimal(original.quantidade);
  const quantidade = Math.abs(delta);
  // Desfazer uma ENTRADA retira do saldo: precisa de saldo, ou de confirmação (aqui o estorno é intencional e justificado).
  const desfeito = await registrarMovimentoDeEstoque(
    tx,
    {
      produtoId: original.produtoId,
      tipo: "AJUSTE",
      sentido: delta > 0 ? -1 : 1,
      quantidadeMilesimos: quantidade,
      data: (ctx.agora ?? new Date()).toISOString().slice(0, 10),
      projetoId: original.projetoId,
      custoUnitarioCentavos: original.custoUnitarioCentavos,
      confirmarSemSaldo: true,
      justificativa: `Estorno: ${motivo.trim()}`,
      estornoDeId: original.id,
    },
    ctx,
  );
  // Efeitos do corte: o retalho gerado é descartado e a sucata gerada sai do saldo (ajuste negativo, com rastro).
  if (original.retalhosGerados.length > 0) {
    await tx.retalho.updateMany({
      where: { id: { in: original.retalhosGerados.map((r) => r.id) } },
      data: { status: "DESCARTADO", observacao: `Saída estornada: ${motivo.trim()}`, atualizadoPorId: ctx.usuario.id },
    });
  }
  for (const s of sucatas) {
    await tx.movimentoSucata.create({
      data: {
        tipo: "AJUSTE",
        data: comoData((ctx.agora ?? new Date()).toISOString().slice(0, 10)),
        pesoKg: s.pesoKg ? (-Number(s.pesoKg.toString())).toFixed(3) : null,
        comprimentoMm: s.pesoKg ? null : s.comprimentoMm !== null ? -s.comprimentoMm : null,
        produtoId: s.produtoId,
        projetoId: s.projetoId,
        observacao: `estorno:mov:${original.id} · ${motivo.trim()}`,
        criadoPorId: ctx.usuario.id,
        atualizadoPorId: ctx.usuario.id,
      },
    });
  }
  return desfeito;
}

export type LinhaDaContagem = {
  produtoId: string;
  quantidadeMilesimos: number;
  custoUnitarioCentavos: number | null;
};

/**
 * Contagem inicial (opcional): um movimento INVENTARIO_INICIAL por produto, só para produto SEM nenhum movimento. Custo vazio =
 * "sem custo" (nunca inventado); custo digitado e produto sem custo → o produto passa a ter esse custo, com histórico.
 */
export async function contarEstoqueInicial(
  tx: Tx,
  linhas: readonly LinhaDaContagem[],
  data: string,
  ctx: ContextoEstoque,
): Promise<{ contados: number }> {
  if (linhas.length === 0)
    throw new ErroNegocio("Informe a quantidade de ao menos um produto.");
  const vistos = new Set<string>();
  for (const l of linhas) {
    if (vistos.has(l.produtoId))
      throw new ErroNegocio("Há produto repetido na contagem.");
    vistos.add(l.produtoId);
    await travarProduto(tx, l.produtoId);
    const total = await tx.movimentoEstoque.count({
      where: { produtoId: l.produtoId, deletadoEm: null },
    });
    if (!podeContarEstoqueInicial(total)) {
      const p = await tx.produto.findUniqueOrThrow({
        where: { id: l.produtoId },
        select: { descricao: true },
      });
      throw new ErroNegocio(
        `“${p.descricao}” já tem movimentos: use um ajuste em vez da contagem inicial.`,
      );
    }
    await registrarMovimentoDeEstoque(
      tx,
      {
        produtoId: l.produtoId,
        tipo: "INVENTARIO_INICIAL",
        quantidadeMilesimos: l.quantidadeMilesimos,
        data,
        custoUnitarioCentavos: l.custoUnitarioCentavos,
        atualizarCustoDoProduto:
          l.custoUnitarioCentavos !== null
            ? { origem: "MANUAL", observacao: "Contagem inicial" }
            : null,
      },
      ctx,
    );
  }
  return { contados: linhas.length };
}

/** Texto curto de um movimento para a linha do tempo e as listas ("Saída de 2,5 un · P-0001"). */
export function resumoDoMovimento(
  tipoRotulo: string,
  quantidadeMilesimos: number,
  sigla: string,
  custoCentavos: number | null,
): string {
  const q = formatarQuantidade(Math.abs(quantidadeMilesimos));
  return `${tipoRotulo}: ${q} ${sigla}${custoCentavos !== null ? ` a ${formatarMoeda(custoCentavos)}` : " (sem custo)"}`;
}

export { paraMilesimos };
