import { z } from "zod";

import { lerQuantidade } from "@/lib/dominio/estoque";
import { CUSTO_MAXIMO_CENTAVOS } from "@/lib/dominio/reajuste";
import { parseMoedaParaCentavos } from "@/lib/formatadores";
import { campoCaixa } from "@/lib/validadores/campos";

/** Campo ausente do FormData vira texto vazio. */
const bruto = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v : ""),
    z.string().trim().max(max, `Use no máximo ${max} caracteres.`),
  );

const idObrigatorio = (mensagem: string) =>
  bruto(64).refine((v) => v.length > 0, mensagem);
const idOpcional = bruto(64).transform((v) => (v === "" ? null : v));
const textoOpcional = (max: number) =>
  bruto(max).transform((v) => (v === "" ? null : v));

function dataValida(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
const dataObrigatoria = (rotulo: string) =>
  bruto(10).refine(dataValida, `${rotulo}: informe uma data válida.`);

/** Quantidade digitada em pt-BR (até 3 casas) → milésimos; zero e negativo são recusados. */
const quantidade = (rotulo: string) =>
  bruto(20).transform((v, ctx): number => {
    const q = lerQuantidade(v);
    if (q === null || q <= 0 || q > 1_000_000_000) {
      ctx.addIssue({
        code: "custom",
        message: `${rotulo}: informe um número maior que zero, com até 3 casas (ex.: 2,5).`,
      });
      return z.NEVER;
    }
    return q;
  });

/** Custo unitário em reais → centavos; vazio = não informado (null), nunca zero. */
const custoOpcional = (rotulo: string) =>
  bruto(24).transform((v, ctx): number | null => {
    if (v === "") return null;
    const c = parseMoedaParaCentavos(v);
    if (c === null || c <= 0 || c > CUSTO_MAXIMO_CENTAVOS) {
      ctx.addIssue({
        code: "custom",
        message: `${rotulo}: informe um valor em reais, ex.: 12,50.`,
      });
      return z.NEVER;
    }
    return c;
  });

export const TIPOS_DE_MOVIMENTO_MANUAL = [
  "ENTRADA_COMPRA",
  "SAIDA_OBRA",
  "DEVOLUCAO",
  "AJUSTE",
  "PERDA",
] as const;

export const movimentoSchema = z
  .object({
    produtoId: idObrigatorio("Produto inválido."),
    tipo: z.enum(TIPOS_DE_MOVIMENTO_MANUAL, {
      message: "Escolha o tipo de movimento.",
    }),
    quantidade: quantidade("Quantidade"),
    sentido: z.preprocess(
      (v) => (v === "" || v === undefined ? undefined : v),
      z.enum(["MAIS", "MENOS"]).optional(),
    ),
    data: dataObrigatoria("Data"),
    projetoId: idOpcional,
    custo: custoOpcional("Custo unitário"),
    confirmarSemSaldo: campoCaixa,
    justificativa: textoOpcional(300),
  })
  .superRefine((d, ctx) => {
    if ((d.tipo === "SAIDA_OBRA" || d.tipo === "DEVOLUCAO") && !d.projetoId)
      ctx.addIssue({
        code: "custom",
        path: ["projetoId"],
        message: "Escolha a obra.",
      });
    if (d.tipo === "AJUSTE" && !d.sentido)
      ctx.addIssue({
        code: "custom",
        path: ["sentido"],
        message: "Escolha acrescentar ou retirar.",
      });
  });

export const estornoSchema = z.object({
  movimentoId: idObrigatorio("Movimento inválido."),
  motivo: bruto(300).refine(
    (v) => v.length >= 3,
    "Informe o motivo do estorno.",
  ),
});

const linhaDaContagem = z.object({
  produtoId: z.string().min(1).max(64),
  quantidade: z.string().max(20),
  custo: z.string().max(24),
});

/** A grade da contagem inicial viaja como JSON num campo só; cada linha vazia (sem quantidade) é ignorada. */
export const contagemSchema = z.object({
  data: dataObrigatoria("Data da contagem"),
  linhas: bruto(200_000).transform((v, ctx) => {
    let bruta: unknown;
    try {
      bruta = JSON.parse(v);
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "A contagem não pôde ser lida. Recarregue a página.",
      });
      return z.NEVER;
    }
    const lista = z
      .array(linhaDaContagem)
      .max(500, "Conte no máximo 500 produtos de uma vez.")
      .safeParse(bruta);
    if (!lista.success) {
      ctx.addIssue({
        code: "custom",
        message: "A contagem não pôde ser lida. Recarregue a página.",
      });
      return z.NEVER;
    }
    const saida: {
      produtoId: string;
      quantidadeMilesimos: number;
      custoUnitarioCentavos: number | null;
    }[] = [];
    for (const l of lista.data) {
      if (l.quantidade.trim() === "") continue; // produto não contado
      const q = lerQuantidade(l.quantidade);
      if (q === null || q <= 0 || q > 1_000_000_000) {
        ctx.addIssue({
          code: "custom",
          message: `Quantidade inválida (“${l.quantidade}”): use um número maior que zero, com até 3 casas.`,
        });
        return z.NEVER;
      }
      let custo: number | null = null;
      if (l.custo.trim() !== "") {
        custo = parseMoedaParaCentavos(l.custo);
        if (custo === null || custo <= 0 || custo > CUSTO_MAXIMO_CENTAVOS) {
          ctx.addIssue({
            code: "custom",
            message: `Custo inválido (“${l.custo}”): use reais, ex.: 12,50.`,
          });
          return z.NEVER;
        }
      }
      saida.push({
        produtoId: l.produtoId,
        quantidadeMilesimos: q,
        custoUnitarioCentavos: custo,
      });
    }
    return saida;
  }),
});

export type DadosDoMovimento = z.output<typeof movimentoSchema>;
