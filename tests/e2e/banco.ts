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

  // Fase 3 (propostas): tudo que os testes criam usa nome/título "E2E " (filhos antes dos pais).
  const projetosDaFase3 = `SELECT id FROM "Projeto" WHERE titulo LIKE 'E2E %' OR "clienteId" IN (SELECT id FROM "Cliente" WHERE nome LIKE 'E2E %')`;
  const propostasE2E = `SELECT id FROM "Proposta" WHERE "projetoId" IN (${projetosDaFase3})`;
  await c.query(`DELETE FROM "ContaReceber" WHERE "propostaId" IN (${propostasE2E}) OR "projetoId" IN (${projetosDaFase3})`);
  await c.query(`DELETE FROM "ItemPropostaMedida" WHERE "itemId" IN (SELECT id FROM "ItemProposta" WHERE "propostaId" IN (${propostasE2E}))`);
  await c.query(`DELETE FROM "ItemProposta" WHERE "propostaId" IN (${propostasE2E})`);
  await c.query(`DELETE FROM "PropostaParcela" WHERE "propostaId" IN (${propostasE2E})`);
  await c.query(`DELETE FROM "GrupoProposta" WHERE "propostaId" IN (${propostasE2E})`);
  await c.query(`DELETE FROM "OpcaoProposta" WHERE "propostaId" IN (${propostasE2E})`);
  await c.query(`DELETE FROM "Proposta" WHERE id IN (${propostasE2E})`);
  // Os testes consomem números da fila de propostas: devolve o contador ao que sobrou (nunca deixa o número real avançado).
  // Se não sobrou nenhuma proposta e o contador está na faixa inicial (2000 a 2500), volta a 2000; com propostas, vai a (maior + 1).
  await c.query(
    `UPDATE "ConfiguracaoEmpresa"
        SET "proximoNumeroProposta" = COALESCE((SELECT max("numeroSequencial") + 1 FROM "Proposta"), 2000)
      WHERE id = 'singleton'
        AND "proximoNumeroProposta" IS NOT NULL
        AND "proximoNumeroProposta" > COALESCE((SELECT max("numeroSequencial") + 1 FROM "Proposta"), 2000)
        AND "proximoNumeroProposta" <= COALESCE((SELECT max("numeroSequencial") + 1 FROM "Proposta"), 2000) + 500`,
  );
  await c.query(`DELETE FROM "TabelaPreco" WHERE "tipologiaId" IN (SELECT id FROM "Tipologia" WHERE nome LIKE 'E2E %')`);
  await c.query(`DELETE FROM "ComposicaoInsumo" WHERE "tipologiaId" IN (SELECT id FROM "Tipologia" WHERE nome LIKE 'E2E %')`);
  await c.query(`DELETE FROM "ComposicaoMaoDeObra" WHERE "tipologiaId" IN (SELECT id FROM "Tipologia" WHERE nome LIKE 'E2E %')`);
  await c.query(`DELETE FROM "Tipologia" WHERE nome LIKE 'E2E %'`);
  await c.query(`DELETE FROM "CondicaoParcela" WHERE "condicaoId" IN (SELECT id FROM "CondicaoPagamento" WHERE nome LIKE 'E2E %')`);
  await c.query(`DELETE FROM "CondicaoPagamento" WHERE nome LIKE 'E2E %'`);
  // Fase 2 (comercial): projetos, visitas e medidas dos testes (título/nome "E2E "), filhos antes dos pais.
  const projetosE2E = `SELECT id FROM "Projeto" WHERE titulo LIKE 'E2E %' OR "clienteId" IN (SELECT id FROM "Cliente" WHERE nome LIKE 'E2E %')`;
  const eventosE2E = `SELECT id FROM "EventoAgenda" WHERE titulo LIKE 'E2E %' OR "projetoId" IN (${projetosE2E}) OR "clienteId" IN (SELECT id FROM "Cliente" WHERE nome LIKE 'E2E %')`;
  await c.query(`DELETE FROM "MedidaRascunho" WHERE "projetoId" IN (${projetosE2E}) OR "eventoId" IN (${eventosE2E})`);
  await c.query(`DELETE FROM "EventoAgenda" WHERE id IN (${eventosE2E})`);
  // Fase 4 (obras): etapas e pausas das obras de teste (as parcelas que apontavam para as etapas já foram apagadas acima).
  await c.query(`DELETE FROM "EtapaProjeto" WHERE "projetoId" IN (${projetosE2E})`);
  await c.query(`DELETE FROM "PausaProjeto" WHERE "projetoId" IN (${projetosE2E})`);
  await c.query(`DELETE FROM "Interacao" WHERE "projetoId" IN (${projetosE2E})`);
  await c.query(`DELETE FROM "Tarefa" WHERE "projetoId" IN (${projetosE2E})`);
  await c.query(`DELETE FROM "HistoricoFaseProjeto" WHERE "projetoId" IN (${projetosE2E})`);
  await c.query(`DELETE FROM "Projeto" WHERE id IN (${projetosE2E})`);
  // Devolve o contador de códigos ao maior que sobrou: os testes não deixam buracos na numeração.
  await c.query(
    `UPDATE "ContadorSequencia" k
        SET "valor" = coalesce((SELECT max(substring(p."codigo" from 8)::int) FROM "Projeto" p WHERE p."codigo" LIKE 'P-' || substring(k."chave" from 9) || '-%'), 0)
      WHERE k."chave" LIKE 'projeto:%'`,
  );
  if (ids.length > 0) await c.query(`DELETE FROM "FeedAgenda" WHERE "usuarioId" = ANY($1)`, [ids]);

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

