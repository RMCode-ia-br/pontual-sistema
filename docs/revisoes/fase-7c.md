# Fase 7C — Permissões por perfil e por módulo

Plano aprovado pelo Régis em 2026-11-27 (arquivo de plano da sessão; decisões 176 a 184 em `docs/DECISOES.md`; inventário em `docs/revisoes/fase-7c-inventario.md`). Fase única, relatório único.

## Estado atual (retomar daqui)

| Bloco | Situação | Commit |
|---|---|---|
| 0 Inventário, decisões, CLAUDE.md | concluído, `verificar` e Vercel verdes | `979d772` |
| 1 Migração `20261128000000_permissoes_perfis` | concluído: aplicada no banco de São Paulo com OK do Régis; `papel: ADMIN` explícito em `criarUsuario`, seed e nos dois helpers de teste que inserem em SQL cru; `verificar` e Vercel verdes | `8d42985` |
| 2 Regra pura, sessão com permissões, seed | concluído, `verificar` e Vercel verdes | `22e3484` |
| 3 Menu, `/sem-acesso`, `exigirModulo` nas páginas | concluído, CI verde (o primeiro push, `54d7ad1`, quebrou o `verificar` por um teste que mocava `@/lib/permissoes` sem `permissoesDe`; corrigido no commit seguinte) | `54d7ad1` + `a999cda` |
| 4 Server Actions | concluído e aguardando o "continuar" do Régis (parada obrigatória): typecheck, lint, build e os 2.028 unitários verdes | (commit do Bloco 4) |
| 5 Rotas, anexos, busca, CSV | pendente | — |
| 6 Valores para o Campo, custo, painel, relatórios | pendente | — |
| 7 Telas de usuários | pendente | — |
| 8 Cancelar obra aprovada | pendente | — |
| 9 E2E por perfil | pendente (parar antes da revisão sênior e da suíte) | — |

Paradas obrigatórias: OK da migração; fim do Bloco 4; fim do Bloco 9; suíte só depois do aviso do Régis. Esforço High nos Blocos 1, 4 e 6 e na revisão sênior.

## Ajustes do Régis sobre o plano
1. `ajustesPermissao` inválido falha fechado (papel ≠ ADMIN: sem acesso a nada, só `/sem-acesso` e a própria conta, com log; ADMIN: perfil puro).
2. Escritório com "excluir e desfazer" só em Comercial, Obras e Financeiro.
3. Cancelar obra aprovada com prévia e bloqueios em palavras simples.
4. Teste gerado: ação exportada × perfil, resultado derivado do mapeamento recurso → módulo → nível; falha se houver ação sem mapeamento. E2E: Escritório ponta a ponta (criar e aprovar proposta, receber, estornar, cancelar obra); Campo (agenda, visita, etapa, foto).
5. Migração: `ADD VALUE` não usado na mesma transação; `prisma migrate diff` só leitura antes; ADMIN com acesso total depois.
6. Pergunta ao Marcelo sobre o Campo concluir etapa que dispara vencimento de parcela.

## Bloco 1 — Migração `20261128000000_permissoes_perfis`

**Antes:** `prisma migrate diff` só leitura (banco × schema) deu vazio: nenhuma divergência de base, nada a preservar além do que já existe.

**SQL (`prisma/migrations/20261128000000_permissoes_perfis/migration.sql`, gerado pelo diff do Prisma):**
```sql
ALTER TYPE "PapelUsuario" ADD VALUE 'ESCRITORIO';
ALTER TYPE "PapelUsuario" ADD VALUE 'CAMPO';
ALTER TABLE "Usuario" ADD COLUMN "ajustesPermissao" JSONB,
ALTER COLUMN "papel" DROP DEFAULT;
```
Sem UPDATE: os quatro usuários atuais continuam `ADMIN`. Sem tabela nova, então sem RLS novo.

