import { z } from "zod";

import { variaveisDoTemplate } from "@/lib/dominio/descricao-item";
import { validarFormula } from "@/lib/dominio/formulas";
import { valorParaCentavos } from "@/lib/dominio/numeros";
import { percentualParaPontosBase } from "@/lib/dominio/preco";
import { textoParaDecimal } from "@/lib/dominio/numeros";
import { campoCaixa, campoIdObrigatorio, campoIdOpcional, campoTexto } from "@/lib/validadores/campos";

export const CATEGORIAS_TIPOLOGIA = ["JANELA", "PORTA", "BOX", "GUARDA_CORPO", "FECHAMENTO_SACADA", "PORTAO", "PERGOLADO", "ESPELHO", "OUTRO"] as const;
export const ROTULO_CATEGORIA_TIPOLOGIA: Record<(typeof CATEGORIAS_TIPOLOGIA)[number], string> = {
  JANELA: "Janela",
  PORTA: "Porta",
  BOX: "Box",
  GUARDA_CORPO: "Guarda-corpo",
  FECHAMENTO_SACADA: "Fechamento de sacada",
  PORTAO: "Portão",
  PERGOLADO: "Pergolado",
  ESPELHO: "Espelho",
  OUTRO: "Outro",
};

export const TIPOS_DESENHO = [
  "JANELA_CORRER",
  "PORTA_CORRER",
  "BASCULA",
  "PAINEL_FIXO",
  "PORTA_GIRO",
  "BOX_FRONTAL",
  "GUARDA_CORPO",
  "FECHAMENTO_SACADA",
  "PORTAO",
  "PERGOLADO",
  "ESPELHO",
  "GENERICO",
] as const;
export const ROTULO_TIPO_DESENHO: Record<(typeof TIPOS_DESENHO)[number], string> = {
  JANELA_CORRER: "Janela de correr",
  PORTA_CORRER: "Porta de correr",
  BASCULA: "Báscula",
  PAINEL_FIXO: "Painel fixo",
  PORTA_GIRO: "Porta de giro",
  BOX_FRONTAL: "Box frontal",
  GUARDA_CORPO: "Guarda-corpo",
  FECHAMENTO_SACADA: "Fechamento de sacada",
  PORTAO: "Portão",
  PERGOLADO: "Pergolado",
  ESPELHO: "Espelho",
  GENERICO: "Genérico",
};

export const COBRANCAS = ["POR_M2", "POR_UNIDADE", "POR_METRO_LINEAR"] as const;
export const ROTULO_COBRANCA: Record<(typeof COBRANCAS)[number], string> = {
  POR_M2: "Por m²",
  POR_UNIDADE: "Por unidade",
  POR_METRO_LINEAR: "Por metro linear",
};

export const CATEGORIAS_MARKUP = ["PADRAO", "VIDRO_TEMPERADO"] as const;
export const ROTULO_CATEGORIA_MARKUP: Record<(typeof CATEGORIAS_MARKUP)[number], string> = {
  PADRAO: "Padrão",
  VIDRO_TEMPERADO: "Vidro temperado / guarda-corpo",
};

export const UNIDADES_INSUMO = ["UN", "M", "M2", "KG", "BARRA", "L", "PAR", "CJ"] as const;

/** "2, 3 e 4" / "2;3;4" → [2, 3, 4] (1 a 12 folhas, sem repetir). */
function lerFolhas(texto: string, ctx: z.RefinementCtx): number[] {
  const partes = texto.split(/[^0-9]+/).filter(Boolean).map(Number);
  const unicos = [...new Set(partes)].sort((a, b) => a - b);
  if (unicos.some((n) => n < 1 || n > 12) || unicos.length > 8) {
    ctx.addIssue({ code: "custom", message: "Folhas: informe números de 1 a 12, ex.: 2, 3, 4." });
    return z.NEVER;
  }
  return unicos;
}