/**
 * Cria uma obra de teste (projeto aprovado com parcelas 50/25/25) e, por padrão, as etapas copiadas do modelo
 * padrão, todas pendentes e SEM datas nem prazo (o teste os define pela interface). Tudo com prefixo "E2E ",
 * que a limpeza apaga. Devolve o id do projeto.
 */
export async function criarObraDeTeste(nome: string, opcoes: { semEtapas?: boolean; status?: "APROVADO" | "NOVO_LEAD" } = {}): Promise<string> {
  return comConexao(async (c) => {
    const clienteId = randomUUID();
    const projetoId = randomUUID();
    await c.query(`INSERT INTO "Cliente" (id, "tipoPessoa", nome, "atualizadoEm") VALUES ($1, 'PF', $2, now())`, [clienteId, `E2E Cliente ${nome}`]);
    await c.query(`INSERT INTO "Projeto" (id, codigo, titulo, "clienteId", status, "atualizadoEm") VALUES ($1, $2, $3, $4, $5::"StatusProjeto", now())`, [
      projetoId,
      `P-0000-${randomUUID().slice(0, 8)}`,
      `E2E Obra ${nome}`,
      clienteId,
      opcoes.status ?? "APROVADO",
    ]);
    const parcelas: [number, string, number, string, string][] = [
      [1, "Sinal", 500000, "CONFIRMACAO", "ABERTA"],
      [2, "Entrega do material", 250000, "ENTREGA_MATERIAL", "AGUARDANDO_GATILHO"],
      [3, "Vidros e instalação", 250000, "ENTREGA_E_INSTALACAO", "AGUARDANDO_GATILHO"],
    ];
    for (const [ordem, descricao, valor, gatilho, status] of parcelas) {
      await c.query(
        `INSERT INTO "ContaReceber" (id, "projetoId", "clienteId", ordem, descricao, "valorCentavos", gatilho, status, "atualizadoEm")
         VALUES ($1, $2, $3, $4, $5, $6, $7::"GatilhoPagamento", $8::"StatusContaReceber", now())`,
        [randomUUID(), projetoId, clienteId, ordem, descricao, valor, gatilho, status],
      );
    }
    if (!opcoes.semEtapas) {
      const itens = await c.query<{ tipo: string; nome: string; ordem: number; grupoPrazo: string | null; peso: number; liberaGatilho: string | null; marcoGarantia: boolean }>(
        `SELECT i.tipo, i.nome, i.ordem, i."grupoPrazo", i.peso, i."liberaGatilho", i."marcoGarantia"
           FROM "ModeloEtapaItem" i JOIN "ModeloEtapas" m ON m.id = i."modeloId"
          WHERE m.padrao AND m."deletadoEm" IS NULL AND i."deletadoEm" IS NULL AND i.ativo ORDER BY i.ordem`,
      );
      if (itens.rows.length === 0) throw new Error("O modelo de etapas padrão não existe no banco de teste (rode a seed).");
      for (const [indice, i] of itens.rows.entries()) {
        await c.query(
          `INSERT INTO "EtapaProjeto" (id, "projetoId", tipo, nome, ordem, "grupoPrazo", peso, "liberaGatilho", "marcoGarantia", "atualizadoEm")
           VALUES ($1, $2, $3::"TipoEtapa", $4, $5, $6::"GrupoPrazo", $7, $8::"GatilhoPagamento", $9, now())`,
          [randomUUID(), projetoId, i.tipo, i.nome, indice + 1, i.grupoPrazo, i.peso, i.liberaGatilho, i.marcoGarantia],
        );
      }
    }
    return projetoId;
  });
}

