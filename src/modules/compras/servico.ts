import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { ErroNegocio } from "@/lib/acoes";
import { registrarAuditoria } from "@/lib/auditoria";
import type { UsuarioSessao } from "@/lib/auth/sessao";
import { conferirRecebimento, custoUnitarioDaEntrega, numeroDaCompra, podeCancelarCompra, statusAposRecebimento, type StatusDaCompra } from "@/lib/dominio/compras";
import { atualizarCustoPeloUltimoRecebimento } from "@/lib/dominio/custo-produto";
import { valorDaEntrega } from "@/lib/dominio/perfil-kg";
import { dataLocalDoInstante } from "@/lib/formatadores";
import { registrarMovimentoDeEstoque } from "@/modules/estoque/servico";
import { criarContasAPagar } from "@/modules/financeiro/servico-pagar";
import { definirPrecosKgDoAcabamento } from "@/modules/produtos/servico-preco-kg";

type Tx = Prisma.TransactionClient;
export type ContextoCompras = { usuario: UsuarioSessao; ip: string | null; agora?: Date };

const comoData = (texto: string): Date => new Date(`${texto}T00:00:00Z`);
const decimal = (m: number): string => (m / 1000).toFixed(3);
const milesimos = (d: { toString(): string }): number => Math.round(Number(d.toString()) * 1000);

const STATUS_QUE_RECEBEM_MATERIAL = ["APROVADO", "EM_EXECUCAO", "CONCLUIDO"] as const;
const UNIDADES = ["UN", "M", "M2", "KG", "BARRA", "L", "PAR", "CJ"] as const;
export type UnidadeDeCompra = (typeof UNIDADES)[number];

/** Próximo número da compra (`C-0001`): UPSERT atômico no contador. */
export async function proximoNumeroDeCompra(tx: Tx): Promise<number> {
  const linhas = await tx.$queryRaw<{ valor: number }[]>`
    INSERT INTO "ContadorSequencia" ("chave", "valor", "atualizadoEm")
    VALUES ('compra', 1, now())
    ON CONFLICT ("chave") DO UPDATE SET "valor" = "ContadorSequencia"."valor" + 1, "atualizadoEm" = now()
    RETURNING "valor"`;
  return Number(linhas[0].valor);
}

export type ItemDeCompraEntrada = {
  /** Item já existente (edição); vazio = item novo. */
  id?: string;
  produtoId: string | null;
  descricao: string | null;
  unidadeCompra: UnidadeDeCompra;
  quantidadeMilesimos: number;
  /** Preço por unidade de compra; null = sem preço ("sem custo"). */
  precoUnitarioCentavos: number | null;
  larguraMm?: number | null;
  alturaMm?: number | null;
  espessuraMm?: number | null;
  tipoVidroId?: string | null;
  beneficiamentos?: string | null;
  itemPropostaId?: string | null;
  itemPropostaMedidaId?: string | null;
};

export type EntradaDeCompra = {
  fornecedorId: string;
  tipo: "MATERIAL" | "VIDRO";
  destino: "ESTOQUE" | "OBRA";
  projetoId: string | null;
  previsaoEntrega: string | null;
  condicoes: string | null;
  observacao: string | null;
  itens: ItemDeCompraEntrada[];
};

