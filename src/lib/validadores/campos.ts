/**
 * Campos de formulário reutilizáveis (Zod): texto vazio vira `undefined`, e telefone, CPF, CNPJ, CEP e
 * e-mail saem normalizados. As mensagens já citam o campo, para aparecerem certas ao lado dele.
 */
import { z } from "zod";

import { inputParaData, normalizarTelefone } from "../formatadores";
import { emailValido, formatarCep, somenteDigitos, validarCnpj, validarCpf } from "../validadores";
import { textoParaDecimal, textoParaInteiro, valorParaCentavos } from "../dominio/numeros";

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

const bruto = (max: number) => z.string().trim().max(max, `Use no máximo ${max} caracteres.`);

/** Texto obrigatório, com mínimo de caracteres. */
export const campoTexto = (rotulo: string, max: number, min = 2) =>
  bruto(max).min(min, `Informe ${rotulo}.`);

/** Texto opcional: vazio vira undefined. */
export const campoTextoOpcional = (max: number) =>
  bruto(max)
    .transform((v) => (v === "" ? undefined : v))
    .optional();

export const campoTelefone = (rotulo = "Telefone") =>
  bruto(30)
    .transform((v, ctx): string | undefined => {
      if (v === "") return undefined;
      const e164 = normalizarTelefone(v);
      if (!e164) {
        ctx.addIssue({ code: "custom", message: `${rotulo}: informe DDD e número (ex.: (22) 99999-9999).` });
        return z.NEVER;
      }
      return e164;
    })
    .optional();

export const campoEmail = (rotulo = "E-mail") =>
  bruto(254)
    .transform((v, ctx): string | undefined => {
      if (v === "") return undefined;
      if (!emailValido(v)) {
        ctx.addIssue({ code: "custom", message: `${rotulo}: informe um endereço válido.` });
        return z.NEVER;
      }
      return v.toLowerCase();
    })
    .optional();

/** CPF válido, guardado só com dígitos. */
export const campoCpf = (rotulo = "CPF") =>
  bruto(20)
    .transform((v, ctx): string | undefined => {
      if (v === "") return undefined;
      if (!validarCpf(v)) {
        ctx.addIssue({ code: "custom", message: `${rotulo} inválido. Confira os 11 números.` });
        return z.NEVER;
      }
      return somenteDigitos(v);
    })
    .optional();

/** CNPJ válido, guardado só com dígitos. */
export const campoCnpj = (rotulo = "CNPJ") =>
  bruto(24)
    .transform((v, ctx): string | undefined => {
      if (v === "") return undefined;
      if (!validarCnpj(v)) {
        ctx.addIssue({ code: "custom", message: `${rotulo} inválido. Confira os 14 números.` });
        return z.NEVER;
      }
      return somenteDigitos(v);
    })
    .optional();

/** CEP no formato 00000-000. */
export const campoCep = () =>
  bruto(12)
    .transform((v, ctx): string | undefined => {
      if (v === "") return undefined;
      if (somenteDigitos(v).length !== 8) {
        ctx.addIssue({ code: "custom", message: "CEP inválido. Use 8 números." });
        return z.NEVER;
      }
      return formatarCep(v);
    })
    .optional();

export const campoUf = () =>
  bruto(2)
    .transform((v, ctx): string | undefined => {
      if (v === "") return undefined;
      const uf = v.toUpperCase();
      if (!(UFS as readonly string[]).includes(uf)) {
        ctx.addIssue({ code: "custom", message: "Estado inválido. Use a sigla (ex.: RJ)." });
        return z.NEVER;
      }
      return uf;
    })
    .optional();

/** Caixa de marcação de formulário: o navegador só envia o campo quando marcada ("on"). */
export const campoCaixa = z
  .string()
  .optional()
  .transform((v) => v === "on" || v === "1" || v === "true");

/** Identificador opcional vindo de um select (vazio = sem valor). Quem usa ainda confere se existe. */
export const campoIdOpcional = z
  .string()
  .trim()
  .max(64)
  .transform((v) => (v === "" ? undefined : v))
  .optional();

export const campoIdObrigatorio = (mensagem = "Registro inválido.") => z.string().trim().min(1, mensagem).max(64, mensagem);

/** Data de calendário ("aaaa-mm-dd" de <input type="date">). */
export const campoDataOpcional = (rotulo: string) =>
  bruto(10)
    .transform((v, ctx): Date | undefined => {
      if (v === "") return undefined;
      const data = inputParaData(v);
      if (!data) {
        ctx.addIssue({ code: "custom", message: `${rotulo}: informe uma data válida.` });
        return z.NEVER;
      }
      return data;
    })
    .optional();

/** Valor em reais digitado ("1.234,56") → centavos inteiros, com teto (cabe no inteiro do banco). */
export const campoMoedaOpcional = (rotulo: string, maxCentavos = 2_000_000_000) =>
  bruto(20)
    .transform((v, ctx): number | undefined => {
      if (v === "") return undefined;
      const centavos = valorParaCentavos(v);
      if (centavos === null || centavos > maxCentavos) {
        ctx.addIssue({ code: "custom", message: `${rotulo}: informe um valor em reais (ex.: 1.234,56).` });
        return z.NEVER;
      }
      return centavos;
    })
    .optional();

export const campoInteiroOpcional = (rotulo: string, max: number) =>
  bruto(12)
    .transform((v, ctx): number | undefined => {
      if (v === "") return undefined;
      const n = textoParaInteiro(v);
      if (n === null || n > max) {
        ctx.addIssue({ code: "custom", message: `${rotulo}: informe um número inteiro de 0 a ${max.toLocaleString("pt-BR")}.` });
        return z.NEVER;
      }
      return n;
    })
    .optional();

export const campoDecimalOpcional = (rotulo: string, max: number, casas = 3) =>
  bruto(20)
    .transform((v, ctx): number | undefined => {
      if (v === "") return undefined;
      const n = textoParaDecimal(v, casas);
      if (n === null || n > max) {
        ctx.addIssue({ code: "custom", message: `${rotulo}: informe um número (até ${casas} casas decimais, máximo ${max.toLocaleString("pt-BR")}).` });
        return z.NEVER;
      }
      return n;
    })
    .optional();
