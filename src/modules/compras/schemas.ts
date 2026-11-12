import { z } from "zod";

import { lerQuantidade } from "@/lib/dominio/estoque";
import { textoParaInteiro } from "@/lib/dominio/numeros";
import { parseMoedaParaCentavos } from "@/lib/formatadores";

import type { EntradaDeCompra, EntradaDeRecebimento, ItemDeCompraEntrada, ItemRecebido, UnidadeDeCompra } from "./servico";

/** Texto ausente vira vazio. */
const bruto = (max: number) => z.preprocess((v) => (typeof v === "string" ? v : ""), z.string().trim().max(max, `Use no máximo ${max} caracteres.`));
const id = z.string().trim().min(1).max(64);

function dataValida(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export const UNIDADES_DE_COMPRA = ["UN", "M", "M2", "KG", "BARRA", "L", "PAR", "CJ"] as const;

const itemBruto = z.object({
  id: z.string().max(64).nullish(),
  produtoId: z.string().max(64).nullish(),
  descricao: z.string().max(200).nullish(),
  unidadeCompra: z.string().max(10),
  quantidade: z.string().max(20),
  preco: z.string().max(24),
  larguraMm: z.string().max(8).nullish(),
  alturaMm: z.string().max(8).nullish(),
  espessuraMm: z.string().max(8).nullish(),
  tipoVidroId: z.string().max(64).nullish(),
  beneficiamentos: z.string().max(200).nullish(),
  itemPropostaId: z.string().max(64).nullish(),
  itemPropostaMedidaId: z.string().max(64).nullish(),
});

export const compraSchema = z.object({
  fornecedorId: bruto(64).refine((v) => v.length > 0, "Escolha o fornecedor."),
  tipo: z.enum(["MATERIAL", "VIDRO"], { message: "Escolha o tipo." }),
  destino: z.enum(["ESTOQUE", "OBRA"], { message: "Escolha o destino." }),
  projetoId: bruto(64),
  previsaoEntrega: bruto(10).refine((v) => v === "" || dataValida(v), "Previsão: informe uma data válida."),
  condicoes: bruto(300),
  observacao: bruto(1000),
  itens: z.array(itemBruto).min(1, "Inclua ao menos um item.").max(100, "No máximo 100 itens por compra."),
  fazerPedido: z.boolean().optional(),
});

/** Medida em mm: vazio = não informada (null). Texto que não se lê ("1.5", "abc") NÃO vira "sem medida" em silêncio: vira erro. */
function medidaEmMm(t: string | null | undefined): { valor: number | null; erro: boolean } {
  const texto = (t ?? "").trim();
  if (texto === "") return { valor: null, erro: false };
  const n = textoParaInteiro(texto);
  return n === null || n <= 0 ? { valor: null, erro: true } : { valor: n, erro: false };
}

/** Converte o formulário em entrada do serviço, devolvendo erros por item (`item:<n>`) quando algo não se lê. */
export function lerCompra(d: z.output<typeof compraSchema>): { ok: true; entrada: EntradaDeCompra } | { ok: false; erro: string; campos: Record<string, string> } {
  const campos: Record<string, string> = {};
  const itens: ItemDeCompraEntrada[] = [];
  d.itens.forEach((i, n) => {
    const q = lerQuantidade(i.quantidade);
    if (q === null || q <= 0) campos[`item:${n}:quantidade`] = "Quantidade maior que zero, com até 3 casas.";
    let preco: number | null = null;
    if (i.preco.trim() !== "") {
      preco = parseMoedaParaCentavos(i.preco);
      if (preco === null || preco <= 0) campos[`item:${n}:preco`] = "Preço em reais, ex.: 12,50.";
    }
    if (!(UNIDADES_DE_COMPRA as readonly string[]).includes(i.unidadeCompra)) campos[`item:${n}:unidade`] = "Unidade inválida.";
    const largura = medidaEmMm(i.larguraMm);
    const altura = medidaEmMm(i.alturaMm);
    const espessura = medidaEmMm(i.espessuraMm);
    if (largura.erro) campos[`item:${n}:larguraMm`] = "Largura em mm, só números inteiros (ex.: 1200).";
    if (altura.erro) campos[`item:${n}:alturaMm`] = "Altura em mm, só números inteiros (ex.: 2100).";
    if (espessura.erro) campos[`item:${n}:espessuraMm`] = "Espessura em mm, só números inteiros (ex.: 8).";
    itens.push({
      id: i.id || undefined,
      produtoId: i.produtoId || null,
      descricao: i.descricao?.trim() || null,
      unidadeCompra: i.unidadeCompra as UnidadeDeCompra,
      quantidadeMilesimos: q ?? 0,
      precoUnitarioCentavos: preco,
      larguraMm: largura.valor,
      alturaMm: altura.valor,
      espessuraMm: espessura.valor,
      tipoVidroId: i.tipoVidroId || null,
      beneficiamentos: i.beneficiamentos?.trim() || null,
      itemPropostaId: i.itemPropostaId || null,
      itemPropostaMedidaId: i.itemPropostaMedidaId || null,
    });
  });
  if (Object.keys(campos).length > 0) return { ok: false, erro: "Confira os itens da compra.", campos };
  return {
    ok: true,
    entrada: {
      fornecedorId: d.fornecedorId,
      tipo: d.tipo,
      destino: d.destino,
      projetoId: d.destino === "OBRA" ? d.projetoId || null : null,
      previsaoEntrega: d.previsaoEntrega || null,
      condicoes: d.condicoes || null,
      observacao: d.observacao || null,
      itens,
    },
  };
}

export const compraIdSchema = z.object({ compraId: id });
export const cancelarCompraSchema = z.object({ compraId: id, motivo: bruto(300).refine((v) => v.length >= 3, "Informe o motivo do cancelamento.") });
export const estornoDeRecebimentoSchema = z.object({ recebimentoId: id, motivo: bruto(300).refine((v) => v.length >= 3, "Informe o motivo do estorno.") });

const itemRecebidoBruto = z.object({
  itemCompraId: id,
  quantidade: z.string().max(20),
  quantidadeEstoque: z.string().max(20).nullish(),
  valorTotal: z.string().max(24).nullish(),
  atualizarPrecoKg: z.boolean().optional(),
});

export const recebimentoSchema = z.object({
  compraId: id,
  data: bruto(10).refine(dataValida, "Data: informe uma data válida."),
  observacao: bruto(300),
  itens: z.array(itemRecebidoBruto).min(1, "Informe o que chegou.").max(100),
  gerarConta: z.boolean().optional(),
  contaVencimento: bruto(10),
  contaParcelas: bruto(3),
  contaCategoriaId: bruto(64),
  contaForma: bruto(20),
});

const FORMAS = ["PIX", "TRANSFERENCIA", "ESPECIE", "CARTAO_CREDITO", "BOLETO"] as const;

export function lerRecebimento(d: z.output<typeof recebimentoSchema>): { ok: true; entrada: EntradaDeRecebimento } | { ok: false; erro: string; campos: Record<string, string> } {
  const campos: Record<string, string> = {};
  const itens: ItemRecebido[] = [];
  d.itens.forEach((i, n) => {
    // Linha sem quantidade = esse item não chegou agora.
    if (i.quantidade.trim() === "") return;
    const q = lerQuantidade(i.quantidade);
    if (q === null || q <= 0) campos[`item:${n}:quantidade`] = "Quantidade maior que zero, com até 3 casas.";
    let qe: number | null = null;
    if (i.quantidadeEstoque && i.quantidadeEstoque.trim() !== "") {
      qe = lerQuantidade(i.quantidadeEstoque);
      if (qe === null || qe <= 0) campos[`item:${n}:estoque`] = "Quantidade maior que zero, com até 3 casas.";
    }
    let valor: number | null = null;
    if (i.valorTotal && i.valorTotal.trim() !== "") {
      valor = parseMoedaParaCentavos(i.valorTotal);
      if (valor === null || valor <= 0) campos[`item:${n}:valor`] = "Valor em reais, ex.: 195,00.";
    }
    itens.push({ itemCompraId: i.itemCompraId, quantidadeCompraMilesimos: q ?? 0, quantidadeEstoqueMilesimos: qe, valorTotalCentavos: valor, atualizarPrecoKg: i.atualizarPrecoKg === true });
  });
  if (itens.length === 0 && Object.keys(campos).length === 0) return { ok: false, erro: "Informe a quantidade de ao menos um item que chegou.", campos: {} };

  let contaPagar: EntradaDeRecebimento["contaPagar"] = null;
  if (d.gerarConta) {
    if (!dataValida(d.contaVencimento)) campos.contaVencimento = "Informe o vencimento.";
    if (!d.contaCategoriaId) campos.contaCategoriaId = "Escolha a categoria da despesa.";
    const parcelas = Number(d.contaParcelas || "1");
    if (!Number.isInteger(parcelas) || parcelas < 1 || parcelas > 60) campos.contaParcelas = "De 1 a 60 parcelas.";
    const forma = (FORMAS as readonly string[]).includes(d.contaForma) ? (d.contaForma as (typeof FORMAS)[number]) : null;
    if (Object.keys(campos).length === 0) contaPagar = { categoriaId: d.contaCategoriaId, vencimento: d.contaVencimento, parcelas, forma };
  }
  if (Object.keys(campos).length > 0) return { ok: false, erro: "Confira o que foi digitado.", campos };
  return { ok: true, entrada: { compraId: d.compraId, data: d.data, observacao: d.observacao || null, itens, contaPagar } };
}