const tipologiaBase = z.object({
  nome: campoTexto("o nome da tipologia", 120),
  categoria: z.enum(CATEGORIAS_TIPOLOGIA, { message: "Escolha a categoria." }),
  tipoDesenho: z.enum(TIPOS_DESENHO, { message: "Escolha o tipo de desenho." }),
  opcoesFolhas: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((v, ctx) => (v ? lerFolhas(v, ctx) : [])),
  templateDescricao: z
    .string()
    .trim()
    .min(5, "Informe o modelo da descrição.")
    .max(1000, "Use no máximo 1.000 caracteres.")
    .superRefine((v, ctx) => {
      const { desconhecidas } = variaveisDoTemplate(v);
      if (desconhecidas.length > 0) {
        ctx.addIssue({ code: "custom", message: `Variável desconhecida no modelo: {${desconhecidas[0]}}. Use as variáveis da lista.` });
      }
    }),
  cobrancaPadrao: z.enum(COBRANCAS, { message: "Escolha como cobrar." }),
  categoriaMarkup: z.enum(CATEGORIAS_MARKUP, { message: "Escolha a categoria de markup." }),
  exigeEsquadria: campoCaixa,
  revisarTexto: campoCaixa,
});

export const tipologiaSchema = tipologiaBase;
export const editarTipologiaSchema = tipologiaBase.extend({ id: campoIdObrigatorio("Tipologia inválida.") });
export const idsSchema = z.array(campoIdObrigatorio()).min(1, "Escolha ao menos uma tipologia.").max(50);

// ----- Composição -----

const texto = (max: number) => z.string().trim().max(max, `Use no máximo ${max} caracteres.`);

export const composicaoSchema = z.object({
  tipologiaId: campoIdObrigatorio("Tipologia inválida."),
  insumos: z
    .array(
      z.object({
        produtoId: z.string().trim().max(64).nullable().optional(),
        descricao: texto(200).optional(),
        unidade: z.enum(UNIDADES_INSUMO),
        formulaQuantidade: texto(300),
        /** "5" ou "5,5" (percentual de perda). */
        perda: texto(8),
        /** Custo próprio em reais (só quando não há produto). */
        custoUnitario: texto(20),
      }),
    )
    .max(60, "No máximo 60 insumos por tipologia."),
  maoDeObra: z
    .array(
      z.object({
        papel: z.enum(["FABRICA", "INSTALACAO"]),
        base: z.enum(["HORAS_POR_M2", "HORAS_POR_UNIDADE"]),
        /** Horas ("1,5"). */
        horas: texto(10),
        /** Custo por hora em reais. */
        custoHora: texto(20),
      }),
    )
    .max(10, "No máximo 10 linhas de mão de obra."),
});

export type EntradaComposicao = z.infer<typeof composicaoSchema>;

export type InsumoLido = {
  produtoId: string | null;
  descricao: string | null;
  unidade: (typeof UNIDADES_INSUMO)[number];
  formulaQuantidade: string;
  perdaPb: number;
  custoUnitarioCentavos: number | null;
};
export type MaoDeObraLida = {
  papel: "FABRICA" | "INSTALACAO";
  base: "HORAS_POR_M2" | "HORAS_POR_UNIDADE";
  horasCentesimos: number;
  custoHoraCentavos: number | null;
};

