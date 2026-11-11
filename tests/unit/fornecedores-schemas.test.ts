import { describe, expect, it } from "vitest";

import { editarFornecedorSchema, fornecedorSchema } from "@/modules/fornecedores/schemas";

const ok = { razaoSocial: "Alumínios Macaé" };

describe("fornecedorSchema", () => {
  it("aceita só o nome; categorias começam vazias", () => {
    const r = fornecedorSchema.safeParse(ok);
    expect(r.success && r.data.categoriaIds).toEqual([]);
  });

  it("normaliza CNPJ, telefone e e-mail", () => {
    const r = fornecedorSchema.safeParse({ ...ok, cnpj: "11.222.333/0001-81", telefone: "(22) 99958-3288", email: "Vendas@Exemplo.com" });
    expect(r.success && r.data).toMatchObject({ cnpj: "11222333000181", telefone: "+5522999583288", email: "vendas@exemplo.com" });
  });

  it("recusa CNPJ inválido, nome curto, prazo absurdo e categorias demais", () => {
    expect(fornecedorSchema.safeParse({ ...ok, cnpj: "11.111.111/1111-11" }).success).toBe(false);
    expect(fornecedorSchema.safeParse({ razaoSocial: "x" }).success).toBe(false);
    expect(fornecedorSchema.safeParse({ ...ok, prazoEntregaDias: "366" }).success).toBe(false);
    expect(fornecedorSchema.safeParse({ ...ok, prazoEntregaDias: "-1" }).success).toBe(false);
    expect(fornecedorSchema.safeParse({ ...ok, categoriaIds: Array.from({ length: 31 }, (_, i) => `c${i}`) }).success).toBe(false);
  });

  it("prazo vazio fica ausente e prazo válido vira número", () => {
    const vazio = fornecedorSchema.safeParse({ ...ok, prazoEntregaDias: "" });
    expect(vazio.success && vazio.data.prazoEntregaDias).toBeUndefined();
    const sete = fornecedorSchema.safeParse({ ...ok, prazoEntregaDias: "7" });
    expect(sete.success && sete.data.prazoEntregaDias).toBe(7);
  });

  it("a edição exige o id", () => {
    expect(editarFornecedorSchema.safeParse(ok).success).toBe(false);
    expect(editarFornecedorSchema.safeParse({ ...ok, id: "f1" }).success).toBe(true);
  });
});
