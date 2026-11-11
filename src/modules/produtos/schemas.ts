import { z } from "zod";

import { textoParaDecimal } from "@/lib/dominio/numeros";
import { CUSTO_MAXIMO_CENTAVOS, type RegraReajuste } from "@/lib/dominio/reajuste";
import { valorParaCentavos } from "@/lib/dominio/numeros";
import {
  campoDecimalOpcional,
  campoIdObrigatorio,
  campoIdOpcional,
  campoInteiroOpcional,
  campoMoedaOpcional,
  campoTexto,
  campoTextoOpcional,
} from "@/lib/validadores/campos";

export const UNIDADES = ["UN", "M", "M2", "KG", "BARRA", "L", "PAR", "CJ"] as const;

export const ROTULO_UNIDADE: Record<(typeof UNIDADES)[number], string> = {
  UN: "Unidade",
  M: "Metro",
  M2: "Metro quadrado (m²)",
  KG: "Quilo (kg)",
  BARRA: "Barra",
  L: "Litro",
  PAR: "Par",
  CJ: "Conjunto",
};

/** Sigla curta para listas ("m²" em vez de "M2"). */
export const SIGLA_UNIDADE: Record<(typeof UNIDADES)[number], string> = { UN: "un", M: "m", M2: "m²", KG: "kg", BARRA: "barra", L: "L", PAR: "par", CJ: "cj" };

/** Comprimento padrão da barra de perfil, em mm (spec R14), usado só quando a unidade é "Barra" e nada foi informado. */
export const COMPRIMENTO_BARRA_PADRAO_MM = 6000;

const produtoBase = z.object({
  codigo: campoTexto("o código do produto", 40, 1),
  descricao: campoTexto("a descrição", 200),
  categoriaId: campoIdOpcional,
  unidade: z.enum(UNIDADES, { message: "Escolha a unidade de medida." }),
  linhaId: campoIdOpcional,
  acabamentoId: campoIdOpcional,
  fornecedorPrincipalId: campoIdOpcional,
  /** Digitado em reais e guardado em centavos. Vazio = custo ainda não informado. */
  custo: campoMoedaOpcional("Custo unitário", CUSTO_MAXIMO_CENTAVOS),
  comprimentoBarraMm: campoInteiroOpcional("Comprimento da barra", 20000),
  pesoKgPorMetro: campoDecimalOpcional("Peso por metro", 1000, 3),
  larguraMm: campoInteiroOpcional("Largura", 20000),
  alturaMm: campoInteiroOpcional("Altura", 20000),
  estoqueMinimo: campoDecimalOpcional("Estoque mínimo", 1_000_000, 3),
  localizacao: campoTextoOpcional(120),
  observacoes: campoTextoOpcional(4000),
});

export const produtoSchema = produtoBase;
export const editarProdutoSchema = produtoBase.extend({ id: campoIdObrigatorio("Produto inválido.") });

export const idsSchema = z.array(campoIdObrigatorio()).min(1, "Escolha ao menos um produto.").max(200, "Escolha no máximo 200 de uma vez.");

// ----- Reajuste em lote (R13) -----

/** Quantos produtos um único reajuste pode atingir (acima disso, divida por categoria ou fornecedor). */
export const LIMITE_REAJUSTE = 5000;

const ESCOPOS = ["FORNECEDOR", "CATEGORIA"] as const;
const MODOS = ["PERCENTUAL", "VALOR_FIXO"] as const;

const reajusteBase = z.object({
  escopo: z.enum(ESCOPOS, { message: "Escolha reajustar por fornecedor ou por categoria." }),
  alvoId: campoIdObrigatorio("Escolha o fornecedor ou a categoria."),
  modo: z.enum(MODOS, { message: "Escolha o tipo de reajuste." }),
  /** Com sinal opcional: "5", "+5", "-3,5" (percentual) ou "2,50", "-10,00" (valor fixo, em reais). */
  valor: z.string().trim().min(1, "Informe o valor do reajuste.").max(20, "Valor grande demais."),
});

/** Transforma o texto do valor numa regra pronta para calcular (ou devolve a mensagem de erro). */
export function lerRegraDeReajuste(modo: (typeof MODOS)[number], texto: string): { regra: RegraReajuste } | { erro: string } {
  const limpo = texto.replace(/\s/g, "");
  const negativo = limpo.startsWith("-");
  const magnitude = limpo.replace(/^[+-]/, "");
  if (modo === "PERCENTUAL") {
    const n = textoParaDecimal(magnitude.replace(/%$/, ""), 2);
    if (n === null) return { erro: "Percentual inválido. Use números, por exemplo 5 ou -3,5." };
    return { regra: { modo, percentual: negativo ? -n : n } };
  }
  const centavos = valorParaCentavos(magnitude);
  if (centavos === null) return { erro: "Valor inválido. Use reais e centavos, por exemplo 2,50 ou -10,00." };
  return { regra: { modo, valorCentavos: negativo ? -centavos : centavos } };
}

export const reajusteSchema = reajusteBase;
/** Na confirmação, a prévia que a pessoa viu viaja junto (assinatura) para o servidor conferir que nada mudou. */
export const aplicarReajusteSchema = reajusteBase.extend({ assinatura: z.string().trim().min(8).max(128) });

export type EntradaDeReajuste = z.infer<typeof reajusteSchema>;
