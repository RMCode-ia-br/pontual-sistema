import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { ErroNegocio } from "@/lib/acoes";
import { registrarAuditoria } from "@/lib/auditoria";
import { destinoDaSobra, pesoDaSucata } from "@/lib/dominio/retalhos";
import { dataLocalDoInstante } from "@/lib/formatadores";
import { registrarLancamento } from "@/modules/financeiro/servico-lancamentos";

import { registrarMovimentoDeEstoque, type ContextoEstoque } from "./servico";
import { saldoDaSucata, travarSucata } from "./sucata-base";

export { saldoDaSucata };

type Tx = Prisma.TransactionClient;

const comoData = (texto: string): Date => new Date(`${texto}T00:00:00Z`);
const decimalKg = (milesimos: number): string => (milesimos / 1000).toFixed(3);
const milesimosDe = (d: { toString(): string } | null): number | null => (d === null ? null : Math.round(Number(d.toString()) * 1000));

const STATUS_QUE_RECEBEM_MATERIAL = ["APROVADO", "EM_EXECUCAO", "CONCLUIDO"] as const;

async function conferirObra(tx: Tx, projetoId: string) {
  const p = await tx.projeto.findFirst({ where: { id: projetoId, deletadoEm: null }, select: { codigo: true, status: true } });
  if (!p) throw new ErroNegocio("Obra não encontrada.", { projetoId: "Escolha uma obra da lista." });
  if (!(STATUS_QUE_RECEBEM_MATERIAL as readonly string[]).includes(p.status)) throw new ErroNegocio("Só obras aprovadas, em execução ou concluídas recebem material.", { projetoId: "Escolha uma obra aprovada." });
  return p;
}

export type EntradaDeBaixaDePerfil = {
  produtoId: string;
  projetoId: string;
  data: string;
  modo: "BARRAS_INTEIRAS" | "BARRA_CORTADA";
  /** Só em BARRAS_INTEIRAS: quantas barras inteiras (inteiro ≥ 1). */
  barras?: number;
  /** Só em BARRA_CORTADA: comprimento usado de UMA barra, em mm. */
  usadoMm?: number;
  /** Quando o retalho mínimo não está definido em Configurações, a pessoa escolhe o destino da sobra. */
  destinoDaSobra?: "RETALHO" | "SUCATA";
  local?: string | null;
  confirmarSemSaldo?: boolean;
  justificativa?: string | null;
};

export type ResultadoDaBaixa = { movimentoId: string; sobra: null | { destino: "NENHUMA" | "RETALHO" | "SUCATA"; comprimentoMm: number; retalhoId?: string; pesoMilesimosKg?: number | null } };

/**
 * Baixa de perfil (produto em BARRA) para uma obra: por barras inteiras, ou cortando UMA barra (comprimento usado). Na barra
 * cortada, a sobra ≥ retalhoMinimoMm (Configurações) vira retalho DISPONIVEL; a menor vira sucata (kg pelo peso por metro, ou só o
 * comprimento se o perfil não tem peso). Sem retalho mínimo definido, a pessoa escolhe e o sistema avisa. Sem comprimento da
 * barra no produto, pede (não assume 6.000). A saída de estoque é a da barra inteira, ao custo da época.
 */