async function conferirCabecalho(tx: Tx, e: EntradaDeCompra) {
  const fornecedor = await tx.fornecedor.findFirst({ where: { id: e.fornecedorId, deletadoEm: null }, select: { id: true } });
  if (!fornecedor) throw new ErroNegocio("Fornecedor não encontrado.", { fornecedorId: "Escolha um fornecedor." });
  if (e.destino === "OBRA") {
    if (!e.projetoId) throw new ErroNegocio("Escolha a obra: compra com destino à obra é custo direto dela.", { projetoId: "Escolha a obra." });
    const p = await tx.projeto.findFirst({ where: { id: e.projetoId, deletadoEm: null }, select: { status: true } });
    if (!p) throw new ErroNegocio("Obra não encontrada.", { projetoId: "Escolha uma obra da lista." });
    if (!(STATUS_QUE_RECEBEM_MATERIAL as readonly string[]).includes(p.status)) throw new ErroNegocio("Só obras aprovadas, em execução ou concluídas recebem material.", { projetoId: "Escolha uma obra aprovada." });
  } else if (e.projetoId) {
    throw new ErroNegocio("Compra para o estoque não tem obra: escolha o destino “Obra” ou tire a obra.", { projetoId: "Tire a obra ou mude o destino." });
  }
  if (e.itens.length === 0) throw new ErroNegocio("Inclua ao menos um item.", { itens: "Inclua ao menos um item." });
}

/** Confere cada item (produto existente ou descrição, quantidade, preço, unidade de compra coerente com o produto). */
async function conferirItens(tx: Tx, itens: readonly ItemDeCompraEntrada[]) {
  for (const [i, it] of itens.entries()) {
    const nome = `Item ${i + 1}`;
    if (!Number.isInteger(it.quantidadeMilesimos) || it.quantidadeMilesimos <= 0) throw new ErroNegocio(`${nome}: informe a quantidade (maior que zero).`);
    if (it.precoUnitarioCentavos !== null && (!Number.isInteger(it.precoUnitarioCentavos) || it.precoUnitarioCentavos <= 0)) throw new ErroNegocio(`${nome}: o preço precisa ser maior que zero (ou fique vazio: “sem custo”).`);
    if (!(UNIDADES as readonly string[]).includes(it.unidadeCompra)) throw new ErroNegocio(`${nome}: unidade inválida.`);
    if (!it.produtoId) {
      if (!it.descricao || it.descricao.trim().length < 2) throw new ErroNegocio(`${nome}: escolha um produto ou descreva o item.`);
      continue;
    }
    const p = await tx.produto.findFirst({ where: { id: it.produtoId, deletadoEm: null }, select: { unidade: true, descricao: true } });
    if (!p) throw new ErroNegocio(`${nome}: produto não encontrado.`);
    // A unidade de compra é a do produto; perfil (barra ou metro) também se compra por kg.
    const ok = it.unidadeCompra === p.unidade || (it.unidadeCompra === "KG" && (p.unidade === "BARRA" || p.unidade === "M"));
    if (!ok) throw new ErroNegocio(`${nome}: “${p.descricao}” é comprado em ${p.unidade.toLowerCase()} (ou em kg, se for perfil).`);
  }
}

const dadosDoItem = (it: ItemDeCompraEntrada) => ({
  produtoId: it.produtoId,
  descricao: it.descricao?.trim() || null,
  unidadeCompra: it.unidadeCompra,
  quantidade: decimal(it.quantidadeMilesimos),
  precoUnitarioCentavos: it.precoUnitarioCentavos,
  larguraMm: it.larguraMm ?? null,
  alturaMm: it.alturaMm ?? null,
  espessuraMm: it.espessuraMm ?? null,
  tipoVidroId: it.tipoVidroId ?? null,
  beneficiamentos: it.beneficiamentos?.trim() || null,
  itemPropostaId: it.itemPropostaId ?? null,
  itemPropostaMedidaId: it.itemPropostaMedidaId ?? null,
});

