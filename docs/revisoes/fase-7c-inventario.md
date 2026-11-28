# Fase 7C — Inventário para permissões por perfil e por módulo

Data: 2026-11-27. Levantado no código sobre o commit `91333e3` antes de codificar. Serve de lista de conferência dos Blocos 2 a 6: nada aqui é decisão final de nome (a regra pura fixa os nomes no Bloco 2), mas toda linha tem de acabar coberta por teste.

## 1. Módulos e telas (menu real, `src/components/layout/menu.ts`)

| Módulo | Telas |
|---|---|
| Painel | `/` |
| Agenda e tarefas | `/agenda`, `/agenda/novo`, `/agenda/[id]`, `/agenda/[id]/visita`, `/tarefas`, `/tarefas/nova`, `/tarefas/[id]`, feed `.ics` |
| Comercial | `/funil`, `/projetos`, `/projetos/novo`, `/projetos/[id]`, `/propostas`, `/propostas/nova`, `/propostas/[id]`, `/propostas/[id]/comparar` |
| Clientes | `/clientes`, `/clientes/novo`, `/clientes/[id]`, `/parceiros` |
| Obras | `/obras`, `/obras/[id]`, `/obras/calendario`, `/obras/galeria`, `/obras/assistencia`, `/obras/assistencia/novo`, `/obras/assistencia/[id]` |
| Financeiro | `/financeiro`, `/financeiro/dre`, `/financeiro/recebimentos`, `/financeiro/contas`, `/financeiro/contas/[id]`, `/financeiro/lancamentos/[id]`, `/financeiro/pagar`, `/financeiro/pagar/[id]`, `/financeiro/pagar/recorrencias`, `/financeiro/receber`, `/financeiro/receber/[id]` |
| Estoque e compras | `/produtos`, `/produtos/novo`, `/produtos/[id]`, `/produtos/reajuste`, `/estoque/movimentacoes`, `/estoque/inventario-inicial`, `/estoque/retalhos`, `/estoque/preco-do-kg`, `/compras`, `/compras/nova`, `/compras/[id]`, `/compras/[id]/editar` |
| Cadastros | `/fornecedores/**`, `/funcionarios/**` (inclui equipes), `/tipologias/**`, `/configuracoes/catalogos`, `/configuracoes/condicoes-pagamento/**`, `/lixeira` |
| Relatórios | `/relatorios` e 13 relatórios (`vendas`, `funil`, `fechamento`, `clientes`, `avaliacoes`, `obras`, `producao`, `margem-obras`, `faturamento`, `estoque`, `produtos-e-precos`, `financeiro/pagar`, `financeiro/receber`) |
| Configurações | `/configuracoes` (índice), `empresa`, `usuarios`, `modelos-texto`, `feriados`, `modelo-etapas`, `importacao`, `auditoria`, `backup` |
| Sem módulo | `/primeiros-passos` (ajuda), `/sem-acesso` (nova), `/trocar-senha` e `/login` (fora de `(app)`) |

Decisão: Agenda e Tarefas deixam de ser parte de Comercial no menu e nas permissões (decisão 176). Há três pontos de atenção de classificação: `/estoque/preco-do-kg` e `/produtos/reajuste` mexem em preço, ficam em Estoque e compras e exigem "ver custo e margem" para aparecer; `/configuracoes/catalogos` e `/configuracoes/condicoes-pagamento` ficam em Cadastros, não em Configurações; `/configuracoes/page.tsx` é a única página que não chama `exigirSessao`.

## 2. Server Actions (57 arquivos)

Legenda: **A** = alterar; **D** = destrutivo (hoje alguns estão como "editar"; o Bloco 4 troca o verbo); **L** = leitura. `[S]` = hoje só checa sessão (16 ações) e ganha `can(ver, …)`. `$` = devolve valores; `U` = devolve URL assinada.