export async function baixarPerfilParaObra(tx: Tx, e: EntradaDeBaixaDePerfil, ctx: ContextoEstoque): Promise<ResultadoDaBaixa> {
  const produto = await tx.produto.findFirst({ where: { id: e.produtoId, deletadoEm: null }, select: { id: true, descricao: true, unidade: true, comprimentoBarraMm: true, pesoKgPorMetro: true } });
  if (!produto) throw new ErroNegocio("Produto não encontrado.");
  if (produto.unidade !== "BARRA") throw new ErroNegocio("A baixa por barra vale para perfis cuja unidade é “Barra”.");
  const obra = await conferirObra(tx, e.projetoId);

  if (e.modo === "BARRAS_INTEIRAS") {
    if (!Number.isInteger(e.barras) || (e.barras ?? 0) < 1) throw new ErroNegocio("Informe quantas barras inteiras (número inteiro, 1 ou mais).", { barras: "Informe um número inteiro, 1 ou mais." });
    const m = await registrarMovimentoDeEstoque(
      tx,
      { produtoId: produto.id, tipo: "SAIDA_OBRA", quantidadeMilesimos: (e.barras as number) * 1000, data: e.data, projetoId: e.projetoId, confirmarSemSaldo: e.confirmarSemSaldo, justificativa: e.justificativa ?? `Baixa de ${e.barras} barra(s) inteira(s)` },
      ctx,
    );
    return { movimentoId: m.id, sobra: null };
  }

  const cfg = await tx.configuracaoEmpresa.findUnique({ where: { id: "singleton" }, select: { retalhoMinimoMm: true } });
  const pesoMil = milesimosDe(produto.pesoKgPorMetro);
  const r = destinoDaSobra({ comprimentoBarraMm: produto.comprimentoBarraMm, usadoMm: e.usadoMm ?? 0, retalhoMinimoMm: cfg?.retalhoMinimoMm ?? null, pesoMilesimosKgPorMetro: pesoMil });
  if (!r.ok) throw new ErroNegocio(r.erro, { usadoMm: r.erro });
  let destino: "NENHUMA" | "RETALHO" | "SUCATA";
  if (r.destino === "DECIDIR") {
    if (!e.destinoDaSobra) throw new ErroNegocio(r.aviso, { destinoDaSobra: "Escolha: retalho ou sucata." });
    destino = e.destinoDaSobra;
  } else destino = r.destino;
  const sobraMm = r.sobraMm;

  const nota = `Corte de ${e.usadoMm} mm de uma barra de ${produto.comprimentoBarraMm} mm${sobraMm > 0 ? `; sobra de ${sobraMm} mm → ${destino === "RETALHO" ? "retalho" : "sucata"}` : ""}`;
  const m = await registrarMovimentoDeEstoque(
    tx,
    { produtoId: produto.id, tipo: "SAIDA_OBRA", quantidadeMilesimos: 1000, data: e.data, projetoId: e.projetoId, confirmarSemSaldo: e.confirmarSemSaldo, justificativa: e.justificativa ? `${nota}. ${e.justificativa}` : nota },
    ctx,
  );

  if (destino === "NENHUMA") return { movimentoId: m.id, sobra: { destino, comprimentoMm: 0 } };
  if (destino === "RETALHO") {
    const retalho = await tx.retalho.create({
      data: { produtoId: produto.id, comprimentoMm: sobraMm, local: e.local?.trim() || null, origemProjetoId: e.projetoId, origemMovimentoId: m.id, criadoPorId: ctx.usuario.id, atualizadoPorId: ctx.usuario.id },
    });
    await registrarAuditoria(tx, { usuario: ctx.usuario, entidade: "Retalho", entidadeId: retalho.id, acao: "CRIAR", depois: { produto: produto.descricao, comprimentoMm: sobraMm, obra: obra.codigo, local: retalho.local }, ip: ctx.ip });
    return { movimentoId: m.id, sobra: { destino, comprimentoMm: sobraMm, retalhoId: retalho.id } };
  }
  await travarSucata(tx);
  const peso = pesoDaSucata(sobraMm, pesoMil);
  const s = await tx.movimentoSucata.create({
    data: { tipo: "GERACAO", data: comoData(e.data), pesoKg: peso === null ? null : decimalKg(peso), comprimentoMm: sobraMm, projetoId: e.projetoId, produtoId: produto.id, observacao: `mov:${m.id} · ${nota}`, criadoPorId: ctx.usuario.id, atualizadoPorId: ctx.usuario.id },
  });
  await registrarAuditoria(tx, { usuario: ctx.usuario, entidade: "MovimentoSucata", entidadeId: s.id, acao: "CRIAR", depois: { tipo: "GERACAO", produto: produto.descricao, comprimentoMm: sobraMm, pesoKg: s.pesoKg?.toString() ?? null, obra: obra.codigo }, ip: ctx.ip });
  return { movimentoId: m.id, sobra: { destino, comprimentoMm: sobraMm, pesoMilesimosKg: peso } };
}