/** Cria a compra em RASCUNHO (ou já como PEDIDO), com número sequencial `C-0001`. */
export async function criarCompra(tx: Tx, e: EntradaDeCompra & { fazerPedido?: boolean }, ctx: ContextoCompras) {
  await conferirCabecalho(tx, e);
  await conferirItens(tx, e.itens);
  const numero = await proximoNumeroDeCompra(tx);
  const hoje = dataLocalDoInstante(ctx.agora ?? new Date());
  const compra = await tx.compra.create({
    data: {
      numero,
      fornecedorId: e.fornecedorId,
      tipo: e.tipo,
      destino: e.destino,
      projetoId: e.projetoId,
      status: e.fazerPedido ? "PEDIDO" : "RASCUNHO",
      dataPedido: e.fazerPedido ? comoData(hoje) : null,
      previsaoEntrega: e.previsaoEntrega ? comoData(e.previsaoEntrega) : null,
      condicoes: e.condicoes?.trim() || null,
      observacao: e.observacao?.trim() || null,
      criadoPorId: ctx.usuario.id,
      atualizadoPorId: ctx.usuario.id,
      itens: { create: e.itens.map((it, ordem) => ({ ordem: ordem + 1, ...dadosDoItem(it), criadoPorId: ctx.usuario.id, atualizadoPorId: ctx.usuario.id })) },
    },
    select: { id: true, numero: true, status: true },
  });
  await registrarAuditoria(tx, { usuario: ctx.usuario, entidade: "Compra", entidadeId: compra.id, acao: "CRIAR", depois: { numero: numeroDaCompra(numero), status: compra.status, destino: e.destino, tipo: e.tipo, itens: e.itens.length }, ip: ctx.ip });
  return compra;
}

