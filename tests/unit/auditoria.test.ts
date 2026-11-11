import { describe, expect, it } from "vitest";

import { calcularDiff, sanitizarParaAuditoria } from "@/lib/auditoria";
import { can } from "@/lib/permissoes";

describe("sanitização da auditoria", () => {
  it("remove senhaHash e outros campos sensíveis, inclusive aninhados", () => {
    const r = sanitizarParaAuditoria({
      nome: "Ana",
      senhaHash: "$2b$12$segredo",
      aninhado: { token: "abc", ok: 1 },
      lista: [{ senha: "x", v: 2 }],
    });
    expect(JSON.stringify(r)).not.toContain("segredo");
    expect(r).toEqual({ nome: "Ana", aninhado: { ok: 1 }, lista: [{ v: 2 }] });
  });

  it("converte Date e BigInt para texto", () => {
    const r = sanitizarParaAuditoria({ em: new Date("2026-01-02T03:04:05Z"), n: BigInt(10) });
    expect(r).toEqual({ em: "2026-01-02T03:04:05.000Z", n: "10" });
  });

  it("devolve null para ausência de valor", () => {
    expect(sanitizarParaAuditoria(null)).toBeNull();
    expect(sanitizarParaAuditoria(undefined)).toBeNull();
  });
});

describe("diff da auditoria", () => {
  it("guarda só os campos alterados", () => {
    const d = calcularDiff({ nome: "A", ativo: true, cidade: "Macaé" }, { nome: "B", ativo: true, cidade: "Macaé" });
    expect(d).toEqual({ antes: { nome: "A" }, depois: { nome: "B" } });
  });

  it("ignora atualizadoEm e atualizadoPorId", () => {
    const d = calcularDiff(
      { nome: "A", atualizadoEm: "2026-01-01", atualizadoPorId: "u1" },
      { nome: "A", atualizadoEm: "2026-02-02", atualizadoPorId: "u2" },
    );
    expect(d).toEqual({ antes: {}, depois: {} });
  });

  it("na criação guarda o registro inteiro em 'depois'", () => {
    expect(calcularDiff(null, { nome: "A", senhaHash: "x" })).toEqual({ antes: null, depois: { nome: "A" } });
  });

  it("na exclusão guarda o registro inteiro em 'antes'", () => {
    expect(calcularDiff({ nome: "A" }, null)).toEqual({ antes: { nome: "A" }, depois: null });
  });

  it("nunca vaza senhaHash, nem quando ele muda", () => {
    const d = calcularDiff({ senhaHash: "antigo", nome: "A" }, { senhaHash: "novo", nome: "A" });
    expect(JSON.stringify(d)).not.toMatch(/antigo|novo/);
  });
});

describe("permissões", () => {
  it("hoje todos podem tudo (ponto único de mudança futura)", () => {
    expect(can({ id: "u1", papel: "ADMIN" }, "excluir", "cliente")).toBe(true);
  });
});
