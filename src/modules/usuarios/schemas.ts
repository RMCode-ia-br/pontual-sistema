import { z } from "zod";

import { emailValido } from "@/lib/validadores";

export const nomeUsuarioSchema = z.string().trim().min(2, "Informe o nome.").max(120, "Use no máximo 120 caracteres.");

/** Login sempre em minúsculas (não diferencia maiúsculas). */
export const loginUsuarioSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,40}$/, "Use de 3 a 40 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado.");

/** E-mail opcional: vazio vira undefined; preenchido precisa ser válido e fica em minúsculas. */
export const emailOpcionalSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "E-mail muito longo.")
  .transform((v) => (v === "" ? undefined : v))
  .refine((v) => v === undefined || emailValido(v), "E-mail inválido.");

export const criarUsuarioSchema = z.object({
  nome: nomeUsuarioSchema,
  login: loginUsuarioSchema,
  email: emailOpcionalSchema,
});

export const editarUsuarioSchema = z.object({
  id: z.string().min(1).max(64),
  nome: nomeUsuarioSchema,
  email: emailOpcionalSchema,
});

export const idSchema = z.string().min(1).max(64);
