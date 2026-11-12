import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { ErroNegocio } from "@/lib/acoes";
import { registrarAuditoria } from "@/lib/auditoria";
import type { UsuarioSessao } from "@/lib/auth/sessao";
import { PRECO_KG_MAXIMO_CENTAVOS, custoUnitarioDoPerfil, precoKgDoPerfil, reajustarPrecoKg, type LinhaDePrecoKg, type UnidadeDoProduto } from "@/lib/dominio/perfil-kg";

type Tx = Prisma.TransactionClient;
export type ContextoPrecoKg = { usuario: UsuarioSessao; ip: string | null; agora?: Date };

const milesimos = (d: { toString(): string } | null): number | null => (d === null ? null : Math.round(Number(d.toString()) * 1000));

export type ProdutoParaCusto = {
  id: string;
  unidade: UnidadeDoProduto;
  acabamentoId: string | null;
  linhaId: string | null;
  pesoKgPorMetro: { toString(): string } | null;
  comprimentoBarraMm: number | null;
};

/** Custo do perfil (na unidade do produto) pelo preço do kg da tabela; null se faltar preço, peso por metro ou comprimento. */
export function custoDoProdutoPelaTabela(p: ProdutoParaCusto, tabela: readonly LinhaDePrecoKg[]): number | null {
  const custoKg = precoKgDoPerfil(p.acabamentoId, p.linhaId, tabela);
  return custoUnitarioDoPerfil(p.unidade, { custoKgCentavos: custoKg, pesoMilesimosKgPorMetro: milesimos(p.pesoKgPorMetro), comprimentoBarraMm: p.comprimentoBarraMm });
}

async function tabelaDoAcabamento(tx: Tx, acabamentoId: string): Promise<LinhaDePrecoKg[]> {
  const linhas = await tx.precoKgAluminio.findMany({ where: { acabamentoId, deletadoEm: null }, select: { acabamentoId: true, linhaId: true, custoKgCentavos: true } });
  return linhas;
}

/**
 * Recalcula o custo de UM perfil pelo preço do kg e grava (com histórico "PRECO_KG") se mudou. Sem como calcular (falta preço,
 * peso ou comprimento), NÃO mexe no custo que já existe: nunca zera nem inventa.
 */
export async function recalcularCustoDoPerfil(tx: Tx, produtoId: string, ctx: ContextoPrecoKg, tabelaConhecida?: readonly LinhaDePrecoKg[]): Promise<{ mudou: boolean; custoCentavos: number | null }> {
  const p = await tx.produto.findFirst({
    where: { id: produtoId, deletadoEm: null, custoPorKg: true },
    select: { id: true, unidade: true, acabamentoId: true, linhaId: true, pesoKgPorMetro: true, comprimentoBarraMm: true, custoUnitarioCentavos: true, fornecedorPrincipalId: true },
  });
  if (!p) return { mudou: false, custoCentavos: null };
  const tabela = tabelaConhecida ?? (p.acabamentoId ? await tabelaDoAcabamento(tx, p.acabamentoId) : []);
  const novo = custoDoProdutoPelaTabela(p, tabela);
  if (novo === null || novo <= 0 || novo === p.custoUnitarioCentavos) return { mudou: false, custoCentavos: p.custoUnitarioCentavos };
  await tx.produto.update({ where: { id: p.id }, data: { custoUnitarioCentavos: novo, custoAtualizadoEm: ctx.agora ?? new Date(), atualizadoPorId: ctx.usuario.id } });
  await tx.historicoPreco.create({
    data: {
      produtoId: p.id,
      custoAnteriorCentavos: p.custoUnitarioCentavos,
      custoNovoCentavos: novo,
      origem: "PRECO_KG",
      fornecedorId: p.fornecedorPrincipalId,
      usuarioId: ctx.usuario.id,
      observacao: "Recalculado pelo preço do kg",
      criadoPorId: ctx.usuario.id,
      atualizadoPorId: ctx.usuario.id,
    },
  });
  return { mudou: true, custoCentavos: novo };
}