async function travarCompra(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "Compra" WHERE "id" = ${id} AND "deletadoEm" IS NULL FOR UPDATE`;
  const c = await tx.compra.findFirst({ where: { id, deletadoEm: null }, include: { itens: { where: { deletadoEm: null }, orderBy: { ordem: "asc" } }, fornecedor: { select: { razaoSocial: true } } } });
  if (!c) throw new ErroNegocio("Compra não encontrada.");
  return c;
}

/**
 * Edita a compra. Sem recebimento, tudo pode mudar (itens novos, alterados e removidos). Com recebimento, o cabeçalho de
 * destino/fornecedor/obra e os itens já recebidos ficam travados: muda só a previsão, as condições, a observação, a quantidade
 * do pedido (nunca abaixo do que já chegou) e o preço do que ainda não chegou; item recebido não se remove.
 */
export async function atualizarCompra(tx: Tx, compraId: string, e: EntradaDeCompra, ctx: ContextoCompras) {
  const c = await travarCompra(tx, compraId);
  if (c.status === "RECEBIDO" || c.status === "CANCELADO") throw new ErroNegocio(c.status === "RECEBIDO" ? "A compra já foi recebida por inteiro." : "A compra está cancelada.");
  const recebeu = c.itens.some((i) => milesimos(i.quantidadeRecebida) > 0);
  if (recebeu && (e.fornecedorId !== c.fornecedorId || e.destino !== c.destino || e.tipo !== c.tipo || (e.projetoId ?? null) !== (c.projetoId ?? null))) {
    throw new ErroNegocio("Já houve recebimento: fornecedor, tipo, destino e obra não mudam mais.");
  }
  await conferirCabecalho(tx, e);
  await conferirItens(tx, e.itens);

  const existentes = new Map(c.itens.map((i) => [i.id, i]));
  const mantidos = new Set<string>();
  for (const it of e.itens) {
    if (!it.id) continue;
    const atual = existentes.get(it.id);
    if (!atual) throw new ErroNegocio("Algum item não pertence a esta compra. Recarregue a página.");
    mantidos.add(it.id);
    const recebida = milesimos(atual.quantidadeRecebida);
    if (recebida > 0) {
      if (it.quantidadeMilesimos < recebida) throw new ErroNegocio(`Item ${atual.ordem}: o pedido não pode ficar abaixo do que já chegou.`);
      if ((it.produtoId ?? null) !== (atual.produtoId ?? null) || it.unidadeCompra !== atual.unidadeCompra) throw new ErroNegocio(`Item ${atual.ordem}: produto e unidade não mudam depois do recebimento.`);
    }
  }
  for (const i of c.itens) {
    if (!mantidos.has(i.id) && milesimos(i.quantidadeRecebida) > 0) throw new ErroNegocio(`O item ${i.ordem} já foi recebido e não pode ser removido.`);
  }

  await tx.compra.update({
    where: { id: c.id },
    data: { fornecedorId: e.fornecedorId, tipo: e.tipo, destino: e.destino, projetoId: e.projetoId, previsaoEntrega: e.previsaoEntrega ? comoData(e.previsaoEntrega) : null, condicoes: e.condicoes?.trim() || null, observacao: e.observacao?.trim() || null, atualizadoPorId: ctx.usuario.id },
  });
  const agora = ctx.agora ?? new Date();
  // Item removido sai da numeração (a ordem é única por compra, inclusive entre os excluídos): vai para uma ordem negativa própria.
  for (const i of c.itens) {
    if (!mantidos.has(i.id)) await tx.itemCompra.update({ where: { id: i.id }, data: { deletadoEm: agora, ordem: -(1_000_000 + Math.floor(Math.random() * 1_000_000_000)), atualizadoPorId: ctx.usuario.id } });
  }
  let ordem = 0;
  for (const it of e.itens) {
    ordem += 1;
    if (it.id) await tx.itemCompra.update({ where: { id: it.id }, data: { ordem: -ordem, atualizadoPorId: ctx.usuario.id } }); // libera a ordem (única) durante a troca
  }
  ordem = 0;
  for (const it of e.itens) {
    ordem += 1;
    if (it.id) await tx.itemCompra.update({ where: { id: it.id }, data: { ordem, ...dadosDoItem(it), atualizadoPorId: ctx.usuario.id } });
    else await tx.itemCompra.create({ data: { compraId: c.id, ordem, ...dadosDoItem(it), criadoPorId: ctx.usuario.id, atualizadoPorId: ctx.usuario.id } });
  }
  await registrarAuditoria(tx, { usuario: ctx.usuario, entidade: "Compra", entidadeId: c.id, acao: "ATUALIZAR", depois: { numero: numeroDaCompra(c.numero), itens: e.itens.length }, ip: ctx.ip });
  // Mudou o pedido: o status derivado pode mudar (ex.: item aumentado deixa de estar "recebida").
  const depois = await tx.itemCompra.findMany({ where: { compraId: c.id, deletadoEm: null }, select: { quantidade: true, quantidadeRecebida: true } });
  const novo = statusAposRecebimento(c.status as StatusDaCompra, depois.map((x) => ({ quantidadeMilesimos: milesimos(x.quantidade), recebidaMilesimos: milesimos(x.quantidadeRecebida) })));
  if (novo !== c.status) await tx.compra.update({ where: { id: c.id }, data: { status: novo } });
}

/** RASCUNHO → PEDIDO (a compra foi feita ao fornecedor). */
export async function fazerPedido(tx: Tx, compraId: string, ctx: ContextoCompras) {
  const c = await travarCompra(tx, compraId);
  if (c.status !== "RASCUNHO") throw new ErroNegocio("Só um rascunho vira pedido.");
  if (c.itens.length === 0) throw new ErroNegocio("Inclua ao menos um item.");
  await tx.compra.update({ where: { id: c.id }, data: { status: "PEDIDO", dataPedido: comoData(dataLocalDoInstante(ctx.agora ?? new Date())), atualizadoPorId: ctx.usuario.id } });
  await registrarAuditoria(tx, { usuario: ctx.usuario, entidade: "Compra", entidadeId: c.id, acao: "PEDIR", antes: { status: "RASCUNHO" }, depois: { status: "PEDIDO", numero: numeroDaCompra(c.numero) }, ip: ctx.ip });
}

/** Cancela uma compra que não recebeu nada (com recebimento, estorna-se antes). */
export async function cancelarCompra(tx: Tx, compraId: string, motivo: string, ctx: ContextoCompras) {
  if (motivo.trim().length < 3) throw new ErroNegocio("Informe o motivo do cancelamento.", { motivo: "Informe o motivo." });
  const c = await travarCompra(tx, compraId);
  const recebido = c.itens.reduce((s, i) => s + milesimos(i.quantidadeRecebida), 0);
  const pode = podeCancelarCompra(c.status as StatusDaCompra, recebido);
  if (!pode.ok) throw new ErroNegocio(pode.erro);
  await tx.compra.update({ where: { id: c.id }, data: { status: "CANCELADO", observacao: [c.observacao, `Cancelada: ${motivo.trim()}`].filter(Boolean).join("\n"), atualizadoPorId: ctx.usuario.id } });
  await registrarAuditoria(tx, { usuario: ctx.usuario, entidade: "Compra", entidadeId: c.id, acao: "CANCELAR", antes: { status: c.status }, depois: { status: "CANCELADO", motivo: motivo.trim() }, ip: ctx.ip });
}

export type ItemRecebido = {
  itemCompraId: string;
  /** Quantidade que chegou, na unidade de COMPRA (o que foi cobrado: kg ou barras). */
  quantidadeCompraMilesimos: number;
  /** Quantidade que ENTRA no estoque, na unidade do produto. Vazio quando as unidades são iguais (vale a mesma quantidade). */
  quantidadeEstoqueMilesimos?: number | null;
  /** Valor total desta entrega, se diferente de quantidade × preço (ex.: pesou diferente na balança). */
  valorTotalCentavos?: number | null;
  /** Perfil comprado por kg: atualizar o preço do kg do acabamento com o preço desta compra. */
  atualizarPrecoKg?: boolean;
};

export type EntradaDeRecebimento = {
  compraId: string;
  data: string;
  observacao?: string | null;
  itens: ItemRecebido[];
  /** Gera a conta a pagar do que foi recebido (com preço), ligada à compra; o custo da obra continua lendo a compra. */
  contaPagar?: { categoriaId: string; vencimento: string; parcelas: number; forma: "PIX" | "TRANSFERENCIA" | "ESPECIE" | "CARTAO_CREDITO" | "BOLETO" | null } | null;
};

/**
 * Recebe (total ou parcialmente) os itens de uma compra, numa transação: guarda o recebimento com o valor CONGELADO, dá entrada
 * no estoque (destino ESTOQUE; o destino OBRA não passa pelo estoque), atualiza o custo do produto pelo ÚLTIMO custo (perfil por
 * kg: oferece atualizar o preço do kg), e, se pedido, gera a conta a pagar. O recebimento nunca passa do pedido; item sem preço
 * entra "sem custo" (a margem da obra fica incompleta); quando a unidade de compra difere da do estoque (kg × barras), a
 * quantidade que entra no estoque é informada, nunca presumida.
 */
export async function receberCompra(tx: Tx, e: EntradaDeRecebimento, ctx: ContextoCompras) {
  const c = await travarCompra(tx, e.compraId);
  if (c.status === "CANCELADO") throw new ErroNegocio("A compra está cancelada.");
  if (c.status === "RECEBIDO") throw new ErroNegocio("A compra já foi recebida por inteiro.");
  if (e.itens.length === 0) throw new ErroNegocio("Informe o que chegou.");
  if (new Set(e.itens.map((i) => i.itemCompraId)).size !== e.itens.length) throw new ErroNegocio("Há um item repetido no recebimento.");
  const hoje = dataLocalDoInstante(ctx.agora ?? new Date());
  if (e.data > hoje) throw new ErroNegocio("A data do recebimento não pode ser no futuro.", { data: "A data não pode ser no futuro." });

  const itensDaCompra = new Map(c.itens.map((i) => [i.id, i]));
  const recebimento = await tx.recebimentoCompra.create({ data: { compraId: c.id, data: comoData(e.data), observacao: e.observacao?.trim() || null, criadoPorId: ctx.usuario.id, atualizadoPorId: ctx.usuario.id } });

  let valorTotalComPreco = 0;
  const linhas: { descricao: string; valor: number | null }[] = [];
  for (const r of e.itens) {
    const item = itensDaCompra.get(r.itemCompraId);
    if (!item) throw new ErroNegocio("Algum item não pertence a esta compra. Recarregue a página.");
    const nome = `Item ${item.ordem}`;
    const conf = conferirRecebimento({ quantidadeMilesimos: milesimos(item.quantidade), recebidaMilesimos: milesimos(item.quantidadeRecebida), recebeMilesimos: r.quantidadeCompraMilesimos });
    if (!conf.ok) throw new ErroNegocio(`${nome}: ${conf.erro}`);

    const produto = item.produtoId ? await tx.produto.findFirst({ where: { id: item.produtoId, deletadoEm: null }, select: { id: true, codigo: true, descricao: true, unidade: true, custoUnitarioCentavos: true, custoPorKg: true, acabamentoId: true, linhaId: true, fornecedorPrincipalId: true } }) : null;
    if (item.produtoId && !produto) throw new ErroNegocio(`${nome}: o produto não existe mais.`);

    // Quantidade que entra no estoque: a mesma da compra quando as unidades coincidem; senão, informada (ex.: 30 kg → 10 barras).
    let qEstoque = r.quantidadeCompraMilesimos;
    if (produto && item.unidadeCompra !== produto.unidade) {
      if (!r.quantidadeEstoqueMilesimos || r.quantidadeEstoqueMilesimos <= 0) throw new ErroNegocio(`${nome}: informe quantas ${produto.unidade === "BARRA" ? "barras" : produto.unidade === "M" ? "metros" : "unidades"} entraram no estoque (a compra foi em ${item.unidadeCompra.toLowerCase()}).`);
      qEstoque = r.quantidadeEstoqueMilesimos;
    }
    const valor = r.valorTotalCentavos != null ? r.valorTotalCentavos : valorDaEntrega(r.quantidadeCompraMilesimos, item.precoUnitarioCentavos);
    if (valor !== null && (!Number.isInteger(valor) || valor <= 0)) throw new ErroNegocio(`${nome}: o valor da entrega precisa ser maior que zero.`);
    const custoUnitario = custoUnitarioDaEntrega(valor, qEstoque);

    const ir = await tx.itemRecebimento.create({
      data: { recebimentoId: recebimento.id, itemCompraId: item.id, quantidadeCompra: decimal(r.quantidadeCompraMilesimos), quantidadeEstoque: decimal(qEstoque), valorCentavos: valor, custoUnitarioCentavos: custoUnitario, criadoPorId: ctx.usuario.id, atualizadoPorId: ctx.usuario.id },
    });
    await tx.itemCompra.update({ where: { id: item.id }, data: { quantidadeRecebida: decimal(milesimos(item.quantidadeRecebida) + r.quantidadeCompraMilesimos), atualizadoPorId: ctx.usuario.id } });

    // Entrada no estoque (destino ESTOQUE). Custo congelado da entrega; sem preço, "sem custo" (null, nunca o custo antigo do produto).
    if (c.destino === "ESTOQUE" && produto) {
      await registrarMovimentoDeEstoque(tx, { produtoId: produto.id, tipo: "ENTRADA_COMPRA", quantidadeMilesimos: qEstoque, data: e.data, custoUnitarioCentavos: custoUnitario, itemRecebimentoId: ir.id, justificativa: `Compra ${numeroDaCompra(c.numero)}` }, ctx);
    }

    // Último custo do produto (e histórico COMPRA). Perfil por kg comprado em kg: o preço do kg do acabamento (se marcado).
    if (produto && item.precoUnitarioCentavos !== null) {
      if (item.unidadeCompra === "KG" && produto.custoPorKg && r.atualizarPrecoKg && produto.acabamentoId) {
        try {
          await definirPrecosKgDoAcabamento(tx, { acabamentoId: produto.acabamentoId, precos: [{ linhaId: produto.linhaId, custoKgCentavos: item.precoUnitarioCentavos }], origem: "COMPRA", compraId: c.id }, ctx);
        } catch (erro) {
          if (!(erro instanceof ErroNegocio && erro.message === "Nada foi alterado.")) throw erro;
        }
      } else if (custoUnitario !== null) {
        const atual = await tx.produto.findUniqueOrThrow({ where: { id: produto.id }, select: { custoUnitarioCentavos: true } });
        const mudanca = atualizarCustoPeloUltimoRecebimento(atual.custoUnitarioCentavos, custoUnitario);
        if (mudanca.muda) {
          await tx.produto.update({ where: { id: produto.id }, data: { custoUnitarioCentavos: mudanca.novoCentavos, custoAtualizadoEm: ctx.agora ?? new Date(), atualizadoPorId: ctx.usuario.id } });
          await tx.historicoPreco.create({
            data: { produtoId: produto.id, custoAnteriorCentavos: mudanca.anteriorCentavos, custoNovoCentavos: mudanca.novoCentavos, origem: "COMPRA", compraId: c.id, fornecedorId: c.fornecedorId, usuarioId: ctx.usuario.id, observacao: `Compra ${numeroDaCompra(c.numero)}`, criadoPorId: ctx.usuario.id, atualizadoPorId: ctx.usuario.id },
          });
        }
      }
    }
    if (valor !== null) valorTotalComPreco += valor;
    linhas.push({ descricao: produto?.descricao ?? item.descricao ?? nome, valor });
  }

  // Status derivado do que foi recebido; a data do pedido nasce no primeiro recebimento de uma compra que ainda era rascunho.
  const depois = await tx.itemCompra.findMany({ where: { compraId: c.id, deletadoEm: null }, select: { quantidade: true, quantidadeRecebida: true } });
  const atual: StatusDaCompra = c.status === "RASCUNHO" ? "PEDIDO" : (c.status as StatusDaCompra);
  const novo = statusAposRecebimento(atual, depois.map((x) => ({ quantidadeMilesimos: milesimos(x.quantidade), recebidaMilesimos: milesimos(x.quantidadeRecebida) })));
  await tx.compra.update({ where: { id: c.id }, data: { status: novo, dataPedido: c.dataPedido ?? comoData(hoje), atualizadoPorId: ctx.usuario.id } });

  let contaPagarId: string | null = null;
  if (e.contaPagar) {
    if (valorTotalComPreco <= 0) throw new ErroNegocio("Nenhum item recebido tem preço: não há valor para a conta a pagar.", { contaPagar: "Sem valor para gerar a conta." });
    const parcelas = Math.max(1, Math.min(60, e.contaPagar.parcelas));
    const r = await criarContasAPagar(
      tx,
      {
        descricao: `Compra ${numeroDaCompra(c.numero)} — ${c.fornecedor.razaoSocial}`,
        modo: parcelas > 1 ? "PARCELADA" : "UNICA",
        fornecedorId: c.fornecedorId,
        funcionarioId: null,
        favorecido: null,
        categoriaId: e.contaPagar.categoriaId,
        projetoId: c.destino === "OBRA" ? c.projetoId : null,
        valor: valorTotalComPreco,
        vencimento: e.contaPagar.vencimento,
        parcelas,
        periodicidade: "MENSAL",
        fimRecorrencia: null,
        forma: e.contaPagar.forma,
        observacao: null,
        compraId: c.id,
      },
      { usuario: ctx.usuario, ip: ctx.ip, agora: ctx.agora },
    );
    contaPagarId = r.primeiraId;
  }

  await registrarAuditoria(tx, {
    usuario: ctx.usuario,
    entidade: "Compra",
    entidadeId: c.id,
    acao: "RECEBER",
    depois: { numero: numeroDaCompra(c.numero), recebimentoId: recebimento.id, data: e.data, status: novo, itens: linhas, valorCentavos: valorTotalComPreco, contaPagarId },
    ip: ctx.ip,
  });
  return { recebimentoId: recebimento.id, status: novo, valorCentavos: valorTotalComPreco, contaPagarId };
}

/**
 * Desfaz um recebimento: as entradas de estoque ganham o movimento inverso, a quantidade recebida volta e o status se recalcula.
 * Recusa se a compra tem conta a pagar ativa (cancele-a antes: o dinheiro pode já ter saído). O recebimento fica como excluído
 * (logicamente) e deixa de entrar no custo da obra.
 */
export async function estornarRecebimento(tx: Tx, recebimentoId: string, motivo: string, ctx: ContextoCompras) {
  if (motivo.trim().length < 3) throw new ErroNegocio("Informe o motivo do estorno.", { motivo: "Informe o motivo." });
  const r0 = await tx.recebimentoCompra.findFirst({ where: { id: recebimentoId, deletadoEm: null }, select: { compraId: true } });
  if (!r0) throw new ErroNegocio("Recebimento não encontrado.");
  const c = await travarCompra(tx, r0.compraId);
  const r = await tx.recebimentoCompra.findFirst({ where: { id: recebimentoId, deletadoEm: null }, include: { itens: { where: { deletadoEm: null } } } });
  if (!r) throw new ErroNegocio("Este recebimento já foi estornado.");
  const contasAtivas = await tx.contaPagar.count({ where: { compraId: c.id, deletadoEm: null, status: { not: "CANCELADA" } } });
  if (contasAtivas > 0) throw new ErroNegocio("Esta compra tem conta a pagar ativa: cancele a conta antes de estornar o recebimento.");

  const agora = ctx.agora ?? new Date();
  const hoje = dataLocalDoInstante(agora);
  for (const ir of r.itens) {
    const entradas = await tx.movimentoEstoque.findMany({ where: { itemRecebimentoId: ir.id, deletadoEm: null, estornadoPor: null }, select: { id: true, produtoId: true, quantidade: true, custoUnitarioCentavos: true } });
    for (const m of entradas) {
      await registrarMovimentoDeEstoque(tx, { produtoId: m.produtoId, tipo: "AJUSTE", sentido: -1, quantidadeMilesimos: Math.abs(milesimos(m.quantidade)), data: hoje, custoUnitarioCentavos: m.custoUnitarioCentavos, confirmarSemSaldo: true, justificativa: `Estorno do recebimento da compra ${numeroDaCompra(c.numero)}: ${motivo.trim()}`, estornoDeId: m.id }, ctx);
    }
    const item = c.itens.find((i) => i.id === ir.itemCompraId);
    if (item) await tx.itemCompra.update({ where: { id: item.id }, data: { quantidadeRecebida: decimal(Math.max(0, milesimos(item.quantidadeRecebida) - milesimos(ir.quantidadeCompra))), atualizadoPorId: ctx.usuario.id } });
    await tx.itemRecebimento.update({ where: { id: ir.id }, data: { deletadoEm: agora, atualizadoPorId: ctx.usuario.id } });
  }
  await tx.recebimentoCompra.update({ where: { id: r.id }, data: { deletadoEm: agora, observacao: [r.observacao, `Estornado: ${motivo.trim()}`].filter(Boolean).join("\n"), atualizadoPorId: ctx.usuario.id } });
  const depois = await tx.itemCompra.findMany({ where: { compraId: c.id, deletadoEm: null }, select: { quantidade: true, quantidadeRecebida: true } });
  const novo = statusAposRecebimento(c.status === "RASCUNHO" ? "PEDIDO" : (c.status as StatusDaCompra), depois.map((x) => ({ quantidadeMilesimos: milesimos(x.quantidade), recebidaMilesimos: milesimos(x.quantidadeRecebida) })));
  await tx.compra.update({ where: { id: c.id }, data: { status: novo, atualizadoPorId: ctx.usuario.id } });
  await registrarAuditoria(tx, { usuario: ctx.usuario, entidade: "Compra", entidadeId: c.id, acao: "ESTORNAR_RECEBIMENTO", depois: { numero: numeroDaCompra(c.numero), recebimentoId: r.id, motivo: motivo.trim(), status: novo }, ip: ctx.ip });
  return { status: novo };
}
