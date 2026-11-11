import { describe, expect, it } from "vitest";

import { comConexao } from "./banco-teste";

/**
 * Garante que a API de dados do Supabase (PostgREST) continue FECHADA para as tabelas do sistema.
 * Toda tabela nova criada por migração precisa de `ENABLE ROW LEVEL SECURITY`; este teste falha se
 * alguma ficar para trás (ela ficaria legível/gravável por quem tiver a chave pública "anon").
 */
describe("segurança do banco (Supabase)", () => {
  it("todas as tabelas do schema public têm RLS ligado", async () => {
    const semRls = await comConexao(async (c) => {
      const r = await c.query<{ tabela: string }>(
        `SELECT c.relname AS tabela FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity ORDER BY 1`,
      );
      return r.rows.map((x) => x.tabela);
    });
    expect(semRls, "tabelas SEM row level security (adicione ENABLE ROW LEVEL SECURITY na migração)").toEqual([]);
  });

  it("os papéis anon e authenticated não têm nenhum privilégio nas tabelas do sistema", async () => {
    const expostas = await comConexao(async (c) => {
      const papeis = await c.query<{ rolname: string }>(`SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated')`);
      if (papeis.rows.length === 0) return []; // PostgreSQL comum (sem Supabase): nada a verificar
      const r = await c.query<{ tabela: string; papel: string }>(
        `SELECT c.relname AS tabela, p.rolname AS papel
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           CROSS JOIN pg_roles p
          WHERE n.nspname = 'public' AND c.relkind = 'r' AND p.rolname IN ('anon','authenticated')
            AND (has_table_privilege(p.oid, c.oid, 'SELECT') OR has_table_privilege(p.oid, c.oid, 'INSERT')
              OR has_table_privilege(p.oid, c.oid, 'UPDATE') OR has_table_privilege(p.oid, c.oid, 'DELETE'))
          ORDER BY 1, 2`,
      );
      return r.rows.map((x) => `${x.papel} -> ${x.tabela}`);
    });
    expect(expostas, "privilégios abertos para papéis públicos do Supabase").toEqual([]);
  });

  it("o app (dono das tabelas) continua lendo e gravando normalmente", async () => {
    const total = await comConexao(async (c) => (await c.query<{ n: number }>(`SELECT count(*)::int AS n FROM "ConfiguracaoEmpresa"`)).rows[0].n);
    expect(total).toBe(1);
  });
});
