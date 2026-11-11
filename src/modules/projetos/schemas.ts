import { z } from "zod";

import { TODOS_OS_STATUS } from "@/lib/dominio/funil";
import { ORIGENS } from "@/modules/clientes/schemas";
import { campoIdObrigatorio, campoIdOpcional, campoMoedaOpcional, campoTexto, campoTextoOpcional } from "@/lib/validadores/campos";

export const PORTES = ["PEQUENO", "MEDIO", "GRANDE"] as const;
export const ROTULO_PORTE: Record<(typeof PORTES)[number], string> = { PEQUENO: "Pequeno", MEDIO: "Médio", GRANDE: "Grande" };

export const INTERESSES = ["COMPRA_REAL", "SO_ORCAMENTO_ESPECULACAO", "INDEFINIDO"] as const;
export const ROTULO_INTERESSE: Record<(typeof INTERESSES)[number], string> = {
  COMPRA_REAL: "Quer comprar de verdade",
  SO_ORCAMENTO_ESPECULACAO: "Só orçamento (especulação)",
  INDEFINIDO: "Ainda não sei",
};

export const TEMPERATURAS = ["FRIA", "MORNA", "QUENTE"] as const;
export const ROTULO_TEMPERATURA: Record<(typeof TEMPERATURAS)[number], string> = { FRIA: "Fria", MORNA: "Morna", QUENTE: "Quente" };

export const FASES_OBRA = ["PLANTA", "EM_CONSTRUCAO", "PRONTA"] as const;
export const ROTULO_FASE_OBRA: Record<(typeof FASES_OBRA)[number], string> = {
  PLANTA: "Na planta",
  EM_CONSTRUCAO: "Em construção",
  PRONTA: "Pronta",
};

export const TIPOS_SERVICO = ["JANELA", "PORTA", "BOX", "GUARDA_CORPO", "FECHAMENTO_SACADA", "PORTAO", "PERGOLADO", "ESPELHO", "OUTRO"] as const;
export const ROTULO_TIPO_SERVICO: Record<(typeof TIPOS_SERVICO)[number], string> = {
  JANELA: "Janelas",
  PORTA: "Portas",
  BOX: "Box de banheiro",
  GUARDA_CORPO: "Guarda-corpo",
  FECHAMENTO_SACADA: "Fechamento de sacada",
  PORTAO: "Portão",
  PERGOLADO: "Pergolado",
  ESPELHO: "Espelhos",
  OUTRO: "Outro",
};

/** Select opcional: vazio vira undefined; valor fora da lista é erro com mensagem no campo. */
function campoEnumOpcional<const T extends readonly [string, ...string[]]>(valores: T, mensagem: string) {
  return z
    .string()
    .trim()
    .transform((v) => (v === "" ? undefined : v))
    .pipe(z.enum(valores, { message: mensagem }).optional())
    .optional();
}

const projetoBase = z.object({
  titulo: campoTexto("o título do projeto", 160),
  clienteId: campoIdObrigatorio("Escolha o cliente do projeto."),
  enderecoObraId: campoIdOpcional,
  arquitetoId: campoIdOpcional,
  construtoraId: campoIdOpcional,
  responsavelId: campoIdOpcional,
  tiposServico: z.array(z.enum(TIPOS_SERVICO)).max(TIPOS_SERVICO.length),
  origem: campoEnumOpcional(ORIGENS, "Escolha uma origem da lista."),
  origemDetalhe: campoTextoOpcional(160),
  porte: campoEnumOpcional(PORTES, "Escolha um porte da lista."),
  interesse: z.enum(INTERESSES, { message: "Escolha o interesse do cliente." }),
  temperatura: campoEnumOpcional(TEMPERATURAS, "Escolha a temperatura da lista."),
  faseDaObra: campoEnumOpcional(FASES_OBRA, "Escolha a fase da obra."),
  investimentoPrevistoCentavos: campoMoedaOpcional("Investimento previsto"),
  valorEstimadoCentavos: campoMoedaOpcional("Valor estimado"),
  prazoDesejado: campoTextoOpcional(120),
  observacoes: campoTextoOpcional(4000),
});

/** Os tipos de serviço chegam como caixas de marcação `servico_JANELA=on`, `servico_BOX=on`... */
function comTiposDeServico(entrada: Record<string, string>) {
  const tiposServico = TIPOS_SERVICO.filter((t) => entrada[`servico_${t}`] === "on");
  // Os campos de dinheiro do formulário se chamam `investimentoPrevisto` e `valorEstimado`.
  return {
    ...entrada,
    tiposServico,
    investimentoPrevistoCentavos: entrada.investimentoPrevisto ?? "",
    valorEstimadoCentavos: entrada.valorEstimado ?? "",
  };
}

export const projetoSchema = projetoBase;
export const projetoEditadoSchema = projetoBase.extend({ id: campoIdObrigatorio("Projeto inválido.") });

export const lerProjeto = (entrada: Record<string, string>) => projetoSchema.safeParse(comTiposDeServico(entrada));
export const lerProjetoEditado = (entrada: Record<string, string>) => projetoEditadoSchema.safeParse(comTiposDeServico(entrada));
export type DadosProjeto = z.output<typeof projetoSchema>;

/** Mover o projeto de fase (arrastando no funil ou pelo menu). Perder exige motivo (R10). */
export const moverProjetoSchema = z.object({
  id: campoIdObrigatorio("Projeto inválido."),
  para: z.enum(TODOS_OS_STATUS, { message: "Fase inválida." }),
  motivoPerdaId: campoIdOpcional,
  motivoPerdaDetalhe: campoTextoOpcional(500),
  concorrente: campoTextoOpcional(120),
});

export const idsSchema = z.array(campoIdObrigatorio()).min(1, "Escolha ao menos um projeto.").max(200, "Escolha no máximo 200 de uma vez.");

export const interacaoProjetoSchema = z.object({
  projetoId: campoIdObrigatorio("Projeto inválido."),
  tipo: z.enum(["NOTA", "LIGACAO", "WHATSAPP", "VISITA", "EMAIL"], { message: "Escolha o tipo do registro." }),
  texto: z.string().trim().min(2, "Escreva o que aconteceu.").max(4000, "Use no máximo 4.000 caracteres."),
});