/** Converte os textos digitados em números e valida fórmulas. Devolve a mensagem do primeiro problema. */
export function lerComposicao(entrada: EntradaComposicao): { insumos: InsumoLido[]; maoDeObra: MaoDeObraLida[] } | { erro: string } {
  const insumos: InsumoLido[] = [];
  for (const [i, bruto] of entrada.insumos.entries()) {
    const n = i + 1;
    const produtoId = bruto.produtoId ? bruto.produtoId : null;
    const descricao = bruto.descricao ? bruto.descricao : null;
    if (!produtoId && !descricao) return { erro: `Insumo ${n}: escolha um produto ou descreva o insumo.` };
    const valida = validarFormula(bruto.formulaQuantidade);
    if (!valida.ok) return { erro: `Insumo ${n}: ${valida.erro}` };
    const perdaPb = bruto.perda === "" ? 0 : percentualParaPontosBase(bruto.perda);
    if (perdaPb === null || perdaPb > 9900) return { erro: `Insumo ${n}: informe a perda de corte entre 0 e 99%, ex.: 5.` };
    let custo: number | null = null;
    if (bruto.custoUnitario !== "") {
      custo = valorParaCentavos(bruto.custoUnitario);
      if (custo === null || custo > 2_000_000_000) return { erro: `Insumo ${n}: informe o custo em reais, ex.: 12,50.` };
    }
    insumos.push({ produtoId, descricao, unidade: bruto.unidade, formulaQuantidade: bruto.formulaQuantidade, perdaPb, custoUnitarioCentavos: custo });
  }

  const maoDeObra: MaoDeObraLida[] = [];
  for (const [i, bruto] of entrada.maoDeObra.entries()) {
    const n = i + 1;
    const horas = textoParaDecimal(bruto.horas, 2);
    if (horas === null || horas <= 0 || horas > 1000) return { erro: `Mão de obra ${n}: informe as horas (maiores que zero), ex.: 1,5.` };
    let custoHora: number | null = null;
    if (bruto.custoHora !== "") {
      custoHora = valorParaCentavos(bruto.custoHora);
      if (custoHora === null || custoHora > 10_000_000) return { erro: `Mão de obra ${n}: informe o custo por hora em reais, ex.: 35,00.` };
    }
    maoDeObra.push({ papel: bruto.papel, base: bruto.base, horasCentesimos: Math.round(horas * 100), custoHoraCentavos: custoHora });
  }
  return { insumos, maoDeObra };
}

// ----- Tabela de preços -----

const data = z
  .string()
  .trim()
  .max(10)
  .transform((v, ctx): string | undefined => {
    if (v === "") return undefined;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) {
      ctx.addIssue({ code: "custom", message: "Informe uma data válida." });
      return z.NEVER;
    }
    return v;
  })
  .optional();

export const precoSchema = z.object({
  id: campoIdOpcional,
  tipologiaId: campoIdObrigatorio("Tipologia inválida."),
  linhaId: campoIdOpcional,
  acabamentoId: campoIdOpcional,
  tipoVidroId: campoIdOpcional,
  espessuraVidroMm: z
    .string()
    .trim()
    .max(3)
    .transform((v, ctx): number | undefined => {
      if (v === "") return undefined;
      const n = Number(v);
      if (!/^\d{1,2}$/.test(v) || n < 1 || n > 50) {
        ctx.addIssue({ code: "custom", message: "Espessura: informe de 1 a 50 mm." });
        return z.NEVER;
      }
      return n;
    })
    .optional(),
  cobranca: z.enum(COBRANCAS, { message: "Escolha como cobrar." }),
  valor: z
    .string()
    .trim()
    .min(1, "Informe o valor.")
    .max(20)
    .transform((v, ctx): number => {
      const centavos = valorParaCentavos(v);
      if (centavos === null || centavos <= 0 || centavos > 2_000_000_000) {
        ctx.addIssue({ code: "custom", message: "Informe um valor em reais maior que zero, ex.: 850,00." });
        return z.NEVER;
      }
      return centavos;
    }),
  vigenciaInicio: data,
  vigenciaFim: data,
});

export const importacaoPrecosSchema = z.object({
  tipologiaId: campoIdObrigatorio("Tipologia inválida."),
  /** Linhas já lidas no navegador: Linha; Acabamento; Vidro; Espessura (mm); Cobrança; Valor. */
  linhas: z.array(z.array(z.string().max(200)).max(8)).min(1, "A planilha não tem linhas.").max(2000, "No máximo 2.000 linhas por vez."),
});
