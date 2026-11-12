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

  // Fase 5 (financeiro): lançamentos e contas do teste saem ANTES de projetos, clientes, parcelas e categorias que os
  // referenciam (todas as chaves são Restrict). Só o que tem o prefixo "E2E " é tocado.
  const clientesE2E = `SELECT id FROM "Cliente" WHERE nome LIKE 'E2E %'`;
  const projetosFinanceiro = `SELECT id FROM "Projeto" WHERE titulo LIKE 'E2E %' OR "clienteId" IN (${clientesE2E})`;
  // Fase 6 (estoque e compras): movimentos, retalhos e sucata dos produtos "E2E-" e das obras "E2E " saem primeiro.
  const produtosE2E = `SELECT id FROM "Produto" WHERE codigo LIKE 'E2E-%'`;
  await c.query(`DELETE FROM "Retalho" WHERE "produtoId" IN (${produtosE2E}) OR "origemProjetoId" IN (${projetosFinanceiro}) OR "consumidoProjetoId" IN (${projetosFinanceiro})`);
  await c.query(`UPDATE "MovimentoEstoque" SET "estornoDeId" = NULL WHERE "produtoId" IN (${produtosE2E}) OR "projetoId" IN (${projetosFinanceiro})`);
  await c.query(`DELETE FROM "MovimentoEstoque" WHERE "produtoId" IN (${produtosE2E}) OR "projetoId" IN (${projetosFinanceiro})`);
  await c.query(`DELETE FROM "MovimentoSucata" WHERE "produtoId" IN (${produtosE2E}) OR "projetoId" IN (${projetosFinanceiro})`);
  await c.query(
    `DELETE FROM "Lancamento" WHERE descricao LIKE 'E2E %' OR "contaFinanceiraId" IN (SELECT id FROM "ContaFinanceira" WHERE nome LIKE 'E2E %')
       OR "clienteId" IN (${clientesE2E}) OR "projetoId" IN (${projetosFinanceiro})`,
  );
  // Categorias financeiras de teste ("E2E "): quem as usa sai antes delas (a limpeza no fim apaga as categorias).
  const categoriasE2E = `SELECT id FROM "CategoriaFinanceira" WHERE nome LIKE 'E2E %'`;
  await c.query(`DELETE FROM "Lancamento" WHERE "categoriaId" IN (${categoriasE2E})`);
  await c.query(`DELETE FROM "ContaPagar" WHERE descricao LIKE 'E2E %' OR "categoriaId" IN (${categoriasE2E})`);
  await c.query(`DELETE FROM "RecorrenciaPagar" WHERE descricao LIKE 'E2E %' OR "categoriaId" IN (${categoriasE2E})`);
  const comprasE2E = `SELECT id FROM "Compra" WHERE "projetoId" IN (${projetosFinanceiro}) OR "fornecedorId" IN (SELECT id FROM "Fornecedor" WHERE "razaoSocial" LIKE 'E2E %')`;
  // A conta a pagar nascida da compra aponta para ela (FK restrita) e a descrição não começa com "E2E ": sai pelo vínculo.
  await c.query(`DELETE FROM "ContaPagar" WHERE "compraId" IN (${comprasE2E})`);
  await c.query(`UPDATE "HistoricoPreco" SET "compraId" = NULL WHERE "compraId" IN (${comprasE2E})`);
  await c.query(`DELETE FROM "HistoricoPrecoKg" WHERE "compraId" IN (${comprasE2E})`);
  await c.query(`DELETE FROM "MovimentoEstoque" WHERE "itemRecebimentoId" IN (SELECT id FROM "ItemRecebimento" WHERE "itemCompraId" IN (SELECT id FROM "ItemCompra" WHERE "compraId" IN (${comprasE2E})))`);
  await c.query(`DELETE FROM "ItemRecebimento" WHERE "itemCompraId" IN (SELECT id FROM "ItemCompra" WHERE "compraId" IN (${comprasE2E}))`);
  await c.query(`DELETE FROM "RecebimentoCompra" WHERE "compraId" IN (${comprasE2E})`);
  await c.query(`DELETE FROM "ItemCompra" WHERE "compraId" IN (${comprasE2E})`);
  await c.query(`DELETE FROM "Compra" WHERE id IN (${comprasE2E})`);
  await c.query(`DELETE FROM "ContaFinanceira" WHERE nome LIKE 'E2E %'`);

  // Fase 4 (assistência): os chamados dos clientes de teste saem antes das contas (a cobrança aponta para a conta)
  // e depois de soltar os compromissos que apontam para eles; o contador volta ao maior número que sobrou.
  const chamadosE2E = `SELECT id FROM "Chamado" WHERE "clienteId" IN (SELECT id FROM "Cliente" WHERE nome LIKE 'E2E %')`;
  await c.query(`UPDATE "EventoAgenda" SET "chamadoId" = NULL WHERE "chamadoId" IN (${chamadosE2E})`);
  await c.query(`DELETE FROM "Chamado" WHERE id IN (${chamadosE2E})`);
  await c.query(`UPDATE "ContadorSequencia" SET "valor" = coalesce((SELECT max("numero") FROM "Chamado"), 0) WHERE "chave" = 'chamado'`);

  // Fase 3 (propostas): tudo que os testes criam usa nome/título "E2E " (filhos antes dos pais).
  const projetosDaFase3 = `SELECT id FROM "Projeto" WHERE titulo LIKE 'E2E %' OR "clienteId" IN (SELECT id FROM "Cliente" WHERE nome LIKE 'E2E %')`;
  const propostasE2E = `SELECT id FROM "Proposta" WHERE "projetoId" IN (${projetosDaFase3})`;
  // Fase 6: o histórico de prorrogações aponta para a conta (FK restrita): sai antes dela.
  await c.query(`DELETE FROM "ProrrogacaoReceber" WHERE "contaReceberId" IN (SELECT id FROM "ContaReceber" WHERE "propostaId" IN (${propostasE2E}) OR "projetoId" IN (${projetosDaFase3}))`);
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
  // Fase 6: preço do kg e acabamento de teste (o acabamento só sai depois dos produtos que o usam).
  await c.query(`DELETE FROM "HistoricoPrecoKg" WHERE "precoKgId" IN (SELECT id FROM "PrecoKgAluminio" WHERE "acabamentoId" IN (SELECT id FROM "AcabamentoAluminio" WHERE nome LIKE 'E2E %'))`);
  await c.query(`DELETE FROM "PrecoKgAluminio" WHERE "acabamentoId" IN (SELECT id FROM "AcabamentoAluminio" WHERE nome LIKE 'E2E %')`);
  await c.query(`DELETE FROM "AcabamentoAluminio" WHERE nome LIKE 'E2E %'`);
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
  await c.query(`DELETE FROM "EspessuraVidro" WHERE mm IN (98, 99)`);
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
        // Parcela em aberto sempre tem vencimento (hoje); a que aguarda a etapa não tem, como no sistema.
        `INSERT INTO "ContaReceber" (id, "projetoId", "clienteId", ordem, descricao, "valorCentavos", gatilho, status, vencimento, "atualizadoEm")
         VALUES ($1, $2, $3, $4, $5, $6, $7::"GatilhoPagamento", $8::"StatusContaReceber", CASE WHEN $8 = 'ABERTA' THEN CURRENT_DATE END, now())`,
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