/** Recalcula todos os perfis por kg de um acabamento (depois de mudar o preço do kg). */
export async function recalcularPerfisDoAcabamento(tx: Tx, acabamentoId: string, ctx: ContextoPrecoKg): Promise<{ perfis: number; atualizados: number }> {
  const tabela = await tabelaDoAcabamento(tx, acabamentoId);
  const perfis = await tx.produto.findMany({ where: { acabamentoId, custoPorKg: true, deletadoEm: null }, select: { id: true }, orderBy: { id: "asc" } });
  let atualizados = 0;
  for (const p of perfis) {
    if ((await recalcularCustoDoPerfil(tx, p.id, ctx, tabela)).mudou) atualizados += 1;
  }
  return { perfis: perfis.length, atualizados };
}

export type PrecoParaDefinir = { linhaId: string | null; custoKgCentavos: number | null };

/**
 * Define os preços do kg de UM acabamento (o geral e, se houver, um por linha) numa transação: grava o histórico de cada mudança,
 * audita e recalcula o custo dos perfis afetados. Preço vazio = "sem preço do kg" (nunca zero). Sem linha mudada, nada acontece.
 */
export async function definirPrecosKgDoAcabamento(tx: Tx, e: { acabamentoId: string; precos: readonly PrecoParaDefinir[] }, ctx: ContextoPrecoKg) {
  const acabamento = await tx.acabamentoAluminio.findFirst({ where: { id: e.acabamentoId, deletadoEm: null }, select: { id: true, nome: true } });
  if (!acabamento) throw new ErroNegocio("Acabamento não encontrado.");
  const linhasValidas = new Set((await tx.linhaAluminio.findMany({ where: { deletadoEm: null }, select: { id: true } })).map((l) => l.id));
  const vistas = new Set<string>();
  for (const p of e.precos) {
    const chave = p.linhaId ?? "";
    if (vistas.has(chave)) throw new ErroNegocio("Há um preço repetido para a mesma linha.");
    vistas.add(chave);
    if (p.linhaId && !linhasValidas.has(p.linhaId)) throw new ErroNegocio("Alguma linha escolhida não existe mais. Recarregue a página.");
    if (p.custoKgCentavos !== null && (!Number.isInteger(p.custoKgCentavos) || p.custoKgCentavos <= 0 || p.custoKgCentavos > PRECO_KG_MAXIMO_CENTAVOS)) {
      throw new ErroNegocio("O preço do kg precisa ser maior que zero.");
    }
  }

  let mudancas = 0;
  for (const p of e.precos) {
    const existente = await tx.precoKgAluminio.findFirst({ where: { acabamentoId: e.acabamentoId, linhaId: p.linhaId, deletadoEm: null } });
    const anterior = existente?.custoKgCentavos ?? null;
    if (!existente && p.custoKgCentavos === null) continue;
    if (existente && anterior === p.custoKgCentavos) continue;
    const linha = existente
      ? await tx.precoKgAluminio.update({ where: { id: existente.id }, data: { custoKgCentavos: p.custoKgCentavos, atualizadoPorId: ctx.usuario.id } })
      : await tx.precoKgAluminio.create({ data: { acabamentoId: e.acabamentoId, linhaId: p.linhaId, custoKgCentavos: p.custoKgCentavos, criadoPorId: ctx.usuario.id, atualizadoPorId: ctx.usuario.id } });
    await tx.historicoPrecoKg.create({
      data: { precoKgId: linha.id, custoAnteriorCentavos: anterior, custoNovoCentavos: p.custoKgCentavos, origem: "MANUAL", usuarioId: ctx.usuario.id, criadoPorId: ctx.usuario.id, atualizadoPorId: ctx.usuario.id },
    });
    await registrarAuditoria(tx, { usuario: ctx.usuario, entidade: "PrecoKgAluminio", entidadeId: linha.id, acao: existente ? "ATUALIZAR" : "CRIAR", antes: existente ? { custoKgCentavos: anterior } : undefined, depois: { acabamento: acabamento.nome, linhaId: p.linhaId, custoKgCentavos: p.custoKgCentavos }, ip: ctx.ip });
    mudancas += 1;
  }
  if (mudancas === 0) throw new ErroNegocio("Nada foi alterado.");
  const recalculo = await recalcularPerfisDoAcabamento(tx, e.acabamentoId, ctx);
  return { mudancas, ...recalculo };
}

