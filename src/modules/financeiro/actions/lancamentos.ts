"use server";

import { falha, falhaDeValidacao, formDataParaObjeto, type ResultadoAcao } from "@/lib/acoes";
import { exigirSessao } from "@/lib/auth/sessao";
import { can } from "@/lib/permissoes";

import { rodarFinanceiro } from "../rodar";
import { conciliarSchema, estornoSchema, lancamentoSchema, transferenciaSchema } from "../schemas";
import { conciliarLancamento, criarLancamentoAvulso, criarTransferencia, estornarLancamento } from "../servico-lancamentos";

/** Lançamento avulso: dinheiro que entrou ou saiu e não é uma parcela de obra nem uma conta a pagar. */
export async function criarLancamento(_anterior: ResultadoAcao<{ id: string }> | null, formData: FormData): Promise<ResultadoAcao<{ id: string }>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "criar", "lancamento")) return falha("Sem permissão.");
  const dados = lancamentoSchema.safeParse(formDataParaObjeto(formData));
  if (!dados.success) return falhaDeValidacao(dados.error);
  return rodarFinanceiro("financeiro.lancamento.criar", async (tx, ip) => {
    const { id } = await criarLancamentoAvulso(tx, dados.data, { usuario: sessao, ip });
    return { dados: { id }, mensagem: dados.data.tipo === "ENTRADA" ? "Entrada registrada." : "Saída registrada." };
  });
}

export async function transferirEntreContas(_anterior: ResultadoAcao | null, formData: FormData): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "criar", "lancamento")) return falha("Sem permissão.");
  const dados = transferenciaSchema.safeParse(formDataParaObjeto(formData));
  if (!dados.success) return falhaDeValidacao(dados.error);
  return rodarFinanceiro("financeiro.transferencia", async (tx, ip) => {
    await criarTransferencia(tx, dados.data, { usuario: sessao, ip });
    return { mensagem: "Transferência registrada." };
  });
}

/** Estorno: o lançamento não é apagado, fica marcado com o motivo e sai de saldo, fluxo e DRE. */
export async function estornar(entrada: unknown): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "estornar", "lancamento")) return falha("Sem permissão.");
  const dados = estornoSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error);
  return rodarFinanceiro("financeiro.lancamento.estornar", async (tx, ip) => {
    const r = await estornarLancamento(tx, dados.data.lancamentoId, dados.data.motivo, { usuario: sessao, ip });
    return { mensagem: r.lancamentos.length > 1 ? "Transferência estornada (as duas pontas)." : "Lançamento estornado." };
  });
}

export async function conciliar(entrada: unknown): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "lancamento")) return falha("Sem permissão.");
  const dados = conciliarSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error);
  return rodarFinanceiro("financeiro.lancamento.conciliar", async (tx, ip) => {
    await conciliarLancamento(tx, dados.data.lancamentoId, dados.data.conciliado, { usuario: sessao, ip });
    return { mensagem: dados.data.conciliado ? "Conciliado." : "Conciliação desfeita." };
  });
}
