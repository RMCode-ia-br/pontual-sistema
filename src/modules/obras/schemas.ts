import { z } from "zod";

import { GATILHOS_DE_ETAPA, MAXIMO_DE_ETAPAS_NO_MODELO, PESO_MAXIMO_DE_ETAPA, TIPOS_DE_ETAPA, validarModeloDeEtapas, type ItemDoModelo } from "@/lib/dominio/etapas";
import { GRUPOS_DE_PRAZO } from "@/lib/dominio/prazo-obra";
import { campoIdObrigatorio } from "@/lib/validadores/campos";

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

// ----- Execução da obra (Bloco 3) -----

const idSchema = campoIdObrigatorio();
const diaSchema = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida.");
const textoOpcional = (max: number) => z.string().trim().max(max, `Use no máximo ${max} caracteres.`).nullable().optional();
const diasDePrazo = z.number({ message: "Informe os dias em número." }).int("Use dias inteiros.").min(1, "Use ao menos 1 dia.").max(3650, "Use no máximo 3650 dias.").nullable().optional();

export const STATUS_DE_ETAPA = ["PENDENTE", "EM_ANDAMENTO", "CONCLUIDA", "BLOQUEADA", "DISPENSADA"] as const;

export const mudarEtapaSchema = z.object({
  etapaId: idSchema,
  para: z.enum(STATUS_DE_ETAPA, { message: "Estado inválido." }),
  data: diaSchema.optional(),
  vencimentoDasParcelas: diaSchema.optional(),
  motivoBloqueioId: z.string().trim().max(64).nullable().optional(),
  detalheBloqueio: textoOpcional(500),
});

export const editarEtapaSchema = z.object({
  etapaId: idSchema,
  responsavelId: z.string().trim().max(64).nullable().optional(),
  equipeId: z.string().trim().max(64).nullable().optional(),
  inicioPrevisto: diaSchema.nullable().optional(),
  fimPrevisto: diaSchema.nullable().optional(),
  observacao: textoOpcional(500),
});

export const aplicarDatasSchema = z.object({
  projetoId: idSchema,
  itens: z.array(z.object({ etapaId: idSchema, inicio: diaSchema, fim: diaSchema })).min(1, "Não há datas para aplicar.").max(MAXIMO_DE_ETAPAS_NO_MODELO),
});

export const prazoDaObraSchema = z.object({
  projetoId: idSchema,
  modo: z.enum(["NENHUM", "TOTAL", "POR_ETAPA"], { message: "Escolha como o prazo foi combinado." }),
  totalDias: diasDePrazo,
  materialDias: diasDePrazo,
  execucaoDias: diasDePrazo,
  vidrosDias: diasDePrazo,
  tipoDias: z.enum(["UTEIS", "CORRIDOS"], { message: "Escolha dias úteis ou corridos." }),
});

export const abrirPausaSchema = z.object({ projetoId: idSchema, inicio: diaSchema.optional(), motivoBloqueioId: campoIdObrigatorio("Escolha o motivo."), observacao: textoOpcional(500) });
export const encerrarPausaSchema = z.object({ pausaId: idSchema, fim: diaSchema.optional() });
export const ajustarPausaSchema = z.object({ pausaId: idSchema, justificada: z.boolean(), observacao: textoOpcional(500) });
export const pausaIdSchema = z.object({ pausaId: idSchema });
export const projetoIdSchema = z.object({ projetoId: idSchema });

/** Valida a forma (Zod) e depois as regras do modelo (domínio). Devolve os itens prontos para gravar. */
export function lerModeloDeEtapas(entrada: unknown): { itens: ItemDoModelo[] } | { erro: string } {
  const lido = modeloEtapasSchema.safeParse(entrada);
  if (!lido.success) return { erro: lido.error.issues[0]?.message ?? "Dados inválidos." };
  const itens: ItemDoModelo[] = lido.data.itens.map((i, indice) => ({ ...i, ordem: indice + 1 }));
  const valida = validarModeloDeEtapas(itens);
  return valida.ok ? { itens } : { erro: valida.erro };
}