| Módulo | Arquivo → ações |
|---|---|
| Agenda e tarefas | `agenda/actions/eventos.ts`: criarEvento, editarEvento, mudarSituacaoDoEvento (A; cancelar = D) · excluirEvento (D). `agenda/actions/feed.ts`: criarFeedAgenda (A), revogarFeedAgenda (D). `agenda/actions/consultas.ts`: buscarProjetosParaAgenda [S], sugerirHorarios [S] (L). `tarefas/actions.ts`: criarTarefa, editarTarefa, concluirTarefa, reabrirTarefa (A), excluirTarefa (D). `visitas/actions.ts`: salvarMedida, salvarDadosDaObra (A, hoje `editar/projeto`; passa a `visita`), excluirMedida (D) |
| Comercial | `projetos/actions/projetos.ts`: criarProjeto, editarProjeto (A), excluirProjetos (D). `projetos/actions/funil.ts`: moverProjeto (A). `projetos/actions/interacoes.ts`: registrar (A), excluir (D). `projetos/actions/consultas.ts`: listarEnderecosDoCliente [S]. `propostas/actions/propostas.ts`: criarProposta, salvarProposta, duplicarProposta (A), excluirProposta (D). `estrutura.ts`: calcularPreviaDoItem ($ custo, L), salvarItem, duplicarItem, moverItem, salvarOpcao, duplicarOpcao, salvarGrupo, moverGrupo, importarMedidasDaVisita (A), removerItem/Opcao/Grupo (rascunho: A, decisão 177). `ciclo.ts`: marcarComoEnviada, criarRevisao, recusarProposta, aprovarPropostaAcao ($) (A), cancelarProposta, encerrarValidadePorReajuste (D). `aprovacao.ts`: previaDesfazerAcao, previaTrocaAcao ($, L), desfazerAprovacaoAcao, trocarAprovacaoAcao, reabrirRevisaoAcao (D). `custo-material.ts`: salvarCustoDeMaterial (A, exige custo). `desenho.ts`: iniciarUploadDesenho (A, U), concluirUploadDesenho (A), removerDesenhoDoItemAcao (A: remover a imagem do item é edição de rascunho) |
| Clientes | `clientes/actions/clientes.ts`: criar, editar, reativar (A), inativar, excluir (D). `contatos.ts`, `enderecos.ts`: criar/editar (A), excluir (D). `interacoes.ts`: registrar (A), excluir (D). `consultas.ts`: verificarDuplicidade, consultarCep, consultarCnpj, buscarClientesParaIndicacao [S] (L) |
| Obras | `obras/actions/obra.ts`: sugerirDatas [S] (L); mudarEtapa, editarEtapaDaObra, aplicarDatas, definirPrazo, pausarObra, encerrarPausaDaObra, aprovarFachadaDoCondominio, gerarEtapas (A); ajustarPausaDaObra, excluirPausaDaObra (D). `chamados.ts`: listarObrasDoClienteParaChamado, preverClassificacao [S] (L); criarChamado, mudarSituacaoDoChamado, gerarCobranca ($, exige valores) (A); ajustarChamadoAcao (D). `fotos.ts`: atualizarFoto, definirAutorizacaoDoCliente, marcarPublicacao (A). `mao-de-obra.ts`: verSugestaoDeMaoDeObra [S] ($ salários, exige custo), aplicarSugestaoDeMaoDeObra (A, hoje `editar/configuracao`; passa a `mao-de-obra`). `modelo.ts`: salvarModeloDeEtapas (A, Configurações). **Nova:** cancelarObraAprovada + prévia (D, Bloco 8) |
| Financeiro | `contas.ts`: criarConta, editarConta (A), alternarAtivaDaConta (D). `lancamentos.ts`: criarLancamento, transferirEntreContas, conciliar (A), estornar (D). `pagar.ts`: criarContaAPagarAcao, pagar, editarRecorrenciaAcao (A), ajustarContaPagar, cancelarContaPagar, reabrirContaPagar, encerrarRecorrenciaAcao (D). `receber.ts`: receber, prorrogarContaReceber, liberarParcela (A), ajustarContaReceber, cancelarContaReceber, reabrirContaReceber (D) |
| Estoque e compras | `compras/actions.ts`: criarCompraAcao, atualizarCompraAcao, fazerPedidoAcao, receberCompraAcao (A), cancelarCompraAcao, estornarRecebimentoAcao (D). `estoque/actions/movimentos.ts`: registrarMovimento, contarInicial (A), estornarMovimento (D). `retalhos.ts`: baixarPerfil, usarRetalho, venderSucataAcao (A), descartarRetalhoAcao, ajustarSucataAcao (D). `produtos/actions/produtos.ts`: criar, editar, reativar (A), inativar, excluir (D). `rapido.ts`: buscarProdutosParaCampo [S] ($ custo), opcoesDoCadastroRapidoDeProduto [S], cadastrarProdutoRapido ($ custo). `reajuste.ts`: preverReajuste ($), aplicarReajuste (D). `preco-kg.ts`: preverReajusteKg ($), salvarPrecosKg (A), aplicarReajusteDoKg (D) |
| Cadastros | `fornecedores/actions.ts`: criar, editar, reativar (A), inativar, excluir (D). `actions-rapido.ts`: buscarFornecedoresParaCampo [S], cadastrarFornecedorRapido (A). `funcionarios/actions/funcionarios.ts` e `equipes.ts`: criar/editar/reativar/adicionar membro/definir líder (A), inativar/excluir/remover membro (D); salários exigem custo. `tipologias/actions/tipologias.ts`: criar, editar, reativar (A), inativar, excluir (D). `composicao.ts`: salvarComposicao (A, exige custo). `precos.ts`: salvarPreco, importarPrecos (A), excluirPreco (D). `desenho.ts`: iniciarUpload, concluirUpload, mudarTamanho, marcarRevisada, salvarDesenhoComoTipologia (A; este exige também Comercial), desenhoDaTipologiaParaTelaAcao [S] (L, U), removerDesenhoDaTipologiaAcao (A). `condicoes-pagamento/actions.ts`: salvarCondicao, reativar (A), inativar, excluir (D). `catalogos/actions.ts`: criar, editar, mover (A), alternarAtivo (D). `lixeira/actions.ts`: restaurar* (A; recurso dinâmico por tipo) |
| Configurações | `usuarios/actions/usuarios.ts`: criarUsuario, editarUsuario, redefinirSenhaUsuario (A), alternarAtivoUsuario (D ao desativar). `configuracoes/actions/empresa.ts`: salvarEmpresa, definirLogoEmpresa (A). `feriados/actions/feriados.ts`: criar, alternarAtivo (A), excluir (D). `modelos-texto/actions.ts`: salvarModeloTexto (A). `importacao/actions.ts`: analisarPlanilha (L), confirmarImportacao (A), desfazerImportacao (D) |
| Transversal | `anexos/actions.ts`: iniciarUploadAnexo (U), concluirUploadAnexo (A), urlDeDownloadAnexo (L, U; hoje carrega por id sem checar a entidade dona), excluirAnexo (D); módulo vem da entidade dona. `busca/actions.ts`: buscaGlobal [S] (L; filtrar por módulo). `filtros/actions.ts`: salvarFiltro (A), excluirFiltroSalvo (D) (por usuário). `notificacoes/actions.ts`: listar, marcarComoLidas [S] (do próprio usuário, sem módulo) |
| Auth | `usuarios/actions/sessao.ts`: entrar, sair, trocarSenha (fora da matriz) |