/** Tarefas abertas que NÃO são dos testes (títulos "E2E ..."): dado de verdade no banco de desenvolvimento. */
export async function contarTarefasForaDoE2E(): Promise<number> {
  return comConexao(async (c) => {
    const r = await c.query<{ n: number }>(`SELECT count(*)::int AS n FROM "Tarefa" WHERE "deletadoEm" IS NULL AND status = 'ABERTA' AND titulo NOT LIKE 'E2E %'`);
    return r.rows[0].n;
  });
}

/**
 * Projetos que NÃO são dos testes (título sem "E2E ") e já foram aprovados ou perdidos: dado de verdade no banco de
 * desenvolvimento, que faz a taxa de fechamento do relatório de funil deixar de ficar em branco.
 */
export async function contarProjetosDecididosForaDoE2E(): Promise<number> {
  return comConexao(async (c) => {
    const r = await c.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "Projeto" WHERE "deletadoEm" IS NULL AND titulo NOT LIKE 'E2E %' AND status IN ('APROVADO', 'EM_EXECUCAO', 'CONCLUIDO', 'PERDIDO')`,
    );
    return r.rows[0].n;
  });
}

/** Define os tipos de serviço do projeto de teste (alimentam a legenda sugerida da galeria). */
export async function definirTiposDeServicoDaObra(projetoId: string, tipos: string[]): Promise<void> {
  await comConexao((c) => c.query(`UPDATE "Projeto" SET "tiposServico" = $2::"TipoServico"[] WHERE id = $1`, [projetoId, tipos]));
}

/** Ids das fotos de obra (ativas) do projeto de teste, da mais antiga para a mais nova. */
export async function idsDasFotosDaObra(projetoId: string): Promise<string[]> {
  return comConexao(async (c) => {
    const r = await c.query<{ id: string }>(
      `SELECT id FROM "Anexo" WHERE "entidadeTipo" = 'Projeto' AND "entidadeId" = $1 AND "deletadoEm" IS NULL AND categoria = 'foto-obra' ORDER BY "criadoEm"`,
      [projetoId],
    );
    return r.rows.map((x) => x.id);
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

/** Dá a instalação por concluída (etapa-marco da garantia) há `diasAtras` dias: a garantia de regulagem corre daí. */
export async function concluirMarcoDaGarantia(projetoId: string, diasAtras: number): Promise<void> {
  await comConexao((c) =>
    c.query(
      `UPDATE "EtapaProjeto" SET status = 'CONCLUIDA', "inicioReal" = CURRENT_DATE - $2::int, "fimReal" = CURRENT_DATE - $2::int
        WHERE "projetoId" = $1 AND "marcoGarantia" AND "deletadoEm" IS NULL`,
      [projetoId, diasAtras],
    ),
  );
}

/** Deixa a etapa do tipo informado da obra de teste com a data prevista de fim `diasAtras` dias no passado. */
export async function atrasarEtapaDaObra(projetoId: string, tipo: string, diasAtras: number): Promise<void> {
  await comConexao((c) =>
    c.query(
      `UPDATE "EtapaProjeto" SET "inicioPrevisto" = CURRENT_DATE - ($3::int + 2), "fimPrevisto" = CURRENT_DATE - $3::int
        WHERE "projetoId" = $1 AND tipo::text = $2 AND "deletadoEm" IS NULL`,
      [projetoId, tipo, diasAtras],
    ),
  );
}

/** Id do cliente da obra de teste. */
export async function clienteDaObra(projetoId: string): Promise<string> {
  return comConexao(async (c) => (await c.query<{ clienteId: string }>(`SELECT "clienteId" FROM "Projeto" WHERE id = $1`, [projetoId])).rows[0].clienteId);
}

/** Chamados do cliente de teste: número, classificação, situação, se a cobrança virou conta e quantas visitas estão ligadas. */
export async function chamadosDoCliente(clienteId: string): Promise<{ numero: number; classificacao: string; status: string; temConta: boolean; visitas: number }[]> {
  return comConexao(async (c) => {
    const r = await c.query<{ numero: number; classificacao: string; status: string; temConta: boolean; visitas: number }>(
      `SELECT h.numero, h.classificacao::text AS classificacao, h.status::text AS status, (h."contaReceberId" IS NOT NULL) AS "temConta",
              (SELECT count(*)::int FROM "EventoAgenda" e WHERE e."chamadoId" = h.id AND e."deletadoEm" IS NULL) AS visitas
         FROM "Chamado" h WHERE h."clienteId" = $1 AND h."deletadoEm" IS NULL ORDER BY h.numero`,
      [clienteId],
    );
    return r.rows;
  });
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

/** Dá um WhatsApp ao cliente da obra de teste (a cobrança por WhatsApp só gera o link com telefone). */
export async function definirWhatsappDoClienteDaObra(projetoId: string, whatsapp: string): Promise<void> {
  await comConexao((c) => c.query(`UPDATE "Cliente" SET whatsapp = $2 WHERE id = (SELECT "clienteId" FROM "Projeto" WHERE id = $1)`, [projetoId, whatsapp]));
}

/** Situação financeira de uma parcela da obra de teste (pela ordem). */
export async function contaDaObra(projetoId: string, ordem: number): Promise<{ id: string; status: string; valorCentavos: number; valorPagoCentavos: number }> {
  return comConexao(async (c) => {
    const r = await c.query(`SELECT id, status::text AS status, "valorCentavos", "valorPagoCentavos" FROM "ContaReceber" WHERE "projetoId" = $1 AND ordem = $2`, [projetoId, ordem]);
    return r.rows[0];
  });
}

/** Soma dos lançamentos não estornados das contas a receber da obra de teste (entradas). */
export async function recebidoDaObra(projetoId: string): Promise<number> {
  return comConexao(async (c) => {
    const r = await c.query(`SELECT COALESCE(SUM("valorCentavos"), 0)::int AS total FROM "Lancamento" WHERE "projetoId" = $1 AND tipo = 'ENTRADA' AND "estornadoEm" IS NULL`, [projetoId]);
    return r.rows[0].total;
  });
}

/** Deixa a parcela da obra de teste vencida há `diasAtras` dias (o vencimento original é o que manda no atraso). */
export async function vencerParcelaDaObra(projetoId: string, ordem: number, diasAtras: number): Promise<void> {
  await comConexao(async (c) => {
    await c.query(`UPDATE "ContaReceber" SET vencimento = CURRENT_DATE - $3::int WHERE "projetoId" = $1 AND ordem = $2`, [projetoId, ordem, diasAtras]);
  });
}

/** Vencimento original, data prometida (dd/mm não: aaaa-mm-dd) e quantidade de pedidos de prazo da parcela. */
export async function prazoDaParcela(projetoId: string, ordem: number): Promise<{ vencimento: string | null; dataPrometida: string | null; pedidos: number }> {
  return comConexao(async (c) => {
    const r = await c.query(
      `SELECT to_char(vencimento, 'YYYY-MM-DD') AS vencimento, to_char("dataPrometida", 'YYYY-MM-DD') AS "dataPrometida",
              (SELECT count(*)::int FROM "ProrrogacaoReceber" p WHERE p."contaReceberId" = cr.id) AS pedidos
         FROM "ContaReceber" cr WHERE cr."projetoId" = $1 AND cr.ordem = $2`,
      [projetoId, ordem],
    );
    return r.rows[0];
  });
}

/** Produto de teste ("E2E-...") com unidade UN e, opcionalmente, custo. Nasce com saldo zero e sem movimentos. */
export async function criarProdutoDeTeste(codigo: string, descricao: string, custoCentavos: number | null = null): Promise<string> {
  return comConexao(async (c) => {
    const id = randomUUID();
    await c.query(
      `INSERT INTO "Produto" (id, codigo, descricao, unidade, "custoUnitarioCentavos", "atualizadoEm") VALUES ($1, $2, $3, 'UN', $4, now())`,
      [id, codigo, descricao, custoCentavos],
    );
    return id;
  });
}

/** Define saldo e estoque mínimo direto no produto de teste (só para montar o cenário do painel e do relatório). */
export async function definirSaldoEMinimoDeTeste(codigo: string, saldo: string, minimo: string | null): Promise<void> {
  await comConexao((c) => c.query(`UPDATE "Produto" SET "saldoCache" = $2, "estoqueMinimo" = $3 WHERE codigo = $1`, [codigo, saldo, minimo]));
}

/** Saldo em cache, soma real dos movimentos e quantidade de movimentos do produto (para conferir que o cache bate). */
export async function estoqueDoProdutoDeTeste(codigo: string): Promise<{ saldoCache: number; somaDosMovimentos: number; movimentos: number }> {
  return comConexao(async (c) => {
    const r = await c.query<{ saldo: string; soma: string; n: number }>(
      `SELECT p."saldoCache"::text AS saldo,
              COALESCE((SELECT sum(m.quantidade) FROM "MovimentoEstoque" m WHERE m."produtoId" = p.id), 0)::text AS soma,
              (SELECT count(*)::int FROM "MovimentoEstoque" m WHERE m."produtoId" = p.id) AS n
         FROM "Produto" p WHERE p.codigo = $1`,
      [codigo],
    );
    return { saldoCache: Number(r.rows[0].saldo), somaDosMovimentos: Number(r.rows[0].soma), movimentos: r.rows[0].n };
  });
}

/** Acabamento de teste ("E2E ..."): o preço do kg dos testes nunca toca nos acabamentos reais. */
export async function criarAcabamentoDeTeste(nome: string): Promise<string> {
  return comConexao(async (c) => {
    const id = randomUUID();
    await c.query(`INSERT INTO "AcabamentoAluminio" (id, nome, ordem, "atualizadoEm") VALUES ($1, $2, 9999, now())`, [id, nome]);
    return id;
  });
}

/** Perfil por kg de teste (barra de 6.000 mm), com peso por metro opcional (kg/m). */
export async function criarPerfilPorKgDeTeste(codigo: string, descricao: string, acabamentoId: string, pesoKgPorMetro: string | null): Promise<string> {
  return comConexao(async (c) => {
    const id = randomUUID();
    await c.query(
      `INSERT INTO "Produto" (id, codigo, descricao, unidade, "custoPorKg", "acabamentoId", "pesoKgPorMetro", "comprimentoBarraMm", "atualizadoEm")
       VALUES ($1, $2, $3, 'BARRA', true, $4, $5, 6000, now())`,
      [id, codigo, descricao, acabamentoId, pesoKgPorMetro],
    );
    return id;
  });
}

/** Perfil em barra de teste (6.000 mm, 0,5 kg/m) com `barras` em estoque (movimento + saldo em cache coerentes). */
export async function criarPerfilBarraDeTeste(codigo: string, descricao: string, barras: number, custoCentavos: number | null = 15_000): Promise<string> {
  return comConexao(async (c) => {
    const id = randomUUID();
    await c.query(
      `INSERT INTO "Produto" (id, codigo, descricao, unidade, "custoUnitarioCentavos", "comprimentoBarraMm", "pesoKgPorMetro", "saldoCache", "atualizadoEm")
       VALUES ($1, $2, $3, 'BARRA', $4, 6000, 0.5, $5, now())`,
      [id, codigo, descricao, custoCentavos, barras],
    );
    await c.query(`INSERT INTO "MovimentoEstoque" (id, "produtoId", tipo, quantidade, data, "custoUnitarioCentavos", "atualizadoEm") VALUES ($1, $2, 'ENTRADA_COMPRA', $3, CURRENT_DATE, $4, now())`, [randomUUID(), id, barras, custoCentavos]);
    return id;
  });
}

/**
 * Categoria de produto de teste ("E2E ..."): os testes nunca dependem das categorias reais (o dono pode renomear
 * ou excluir "Perfis", "Vidros" etc.). A limpeza apaga as "E2E %" depois dos fornecedores e produtos que as usam.
 */
export async function criarCategoriaDeProdutoDeTeste(nome: string): Promise<string> {
  return comConexao(async (c) => {
    const id = randomUUID();
    await c.query(`INSERT INTO "CategoriaProduto" (id, nome, ordem, "atualizadoEm") VALUES ($1, $2, 9999, now())`, [id, nome]);
    return id;
  });
}

/** Linha de alumínio de teste ("E2E ..."): os testes nunca dependem das linhas reais ("Suprema" etc.). */
export async function criarLinhaDeTeste(nome: string): Promise<string> {
  return comConexao(async (c) => {
    const id = randomUUID();
    await c.query(`INSERT INTO "LinhaAluminio" (id, nome, ordem, "atualizadoEm") VALUES ($1, $2, 9999, now())`, [id, nome]);
    return id;
  });
}

/** Espessura de vidro de teste: 98 mm (a limpeza apaga 98 e 99 mm, valores que o dono não usa). */
export async function criarEspessuraDeVidroDeTeste(): Promise<number> {
  return comConexao(async (c) => {
    await c.query(`INSERT INTO "EspessuraVidro" (id, mm, ordem, "atualizadoEm") VALUES ($1, 98, 9999, now()) ON CONFLICT (mm) DO NOTHING`, [randomUUID()]);
    return 98;
  });
}

/** Motivo de bloqueio de teste ("E2E ..."): `justificado` diz se a pausa estende o prazo prometido (R8). */
export async function criarMotivoDeBloqueioDeTeste(nome: string, justificado: boolean): Promise<string> {
  return comConexao(async (c) => {
    const id = randomUUID();
    await c.query(`INSERT INTO "MotivoBloqueio" (id, nome, justificado, ordem, "atualizadoEm") VALUES ($1, $2, $3, 9999, now())`, [id, nome, justificado]);
    return id;
  });
}

/** Motivo de perda de teste ("E2E ..."): quem marca um projeto como perdido nos testes escolhe este. */
export async function criarMotivoDePerdaDeTeste(nome: string): Promise<string> {
  return comConexao(async (c) => {
    const id = randomUUID();
    await c.query(`INSERT INTO "MotivoPerda" (id, nome, ordem, "atualizadoEm") VALUES ($1, $2, 9999, now())`, [id, nome]);
    return id;
  });
}

/**
 * Categoria financeira de teste ("E2E ..."). O grupo do DRE precisa combinar com o tipo (receita só em grupo de receita,
 * despesa só nos demais; o banco também confere).
 */
export async function criarCategoriaFinanceiraDeTeste(
  nome: string,
  tipo: "RECEITA" | "DESPESA",
  grupo: "RECEITAS_OPERACIONAIS" | "OUTRAS_RECEITAS" | "IMPOSTOS" | "CUSTOS_DIRETOS" | "DESPESAS_FIXAS" | "DESPESAS_OPERACIONAIS" | "DESPESAS_COMERCIAIS" | "DESPESAS_ADMINISTRATIVAS" | "DESPESAS_FINANCEIRAS",
): Promise<string> {
  return comConexao(async (c) => {
    const id = randomUUID();
    await c.query(
      `INSERT INTO "CategoriaFinanceira" (id, nome, tipo, grupo, ordem, "atualizadoEm") VALUES ($1, $2, $3::"TipoCategoriaFinanceira", $4::"GrupoDre", 9999, now())`,
      [id, nome, tipo, grupo],
    );
    return id;
  });
}

/**
 * Condição de pagamento de teste ("E2E ..."): por padrão o cronograma 50% sinal + 25% entrega do material + 25% entrega dos
 * vidros e instalação. Com `textoLivre` nasce sem parcelas (como "A combinar").
 */
export async function criarCondicaoDePagamentoDeTeste(nome: string, opcoes: { textoLivre?: string } = {}): Promise<string> {
  return comConexao(async (c) => {
    const id = randomUUID();
    await c.query(`INSERT INTO "CondicaoPagamento" (id, nome, "textoLivre", ordem, "atualizadoEm") VALUES ($1, $2, $3, 9999, now())`, [id, nome, opcoes.textoLivre ?? null]);
    if (opcoes.textoLivre) return id;
    const parcelas: [number, string, number, string][] = [
      [1, "Sinal na confirmação do pedido", 5000, "CONFIRMACAO"],
      [2, "Na entrega do material (esquadrias)", 2500, "ENTREGA_MATERIAL"],
      [3, "Na entrega dos vidros e instalação", 2500, "ENTREGA_E_INSTALACAO"],
    ];
    for (const [ordem, descricao, percentualPb, gatilho] of parcelas) {
      await c.query(
        `INSERT INTO "CondicaoParcela" (id, "condicaoId", ordem, descricao, "percentualPb", gatilho, "atualizadoEm") VALUES ($1, $2, $3, $4, $5, $6::"GatilhoPagamento", now())`,
        [randomUUID(), id, ordem, descricao, percentualPb, gatilho],
      );
    }
    return id;
  });
}

/**
 * Tipologia de teste ("E2E ...") ativa: janela de correr de 2 a 4 folhas, cobrada por m², que exige esquadria, sem
 * composição nem tabela de preços (os testes informam o valor do item na mão).
 */
export async function criarTipologiaDeTeste(nome: string): Promise<string> {
  return comConexao(async (c) => {
    const id = randomUUID();
    await c.query(
      `INSERT INTO "Tipologia" (id, nome, categoria, "tipoDesenho", "opcoesFolhas", "templateDescricao", "cobrancaPadrao", "exigeEsquadria", ordem, "atualizadoEm")
       VALUES ($1, $2, 'JANELA'::"TipoServico", 'JANELA_CORRER'::"TipoDesenho", $3::int[], $4, 'POR_M2'::"TipoCobranca", true, 9999, now())`,
      [id, nome, [2, 3, 4], "JANELA(S) DE CORRER COM {FOLHAS} FOLHAS EM ALUMÍNIO LINHA {LINHA}, MED. {MEDIDAS}"],
    );
    return id;
  });
}

/** Feriado de teste ("E2E ...") numa data "aaaa-mm-dd"; `tipo` OUTRO é o ponto facultativo (só aviso, não desconta dia útil). */
export async function criarFeriadoDeTeste(nome: string, data: string, tipo: "FERIADO" | "OUTRO" = "FERIADO"): Promise<string> {
  return comConexao(async (c) => {
    const id = randomUUID();
    await c.query(`INSERT INTO "Feriado" (id, data, nome, tipo, "atualizadoEm") VALUES ($1, $2::date, $3, $4::"TipoFeriado", now())`, [id, data, nome, tipo]);
    return id;
  });
}

/** Fornecedor de teste ("E2E ...") ligado às categorias de teste informadas (por nome). */
export async function criarFornecedorDeTeste(razaoSocial: string, categorias: string[] = []): Promise<string> {
  return comConexao(async (c) => {
    const id = randomUUID();
    await c.query(`INSERT INTO "Fornecedor" (id, "razaoSocial", "atualizadoEm") VALUES ($1, $2, now())`, [id, razaoSocial]);
    for (const nome of categorias) {
      // Tabela de junção implícita do Prisma: A = CategoriaProduto, B = Fornecedor (ordem alfabética dos modelos).
      await c.query(`INSERT INTO "_CategoriaProdutoToFornecedor" ("A", "B") SELECT id, $2 FROM "CategoriaProduto" WHERE nome = $1`, [nome, id]);
    }
    return id;
  });
}

/** Define o retalho mínimo de Configurações (null = vazio). Quem usa guarda e restaura o valor original. */
export async function definirRetalhoMinimo(mm: number | null): Promise<void> {
  await comConexao((c) => c.query(`UPDATE "ConfiguracaoEmpresa" SET "retalhoMinimoMm" = $1 WHERE id = 'singleton'`, [mm]));
}

/** Retalhos do produto de teste (comprimento e situação), do maior para o menor. */
export async function retalhosDoProdutoDeTeste(codigo: string): Promise<{ comprimentoMm: number; status: string; local: string | null }[]> {
  return comConexao(async (c) => {
    const r = await c.query<{ comprimentoMm: number; status: string; local: string | null }>(
      `SELECT r."comprimentoMm", r.status::text AS status, r.local FROM "Retalho" r JOIN "Produto" p ON p.id = r."produtoId" WHERE p.codigo = $1 ORDER BY r."comprimentoMm" DESC`,
      [codigo],
    );
    return r.rows;
  });
}

/** Contas a pagar nascidas das compras do fornecedor de teste (valor, parcelas e se estão ligadas à compra). */
export async function contasPagarDasComprasDeTeste(fornecedor: string): Promise<{ valorCentavos: number; parcelaTotal: number | null; comCompra: boolean }[]> {
  return comConexao(async (c) => {
    const r = await c.query<{ valorCentavos: number; parcelaTotal: number | null; comCompra: boolean }>(
      `SELECT cp."valorCentavos", cp."parcelaTotal", (cp."compraId" IS NOT NULL) AS "comCompra"
         FROM "ContaPagar" cp JOIN "Fornecedor" f ON f.id = cp."fornecedorId"
        WHERE f."razaoSocial" = $1 AND cp."deletadoEm" IS NULL ORDER BY cp.vencimento, cp."parcelaNumero"`,
      [fornecedor],
    );
    return r.rows;
  });
}

/** Recebimentos (não estornados) e o valor congelado de cada um, das compras do fornecedor de teste. */
export async function recebimentosDasComprasDeTeste(fornecedor: string): Promise<{ valorCentavos: number | null; quantidadeCompra: string; quantidadeEstoque: string }[]> {
  return comConexao(async (c) => {
    const r = await c.query<{ valorCentavos: number | null; quantidadeCompra: string; quantidadeEstoque: string }>(
      `SELECT ir."valorCentavos", ir."quantidadeCompra"::text AS "quantidadeCompra", ir."quantidadeEstoque"::text AS "quantidadeEstoque"
         FROM "ItemRecebimento" ir
         JOIN "ItemCompra" ic ON ic.id = ir."itemCompraId" JOIN "Compra" co ON co.id = ic."compraId" JOIN "Fornecedor" f ON f.id = co."fornecedorId"
        WHERE f."razaoSocial" = $1 AND ir."deletadoEm" IS NULL ORDER BY co.numero, ic.ordem`,
      [fornecedor],
    );
    return r.rows;
  });
}