**SQL de volta:**
```sql
ALTER TABLE "Usuario" DROP COLUMN "ajustesPermissao", ALTER COLUMN "papel" SET DEFAULT 'ADMIN';
-- Os valores ESCRITORIO e CAMPO ficam no enum (PostgreSQL não remove valor de enum). Só se NENHUM usuário
-- os usar: recriar o tipo (CREATE TYPE novo, ALTER COLUMN ... TYPE novo USING papel::text::novo, DROP TYPE antigo).
```

**Validação BEGIN/ROLLBACK no banco compartilhado** (nada gravado): migração aplicada dentro da transação sem erro; `papel` ficou `NOT NULL` sem padrão e `ajustesPermissao` `jsonb` nulável; usuários antes e depois: 4 `ADMIN` (acesso total preservado); **usar `CAMPO` na mesma transação foi RECUSADO** (erro `55P04 unsafe use of new value`), confirmando que a migração só cria os valores e nada os usa; após o ROLLBACK a coluna não existe e o enum tem só `ADMIN`.

**Efeito no código:** com o padrão removido, `criarUsuario` (hoje sem `papel`) e `prisma/seed.ts` passam a exigir perfil; o Bloco 2 corrige os dois e regenera o cliente. Entre a aplicação da migração e o deploy do código novo, só `criarUsuario` falharia (ninguém cria usuário nesse intervalo).

## Bloco 2 — Regra pura e sessão

- `src/lib/dominio/permissoes.ts` (pura): módulos, perfis prontos, `permissoesEfetivas(papel, ajustes)` com Zod estrito (falha fechada: papel ≠ ADMIN sem acesso a nada, ADMIN perfil puro, sempre com `ajustesInvalidos`), normalização (Painel só "ver", destrutivo só com alterar, custo exige valores), `decidir` com tabelas `NIVEL_DO_VERBO` e `RECURSO` (módulo, `tambem`, `exige` transversais; verbo, recurso ou perfil desconhecido = negado).
- `src/lib/permissoes/index.ts`: `can(usuario, acao, recurso)` calcula pelo papel quando a sessão não traz permissões já calculadas (ponto de extensão da Parte A: ator com `permissoes` próprias).
- `obterUsuarioAtual` lê `ajustesPermissao` na mesma consulta e devolve `permissoes`; ajuste inválido vai para o log com o id do usuário (nunca o conteúdo).
- Recursos de nome ambíguo (`projeto`, `configuracao`, `interacao`) ficam mapeados de forma provisória e conservadora; o Bloco 4 os troca por `visita`, `mao-de-obra`, `interacao-cliente`/`interacao-projeto` e a varredura passa a proibir os antigos.
- Testes: `tests/unit/permissoes.test.ts` (tabela esperada escrita à mão, perfil × módulo × nível, transversais, ajustes acima e abaixo do perfil, falha fechada com 8 tipos de ajuste inválido) e `tests/unit/permissoes-varredura.test.ts` (todo `can(` do código tem verbo e recurso mapeados; recurso dinâmico só na lixeira).

## Bloco 3 — Menu, páginas e `/sem-acesso`

- **Menu:** cada item tem `modulo` (e `exige` para "Preço do kg" = custo). `menuVisivel`, `menuCelularVisivel` e `paginasDisponiveis(permissoes)` são funções puras; as permissões chegam aos componentes de cliente como dado simples (`modulos`, `verValores`, `verCustoMargem`), nunca como função. Agenda e Tarefas viraram o grupo "Agenda e tarefas" (decisão 176); "Condições de pagamento" passou para Cadastros; "Ajuda" (primeiros passos, que lê contagens de usuários e produtos) exige Configurações. Barra do celular: até 4 atalhos entre Painel, Funil, Agenda, Tarefas e Obras (o Campo vê Painel, Agenda, Tarefas e Obras). Abas de Configurações filtradas pelo módulo de cada aba.
- **Páginas:** `exigirModulo(modulos, { nivel, exige })` (`src/lib/auth/modulo.ts`) nas 90 páginas, aplicado por script com tabela explícita rota → módulo; telas de cadastro novo, edição, reajuste e inventário inicial exigem "alterar"; telas de dinheiro (propostas, financeiro, compras e relatórios financeiros e de vendas) exigem também "ver valores"; preço do kg, reajuste de produtos e margem por obra exigem "ver custo e margem"; cada relatório exige Relatórios mais o módulo de origem. Sem acesso: `/sem-acesso` ("Você não tem acesso a esta área. Fale com o administrador."), que só pede sessão para não haver laço.
- **Testes:** `tests/unit/paginas-e-menu-permissao.test.ts` (toda página chama `exigirModulo`, exceções com motivo; cada item do menu aponta para uma página que exige o mesmo módulo; menu de cada perfil e do ajuste inválido). Único ajuste num E2E existente: `area-logada.spec.ts` abre "Agenda e tarefas" para achar "Tarefas".
- **Fica para o Bloco 6:** valores DENTRO de telas que o Campo vê (obra, cliente, visita, linha do tempo, lista de obras), o índice `/relatorios` filtrado por link, e custo nas telas de produto, funcionário e tipologia.

