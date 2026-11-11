import { z } from "zod";

import { inputParaData } from "@/lib/formatadores";

export const TIPOS_FERIADO = {
  FERIADO: "Feriado (desconta dias úteis)",
  FERIAS_COLETIVA_FORNECEDORES: "Férias coletivas de fornecedores",
  OUTRO: "Outro (só aviso na agenda)",
} as const;

export type TipoFeriadoChave = keyof typeof TIPOS_FERIADO;

const dataObrigatoria = (rotulo: string) =>
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      const data = inputParaData(v);
      if (!data) {
        ctx.addIssue({ code: "custom", message: `${rotulo}: informe uma data válida.` });
        return z.NEVER;
      }
      return data;
    });

export const feriadoSchema = z
  .object({
    data: dataObrigatoria("Data"),
    nome: z.string().trim().min(2, "Informe o nome.").max(100, "Use no máximo 100 caracteres."),
    tipo: z.enum(["FERIADO", "FERIAS_COLETIVA_FORNECEDORES", "OUTRO"], { message: "Escolha o tipo." }),
    dataFim: z
      .string()
      .trim()
      .transform((v, ctx): Date | null => {
        if (v === "") return null;
        const data = inputParaData(v);
        if (!data) {
          ctx.addIssue({ code: "custom", message: "Data final: informe uma data válida." });
          return z.NEVER;
        }
        return data;
      })
      .optional(),
  })
  .superRefine((d, ctx) => {
    if (d.dataFim && d.dataFim.getTime() < d.data.getTime()) {
      ctx.addIssue({ code: "custom", path: ["dataFim"], message: "A data final não pode ser antes da data inicial." });
    }
  });
