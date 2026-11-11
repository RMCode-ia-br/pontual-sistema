/**
 * Acesso ao banco só para preparar/limpar dados dos testes E2E.
 * Usa o driver `pg` direto (SQL) porque o carregador de TypeScript do Playwright é CommonJS
 * e não consegue importar o cliente Prisma gerado, que é ESM.
 *
 * REGRA: os testes só criam dados com prefixo "E2E " / login "e2e-*" e removem tudo no fim.
 * Nunca tocam no usuário `admin`.
 */
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { Client } from "pg";

import { gerarHashSenha } from "../../src/lib/auth/senha";

import { LOGINS_E2E, USUARIO_E2E } from "./dados";

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

/** Apaga do bucket privado os arquivos enviados pelos testes (nunca os de outros usuários). */
async function removerObjetos(caminhos: string[]): Promise<void> {
  if (caminhos.length === 0) return;
  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_SECRET_KEY;
  if (!url || !chave) return;
  const sb = createClient(url, chave, { auth: { persistSession: false } });
  await sb.storage.from(process.env.SUPABASE_STORAGE_BUCKET || "anexos").remove(caminhos);
}

async function limpar(c: Client): Promise<void> {
  const usuarios = await c.query<{ id: string }>(`SELECT id FROM "Usuario" WHERE login = ANY($1)`, [LOGINS_E2E]);
  const ids = usuarios.rows.map((u) => u.id);

  // Anexos enviados pelos usuários de teste: apaga o arquivo no Storage e o registro.
  if (ids.length > 0) {
    const anexos = await c.query<{ caminho: string }>(`SELECT caminho FROM "Anexo" WHERE "criadoPorId" = ANY($1)`, [ids]);
    await removerObjetos(anexos.rows.map((a) => a.caminho));
    await c.query(`DELETE FROM "Anexo" WHERE "criadoPorId" = ANY($1)`, [ids]);
  }

  // Cadastros da Fase 1: tudo que os testes criam tem nome começando com "E2E " (filhos antes dos pais).
  await c.query(`DELETE FROM "Interacao" WHERE "clienteId" IN (SELECT id FROM "Cliente" WHERE nome LIKE 'E2E %')`);
  await c.query(`DELETE FROM "Tarefa" WHERE "clienteId" IN (SELECT id FROM "Cliente" WHERE nome LIKE 'E2E %')`);
  await c.query(`DELETE FROM "EnderecoCliente" WHERE "clienteId" IN (SELECT id FROM "Cliente" WHERE nome LIKE 'E2E %')`);
  await c.query(`DELETE FROM "ContatoCliente" WHERE "clienteId" IN (SELECT id FROM "Cliente" WHERE nome LIKE 'E2E %')`);
  await c.query(`UPDATE "Cliente" SET "indicadoPorId" = NULL WHERE nome LIKE 'E2E %'`);
  await c.query(`DELETE FROM "Cliente" WHERE nome LIKE 'E2E %'`);
  await c.query(`DELETE FROM "HistoricoPreco" WHERE "loteImportacaoId" IN (SELECT id FROM "LoteImportacao" WHERE "criadoPorId" = ANY($1))`, [ids]);
  await c.query(`DELETE FROM "Interacao" WHERE "clienteId" IN (SELECT id FROM "Cliente" WHERE "loteImportacaoId" IN (SELECT id FROM "LoteImportacao" WHERE "criadoPorId" = ANY($1)))`, [ids]);
  await c.query(`DELETE FROM "Cliente" WHERE "loteImportacaoId" IN (SELECT id FROM "LoteImportacao" WHERE "criadoPorId" = ANY($1))`, [ids]);
  await c.query(`DELETE FROM "Fornecedor" WHERE "loteImportacaoId" IN (SELECT id FROM "LoteImportacao" WHERE "criadoPorId" = ANY($1))`, [ids]);
  await c.query(`DELETE FROM "HistoricoPreco" WHERE "produtoId" IN (SELECT id FROM "Produto" WHERE "loteImportacaoId" IN (SELECT id FROM "LoteImportacao" WHERE "criadoPorId" = ANY($1)))`, [ids]);
  await c.query(`DELETE FROM "Produto" WHERE "loteImportacaoId" IN (SELECT id FROM "LoteImportacao" WHERE "criadoPorId" = ANY($1))`, [ids]);
  await c.query(`DELETE FROM "LoteImportacaoItem" WHERE "loteId" IN (SELECT id FROM "LoteImportacao" WHERE "criadoPorId" = ANY($1))`, [ids]);
  await c.query(`DELETE FROM "LoteImportacao" WHERE "criadoPorId" = ANY($1)`, [ids]);
  await c.query(`DELETE FROM "HistoricoPreco" WHERE "produtoId" IN (SELECT id FROM "Produto" WHERE codigo LIKE 'E2E-%')`);
  await c.query(`DELETE FROM "Produto" WHERE codigo LIKE 'E2E-%'`);
  await c.query(`DELETE FROM "Fornecedor" WHERE "razaoSocial" LIKE 'E2E %'`);
  await c.query(`DELETE FROM "EquipeMembro" WHERE "equipeId" IN (SELECT id FROM "Equipe" WHERE nome LIKE 'E2E %') OR "funcionarioId" IN (SELECT id FROM "Funcionario" WHERE nome LIKE 'E2E %')`);
  await c.query(`DELETE FROM "Equipe" WHERE nome LIKE 'E2E %'`);
  await c.query(`DELETE FROM "Funcionario" WHERE nome LIKE 'E2E %'`);
  if (ids.length > 0) await c.query(`DELETE FROM "FiltroSalvo" WHERE "usuarioId" = ANY($1)`, [ids]);

  await c.query(`DELETE FROM "Tarefa" WHERE titulo LIKE 'E2E %'`);
  await c.query(`DELETE FROM "Feriado" WHERE nome LIKE 'E2E %'`);
  for (const tabela of ["LinhaAluminio", "AcabamentoAluminio", "TipoVidro", "CategoriaProduto", "MotivoPerda", "MotivoBloqueio"]) {
    await c.query(`DELETE FROM "${tabela}" WHERE nome LIKE 'E2E %'`);
  }
  await c.query(`DELETE FROM "EspessuraVidro" WHERE mm = 99`);
  await c.query(`DELETE FROM "CategoriaFinanceira" WHERE nome LIKE 'E2E %'`);

  // Só apaga o que é dos testes: os logins e2e-* e os IPs da faixa reservada (RFC 5737).
  await c.query(`DELETE FROM "TentativaLogin" WHERE identificador = ANY($1) OR ip LIKE '198.51.100.%'`, [LOGINS_E2E]);
  if (ids.length > 0) {
    await c.query(`DELETE FROM "LogAuditoria" WHERE "usuarioId" = ANY($1) OR "entidadeId" = ANY($1)`, [ids]);
    await c.query(`DELETE FROM "Usuario" WHERE id = ANY($1)`, [ids]);
  }
}