**Lição do Bloco 3:** rodei só os unitários da regra antes do push e o `verificar` pegou `permissao-de-custo.test.ts` (mock de `@/lib/permissoes` sem `permissoesDe`). A partir daqui `npm test` completo (unitários, sem banco, ~80 s) roda antes de CADA push, além de typecheck e lint.

## Bloco 4 — Server Actions (relatório parcial, parada obrigatória)

**Resultado:** as 211 ações exportadas (57 arquivos `"use server"`) conferem `can()` além da sessão, com verbo e recurso do mapeamento; typecheck, lint, build e 2.028 unitários verdes (base da 3.6b-3: 1.614).

### Ações renomeadas (verbo ou recurso passou a refletir o que a ação faz)
- **Destrutivas que estavam como "editar":** cancelar proposta (`cancelar proposta`), encerrar validade por reajuste (`encerrar proposta`), reabrir revisão (`reabrir aprovacao`); ajustar, cancelar e reabrir conta a receber e a pagar; encerrar recorrência; cancelar compra (`cancelar compra`) e estornar recebimento de compra (`estornar compra`); estornar movimento de estoque; descartar retalho; ajustar sucata; ajustar chamado; ajustar pausa da obra; aplicar e prever reajuste de produtos e do kg (`reajustar`); alternar conta financeira ativa (`inativar`); `excluirPreco` da tipologia (`excluir preco-tipologia`).
- **Inativar e reativar** (clientes, fornecedores, funcionários, produtos, tipologias, condições, catálogos, feriados): `ativo ? "reativar" : "inativar"` (inativar é destrutivo, reativar só altera).
- **Remover item, opção e grupo de proposta em rascunho:** de `excluir` para `editar proposta` (decisão 177).
- **Recursos ambíguos separados:** `visita` (dados da obra na visita), `interacao-cliente` e `interacao-projeto`, `mao-de-obra` (exige custo), `cobranca-chamado` (exige valores), `custo-material` (exige custo), `composicao` (exige custo), `preco-tipologia` (exige valores), `desenho-tipologia` (Cadastros), `tipologia-de-proposta` ("salvar como nova tipologia": Cadastros e Comercial). Saíram `interacao` e `baixa-material`.
- **15 ações que só checavam sessão** ganharam `can(ver, …)`: consultas de agenda, clientes, projetos, fornecedores, produtos, chamados, obra, mão de obra e o desenho da tipologia na tela (`ver proposta`, porque é usado no editor da proposta).
- **Busca global** filtra por módulo: cada um dos 8 grupos só é consultado se a pessoa pode ver o módulo (quem não pode recebe lista vazia sem tocar o banco). Isto adiantou parte do Bloco 5.
- **Defeito achado e corrigido:** a lixeira chamava `can(…, "restaurar", tipo)` com o tipo no plural (`"clientes"`), que não existe no mapeamento; com falha fechada negaria a restauração até ao administrador, e a varredura não pegou por ser recurso dinâmico. Agora `RECURSO_DA_LIXEIRA` (`modules/lixeira/tipos.ts`) traduz tipo → recurso e o teste confere que cada tipo está mapeado e liberado ao administrador.
- Sem exceção por desenho (não conferem módulo): `entrar`, `sair`, `trocarSenha` (a própria senha), `listarNotificacoes` e `marcarNotificacoesComoLidas` (as do próprio usuário).

