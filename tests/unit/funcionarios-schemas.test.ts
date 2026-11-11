import { describe, expect, it } from "vitest";

import { editarEquipeSchema, editarFuncionarioSchema, equipeSchema, funcionarioSchema, membroSchema } from "@/modules/funcionarios/schemas";

const ok = { nome: "José da Silva", funcao: "INSTALACAO" };

describe("funcionarioSchema", () => {
  it("aceita nome e função; o resto é opcional", () => {
    expect(funcionarioSchema.safeParse(ok).success).toBe(true);
  });

  it("exige a função, dentro da lista", () => {
    expect(funcionarioSchema.safeParse({ nome: "José da Silva" }).success).toBe(false);
    expect(funcionarioSchema.safeParse({ ...ok, funcao: "CHEFE" }).success).toBe(false);
  });

  it("converte salário e custo por hora de reais para centavos inteiros", () => {
    const r = funcionarioSchema.safeParse({ ...ok, salarioBase: "3.500,00", custoHora: "25,50" });
    expect(r.success && r.data.salarioBase).toBe(350000);
    expect(r.success && r.data.custoHora).toBe(2550);
  });

  it("recusa valor monetário inválido, negativo ou acima do limite do campo", () => {
    for (const ruim of ["abc", "-10", "12,345", "99999999999,00"]) expect(funcionarioSchema.safeParse({ ...ok, salarioBase: ruim }).success, ruim).toBe(false);
  });

  it("a demissão não pode ser antes da admissão, mas o mesmo dia vale", () => {
    const antes = funcionarioSchema.safeParse({ ...ok, admissaoEm: "2024-05-10", demissaoEm: "2024-01-10" });
    expect(antes.success).toBe(false);
    if (!antes.success) expect(antes.error.issues[0]).toMatchObject({ path: ["demissaoEm"] });
    expect(funcionarioSchema.safeParse({ ...ok, admissaoEm: "2024-05-10", demissaoEm: "2024-05-10" }).success).toBe(true);
    expect(funcionarioSchema.safeParse({ ...ok, demissaoEm: "2024-01-10" }).success).toBe(true); // sem admissão: nada a comparar
  });

  it("recusa data impossível e CPF inválido", () => {
    expect(funcionarioSchema.safeParse({ ...ok, admissaoEm: "2024-02-31" }).success).toBe(false);
    expect(funcionarioSchema.safeParse({ ...ok, cpf: "111.111.111-11" }).success).toBe(false);
    const r = funcionarioSchema.safeParse({ ...ok, cpf: "529.982.247-25" });
    expect(r.success && r.data.cpf).toBe("52998224725");
  });

  it("a edição exige o id e mantém a regra das datas", () => {
    expect(editarFuncionarioSchema.safeParse(ok).success).toBe(false);
    expect(editarFuncionarioSchema.safeParse({ ...ok, id: "f1" }).success).toBe(true);
    expect(editarFuncionarioSchema.safeParse({ ...ok, id: "f1", admissaoEm: "2024-05-10", demissaoEm: "2024-01-10" }).success).toBe(false);
  });
});

describe("equipes", () => {
  it("equipe exige nome; a caixa 'ativo' só vale com 'on'", () => {
    expect(equipeSchema.safeParse({ nome: "x" }).success).toBe(false);
    const r = equipeSchema.safeParse({ nome: "Equipe 1", ativo: "on" });
    expect(r.success && r.data.ativo).toBe(true);
    expect(editarEquipeSchema.safeParse({ nome: "Equipe 1" }).success).toBe(false);
  });

  it("membro exige equipe e pessoa, e 'lider' só com 'on'", () => {
    expect(membroSchema.safeParse({ equipeId: "e1", funcionarioId: "" }).success).toBe(false);
    const r = membroSchema.safeParse({ equipeId: "e1", funcionarioId: "f1" });
    expect(r.success && r.data.lider).toBe(false);
    const lider = membroSchema.safeParse({ equipeId: "e1", funcionarioId: "f1", lider: "on" });
    expect(lider.success && lider.data.lider).toBe(true);
  });
});
