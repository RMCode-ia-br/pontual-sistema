import { describe, expect, it } from "vitest";

import {
  conferirSenha,
  CUSTO_BCRYPT,
  gerarHashSenha,
  gerarSenhaTemporaria,
  validarPoliticaSenha,
} from "@/lib/auth/senha";

describe("política de senha", () => {
  it("rejeita senha com menos de 8 caracteres", () => {
    expect(validarPoliticaSenha("1234567")).toMatchObject({ valida: false });
  });

  it("aceita senha com exatamente 8 caracteres", () => {
    expect(validarPoliticaSenha("12345678")).toEqual({ valida: true });
  });

  it("rejeita a senha inicial 'admin' em qualquer caixa, mesmo com espaços", () => {
    for (const s of ["admin", "ADMIN", "Admin"]) {
      // 'admin' tem 5 letras: cai na regra de tamanho, que também a bloqueia.
      expect(validarPoliticaSenha(s)).toMatchObject({ valida: false });
    }
  });

  it("rejeita 'admin' preenchida com espaços até 8 caracteres", () => {
    expect(validarPoliticaSenha("admin   ")).toMatchObject({ valida: false });
  });

  it("rejeita senha só de espaços", () => {
    expect(validarPoliticaSenha("        ")).toMatchObject({ valida: false });
  });
});

describe("hash de senha", () => {
  it("usa bcrypt com custo >= 12 e confere a senha correta", async () => {
    expect(CUSTO_BCRYPT).toBeGreaterThanOrEqual(12);
    const hash = await gerarHashSenha("senha-segura-123");
    expect(hash.startsWith("$2")).toBe(true);
    expect(hash).toContain(`$${CUSTO_BCRYPT}$`);
    expect(await conferirSenha("senha-segura-123", hash)).toBe(true);
  });

  it("não confere senha errada", async () => {
    const hash = await gerarHashSenha("senha-segura-123");
    expect(await conferirSenha("senha-segura-124", hash)).toBe(false);
  });
});

describe("senha temporária", () => {
  it("tem o tamanho pedido e só caracteres sem ambiguidade", () => {
    const s = gerarSenhaTemporaria(12);
    expect(s).toHaveLength(12);
    expect(s).not.toMatch(/[0O1lI]/);
  });

  it("gera valores diferentes e passa na própria política", () => {
    const a = gerarSenhaTemporaria();
    const b = gerarSenhaTemporaria();
    expect(a).not.toBe(b);
    expect(validarPoliticaSenha(a)).toEqual({ valida: true });
  });
});