Verbos destrutivos escondidos em "editar" que o Bloco 4 renomeia: cancelarProposta, encerrarValidadePorReajuste, reabrirRevisaoAcao, ajustar/cancelar/reabrir de conta a pagar e a receber, cancelarCompraAcao, estornarRecebimentoAcao, estornarMovimento, descartarRetalhoAcao, ajustarSucataAcao, ajustarChamadoAcao, todos os "inativar", aplicarReajuste e aplicarReajusteDoKg.

Recursos ambíguos a separar: `projeto` (funil × visita), `configuracao` (empresa × mão de obra), `interacao` (clientes × projetos), `movimentoEstoque` (movimento × baixa de perfil).

## 3. Rotas de API (37)

| Rota | Entrega | Regra prevista |
|---|---|---|
| `/api/propostas/[id]/pdf` | PDF com valores | Comercial ver + valores |
| `/api/propostas/[id]/producao` | PDF sem valores | Obras ver ou Comercial ver |
| `/api/compras/[id]/pdf` | PDF com preços | Estoque ver + valores |
| `/api/obras/[id]/kit` | ZIP de imagens | Obras ver (mantém a autorização R18) |
| `/api/agenda/exportar` | `.ics` da sessão | Agenda ver |
| `/api/public/agenda/[token]` | `.ics` público por token | Agenda ver do dono do token, a cada busca |
| `/api/exportar/clientes`, `projetos`, `obras`, `chamados`, `compras`, `estoque/movimentacoes`, `fornecedores`, `produtos`, `funcionarios`, `auditoria` | CSV | Módulo de origem ver; colunas de valor exigem valores; de custo exigem custo (`interna`) |
| `/api/exportar/financeiro/*` (receber, pagar, recebimentos, fluxo, dre, aging, extrato) | CSV com valores | Financeiro ver |
| `/api/exportar/relatorios/*` (vendas, funil, fechamento, clientes, avaliacoes, obras, producao, faturamento, estoque, produtos-e-precos, margem-obras) | CSV | Relatórios ver + módulo de origem + transversais. **Estoque sai hoje com custo sem marcar `interna`: corrigir.** Faturamento traz repasse de nota e cartão sem `interna`: corrigir |
| `/api/auth/*`, `/api/health`, `/api/cron/diario`, `/api/public/*` (formulário do site) | público | não mudam |

