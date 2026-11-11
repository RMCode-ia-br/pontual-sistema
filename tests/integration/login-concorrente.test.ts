import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { autenticar } from "@/lib/auth/autenticar";
import { MAX_FALHAS } from "@/lib/auth/bloqueio";

import { criarUsuarioDeTeste, falhasRegistradas, limparDadosDeIntegracao } from "./banco-teste";

const SENHA = "Senha-Integracao-1";

beforeAll(async () => {
  await limparDadosDeIntegracao();
  await criarUsuarioDeTeste("int-concorrente", SENHA);
  await criarUsuarioDeTeste("int-reinicio", SENHA);
  await criarUsuarioDeTeste("int-alias", SENHA, "int-alias@exemplo.com");
});

afterAll(async () => {
  await limparDadosDeIntegracao();
});

describe("bloqueio de login com o banco real", () => {
  it("20 tentativas SIMULTÂNEAS com senha errada: só 5 passam, as outras 15 são bloqueadas", async () => {
    const ip = "198.51.100.201";
    const resultados = await Promise.all(Array.from({ length: 20 }, (_, i) => autenticar("int-concorrente", `errada-${i}-xyz`, ip)));

    const avaliadas = resultados.filter((r) => !r.ok && r.motivo === "invalido").length;
    const bloqueadas = resultados.filter((r) => !r.ok && r.motivo === "bloqueado").length;

    // Antes da correção, as 20 liam "0 falhas" ao mesmo tempo e TODAS eram avaliadas pelo bcrypt.
    expect(avaliadas).toBe(MAX_FALHAS);
    expect(bloqueadas).toBe(20 - MAX_FALHAS);
    expect(await falhasRegistradas("int-concorrente")).toBe(MAX_FALHAS);
  });

  it("depois de bloqueado, nem a senha CERTA entra", async () => {
    const r = await autenticar("int-concorrente", SENHA, "198.51.100.201");
    expect(r).toMatchObject({ ok: false, motivo: "bloqueado" });
  });

  it("o bloqueio vale para o mesmo usuário vindo de outro IP (por conta)", async () => {
    const r = await autenticar("int-concorrente", SENHA, "198.51.100.202");
    expect(r).toMatchObject({ ok: false, motivo: "bloqueado" });
  });

  it("4 falhas e depois a senha certa: entra, e o contador zera", async () => {
    const ip = "198.51.100.203";
    for (let i = 0; i < 4; i++) {
      expect(await autenticar("int-reinicio", `errada-${i}`, ip)).toEqual({ ok: false, motivo: "invalido" });
    }
    const entrou = await autenticar("int-reinicio", SENHA, ip);
    expect(entrou).toMatchObject({ ok: true, usuario: { login: "int-reinicio" } });
    // A falha provisória do próprio login bem-sucedido foi desfeita.
    expect(await falhasRegistradas("int-reinicio")).toBe(4);

    // Zerou: dá para errar mais 4 vezes sem bloquear.
    for (let i = 0; i < 4; i++) {
      expect(await autenticar("int-reinicio", `outra-${i}`, ip)).toEqual({ ok: false, motivo: "invalido" });
    }
  });

  it("login e e-mail do mesmo usuário compartilham UM contador (não são 2x as tentativas)", async () => {
    const ip = "198.51.100.204";
    for (let i = 0; i < 3; i++) await autenticar("int-alias", `errada-${i}`, ip);
    for (let i = 0; i < 2; i++) await autenticar("int-alias@exemplo.com", `errada-${i}`, ip);
    // 3 pelo login + 2 pelo e-mail = 5: qualquer um dos dois está bloqueado.
    expect(await autenticar("int-alias", SENHA, "198.51.100.205")).toMatchObject({ ok: false, motivo: "bloqueado" });
    expect(await autenticar("int-alias@exemplo.com", SENHA, "198.51.100.206")).toMatchObject({ ok: false, motivo: "bloqueado" });
  });

  it("usuário inexistente também é bloqueado (não revela se o login existe) e nunca autentica", async () => {
    const ip = "198.51.100.207";
    const rs = await Promise.all(Array.from({ length: 8 }, (_, i) => autenticar("int-fantasma", `x-${i}-yyy`, ip)));
    expect(rs.filter((r) => !r.ok && r.motivo === "invalido")).toHaveLength(MAX_FALHAS);
    expect(rs.filter((r) => !r.ok && r.motivo === "bloqueado")).toHaveLength(8 - MAX_FALHAS);
    expect(rs.some((r) => r.ok)).toBe(false);
  });
});
