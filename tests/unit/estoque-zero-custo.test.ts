import { describe, expect, it } from "vitest";

import { campoMoedaOpcional, mensagemDeCustoZero } from "@/lib/validadores/campos";
import { contagemSchema, movimentoSchema } from "@/modules/estoque/schemas";
import { produtoSchema } from "@/modules/produtos/schemas";
import { z } from "zod";

/**
 * Decisões do Marcelo sobre zero (Fase 7B): a CONTAGEM de estoque aceita zero (produto contado, sem estoque; diferente de
 * "não contado" = em branco). O CUSTO unitário recusa zero: sem custo, deixe em branco e a margem aparece como Incompleta.
 */
const MENSAGEM = /se não tem custo, deixe em branco: a margem aparece como Incompleta/;

describe("custo unitário: zero é recusado com a orientação; em branco é aceito", () => {
  const campo = z.object({ custo: campoMoedaOpcional("Custo unitário", 1_000_000, { recusarZero: true }) });
  it.each(["0", "0,00", "R$ 0,00"])("%s → recusado, dizendo para deixar em branco", (v) => {
    const r = campo.safeParse({ custo: v });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(MENSAGEM);
  });
  it("em branco é aceito (sem custo: nada inventado) e valor positivo vale", () => {
    expect(campo.safeParse({ custo: "" })).toMatchObject({ success: true, data: { custo: undefined } });
    expect(campo.safeParse({ custo: "12,50" })).toMatchObject({ success: true, data: { custo: 1250 } });
  });
  it("a mensagem é a mesma em todo o sistema", () => {
    expect(mensagemDeCustoZero("Custo unitário")).toBe("Custo unitário: se não tem custo, deixe em branco: a margem aparece como Incompleta.");
  });
});

describe("custo no cadastro de produto e no movimento de estoque", () => {
  const produto = { codigo: "P-1", descricao: "Perfil teste", unidade: "UN", categoriaId: "", fornecedorId: "" };
  it("cadastro de produto: custo 0 recusado; em branco aceito", () => {
    const zero = produtoSchema.safeParse({ ...produto, custo: "0,00" });
    expect(zero.success).toBe(false);
    if (!zero.success) expect(JSON.stringify(zero.error.issues)).toMatch(MENSAGEM);
    const branco = produtoSchema.safeParse({ ...produto, custo: "" });
    if (!branco.success) expect(JSON.stringify(branco.error.issues)).not.toMatch(/Custo unitário/); // pode haver outro campo faltando, mas nunca por custo em branco
  });

  const movimento = (extra: Record<string, string>) => movimentoSchema.safeParse({ produtoId: "abc", tipo: "ENTRADA_COMPRA", quantidade: "2", data: "2026-11-20", ...extra });
  it("movimento: custo 0 recusado com a orientação; custo em branco aceito", () => {
    const zero = movimento({ custo: "0" });
    expect(zero.success).toBe(false);
    if (!zero.success) expect(zero.error.issues.map((i) => i.message).join(" ")).toMatch(MENSAGEM);
    expect(movimento({ custo: "" })).toMatchObject({ success: true, data: { custo: null } });
  });
  it("movimento: quantidade zero continua recusada", () => {
    expect(movimento({ quantidade: "0" }).success).toBe(false);
  });
});

describe("contagem inicial: quantidade zero é aceita (e em branco continua 'não contado')", () => {
  const contagem = (linhas: { produtoId: string; quantidade: string; custo: string }[]) => contagemSchema.safeParse({ data: "2026-11-20", linhas: JSON.stringify(linhas) });
  it("0, 0,00 e 0,000 viram contagem de zero; em branco é ignorado", () => {
    const r = contagem([
      { produtoId: "a", quantidade: "0", custo: "" },
      { produtoId: "b", quantidade: "0,00", custo: "" },
      { produtoId: "c", quantidade: "", custo: "" },
    ]);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.linhas.map((l: { produtoId: string; quantidadeMilesimos: number }) => [l.produtoId, l.quantidadeMilesimos])).toEqual([["a", 0], ["b", 0]]);
  });
  it("quantidade negativa ou ilegível é recusada; custo 0 na contagem é recusado com a orientação", () => {
    expect(contagem([{ produtoId: "a", quantidade: "-1", custo: "" }]).success).toBe(false);
    expect(contagem([{ produtoId: "a", quantidade: "abc", custo: "" }]).success).toBe(false);
    const r = contagem([{ produtoId: "a", quantidade: "5", custo: "0" }]);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(MENSAGEM);
  });
});