### Testes novos
- `tests/unit/sessao-obrigatoria.test.ts` estendido: toda ação exportada precisa conferir `can(` (também por função local que ela chame), com as 5 exceções acima, e a lista de exceções não pode apodrecer.
- `tests/unit/permissoes-varredura.test.ts`: todo `can(` do código tem verbo literal, verbo com nível e recurso mapeado; a lixeira é conferida pelo valor real.
- `tests/unit/acoes-matriz.test.ts` (**matriz gerada**): para cada uma das 211 ações × 6 perfis (Dono, Escritório, Campo, Campo com ajuste inválido, Dono sem custo e margem, Dono sem valores) o esperado sai do mapeamento lendo os `can(` do código-fonte; a ação é CHAMADA de verdade com a sessão do perfil e com um banco falso que explode se tocado. Esperado negado: responde "Sem permissão" sem tocar o banco; esperado liberado: não pode responder "Sem permissão". Falha se uma ação não tem `can(` lido. Decisão mista entre alternativas de um verbo ternário fica de fora só para aquele perfil. A `buscaGlobal`, que filtra em vez de negar, tem asserções próprias.
- Isto substitui os "testes de integração por módulo" planejados: prova a negação chamando a ação direto, e ainda prova que o banco não foi tocado (mais forte que um teste com banco real).

### O que ficou SEM teste (e por quê)
- A matriz só tem 6 perfis fixos; combinações arbitrárias de ajuste por módulo são cobertas pela regra pura (`permissoes.test.ts`), não ação a ação.
- A matriz deriva o esperado dos `can(` lidos no texto: um `can(` com recurso certo no lugar errado (depois de efeito colateral) não é pego; todas as ações seguem o padrão sessão → `can` → validação, e a matriz prova que nada toca o banco antes do `can`.
- Ações com duas chamadas `can` em ramos exclusivos aparecem como "misto" e são puladas por perfil (hoje só ternários de verbo).
- Ações de ponta a ponta com banco real continuam cobertas pelas suítes de integração existentes (rodam como administrador); elas não foram reexecutadas neste bloco (suíte completa só depois do aviso do Régis).
- `mudarEtapa` (Obras) pode liberar parcelas por gatilho: o Campo, que altera Obras, concluiria uma etapa que dispara o vencimento (pergunta ao Marcelo em PENDENCIAS; padrão: manter).
- Leitura de VALORES dentro das telas e consultas (obra, cliente, visita, linha do tempo, CSV, PDF, anexos, painel) é dos Blocos 5 e 6; hoje só o módulo e os transversais das PÁGINAS e das AÇÕES estão fechados.

### Matriz por perfil (gerada da própria matriz de testes)

Para regerar: `GERAR_RELATORIO_MATRIZ=<arquivo.md> npx vitest run tests/unit/acoes-matriz.test.ts` (no PowerShell: `$env:GERAR_RELATORIO_MATRIZ = "..."`). As três invariantes abaixo viraram asserções permanentes do mesmo teste: o Campo só age em Agenda e tarefas e Obras (em Clientes só lê), não executa destrutiva nem lê valores ou custo; o Escritório só tem destrutiva em Comercial, Obras e Financeiro.

Gerado da matriz (209 ações; a `buscaGlobal` filtra por módulo em vez de negar e fica fora das listas).

#### Campo

##### Ações permitidas (32)

- **Agenda e tarefas** (12): buscarProjetosParaAgenda, sugerirHorarios, criarEvento, editarEvento, mudarSituacaoDoEvento, criarFeedAgenda, criarTarefa, editarTarefa, concluirTarefa, reabrirTarefa, salvarMedida, salvarDadosDaObra
- **Clientes** (2): buscarClientesParaIndicacao, listarEnderecosDoCliente
- **Obras** (13): criarChamado, listarObrasDoClienteParaChamado, preverClassificacao, mudarSituacaoDoChamado, mudarEtapa, editarEtapaDaObra, sugerirDatas, aplicarDatas, definirPrazo, pausarObra, encerrarPausaDaObra, aprovarFachadaDoCondominio, gerarEtapas
- **Transversal (anexos e filtros salvos)** (5): iniciarUploadAnexo, concluirUploadAnexo, urlDeDownloadAnexo, salvarFiltro, atualizarFoto

