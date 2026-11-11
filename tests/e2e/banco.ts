/**
 * Acesso ao banco só para preparar/limpar dados dos testes E2E.
 * Usa o driver `pg` direto (SQL) porque o carregador de TypeScript do Playwright é CommonJS
 * e não consegue importar o cliente Prisma gerado, que é ESM.
 */
import { randomUUID } from "node:crypto";

import { config } from "dotenv";
import { Client } from "pg";

import { gerarHashSenha } from "../../src/lib/auth/senha";

import { USUARIO_E2E } from "./dados";

config({ path: ".env.local", quiet: true });

async function comConexao<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const url = new URL(process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "");
  url.searchParams.delete("pgbouncer");
  const cliente = new Client({ connectionString: url.toString(), ssl: { rejectUnauthorized: false } });
  await cliente.connect();
  try {
    return await fn(cliente);
  } finally {
    await cliente.end();
  }
}

async function limpar(c: Client): Promise<void> {
  const existente = await c.query<{ id: string }>(`SELECT id FROM "Usuario" WHERE login = $1`, [USUARIO_E2E.login]);
  // Só apaga o que é dos testes: o usuário e-2-e e os IPs da faixa reservada (RFC 5737).
  await c.query(`DELETE FROM "TentativaLogin" WHERE identificador = $1 OR ip LIKE '198.51.100.%'`, [USUARIO_E2E.login]);
  const id = existente.rows[0]?.id;
  if (id) {
    await c.query(`DELETE FROM "LogAuditoria" WHERE "usuarioId" = $1 OR "entidadeId" = $1`, [id]);
    await c.query(`DELETE FROM "Usuario" WHERE id = $1`, [id]);
  }
}

/** Recria o usuário de teste no estado inicial: senha provisória e troca pendente. */
export async function prepararUsuarioE2E(): Promise<void> {
  const senhaHash = await gerarHashSenha(USUARIO_E2E.senhaProvisoria);
  await comConexao(async (c) => {
    await limpar(c);
    await c.query(
      `INSERT INTO "Usuario" (id, nome, login, "senhaHash", "precisaTrocarSenha", "atualizadoEm")
       VALUES ($1, $2, $3, $4, true, now())`,
      [randomUUID(), USUARIO_E2E.nome, USUARIO_E2E.login, senhaHash],
    );
  });
}

export async function removerUsuarioE2E(): Promise<void> {
  await comConexao(limpar);
}

export async function definirUsuarioAtivo(ativo: boolean): Promise<void> {
  await comConexao((c) => c.query(`UPDATE "Usuario" SET ativo = $1 WHERE login = $2`, [ativo, USUARIO_E2E.login]));
}

export type LinhaAuditoria = { usuarioNome: string | null; acao: string; antes: unknown; depois: unknown };

export async function buscarAuditoriaDoUsuarioE2E(acao: string): Promise<LinhaAuditoria[]> {
  return comConexao(async (c) => {
    const r = await c.query<LinhaAuditoria>(
      `SELECT a."usuarioNome", a.acao, a.antes, a.depois
         FROM "LogAuditoria" a JOIN "Usuario" u ON u.id = a."entidadeId"
        WHERE u.login = $1 AND a.acao = $2`,
      [USUARIO_E2E.login, acao],
    );
    return r.rows;
  });
}