/** Cria uma equipe de teste ("E2E ...") e a atribui às etapas dos tipos informados da obra. */
export async function atribuirEquipeAEtapas(projetoId: string, nomeDaEquipe: string, tipos: string[]): Promise<void> {
  await comConexao(async (c) => {
    const equipeId = randomUUID();
    await c.query(`INSERT INTO "Equipe" (id, nome, "atualizadoEm") VALUES ($1, $2, now())`, [equipeId, nomeDaEquipe]);
    await c.query(`UPDATE "EtapaProjeto" SET "equipeId" = $1 WHERE "projetoId" = $2 AND tipo::text = ANY($3::text[])`, [equipeId, projetoId, tipos]);
  });
}

/** Atalho de teste: deixa concluídas as etapas abertas anteriores à entrega (a interface exige resolver cada uma). */
export async function concluirEtapasAnterioresDaObra(projetoId: string): Promise<void> {
  await comConexao((c) =>
    c.query(
      `UPDATE "EtapaProjeto" SET status = 'CONCLUIDA', "inicioReal" = COALESCE("inicioReal", CURRENT_DATE), "fimReal" = CURRENT_DATE
        WHERE "projetoId" = $1 AND "deletadoEm" IS NULL AND status IN ('PENDENTE', 'EM_ANDAMENTO', 'BLOQUEADA')
          AND ordem < (SELECT ordem FROM "EtapaProjeto" WHERE "projetoId" = $1 AND tipo = 'ENTREGA' AND "deletadoEm" IS NULL)`,
      [projetoId],
    ),
  );
}

/** Parcelas da obra de teste (descrição, situação e se foram ligadas a uma etapa). */
export async function parcelasDaObra(projetoId: string): Promise<{ descricao: string; status: string; vencimento: string | null; etapaId: string | null }[]> {
  return comConexao(async (c) => {
    const r = await c.query<{ descricao: string; status: string; vencimento: Date | null; etapaProjetoId: string | null }>(
      `SELECT descricao, status::text AS status, vencimento, "etapaProjetoId" FROM "ContaReceber" WHERE "projetoId" = $1 ORDER BY ordem`,
      [projetoId],
    );
    return r.rows.map((x) => ({ descricao: x.descricao, status: x.status, vencimento: x.vencimento ? x.vencimento.toISOString().slice(0, 10) : null, etapaId: x.etapaProjetoId }));
  });
}

/** Tarefas do projeto de teste por tipo (para conferir cobranças e follow-ups). */
export async function tarefasDaObra(projetoId: string): Promise<{ tipo: string | null; titulo: string; status: string }[]> {
  return comConexao(async (c) => {
    const r = await c.query<{ tipo: string | null; titulo: string; status: string }>(`SELECT tipo, titulo, status::text AS status FROM "Tarefa" WHERE "projetoId" = $1 ORDER BY "criadoEm"`, [projetoId]);
    return r.rows;
  });
}

/** Ids dos itens ativos do modelo de etapas padrão (para restaurar depois de um teste que o edita). */
export async function tirarSnapshotDoModeloDeEtapas(): Promise<{ modeloId: string; itemIds: string[] }> {
  return comConexao(async (c) => {
    const r = await c.query<{ modeloId: string; id: string }>(
      `SELECT i."modeloId", i.id FROM "ModeloEtapaItem" i JOIN "ModeloEtapas" m ON m.id = i."modeloId"
        WHERE m.padrao AND m."deletadoEm" IS NULL AND i."deletadoEm" IS NULL ORDER BY i.ordem`,
    );
    if (r.rows.length === 0) throw new Error("O modelo de etapas padrão não existe no banco de teste (rode a seed).");
    return { modeloId: r.rows[0].modeloId, itemIds: r.rows.map((x) => x.id) };
  });
}