## 4. Valores que aparecem em telas que o Campo veria

| Onde | O que mostra | Tratamento |
|---|---|---|
| `/obras/[id]` resumo (`resumo-da-obra.tsx`) | "Valor fechado" | ocultar sem valores |
| abas da obra: Parcelas (`parcelas-da-obra.tsx`), Materiais (`materiais-da-obra.tsx`, "recebido R$"), Custo e margem (`custo-da-obra.tsx`, sem checagem hoje), Financeiro | valores e custo | ocultar a aba sem valores; Custo e margem exige custo |
| `lista-de-chamados.tsx`, `painel-do-chamado.tsx`, `/obras/assistencia/[id]` | "Visita cobrada R$", valor da visita, seção de cobrança | ocultar sem valores |
| `lista-de-obras.tsx` e `queries-lista.ts` | `valorFechado` | tirar coluna e campo da consulta sem valores |
| Linha do tempo (`LinhaDoTempo`, em obra, projeto e cliente) | textos de interação com R$ (`servico-ciclo.ts`, `servico-desfazer.ts`, `servico-receber.ts`, `servico-pagar.ts`, `servico-lancamentos.ts`, `servico-chamados.ts`) | `textoSemValores` por tipo de interação, função pura testada |
| `/clientes/[id]`: abas Projetos (`projetos-do-cliente.tsx`) e Financeiro (`financeiro-do-cliente.tsx`) | valor estimado, saldo, atraso | ocultar sem valores |
| `/agenda/[id]/visita` (`form-dados-da-obra.tsx`) | "Investimento previsto (R$)" | ocultar sem valores |
| `cartao-projeto.tsx`, `kanban.tsx`, `resumo-do-projeto.tsx` | valor estimado e fechado | Campo não tem Comercial; cobre quem tem Comercial sem valores |
| WhatsApp de cobrança (`montarCobrancaDaConta`) | saldo | só Financeiro com valores |
| Painel (`dados.ts` e `page.tsx`) | blocos de dinheiro, vendas, funil, estoque, cadastros | bloco só aparece se a pessoa vê o módulo de origem e os transversais |
| Busca global | sem valores, mas sem filtro de módulo | filtrar por módulo |
| Notificações | nenhum código cria `Notificacao` hoje | sem tratamento; registrar para quem criar |
| Tarefas geradas ("Cobrar parcela — …") | sem R$ no título | sem tratamento |