#### Escritório

##### Ações negadas (40)

- **Agenda e tarefas** (4): excluirEvento, revogarFeedAgenda, excluirTarefa, excluirMedida
- **Cadastros** (6): excluirCondicoes, excluirFornecedores, excluirEquipe, excluirFuncionarios, excluirPreco, excluirTipologias
- **Clientes** (4): excluirClientes, excluirContato, excluirEndereco, excluirInteracaoDoCliente
- **Configurações** (16): salvarEmpresa, definirLogoEmpresa, criarFeriado, alternarAtivoFeriado, excluirFeriado, analisarPlanilha, confirmarImportacao, desfazerImportacao, salvarModeloTexto, verSugestaoDeMaoDeObra, aplicarSugestaoDeMaoDeObra, salvarModeloDeEtapas, criarUsuario, editarUsuario, alternarAtivoUsuario, redefinirSenhaUsuario
- **Estoque e compras** (10): cancelarCompraAcao, estornarRecebimentoAcao, estornarMovimento, descartarRetalhoAcao, ajustarSucataAcao, preverReajusteKg, aplicarReajusteDoKg, excluirProdutos, preverReajuste, aplicarReajuste

##### Ações destrutivas permitidas (24)

- **Comercial** (10): excluirInteracaoDoProjeto, excluirProjetos, desfazerAprovacaoAcao, trocarAprovacaoAcao, reabrirRevisaoAcao, previaDesfazerAcao, previaTrocaAcao, cancelarProposta, encerrarValidadePorReajuste, excluirProposta
- **Financeiro** (9): alternarAtivaDaConta, estornar, ajustarContaPagar, cancelarContaPagar, reabrirContaPagar, encerrarRecorrenciaAcao, ajustarContaReceber, cancelarContaReceber, reabrirContaReceber
- **Obras** (3): ajustarChamadoAcao, ajustarPausaDaObra, excluirPausaDaObra
- **Transversal (anexos e filtros salvos)** (2): excluirAnexo, excluirFiltroSalvo


**Conferência (pedido do Régis no início do Bloco 5):** a primeira geração mostrou, no Campo, itens fora de "agenda, visita, etapa, foto, nota de campo e a própria conta". Corrigidos:
- `verificarDuplicidadeDeCliente`, `consultarCepDoEndereco` e `consultarCnpjDoCliente` só servem ao cadastro de cliente: passaram de `ver cliente` para `criar cliente` (o Campo só lê Clientes).
- `definirAutorizacaoDoCliente` e `marcarPublicacao` (autorização de uso de imagem e publicação no portfólio) saíram de `editar obra` para o recurso novo `portfolio-obra` (Obras e Comercial): o Campo tira a foto, o escritório publica.

**Mantidos no Campo por decisão (para o Régis confirmar):** `buscarClientesParaIndicacao` e `listarEnderecosDoCliente` (o seletor de cliente e o endereço que a agenda e a assistência usam), `criarFeedAgenda` (o próprio feed de agenda), tarefas (decisão 177: Campo altera "Agenda e tarefas"), e dentro de Obras: datas, prazo, pausa, fachada de condomínio, gerar etapas e assistência (chamados), por serem trabalho sobre as etapas da obra.

**Escritório:** nenhuma destrutiva fora de Comercial, Obras e Financeiro. Única observação: `excluirAnexo` aparece como destrutiva liberada porque o anexo ainda é "de qualquer módulo"; no Bloco 5 o módulo passa a vir da entidade dona do anexo (aí o Escritório só apaga anexo de Comercial, Obras e Financeiro) e a invariante será apertada para valer também para o transversal. As negações do Escritório batem com a decisão 177 (excluir em Clientes, Cadastros, Agenda e tarefas, Estoque e compras; Configurações inteira).