/**
 * Desfaz uma edição do modelo pela interface: a ação só marca os itens antigos como excluídos e cria novos,
 * então basta apagar os novos e reativar os antigos (nada referencia os itens do modelo).
 */
export async function restaurarModeloDeEtapas(snapshot: { modeloId: string; itemIds: string[] }): Promise<void> {
  await comConexao(async (c) => {
    await c.query(`DELETE FROM "ModeloEtapaItem" WHERE "modeloId" = $1 AND id <> ALL($2::text[])`, [snapshot.modeloId, snapshot.itemIds]);
    await c.query(`UPDATE "ModeloEtapaItem" SET "deletadoEm" = NULL WHERE id = ANY($1::text[])`, [snapshot.itemIds]);
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

// ---- Fase 2: endereço da obra de um projeto de teste (a tela de visita grava o condomínio nele) ----

/** Cria um endereço para o cliente do projeto de teste e o define como endereço da obra. Devolve o id do endereço. */
export async function vincularEnderecoDeObra(tituloProjeto: string): Promise<string> {
  return comConexao(async (c) => {
    const p = await c.query<{ id: string; clienteId: string }>(`SELECT id, "clienteId" FROM "Projeto" WHERE titulo = $1 AND "deletadoEm" IS NULL`, [tituloProjeto]);
    if (!p.rows[0]) throw new Error("projeto de teste não encontrado");
    const enderecoId = randomUUID();
    await c.query(
      `INSERT INTO "EnderecoCliente" (id, "clienteId", tipo, apelido, logradouro, numero, cidade, uf, "atualizadoEm") VALUES ($1, $2, 'OBRA', 'E2E Obra', 'Rua E2E', '10', 'Búzios', 'RJ', now())`,
      [enderecoId, p.rows[0].clienteId],
    );
    await c.query(`UPDATE "Projeto" SET "enderecoObraId" = $1 WHERE id = $2`, [enderecoId, p.rows[0].id]);
    return enderecoId;
  });
}

export async function lerEndereco(enderecoId: string): Promise<{ condominio: boolean; condominioNome: string | null; exigeAprovacaoFachada: boolean; fachadaAprovada: boolean; sindicoTelefone: string | null }> {
  return comConexao(async (c) => (await c.query(`SELECT condominio, "condominioNome", "exigeAprovacaoFachada", "fachadaAprovada", "sindicoTelefone" FROM "EnderecoCliente" WHERE id = $1`, [enderecoId])).rows[0]);
}

// ---- Fase 3: parcelas a receber e tarefas geradas pela aprovação (as telas financeiras são da Fase 5) ----

export type ContaDaProposta = { ordem: number; valorCentavos: number; status: string; vencimento: string | null; comNotaFiscal: boolean };

export async function contasDaProposta(numero: string, revisao = 0): Promise<ContaDaProposta[]> {
  return comConexao(async (c) => {
    const r = await c.query<ContaDaProposta>(
      `SELECT cr.ordem, cr."valorCentavos", cr.status::text AS status, to_char(cr.vencimento, 'YYYY-MM-DD') AS vencimento, cr."comNotaFiscal"
         FROM "ContaReceber" cr JOIN "Proposta" p ON p.id = cr."propostaId"
        WHERE p.numero = $1 AND p.revisao = $2 ORDER BY cr.ordem`,
      [numero, revisao],
    );
    return r.rows;
  });
}

export async function tarefasDoProjeto(titulo: string): Promise<{ titulo: string; tipo: string | null; status: string }[]> {
  return comConexao(async (c) => {
    const r = await c.query<{ titulo: string; tipo: string | null; status: string }>(
      `SELECT t.titulo, t.tipo, t.status::text AS status FROM "Tarefa" t JOIN "Projeto" p ON p.id = t."projetoId" WHERE p.titulo = $1 AND t."deletadoEm" IS NULL ORDER BY t."criadoEm"`,
      [titulo],
    );
    return r.rows;
  });
}
