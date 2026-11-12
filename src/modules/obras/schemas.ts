import { z } from "zod";

import { GATILHOS_DE_ETAPA, MAXIMO_DE_ETAPAS_NO_MODELO, PESO_MAXIMO_DE_ETAPA, TIPOS_DE_ETAPA, validarModeloDeEtapas, type ItemDoModelo } from "@/lib/dominio/etapas";
import { GRUPOS_DE_PRAZO } from "@/lib/dominio/prazo-obra";

export const itemDoModeloSchema = z.object({
  tipo: z.enum(TIPOS_DE_ETAPA, { message: "Escolha o tipo da etapa." }),
  nome: z.string().trim().min(1, "Dê um nome a cada etapa.").max(80, "Use no máximo 80 caracteres no nome da etapa."),
  /** Vazio = fora dos três prazos (é o caso da medição exata). */
  grupoPrazo: z.enum(GRUPOS_DE_PRAZO).nullable(),
  peso: z.number({ message: "Informe o peso." }).int("O peso é um número inteiro.").min(1, "O peso mínimo é 1.").max(PESO_MAXIMO_DE_ETAPA, `O peso máximo é ${PESO_MAXIMO_DE_ETAPA}.`),
  liberaGatilho: z.enum(GATILHOS_DE_ETAPA).nullable(),
  marcoGarantia: z.boolean(),
  exigeEsquadria: z.boolean(),
  ativo: z.boolean(),
});

export const modeloEtapasSchema = z.object({
  itens: z.array(itemDoModeloSchema).min(1, "O modelo precisa de ao menos uma etapa.").max(MAXIMO_DE_ETAPAS_NO_MODELO, `No máximo ${MAXIMO_DE_ETAPAS_NO_MODELO} etapas.`),
});

export type EntradaModeloEtapas = z.infer<typeof modeloEtapasSchema>;

/** Valida a forma (Zod) e depois as regras do modelo (domínio). Devolve os itens prontos para gravar. */
export function lerModeloDeEtapas(entrada: unknown): { itens: ItemDoModelo[] } | { erro: string } {
  const lido = modeloEtapasSchema.safeParse(entrada);
  if (!lido.success) return { erro: lido.error.issues[0]?.message ?? "Dados inválidos." };
  const itens: ItemDoModelo[] = lido.data.itens.map((i, indice) => ({ ...i, ordem: indice + 1 }));
  const valida = validarModeloDeEtapas(itens);
  return valida.ok ? { itens } : { erro: valida.erro };
}