## 5. Custo e margem (exigem "ver custo e margem")

Margem por obra (tela, aba Custo e margem, CSV; já checa só a tela e o CSV); relatório de estoque (valor do estoque, custo unitário, por fornecedor, curva ABC, variação de custo) e seu CSV; CSVs de produtos, movimentações e compras (custo unitário); produtos e preços (cadastro: custo, histórico de preço, reajuste, preço do kg, inventário inicial, movimentos); composição e tabela de preços da tipologia; proposta (`painel-totais.tsx` modo interno, `dialogo-custo-material.tsx`, custo e markup no `dialogo-item.tsx`, prévia do item); repasse de nota e cartão (painel, vendas, faturamento, custo da obra, CSV de faturamento); salários (`painel-lista-funcionarios.tsx`, `form-funcionario.tsx`, sugestão de mão de obra); campos "Produtos sem custo" e "Custos desatualizados" no painel.

## 6. Anexos, Storage, `.ics`, PDFs

- `urlDeDownloadAnexo` carrega por id e só checa `ver/anexo`: passa a decidir pelo módulo da entidade dona (`entidadeTipo`): cliente → Clientes; lançamento (comprovante) → Financeiro; produto e fornecedor → Estoque/Cadastros; funcionário → Cadastros; proposta e projeto → Comercial; chamado → Obras; medida e evento → Agenda; tarefa → Agenda.
- Desenhos da proposta e da tipologia são anexos: item exige Comercial; tipologia exige Cadastros; a folha de produção embute o desenho do item para quem tem Obras.
- Foto de obra e kit: Obras.
- Logo: pública para a interface (Configurações > cache de URL).

## 7. Decisão 151 (`DadosDoAceiteIncompletos`)

Aparece em painel (Vendido), aba Custo e margem, `/relatorios/vendas`, `/relatorios/faturamento`, `/relatorios/margem-obras` e nos CSVs (409). Sem "ver valores" a mensagem passa a ser "Há um problema nos dados. Fale com o administrador." (sem números de propostas).

## 8. Cancelar obra aprovada (regra 13 do dono)

Não existe ação. `avaliarMovimento` (`src/lib/dominio/funil.ts`) recusa mover para `CANCELADO` e a partir de fase de obra; o desfazer aprovação bloqueia obra em execução, concluída ou cancelada. `ondeCanceladosDepoisDeAprovados` (`indicadores/cancelamentos.ts`) lê `status CANCELADO` + `HistoricoFaseProjeto` e nunca é alimentado. Bloco 8 constrói a ação, no padrão prévia + bloqueios do desfazer (7A.1).

## 9. Pontos de atenção técnica para a execução

- `obterUsuarioAtual` já lê `papel` do banco por requisição: as permissões efetivas saem de lá, o JWT não muda.
- Proteção atual é "último usuário ativo"; passa a "último administrador ativo" (ADMIN com Configurações alterar), sob o mesmo `travarUsuariosAtivos`.
- Teste `tests/unit/sessao-obrigatoria.test.ts` varre `"use server"` por `exigirSessao`; será estendido para exigir `can(` e para gerar a matriz ação × perfil.
- `ACOES_DESTRUTIVAS` em `src/lib/permissoes/index.ts` deixa de ser lista solta e passa a ser a fonte do nível destrutivo.
- Fora do escopo: Parte A (API do agente, só ponto de extensão no `can`), módulo Conversas, Fase 8, CHECK das colunas do aceite.