/** Sem escopo, o reajuste vale para TODOS os preços do kg; com escopo, só para os acabamentos listados. */
export type EscopoDoReajusteKg = { acabamentoIds: readonly string[] };

export type LinhaDoReajusteKg = { id: string; acabamento: string; linha: string | null; anteriorCentavos: number; novoCentavos: number | null };

/** Prévia do reajuste em todos os preços do kg preenchidos (nada é gravado). Linha cujo resultado é inválido sai com `novoCentavos: null`. */
export async function previaDoReajusteKg(db: Pick<Tx, "precoKgAluminio">, percentualPb: number, escopo?: EscopoDoReajusteKg): Promise<LinhaDoReajusteKg[]> {
  const linhas = await db.precoKgAluminio.findMany({
    where: { deletadoEm: null, custoKgCentavos: { not: null }, ...(escopo ? { acabamentoId: { in: [...escopo.acabamentoIds] } } : {}) },
    select: { id: true, custoKgCentavos: true, acabamento: { select: { nome: true } }, linha: { select: { nome: true } } },
    orderBy: [{ acabamento: { nome: "asc" } }, { linha: { nome: "asc" } }],
  });
  return linhas.map((l) => ({ id: l.id, acabamento: l.acabamento.nome, linha: l.linha?.nome ?? null, anteriorCentavos: l.custoKgCentavos!, novoCentavos: reajustarPrecoKg(l.custoKgCentavos, percentualPb) }));
}

/** Aplica o reajuste em TODOS os preços do kg preenchidos (o mesmo percentual), com histórico "REAJUSTE_LOTE", e recalcula os perfis. */
export async function aplicarReajusteKg(tx: Tx, percentualPb: number, ctx: ContextoPrecoKg, escopo?: EscopoDoReajusteKg) {
  if (!Number.isInteger(percentualPb) || percentualPb === 0 || Math.abs(percentualPb) > 100_000) throw new ErroNegocio("Informe um percentual diferente de zero.");
  const previa = await previaDoReajusteKg(tx, percentualPb, escopo);
  if (previa.length === 0) throw new ErroNegocio("Não há preço do kg informado para reajustar.");
  const invalidas = previa.filter((l) => l.novoCentavos === null);
  if (invalidas.length > 0) throw new ErroNegocio(`O reajuste deixaria ${invalidas.length} preço(s) inválido(s) (zero, negativo ou acima do teto). Nada foi aplicado.`);
  const acabamentos = new Set<string>();
  for (const l of previa) {
    const linha = await tx.precoKgAluminio.update({ where: { id: l.id }, data: { custoKgCentavos: l.novoCentavos, atualizadoPorId: ctx.usuario.id }, select: { acabamentoId: true } });
    acabamentos.add(linha.acabamentoId);
    await tx.historicoPrecoKg.create({
      data: { precoKgId: l.id, custoAnteriorCentavos: l.anteriorCentavos, custoNovoCentavos: l.novoCentavos, origem: "REAJUSTE_LOTE", usuarioId: ctx.usuario.id, observacao: `${percentualPb > 0 ? "+" : ""}${percentualPb / 100}%`, criadoPorId: ctx.usuario.id, atualizadoPorId: ctx.usuario.id },
    });
  }
  let atualizados = 0;
  for (const a of acabamentos) atualizados += (await recalcularPerfisDoAcabamento(tx, a, ctx)).atualizados;
  await registrarAuditoria(tx, { usuario: ctx.usuario, entidade: "PrecoKgAluminio", entidadeId: "reajuste-lote", acao: "REAJUSTE_LOTE", depois: { percentualPb, precos: previa.length, perfisAtualizados: atualizados }, ip: ctx.ip });
  return { precos: previa.length, perfisAtualizados: atualizados };
}