/** Usa um retalho DISPONIVEL numa obra: vira CONSUMIDO (custo contado na obra de origem; aqui entra a R$ 0, como informação). */
export async function usarRetalhoEmObra(tx: Tx, e: { retalhoId: string; projetoId: string }, ctx: ContextoEstoque) {
  await tx.$queryRaw`SELECT "id" FROM "Retalho" WHERE "id" = ${e.retalhoId} AND "deletadoEm" IS NULL FOR UPDATE`;
  const r = await tx.retalho.findFirst({ where: { id: e.retalhoId, deletadoEm: null }, include: { produto: { select: { descricao: true } } } });
  if (!r) throw new ErroNegocio("Retalho não encontrado.");
  if (r.status !== "DISPONIVEL") throw new ErroNegocio("Este retalho já foi usado ou descartado.");
  const obra = await conferirObra(tx, e.projetoId);
  const agora = ctx.agora ?? new Date();
  await tx.retalho.update({ where: { id: r.id }, data: { status: "CONSUMIDO", consumidoProjetoId: e.projetoId, consumidoEm: agora, atualizadoPorId: ctx.usuario.id } });
  await registrarAuditoria(tx, { usuario: ctx.usuario, entidade: "Retalho", entidadeId: r.id, acao: "USAR", antes: { status: "DISPONIVEL" }, depois: { status: "CONSUMIDO", obra: obra.codigo, produto: r.produto.descricao, comprimentoMm: r.comprimentoMm }, ip: ctx.ip });
}

/** Descarta um retalho DISPONIVEL, com motivo; opcionalmente o peso vai para a sucata (se o perfil tem peso por metro; senão, o comprimento). */
export async function descartarRetalho(tx: Tx, e: { retalhoId: string; motivo: string; virarSucata: boolean }, ctx: ContextoEstoque) {
  if (e.motivo.trim().length < 3) throw new ErroNegocio("Informe o motivo do descarte.", { motivo: "Informe o motivo." });
  await tx.$queryRaw`SELECT "id" FROM "Retalho" WHERE "id" = ${e.retalhoId} AND "deletadoEm" IS NULL FOR UPDATE`;
  const r = await tx.retalho.findFirst({ where: { id: e.retalhoId, deletadoEm: null }, include: { produto: { select: { id: true, descricao: true, pesoKgPorMetro: true } } } });
  if (!r) throw new ErroNegocio("Retalho não encontrado.");
  if (r.status !== "DISPONIVEL") throw new ErroNegocio("Este retalho já foi usado ou descartado.");
  await tx.retalho.update({ where: { id: r.id }, data: { status: "DESCARTADO", observacao: e.motivo.trim(), atualizadoPorId: ctx.usuario.id } });
  if (e.virarSucata) {
    await travarSucata(tx);
    const peso = pesoDaSucata(r.comprimentoMm, milesimosDe(r.produto.pesoKgPorMetro));
    await tx.movimentoSucata.create({
      data: { tipo: "GERACAO", data: comoData(dataLocalDoInstante(ctx.agora ?? new Date())), pesoKg: peso === null ? null : decimalKg(peso), comprimentoMm: r.comprimentoMm, produtoId: r.produto.id, observacao: `retalho:${r.id} · descartado: ${e.motivo.trim()}`, criadoPorId: ctx.usuario.id, atualizadoPorId: ctx.usuario.id },
    });
  }
  await registrarAuditoria(tx, { usuario: ctx.usuario, entidade: "Retalho", entidadeId: r.id, acao: "DESCARTAR", antes: { status: "DISPONIVEL" }, depois: { status: "DESCARTADO", motivo: e.motivo.trim(), virouSucata: e.virarSucata }, ip: ctx.ip });
}

