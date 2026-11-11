import { z } from "zod";

import { inputParaData } from "@/lib/formatadores";

export const tarefaSchema = z.object({
  titulo: z.string().trim().min(2, "Informe o título da tarefa.").max(160, "Use no máximo 160 caracteres."),
  descricao: z
    .string()
    .trim()
    .max(2000, "Use no máximo 2.000 caracteres.")
    .transform((v) => (v === "" ? null : v))
    .optional(),
  vencimento: z
    .string()
    .trim()
    .transform((v, ctx): Date | null => {
      if (v === "") return null;
      const data = inputParaData(v);
      if (!data) {
        ctx.addIssue({ code: "custom", message: "Vencimento: informe uma data válida." });
        return z.NEVER;
      }
      return data;
    })
    .optional(),
  responsavelId: z
    .string()
    .trim()
    .max(64)
    .transform((v) => (v === "" ? null : v))
    .optional(),
});

export const editarTarefaSchema = tarefaSchema.extend({ id: z.string().min(1).max(64) });

export type FiltroStatus = "abertas" | "concluidas" | "todas";

export function lerFiltroStatus(valor: string | undefined): FiltroStatus {
  return valor === "concluidas" || valor === "todas" ? valor : "abertas";
}

/** Tarefa aberta cujo vencimento (data de calendário) já passou. Estado derivado: nunca gravado no banco. */
export function tarefaVencida(status: string, vencimento: Date | null, hoje: Date): boolean {
  return status === "ABERTA" && vencimento !== null && vencimento.getTime() < hoje.getTime();
}
