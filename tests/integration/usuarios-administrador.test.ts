import { describe, expect, it } from "vitest";

import { ajustesPermissaoSchema, ehAdministrador, PAPEIS, permissoesEfetivas } from "../../src/lib/dominio/permissoes";
import { comConexao } from "./banco-teste";

/**
 * Fase 7C, só LEITURA do banco compartilhado (não cria nem altera usuário, real ou de teste): confere o que a migração e a
 * regra do último administrador prometem sobre os usuários de verdade.
 */
describe("usuários no banco: administrador e ajustes", () => {
  const ler = () =>
    comConexao(async (c) => {
      const r = await c.query<{ id: string; login: string; ativo: boolean; papel: string; ajustesPermissao: unknown }>(
        `SELECT id, login, ativo, papel::text AS papel, "ajustesPermissao" FROM "Usuario" WHERE "deletadoEm" IS NULL`,
      );
      return r.rows;
    });

  it("existe pelo menos um administrador ativo (Dono/Gestão com acesso a Configurações)", async () => {
    const admins = (await ler()).filter((u) => u.ativo && ehAdministrador(permissoesEfetivas(u.papel, u.ajustesPermissao)));
    expect(admins.length).toBeGreaterThanOrEqual(1);
  });

  it("todo usuário tem um perfil conhecido e nenhum ajuste guardado está fora do formato", async () => {
    for (const u of await ler()) {
      expect(PAPEIS as readonly string[], `perfil de ${u.login}`).toContain(u.papel);
      if (u.ajustesPermissao !== null) expect(ajustesPermissaoSchema.safeParse(u.ajustesPermissao).success, `ajuste de ${u.login}`).toBe(true);
    }
  });

  it("usuário Dono/Gestão sem ajuste tem acesso total (a migração não trancou ninguém)", async () => {
    const donos = (await ler()).filter((u) => u.papel === "ADMIN" && u.ajustesPermissao === null);
    for (const u of donos) {
      const p = permissoesEfetivas(u.papel, u.ajustesPermissao);
      expect(p.verValores && p.verCustoMargem && ehAdministrador(p), u.login).toBe(true);
    }
  });
});
