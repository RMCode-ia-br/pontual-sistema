import { beforeEach, describe, expect, it, vi } from "vitest";

import { permissoesEfetivas } from "@/lib/dominio/permissoes";

/**
 * Fase 7C: produto, funcionário (salário e custo por hora) e tipologia (composição) respeitam "ver custo e margem" por
 * AJUSTE, com o mesmo mecanismo do Bloco 6: o dado sai do servidor e a ação PRESERVA o valor guardado (campo ausente na
 * tela não é "apagar"). As ações rodam contra um banco em memória.
 */

const estado = vi.hoisted(() => ({
  sessao: null as unknown,
  produto: null as Record<string, unknown> | null,
  funcionario: null as Record<string, unknown> | null,
  atualizacoes: [] as { modelo: string; data: Record<string, unknown> }[],
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {}, updateTag: () => {} }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth/sessao", () => ({ exigirSessao: async () => estado.sessao }));
vi.mock("@/lib/auditoria", () => ({ registrarAuditoria: async () => {} }));
vi.mock("@/modules/produtos/servico-preco-kg", () => ({ recalcularCustoDoPerfil: async () => {} }));
vi.mock("@/lib/db", () => {
  const registro = (modelo: "produto" | "funcionario") => ({
    // O registro existente só vem quando a consulta é pelo id (conferências de código, CPF e vínculo voltam vazias).
    findFirst: async ({ where }: { where: Record<string, unknown> }) => {
      const r = modelo === "produto" ? estado.produto : estado.funcionario;
      return r && where.id === r.id && Object.keys(where).every((k) => ["id", "deletadoEm"].includes(k)) ? { ...r } : null;
    },
    update: async ({ data }: { data: Record<string, unknown> }) => {
      estado.atualizacoes.push({ modelo, data });
      return { ...(modelo === "produto" ? estado.produto : estado.funcionario), ...data };
    },
  });
  const qualquer = { findFirst: async () => null, findMany: async () => [], count: async () => 0, create: async () => ({ id: "x" }) };
  const tx: Record<string, unknown> = { produto: registro("produto"), funcionario: registro("funcionario"), historicoPreco: { create: async () => ({}) } };
  const prisma = new Proxy(tx, { get: (alvo, prop: string) => (prop === "$transaction" ? async (cb: (t: unknown) => Promise<unknown>) => cb(prisma) : (alvo[prop] ?? qualquer)) });
  return { prisma };
});

const sessaoDe = (ajustes?: unknown) => ({ id: "u", nome: "U", login: "u", email: null, papel: "ADMIN", permissoes: permissoesEfetivas("ADMIN", ajustes), precisaTrocarSenha: false });
const SEM_CUSTO = { verCustoMargem: false };

function formulario(campos: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

describe("funcionário: salário e custo por hora", () => {
  const CAMPOS = { id: "f1", nome: "Fulano de Tal", funcao: "FABRICA" };

  beforeEach(() => {
    estado.atualizacoes = [];
    estado.funcionario = { id: "f1", nome: "Fulano de Tal", funcao: "FABRICA", salarioBaseCentavos: 350000, custoHoraCentavos: 2500, ativo: true, deletadoEm: null };
  });

  it("sem 'ver custo e margem', editar o nome NÃO apaga salário nem custo por hora", async () => {
    estado.sessao = sessaoDe(SEM_CUSTO);
    const { editarFuncionario } = await import("@/modules/funcionarios/actions/funcionarios");
    const r = await editarFuncionario(null, formulario({ ...CAMPOS, nome: "Fulano Renomeado" }));
    expect(r.ok).toBe(true);
    const data = estado.atualizacoes[0]!.data;
    expect(data.nome).toBe("Fulano Renomeado");
    expect("salarioBaseCentavos" in data).toBe(false);
    expect("custoHoraCentavos" in data).toBe(false);
  });

  it("com 'ver custo e margem', o salário digitado é gravado", async () => {
    estado.sessao = sessaoDe();
    const { editarFuncionario } = await import("@/modules/funcionarios/actions/funcionarios");
    const r = await editarFuncionario(null, formulario({ ...CAMPOS, salarioBase: "4.000,00", custoHora: "30,00" }));
    expect(r.ok).toBe(true);
    expect(estado.atualizacoes[0]!.data).toMatchObject({ salarioBaseCentavos: 400000, custoHoraCentavos: 3000 });
  });
});

describe("produto: custo e 'por kg'", () => {
  const CAMPOS = { id: "p1", codigo: "P-1", descricao: "Perfil X", unidade: "BARRA" };

  beforeEach(() => {
    estado.atualizacoes = [];
    estado.produto = { id: "p1", codigo: "P-1", descricao: "Perfil X", unidade: "BARRA", custoUnitarioCentavos: 12345, custoAtualizadoEm: null, custoPorKg: true, fornecedorPrincipalId: null, deletadoEm: null };
  });

  it("sem 'ver custo e margem', editar a descrição preserva o custo e o 'por kg' guardados (sem erro)", async () => {
    estado.sessao = sessaoDe(SEM_CUSTO);
    const { editarProduto } = await import("@/modules/produtos/actions/produtos");
    const r = await editarProduto(null, formulario({ ...CAMPOS, descricao: "Perfil X renomeado" }));
    expect(r.ok).toBe(true);
    const data = estado.atualizacoes[0]!.data;
    expect(data.descricao).toBe("Perfil X renomeado");
    expect(data.custoUnitarioCentavos).toBe(12345);
    expect(data.custoPorKg).toBe(true);
    expect("custoAtualizadoEm" in data).toBe(false);
  });

  it("com 'ver custo e margem', apagar o custo de um produto que tinha é recusado (regra antiga continua)", async () => {
    estado.sessao = sessaoDe();
    estado.produto = { ...estado.produto!, custoPorKg: false };
    const { editarProduto } = await import("@/modules/produtos/actions/produtos");
    const r = await editarProduto(null, formulario({ ...CAMPOS, custoOriginal: "12345", custo: "" }));
    expect(r.ok).toBe(false);
    expect(estado.atualizacoes).toHaveLength(0);
  });
});

describe("telas: o mecanismo está ligado em produto, funcionário e tipologia", () => {
  it("as telas cortam o custo no servidor (texto-guarda, para ninguém desligar sem querer)", async () => {
    const fs = await import("node:fs");
    const ler = (p: string) => fs.readFileSync(p, "utf8");
    expect(ler("src/app/(app)/produtos/[id]/page.tsx")).toMatch(/custoUnitarioCentavos: null/);
    expect(ler("src/app/(app)/funcionarios/[id]/page.tsx")).toMatch(/salarioBaseCentavos: null/);
    expect(ler("src/app/(app)/tipologias/[id]/page.tsx")).toMatch(/a\.valor !== "composicao" \|\| can\(sessao, "ver", "custo"\)/);
    expect(ler("src/modules/produtos/components/painel-lista-produtos.tsx")).toMatch(/c\.id !== "custo"/);
    expect(ler("src/modules/funcionarios/components/painel-lista-funcionarios.tsx")).toMatch(/c\.id !== "salario"/);
    expect(ler("src/modules/produtos/components/form-produto.tsx")).toMatch(/mostrarCusto \?/);
    expect(ler("src/modules/funcionarios/components/form-funcionario.tsx")).toMatch(/mostrarCusto \?/);
  });
});
