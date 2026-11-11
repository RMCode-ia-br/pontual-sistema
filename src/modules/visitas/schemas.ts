import { z } from "zod";

import { campoCaixa, campoIdObrigatorio, campoIdOpcional, campoInteiroOpcional, campoMoedaOpcional, campoTelefone, campoTextoOpcional } from "@/lib/validadores/campos";
import { FASES_OBRA } from "@/modules/projetos/schemas";

/** Sugestões de tipologia na medida-rascunho (texto livre; a entidade Tipologia chega na Fase 3). */
export const TIPOLOGIAS_SUGERIDAS = [
  "Janela de correr",
  "Porta de correr",
  "Báscula",
  "Painel fixo",
  "Porta de giro",
  "Box frontal",
  "Guarda-corpo",
  "Fechamento de sacada",
  "Portão",
  "Pergolado",
  "Espelho",
] as const;

const milimetros = (rotulo: string) => campoInteiroOpcional(rotulo, 20_000).refine((v) => v === undefined || v > 0, `${rotulo}: informe um valor maior que zero.`);

export const medidaSchema = z.object({
  id: campoIdOpcional,
  eventoId: campoIdOpcional,
  projetoId: campoIdObrigatorio("Projeto inválido."),
  ambiente: campoTextoOpcional(120),
  tipologia: campoTextoOpcional(120),
  larguraMm: milimetros("Largura"),
  alturaMm: milimetros("Altura"),
  quantidade: z
    .string()
    .trim()
    .regex(/^\d{1,3}$/, "Informe a quantidade (1 a 999).")
    .transform(Number)
    .refine((n) => n >= 1, "A quantidade mínima é 1."),
  observacao: campoTextoOpcional(500),
});

export const dadosDaObraSchema = z.object({
  projetoId: campoIdObrigatorio("Projeto inválido."),
  faseDaObra: z
    .string()
    .trim()
    .transform((v) => (v === "" ? undefined : v))
    .pipe(z.enum(FASES_OBRA, { message: "Escolha a fase da obra." }).optional())
    .optional(),
  arquitetoId: campoIdOpcional,
  prazoDesejado: campoTextoOpcional(120),
  investimentoPrevistoCentavos: campoMoedaOpcional("Investimento previsto"),
  // Condomínio (gravado no endereço da obra, R9).
  condominio: campoCaixa,
  condominioNome: campoTextoOpcional(160),
  exigeAprovacaoFachada: campoCaixa,
  fachadaAprovada: campoCaixa,
  horariosPermitidos: campoTextoOpcional(200),
  sindicoNome: campoTextoOpcional(160),
  sindicoTelefone: campoTelefone("Telefone do síndico"),
});

export const idSchema = campoIdObrigatorio("Registro inválido.");
