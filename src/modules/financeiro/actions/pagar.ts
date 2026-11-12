"use server";

import { falha, falhaDeValidacao, formDataParaObjeto, type ResultadoAcao } from "@/lib/acoes";
import { exigirSessao } from "@/lib/auth/sessao";
import { can } from "@/lib/permissoes";

import { rodarFinanceiro } from "../rodar";
import { ajusteDeContaPagarSchema, cancelarContaPagarSchema, contaAPagarSchema, contaPagarIdSchema, encerrarRecorrenciaSchema, pagamentoSchema, recorrenciaSchema } from "../schemas";
import { ajustarContaAPagar, cancelarContaAPagar, criarContasAPagar, editarRecorrencia, encerrarRecorrencia, registrarPagamento, reabrirContaAPagar } from "../servico-pagar";

/** Cria uma conta a pagar única, parcelada ou recorrente. Devolve o id da primeira conta criada. */
export async function criarContaAPagarAcao(_anterior: ResultadoAcao<{ id: string }> | null, formData: FormData): Promise<ResultadoAcao<{ id: string }>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "criar", "contaPagar")) return falha("Sem permissão.");
  const dados = contaAPagarSchema.safeParse(formDataParaObjeto(formData));
  if (!dados.success) return falhaDeValidacao(dados.error);
  return rodarFinanceiro("financeiro.pagar.criar", async (tx, ip) => {
    const r = await criarContasAPagar(tx, dados.data, { usuario: sessao, ip });
    const mensagem =
      dados.data.modo === "RECORRENTE" ? `Recorrência criada: ${r.criadas} conta${r.criadas === 1 ? "" : "s"} gerada${r.criadas === 1 ? "" : "s"} (as próximas saem sozinhas).` : dados.data.modo === "PARCELADA" ? `${r.criadas} parcelas criadas.` : "Conta a pagar criada.";
    return { dados: { id: r.primeiraId }, mensagem };
  });
}

/** Baixa total ou parcial (cria o lançamento de saída e recalcula a conta). */
export async function pagar(_anterior: ResultadoAcao | null, formData: FormData): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "pagar", "contaPagar")) return falha("Sem permissão.");
  const dados = pagamentoSchema.safeParse(formDataParaObjeto(formData));
  if (!dados.success) return falhaDeValidacao(dados.error);
  return rodarFinanceiro("financeiro.pagar.baixar", async (tx, ip) => {
    const r = await registrarPagamento(tx, dados.data, { usuario: sessao, ip });
    return { mensagem: r.status === "PAGA" ? "Pagamento registrado: conta quitada." : "Pagamento parcial registrado." };
  });
}

export async function ajustarContaPagar(_anterior: ResultadoAcao | null, formData: FormData): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "contaPagar")) return falha("Sem permissão.");
  const dados = ajusteDeContaPagarSchema.safeParse(formDataParaObjeto(formData));
  if (!dados.success) return falhaDeValidacao(dados.error);
  return rodarFinanceiro("financeiro.pagar.ajustar", async (tx, ip) => {
    await ajustarContaAPagar(tx, { contaPagarId: dados.data.contaPagarId, valorCentavos: dados.data.valor, vencimento: dados.data.vencimento, motivo: dados.data.motivo }, { usuario: sessao, ip });
    return { mensagem: "Conta ajustada." };
  });
}

export async function cancelarContaPagar(entrada: unknown): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "contaPagar")) return falha("Sem permissão.");
  const dados = cancelarContaPagarSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error);
  return rodarFinanceiro("financeiro.pagar.cancelar", async (tx, ip) => {
    await cancelarContaAPagar(tx, dados.data.contaPagarId, dados.data.motivo, { usuario: sessao, ip });
    return { mensagem: "Conta cancelada." };
  });
}

export async function reabrirContaPagar(entrada: unknown): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "contaPagar")) return falha("Sem permissão.");
  const dados = contaPagarIdSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error);
  return rodarFinanceiro("financeiro.pagar.reabrir", async (tx, ip) => {
    await reabrirContaAPagar(tx, dados.data.contaPagarId, { usuario: sessao, ip });
    return { mensagem: "Conta reaberta." };
  });
}

/** Edita o modelo da recorrência; vale para as ocorrências futuras em aberto. */
export async function editarRecorrenciaAcao(_anterior: ResultadoAcao | null, formData: FormData): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "recorrencia")) return falha("Sem permissão.");
  const dados = recorrenciaSchema.safeParse(formDataParaObjeto(formData));
  if (!dados.success) return falhaDeValidacao(dados.error);
  return rodarFinanceiro("financeiro.recorrencia.editar", async (tx, ip) => {
    const r = await editarRecorrencia(tx, dados.data, { usuario: sessao, ip });
    return { mensagem: r.atualizadas === 0 ? "Recorrência atualizada." : `Recorrência atualizada (${r.atualizadas} conta${r.atualizadas === 1 ? "" : "s"} futura${r.atualizadas === 1 ? "" : "s"} em aberto).` };
  });
}

export async function encerrarRecorrenciaAcao(entrada: unknown): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "recorrencia")) return falha("Sem permissão.");
  const dados = encerrarRecorrenciaSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error);
  return rodarFinanceiro("financeiro.recorrencia.encerrar", async (tx, ip) => {
    const r = await encerrarRecorrencia(tx, dados.data.recorrenciaId, { usuario: sessao, ip });
    return { mensagem: r.canceladas === 0 ? "Recorrência encerrada." : `Recorrência encerrada; ${r.canceladas} conta${r.canceladas === 1 ? "" : "s"} futura${r.canceladas === 1 ? "" : "s"} cancelada${r.canceladas === 1 ? "" : "s"}.` };
  });
}