/** Ajuste do saldo de sucata em kg (positivo acrescenta, negativo retira), com observação. Não deixa o saldo ficar negativo. */
export async function ajustarSucata(tx: Tx, e: { data: string; pesoMilesimosKg: number; observacao: string }, ctx: ContextoEstoque) {
  if (!Number.isInteger(e.pesoMilesimosKg) || e.pesoMilesimosKg === 0) throw new ErroNegocio("Informe um peso diferente de zero.", { peso: "Informe um peso diferente de zero." });
  if (e.observacao.trim().length < 3) throw new ErroNegocio("Explique o ajuste.", { observacao: "Explique o ajuste." });
  await travarSucata(tx);
  const saldo = await saldoDaSucata(tx);
  if (saldo.pesoMilesimosKg + e.pesoMilesimosKg < 0) throw new ErroNegocio("O ajuste deixaria a sucata negativa.", { peso: "Passa do que há em sucata." });
  const m = await tx.movimentoSucata.create({ data: { tipo: "AJUSTE", data: comoData(e.data), pesoKg: decimalKg(e.pesoMilesimosKg), observacao: e.observacao.trim(), criadoPorId: ctx.usuario.id, atualizadoPorId: ctx.usuario.id } });
  await registrarAuditoria(tx, { usuario: ctx.usuario, entidade: "MovimentoSucata", entidadeId: m.id, acao: "AJUSTAR", depois: { pesoKg: m.pesoKg?.toString(), observacao: e.observacao.trim() }, ip: ctx.ip });
}

export type EntradaDeVendaDeSucata = {
  data: string;
  pesoMilesimosKg: number;
  valorCentavos: number;
  /** Conta onde o dinheiro entrou; vazio = só registra a venda, sem lançamento no financeiro. */
  contaFinanceiraId: string | null;
  /** Categoria de receita; vazio = a categoria "Venda de sucata" (semeada). */
  categoriaId: string | null;
  observacao: string | null;
};

/** Vende sucata (peso e valor digitados): baixa o saldo em kg e, se escolhida a conta, lança a entrada no financeiro na mesma transação. */
export async function venderSucata(tx: Tx, e: EntradaDeVendaDeSucata, ctx: ContextoEstoque) {
  if (!Number.isInteger(e.pesoMilesimosKg) || e.pesoMilesimosKg <= 0) throw new ErroNegocio("Informe o peso vendido (maior que zero).", { peso: "Informe o peso vendido." });
  if (!Number.isInteger(e.valorCentavos) || e.valorCentavos <= 0) throw new ErroNegocio("Informe o valor da venda (maior que zero).", { valor: "Informe o valor da venda." });
  await travarSucata(tx);
  const saldo = await saldoDaSucata(tx);
  if (e.pesoMilesimosKg > saldo.pesoMilesimosKg) throw new ErroNegocio(`Só há ${(saldo.pesoMilesimosKg / 1000).toLocaleString("pt-BR")} kg de sucata registrados: use um ajuste antes, se vendeu mais.`, { peso: "Passa do saldo de sucata." });

  let lancamentoId: string | null = null;
  if (e.contaFinanceiraId) {
    let categoriaId = e.categoriaId;
    if (!categoriaId) {
      const padrao = await tx.categoriaFinanceira.findFirst({ where: { tipo: "RECEITA", nome: { equals: "Venda de sucata", mode: "insensitive" }, ativo: true, deletadoEm: null }, select: { id: true } });
      if (!padrao) throw new ErroNegocio("Escolha a categoria da receita (a categoria “Venda de sucata” não está ativa).", { categoriaId: "Escolha a categoria." });
      categoriaId = padrao.id;
    }
    const l = await registrarLancamento(
      tx,
      { data: e.data, tipo: "ENTRADA", valorCentavos: e.valorCentavos, contaFinanceiraId: e.contaFinanceiraId, categoriaId, descricao: "Venda de sucata de alumínio", forma: null, comNotaFiscal: false, observacao: e.observacao },
      ctx,
    );
    lancamentoId = l.id;
  }
  const m = await tx.movimentoSucata.create({
    data: { tipo: "VENDA", data: comoData(e.data), pesoKg: decimalKg(e.pesoMilesimosKg), valorCentavos: e.valorCentavos, lancamentoId, observacao: e.observacao, criadoPorId: ctx.usuario.id, atualizadoPorId: ctx.usuario.id },
  });
  await registrarAuditoria(tx, { usuario: ctx.usuario, entidade: "MovimentoSucata", entidadeId: m.id, acao: "VENDER", depois: { pesoKg: m.pesoKg?.toString(), valorCentavos: e.valorCentavos, lancamentoId }, ip: ctx.ip });
  return { id: m.id, lancamentoId };
}
