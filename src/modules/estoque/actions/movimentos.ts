"use server";

import {
  falha,
  falhaDeValidacao,
  formDataParaObjeto,
  type ResultadoAcao,
} from "@/lib/acoes";
import { exigirSessao } from "@/lib/auth/sessao";
import { can } from "@/lib/permissoes";

import { rodarEstoque } from "../rodar";
import { contagemSchema, estornoSchema, movimentoSchema } from "../schemas";
import {
  contarEstoqueInicial,
  estornarMovimentoDeEstoque,
  registrarMovimentoDeEstoque,
} from "../servico";

/** Entrada, saída para obra, devolução, ajuste ou perda de UM produto. */
export async function registrarMovimento(
  _anterior: ResultadoAcao | null,
  formData: FormData,
): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "criar", "movimentoEstoque")) return falha("Sem permissão.");
  const dados = movimentoSchema.safeParse(formDataParaObjeto(formData));
  if (!dados.success) return falhaDeValidacao(dados.error);
  const d = dados.data;
  return rodarEstoque("estoque.movimento", async (tx, ip) => {
    await registrarMovimentoDeEstoque(
      tx,
      {
        produtoId: d.produtoId,
        tipo: d.tipo,
        quantidadeMilesimos: d.quantidade,
        sentido:
          d.sentido === "MAIS" ? 1 : d.sentido === "MENOS" ? -1 : undefined,
        data: d.data,
        projetoId: d.projetoId,
        // Custo digitado vale (e atualiza o custo do produto na entrada avulsa); vazio = o custo atual do produto.
        ...(d.custo !== null ? { custoUnitarioCentavos: d.custo } : {}),
        atualizarCustoDoProduto:
          d.tipo === "ENTRADA_COMPRA" && d.custo !== null
            ? { origem: "MANUAL", observacao: "Entrada avulsa" }
            : null,
        confirmarSemSaldo: d.confirmarSemSaldo,
        justificativa: d.justificativa,
      },
      { usuario: sessao, ip },
    );
    return { mensagem: "Movimento registrado." };
  });
}

/** Desfaz um movimento criando o inverso (nunca edita nem apaga). */
export async function estornarMovimento(
  entrada: unknown,
): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "movimentoEstoque"))
    return falha("Sem permissão.");
  const dados = estornoSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error);
  return rodarEstoque("estoque.estornar", async (tx, ip) => {
    await estornarMovimentoDeEstoque(
      tx,
      dados.data.movimentoId,
      dados.data.motivo,
      { usuario: sessao, ip },
    );
    return { mensagem: "Movimento estornado." };
  });
}

/** Contagem inicial opcional de vários produtos (só os que ainda não têm movimentos). */
export async function contarInicial(
  _anterior: ResultadoAcao | null,
  formData: FormData,
): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "criar", "movimentoEstoque")) return falha("Sem permissão.");
  const dados = contagemSchema.safeParse(formDataParaObjeto(formData));
  if (!dados.success) return falhaDeValidacao(dados.error);
  return rodarEstoque("estoque.inventario-inicial", async (tx, ip) => {
    const r = await contarEstoqueInicial(
      tx,
      dados.data.linhas,
      dados.data.data,
      { usuario: sessao, ip },
    );
    return {
      mensagem: `Contagem inicial registrada para ${r.contados} produto${r.contados === 1 ? "" : "s"}.`,
    };
  });
}
