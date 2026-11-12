"use server";

import { falha, falhaDeValidacao, formDataParaObjeto, type ResultadoAcao } from "@/lib/acoes";
import { exigirSessao } from "@/lib/auth/sessao";
import { can } from "@/lib/permissoes";

import { ativarContaSchema, contaFinanceiraSchema, contaIdSchema } from "../schemas";
import { rodarFinanceiro } from "../rodar";
import { alternarContaAtiva, criarContaFinanceira, editarContaFinanceira } from "../servico-contas";

const JA_EXISTE = "Já existe uma conta com esse nome.";

/** Cadastra uma conta financeira (banco, caixa…). O saldo inicial é opcional: nada é inventado. */
export async function criarConta(_anterior: ResultadoAcao<{ id: string }> | null, formData: FormData): Promise<ResultadoAcao<{ id: string }>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "criar", "contaFinanceira")) return falha("Sem permissão.");
  const dados = contaFinanceiraSchema.safeParse(formDataParaObjeto(formData));
  if (!dados.success) return falhaDeValidacao(dados.error);
  return rodarFinanceiro(
    "financeiro.conta.criar",
    async (tx, ip) => {
      const { id } = await criarContaFinanceira(tx, dados.data, { usuario: sessao, ip });
      return { dados: { id }, mensagem: "Conta cadastrada." };
    },
    JA_EXISTE,
  );
}

/** Edita a conta (inclusive o saldo inicial e a data do saldo, sem quebrar o histórico). */
export async function editarConta(_anterior: ResultadoAcao | null, formData: FormData): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "contaFinanceira")) return falha("Sem permissão.");
  const bruto = formDataParaObjeto(formData);
  const id = contaIdSchema.safeParse(bruto);
  if (!id.success) return falhaDeValidacao(id.error);
  const dados = contaFinanceiraSchema.safeParse(bruto);
  if (!dados.success) return falhaDeValidacao(dados.error);
  return rodarFinanceiro(
    "financeiro.conta.editar",
    async (tx, ip) => {
      await editarContaFinanceira(tx, id.data.contaId, dados.data, { usuario: sessao, ip });
      return { mensagem: "Conta atualizada." };
    },
    JA_EXISTE,
  );
}

export async function alternarAtivaDaConta(entrada: unknown): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "contaFinanceira")) return falha("Sem permissão.");
  const dados = ativarContaSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error);
  return rodarFinanceiro("financeiro.conta.ativar", async (tx, ip) => {
    await alternarContaAtiva(tx, dados.data.contaId, dados.data.ativo, { usuario: sessao, ip });
    return { mensagem: dados.data.ativo ? "Conta reativada." : "Conta inativada. O histórico e o saldo continuam." };
  });
}