type OpcoesUsuario = { senhaDefinitiva?: boolean };

/**
 * Recria o usuário de teste: por padrão com senha provisória e troca pendente;
 * com `senhaDefinitiva` já pronto para uso (sem troca pendente).
 */
export async function prepararUsuarioE2E(opcoes: OpcoesUsuario = {}): Promise<void> {
  const senha = opcoes.senhaDefinitiva ? USUARIO_E2E.senhaNova : USUARIO_E2E.senhaProvisoria;
  const senhaHash = await gerarHashSenha(senha);
  await comConexao(async (c) => {
    await limpar(c);
    await c.query(
      `INSERT INTO "Usuario" (id, nome, login, "senhaHash", "precisaTrocarSenha", "atualizadoEm")
       VALUES ($1, $2, $3, $4, $5, now())`,
      [randomUUID(), USUARIO_E2E.nome, USUARIO_E2E.login, senhaHash, !opcoes.senhaDefinitiva],
    );
  });
}

export async function removerUsuarioE2E(): Promise<void> {
  await comConexao(limpar);
}

export async function definirUsuarioAtivo(ativo: boolean, login: string = USUARIO_E2E.login): Promise<void> {
  await comConexao((c) => c.query(`UPDATE "Usuario" SET ativo = $1 WHERE login = $2`, [ativo, login]));
}

export type LinhaAuditoria = { usuarioNome: string | null; entidade: string; acao: string; antes: unknown; depois: unknown };

/** Registros de auditoria feitos pelo usuário de teste. */
export async function buscarAuditoriaFeitaPeloE2E(entidade: string, acao: string): Promise<LinhaAuditoria[]> {
  return comConexao(async (c) => {
    const r = await c.query<LinhaAuditoria>(
      `SELECT a."usuarioNome", a.entidade, a.acao, a.antes, a.depois
         FROM "LogAuditoria" a JOIN "Usuario" u ON u.id = a."usuarioId"
        WHERE u.login = $1 AND a.entidade = $2 AND a.acao = $3
        ORDER BY a."criadoEm" DESC`,
      [USUARIO_E2E.login, entidade, acao],
    );
    return r.rows;
  });
}

