import { z } from "zod";

import { FORMAS_PAGAMENTO, GATILHOS, validarParcelas, type ParcelaPlanejada } from "@/lib/dominio/parcelas";
import { percentualParaPontosBase } from "@/lib/dominio/preco";
import { campoIdObrigatorio } from "@/lib/validadores/campos";

const texto = (max: number) => z.string().trim().max(max, `Use no máximo ${max} caracteres.`);

export const parcelaCondicaoSchema = z.object({
  descricao: texto(120).min(1, "Descreva a parcela."),
  /** Percentual digitado ("50", "33,33"). */
  percentual: texto(8),
  gatilho: z.enum(GATILHOS, { message: "Escolha quando a parcela é cobrada." }),
  forma: z.enum(FORMAS_PAGAMENTO).nullable().optional(),
  diasApos: texto(4).optional(),
  parcelasCartao: texto(2).optional(),
});

export const condicaoSchema = z.object({
  id: z.string().trim().max(64).optional(),
  nome: texto(160).min(2, "Informe o nome da condição."),
  descricao: texto(300).optional(),
  /** Condição sem cronograma (ex.: "A combinar"). */
  textoLivre: texto(500).optional(),
  parcelas: z.array(parcelaCondicaoSchema).max(24, "No máximo 24 parcelas."),
});

export type EntradaCondicao = z.infer<typeof condicaoSchema>;
export const idsSchema = z.array(campoIdObrigatorio()).min(1).max(20);

/** Converte os textos digitados em parcelas do domínio e valida (soma 100%, gatilho, cartão). */
export function lerParcelasDaCondicao(entrada: EntradaCondicao): { parcelas: (ParcelaPlanejada & { ordem: number })[] } | { erro: string } {
  const livre = (entrada.textoLivre ?? "") !== "";
  if (livre && entrada.parcelas.length > 0) return { erro: "Uma condição com texto livre não tem parcelas. Remova as parcelas ou o texto livre." };
  if (livre) return { parcelas: [] };

  const parcelas: (ParcelaPlanejada & { ordem: number })[] = [];
  for (const [i, p] of entrada.parcelas.entries()) {
    const percentualPb = percentualParaPontosBase(p.percentual);
    if (percentualPb === null || percentualPb <= 0 || percentualPb > 10000) {
      return { erro: `Parcela ${i + 1}: informe o percentual entre 0,01 e 100, ex.: 50.` };
    }
    const diasApos = p.diasApos && p.diasApos !== "" ? Number(p.diasApos) : null;
    if (diasApos !== null && !/^\d{1,3}$/.test(p.diasApos ?? "")) return { erro: `Parcela ${i + 1}: informe os dias como número inteiro.` };
    const parcelasCartao = p.parcelasCartao && p.parcelasCartao !== "" ? Number(p.parcelasCartao) : null;
    if (parcelasCartao !== null && !/^\d{1,2}$/.test(p.parcelasCartao ?? "")) return { erro: `Parcela ${i + 1}: informe o número de parcelas do cartão.` };
    parcelas.push({
      ordem: i + 1,
      descricao: p.descricao,
      percentualPb,
      gatilho: p.gatilho,
      forma: p.forma ?? null,
      diasApos: p.gatilho === "DIAS_APOS_APROVACAO" ? diasApos : null,
      // O modelo não tem data fixa: ela é escolhida na proposta. Uma data qualquer só para validar o formato.
      dataFixa: p.gatilho === "DATA_FIXA" ? "2000-01-01" : null,
      parcelasCartao,
    });
  }
  if (parcelas.length === 0) return { erro: "Inclua ao menos uma parcela ou use o texto livre." };
  const valida = validarParcelas(parcelas);
  if (!valida.ok) return { erro: valida.erro };
  return { parcelas };
}
