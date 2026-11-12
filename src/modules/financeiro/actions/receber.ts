"use server";

import { falha, falhaDeValidacao, formDataParaObjeto, type ResultadoAcao } from "@/lib/acoes";
import { exigirSessao } from "@/lib/auth/sessao";
import { can } from "@/lib/permissoes";

import { rodarFinanceiro } from "../rodar";
import { ajusteDeContaSchema, cancelarContaSchema, contaReceberIdSchema, liberarParcelaSchema, recebimentoSchema } from "../schemas";
import { ajustarContaAReceber, cancelarContaAReceber, liberarParcelaAntesDaEtapa, reabrirContaAReceber, registrarRecebimento } from "../servico-receber";

/** Recebimento total ou parcial de uma conta a receber (cria o lançamento de entrada e recalcula a conta). */
export async function receber(_anterior: ResultadoAcao | null, formData: FormData): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "receber", "contaReceber")) return falha("Sem permissão.");
  const dados = recebimentoSchema.safeParse(formDataParaObjeto(formData));
  if (!dados.success) return falhaDeValidacao(dados.error);
  return rodarFinanceiro("financeiro.receber", async (tx, ip) => {
    const r = await registrarRecebimento(
      tx,
      {
        contaReceberId: dados.data.contaReceberId,
        data: dados.data.data,
        valorCentavos: dados.data.valor,
        contaFinanceiraId: dados.data.contaFinanceiraId,
        categoriaId: dados.data.categoriaId,
        forma: dados.data.forma,
        comNotaFiscal: dados.data.comNotaFiscal,
        observacao: dados.data.observacao,
      },
      { usuario: sessao, ip },
    );
    return { mensagem: r.status === "PAGA" ? "Recebimento registrado: parcela quitada." : "Recebimento parcial registrado." };
  });
}

export async function ajustarContaReceber(_anterior: ResultadoAcao | null, formData: FormData): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "contaReceber")) return falha("Sem permissão.");
  const dados = ajusteDeContaSchema.safeParse(formDataParaObjeto(formData));
  if (!dados.success) return falhaDeValidacao(dados.error);
  return rodarFinanceiro("financeiro.receber.ajustar", async (tx, ip) => {
    await ajustarContaAReceber(tx, { contaReceberId: dados.data.contaReceberId, valorCentavos: dados.data.valor, vencimento: dados.data.vencimento, motivo: dados.data.motivo }, { usuario: sessao, ip });
    return { mensagem: "Conta ajustada." };
  });
}

export async function cancelarContaReceber(entrada: unknown): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "contaReceber")) return falha("Sem permissão.");
  const dados = cancelarContaSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error);
  return rodarFinanceiro("financeiro.receber.cancelar", async (tx, ip) => {
    await cancelarContaAReceber(tx, dados.data.contaReceberId, dados.data.motivo, { usuario: sessao, ip });
    return { mensagem: "Conta cancelada." };
  });
}

export async function reabrirContaReceber(entrada: unknown): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "contaReceber")) return falha("Sem permissão.");
  const dados = contaReceberIdSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error);
  return rodarFinanceiro("financeiro.receber.reabrir", async (tx, ip) => {
    await reabrirContaAReceber(tx, dados.data.contaReceberId, { usuario: sessao, ip });
    return { mensagem: "Conta reaberta." };
  });
}

export async function liberarParcela(_anterior: ResultadoAcao | null, formData: FormData): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "contaReceber")) return falha("Sem permissão.");
  const dados = liberarParcelaSchema.safeParse(formDataParaObjeto(formData));
  if (!dados.success) return falhaDeValidacao(dados.error);
  return rodarFinanceiro("financeiro.receber.liberar", async (tx, ip) => {
    await liberarParcelaAntesDaEtapa(tx, { contaReceberId: dados.data.contaReceberId, vencimento: dados.data.vencimento }, { usuario: sessao, ip });
    return { mensagem: "Parcela liberada para cobrança." };
  });
}