/** Registros de auditoria sobre o usuário de teste (ex.: troca de senha). */
export async function buscarAuditoriaDoUsuarioE2E(acao: string): Promise<LinhaAuditoria[]> {
  return comConexao(async (c) => {
    const r = await c.query<LinhaAuditoria>(
      `SELECT a."usuarioNome", a.entidade, a.acao, a.antes, a.depois
         FROM "LogAuditoria" a JOIN "Usuario" u ON u.id = a."entidadeId"
        WHERE u.login = $1 AND a.acao = $2`,
      [USUARIO_E2E.login, acao],
    );
    return r.rows;
  });
}

// ---- Configuração da empresa: os testes alteram a linha real e a restauram no fim ----

export type SnapshotConfiguracao = Record<string, unknown> | null;

export async function tirarSnapshotConfiguracao(): Promise<SnapshotConfiguracao> {
  return comConexao(async (c) => {
    const r = await c.query(`SELECT * FROM "ConfiguracaoEmpresa" WHERE id = 'singleton'`);
    return r.rows[0] ?? null;
  });
}

export async function restaurarConfiguracao(snapshot: SnapshotConfiguracao): Promise<void> {
  if (!snapshot) return;
  const colunas = Object.keys(snapshot).filter((k) => k !== "id");
  const atribuicoes = colunas.map((k, i) => `"${k}" = $${i + 2}`).join(", ");
  await comConexao((c) => c.query(`UPDATE "ConfiguracaoEmpresa" SET ${atribuicoes} WHERE id = $1`, ["singleton", ...colunas.map((k) => snapshot[k])]));
}

export async function lerCampoConfiguracao(coluna: string): Promise<unknown> {
  if (!/^[A-Za-z]+$/.test(coluna)) throw new Error("coluna inválida");
  return comConexao(async (c) => (await c.query(`SELECT "${coluna}" AS valor FROM "ConfiguracaoEmpresa" WHERE id = 'singleton'`)).rows[0]?.valor);
}

export async function contarAnexosDoE2E(): Promise<number> {
  return comConexao(async (c) => {
    const r = await c.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "Anexo" a JOIN "Usuario" u ON u.id = a."criadoPorId" WHERE u.login = ANY($1) AND a."deletadoEm" IS NULL`,
      [LOGINS_E2E],
    );
    return r.rows[0].n;
  });
}

// ---- Modelos de texto: o teste edita um modelo real e o restaura ----

export type ModeloTextoLinha = { id: string; titulo: string; conteudo: string; ativo: boolean };

export async function obterModeloTexto(chave: string): Promise<ModeloTextoLinha> {
  return comConexao(async (c) => {
    const r = await c.query<ModeloTextoLinha>(`SELECT id, titulo, conteudo, ativo FROM "ModeloTexto" WHERE chave = $1`, [chave]);
    if (!r.rows[0]) throw new Error(`modelo ${chave} não existe (rode npm run seed)`);
    return r.rows[0];
  });
}

export async function restaurarModeloTexto(m: ModeloTextoLinha): Promise<void> {
  await comConexao((c) => c.query(`UPDATE "ModeloTexto" SET titulo = $2, conteudo = $3, ativo = $4 WHERE id = $1`, [m.id, m.titulo, m.conteudo, m.ativo]));
}

// ---- Produtos: simula outra pessoa mexendo no custo enquanto a prévia do reajuste está aberta ----

/** Altera o custo direto no banco (sem passar pela tela), como se outro usuário tivesse editado o produto. */
export async function alterarCustoDiretoNoBanco(codigo: string, centavos: number): Promise<void> {
  await comConexao((c) => c.query(`UPDATE "Produto" SET "custoUnitarioCentavos" = $2 WHERE codigo = $1`, [codigo, centavos]));
}

export async function lerCustoNoBanco(codigo: string): Promise<number | null> {
  return comConexao(async (c) => (await c.query<{ v: number | null }>(`SELECT "custoUnitarioCentavos" AS v FROM "Produto" WHERE codigo = $1`, [codigo])).rows[0]?.v ?? null);
}
