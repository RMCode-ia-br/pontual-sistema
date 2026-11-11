import { randomUUID } from "node:crypto";

import { Client } from "pg";

import { gerarHashSenha } from "../../src/lib/auth/senha";

/** Conexão direta (Session pooler) para preparar e limpar dados dos testes de integração. */
export async function comConexao<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const url = new URL(process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "");
  url.searchParams.delete("pgbouncer");
  const c = new Client({ connectionString: url.toString(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

export const PREFIXO_LOGIN = "int-";
export const PREFIXO_IP = "198.51.100.2";

export async function criarUsuarioDeTeste(login: string, senha: string, email?: string): Promise<void> {
  const senhaHash = await gerarHashSenha(senha);
  await comConexao((c) =>
    c.query(
      `INSERT INTO "Usuario" (id, nome, login, email, "senhaHash", "precisaTrocarSenha", "atualizadoEm")
       VALUES ($1, $2, $3, $4, $5, false, now())`,
      [randomUUID(), `Integração ${login}`, login, email ?? null, senhaHash],
    ),
  );
}

export async function falhasRegistradas(login: string): Promise<number> {
  return comConexao(async (c) => {
    const r = await c.query<{ n: number }>(`SELECT count(*)::int AS n FROM "TentativaLogin" WHERE identificador = $1 AND NOT sucesso`, [login]);
    return r.rows[0].n;
  });
}

export async function limparDadosDeIntegracao(): Promise<void> {
  await comConexao(async (c) => {
    await c.query(`DELETE FROM "TentativaLogin" WHERE identificador LIKE $1 OR ip LIKE $2`, [`${PREFIXO_LOGIN}%`, `${PREFIXO_IP}%`]);
    await c.query(`DELETE FROM "Usuario" WHERE login LIKE $1`, [`${PREFIXO_LOGIN}%`]);
  });
}
