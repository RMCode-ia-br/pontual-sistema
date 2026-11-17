/**
 * Deadlock do PostgreSQL (40P01), como o Prisma o devolve: `P2034` (conflito de escrita ou deadlock) ou erro de consulta
 * crua com o código do Postgres. O banco aborta UMA das transações e a outra segue: refazer a abortada é seguro porque
 * nada dela foi gravado.
 */
export function ehDeadlock(erro: unknown): boolean {
  if (!erro || typeof erro !== "object") return false;
  const e = erro as { code?: unknown; message?: unknown; meta?: unknown };
  if (e.code === "P2034") return true;
  let meta = "";
  try {
    meta = JSON.stringify(e.meta ?? {});
  } catch {
    meta = "";
  }
  return /40P01|deadlock detected/i.test(`${typeof e.message === "string" ? e.message : ""} ${meta}`);
}

/** Roda a transação e, se ela for a vítima de um deadlock, tenta de novo (no máximo `tentativas` vezes no total). */
export async function tentarDeNovoEmDeadlock<T>(fn: () => Promise<T>, tentativas = 2): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (erro) {
      if (i >= tentativas || !ehDeadlock(erro)) throw erro;
    }
  }
}
