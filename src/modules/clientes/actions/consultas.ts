"use server";

import { z } from "zod";

import { falha, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { exigirSessao } from "@/lib/auth/sessao";
import { consultarCep, consultarCnpj, type DadosDeCnpj, type EnderecoPorCep } from "@/lib/brasil/consultas";
import { somenteDigitos, validarCnpj } from "@/lib/validadores";

import { buscarClientesParaSelecao, buscarDuplicados, type Duplicado } from "../queries";

const entradaDuplicidade = z.object({
  cpfCnpj: z.string().trim().max(24).optional(),
  telefone: z.string().trim().max(30).optional(),
  whatsapp: z.string().trim().max(30).optional(),
  exceto: z.string().trim().max(64).optional(),
});

/** Avisa, antes de salvar, se já existe cliente com o mesmo CPF/CNPJ ou telefone. */
export async function verificarDuplicidadeDeCliente(entrada: unknown): Promise<ResultadoAcao<Duplicado[]>> {
  await exigirSessao();
  const dados = entradaDuplicidade.safeParse(entrada);
  if (!dados.success) return sucesso([]);
  const { exceto, ...contato } = dados.data;
  return sucesso(await buscarDuplicados(contato, exceto || undefined));
}

/** Preenche o endereço pelo CEP (ViaCEP). Falha silenciosa: sem resultado, a pessoa digita à mão. */
export async function consultarCepDoEndereco(cep: string): Promise<ResultadoAcao<EnderecoPorCep>> {
  await exigirSessao();
  const digitos = somenteDigitos(String(cep ?? ""));
  if (digitos.length !== 8) return falha("CEP incompleto.");
  const achado = await consultarCep(digitos);
  return achado ? sucesso(achado) : falha("CEP não encontrado.");
}

/** Preenche razão social, fantasia, telefone e e-mail pelo CNPJ (BrasilAPI). Falha silenciosa. */
export async function consultarCnpjDoCliente(cnpj: string): Promise<ResultadoAcao<DadosDeCnpj>> {
  await exigirSessao();
  const digitos = somenteDigitos(String(cnpj ?? ""));
  if (digitos.length !== 14 || !validarCnpj(digitos)) return falha("CNPJ inválido.");
  const achado = await consultarCnpj(digitos);
  return achado ? sucesso(achado) : falha("Não foi possível consultar o CNPJ agora.");
}

/** Busca de clientes enquanto a pessoa digita (campo "indicado por"). */
export async function buscarClientesParaIndicacao(termo: string, exceto?: string): Promise<ResultadoAcao<{ id: string; nome: string }[]>> {
  await exigirSessao();
  const texto = z.string().trim().min(2).max(80).safeParse(termo);
  if (!texto.success) return sucesso([]);
  return sucesso(await buscarClientesParaSelecao(texto.data, exceto || undefined));
}
