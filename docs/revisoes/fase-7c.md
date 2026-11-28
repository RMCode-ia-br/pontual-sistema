# Fase 7C — Permissões por perfil e por módulo

Plano aprovado pelo Régis em 2026-11-27 (arquivo de plano da sessão; decisões 176 a 184 em `docs/DECISOES.md`; inventário em `docs/revisoes/fase-7c-inventario.md`). Fase única, relatório único.

## Estado atual (retomar daqui)

| Bloco | Situação | Commit |
|---|---|---|
| 0 Inventário, decisões, CLAUDE.md | concluído, `verificar` e Vercel verdes | `979d772` |
| 1 Migração `20261128000000_permissoes_perfis` | concluído: aplicada no banco de São Paulo com OK do Régis; `papel: ADMIN` explícito em `criarUsuario`, seed e nos dois helpers de teste que inserem em SQL cru; `verificar` e Vercel verdes | `8d42985` |
| 2 Regra pura, sessão com permissões, seed | concluído, `verificar` e Vercel verdes | `22e3484` |
| 3 Menu, `/sem-acesso`, `exigirModulo` nas páginas | concluído, CI verde (o primeiro push, `54d7ad1`, quebrou o `verificar` por um teste que mocava `@/lib/permissoes` sem `permissoesDe`; corrigido no commit seguinte) | `54d7ad1` + `a999cda` |
| 4 Server Actions | concluído; o Régis liberou com "continuar"; CI verde | `d0b4aa7` + `5b434ea` (matriz por perfil e correções do Campo) |
| 5 Rotas, anexos, busca, CSV | concluído, CI verde | `e1468be` |
| 6 Valores para o Campo, custo, painel, relatórios | concluído, CI verde (retomado depois do limite da sessão: o que estava no disco foi conferido, completado com testes e commitado) | `160fb3e` |
| 7 Telas de usuários | concluído (commit deste bloco) | (commit do Bloco 7) |
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

## Bloco 5 — Rotas, anexos, busca e CSV (camada 4: saídas)

- **Um helper só decide a saída** (`src/lib/csv/acesso.ts`): `saidaNegada(usuario, { recursos, algum, valores, custo })` devolve 403 (sem cache) ou `null`; `acessoDoCsv(usuario)` dá as opções do CSV; `semColunas` tira colunas de CSV montado à mão. Toda rota de saída chama `saidaNegada` logo depois da sessão.
- **31 rotas cobertas:** CSVs (`/api/exportar/**`), PDF da proposta (Comercial + valores), folha de produção (Obras **ou** Comercial: serve o campo, sem valores), pedido de compra em PDF (Estoque + valores), kit de postagem (`portfolio-obra`: Obras e Comercial) e `.ics` da agenda (Agenda). Cada relatório exige Relatórios mais o módulo de origem (e valores ou custo conforme o conteúdo); auditoria exige Configurações; financeiro exige valores.
- **CSV tipado:** `podeVerValores` passou a ser opção OBRIGATÓRIA e **toda coluna de dinheiro some sem "ver valores"**; coluna `interna` (custo, margem, repasse de nota e de cartão) some sem "ver custo e margem". Marcadas `interna`: custo unitário e valor em estoque (posição do estoque; as visões de fornecedor, curva ABC e variação de custo exigem custo inteiras), repasses do faturamento. CSVs montados à mão perdem a coluna: valor estimado (projetos), valor fechado (obras), valor da visita (chamados), custo unitário (movimentações) e custo e data do custo (produtos). Compras exige valores inteira. Corrige o defeito achado no inventário: o CSV de estoque saía com custo para todos.
- **Feed `.ics` público:** passou a consultar o perfil do DONO do token a cada busca; sem Agenda, 404 igual ao de token inválido (o feed morre na hora se o perfil mudar).
- **Anexos:** a permissão é a do módulo da ENTIDADE DONA do arquivo (`src/modules/anexos/permissao.ts`, tipo `Record<EntidadeComAnexo, …>` obriga regra para entidade nova): subir, baixar e excluir. Comprovante de lançamento e anexo de proposta exigem também valores; foto de visita, de medida, de obra e de assistência são do Campo (que só lê Clientes e não apaga); o Escritório só APAGA anexo de Comercial, Obras e Financeiro (Projeto, Proposta, Chamado, Lançamento); entidade desconhecida é negada. Resolve a observação da matriz sobre `excluirAnexo`.
- **Busca global** por módulo já tinha entrado no Bloco 4.
- **Testes novos:** `tests/unit/rotas-matriz.test.ts` (matriz gerada: cada rota × 6 perfis, esperado derivado do `saidaNegada` lido no código, banco falso que explode; rota sem `saidaNegada` falha; feed público confere a Agenda do dono), `tests/unit/anexos-e-csv-permissao.test.ts` (regra de anexo por entidade × perfil, `saidaNegada`, `semColunas`), coluna de dinheiro no `csv-colunas.test.ts`. A varredura de `can(` passou a tratar `acesso.ts` e `anexos/permissao.ts` como despachantes (exceções explicadas) e confere os recursos de anexo. A bomba do banco falso passou a rejeitar com promessa já tratada (consultas em paralelo geravam "unhandled rejection").
- **Fica para o Bloco 6:** valores DENTRO das telas permitidas (obra, cliente, visita, linha do tempo, lista de obras), botões de WhatsApp com saldo, painel por bloco, aviso da decisão 151 e o índice `/relatorios` filtrado por link, e custo nas telas de produto, funcionário e tipologia. Os E2E das exportações rodam como administrador e não foram reexecutados neste bloco (suíte completa só depois do aviso do Régis).

## Bloco 6 — Valores e custo dentro das telas permitidas

Princípio: valor ou custo é REMOVIDO NO SERVIDOR antes de chegar à tela (nada no HTML), não só escondido; botão que sempre responderia "Sem permissão" não aparece.

- **Nota de campo:** o diário da obra (`interacao-projeto`) passou a aceitar Obras **ou** Comercial (`ou` na regra de permissões): o Campo escreve, não apaga. A matriz regerada mantém as invariantes.
- **Obra (`/obras/[id]`):** sem "ver valores" somem o valor fechado (nem no objeto), a aba Parcelas, o "recebido" das compras e o valor da visita; sem "ver custo e margem" some a aba Custo e margem (o endereço direto cai no resumo) e o aviso "sem custo" dos materiais; o diário tem o R$ trocado por "valor oculto" por função pura (`ocultarValoresDoTexto`); "Ver projeto" e "Voltar para os projetos" só com Comercial (o Campo volta para as obras).
- **Assistência:** lista e chamado sem valor da visita; o painel do chamado esconde a seção de garantia e cobrança de quem não ajusta, e o "cobrar a visita" e a geração da cobrança de quem não vê valores; a ação não envia nem apaga o valor nesses casos.
- **Lista de obras:** sem valor fechado.
- **Cliente (`/clientes/[id]`):** quem só vê Clientes recebe ficha de leitura (nome, telefone, WhatsApp, endereços, contatos), sem CPF/CNPJ, e-mail, origem, observações nem formulário; abas Projetos (Comercial e valores), Financeiro (Financeiro e valores), Arquivos e Linha do tempo (quem altera Clientes) e Assistência (Obras); botões de inativar e de lixeira só com a permissão destrutiva.
- **Visita:** o "Investimento previsto" some sem valores e `salvarDadosDaObra` PRESERVA o valor guardado (campo ausente não vira "apagar").
- **Comercial exige valores:** Funil, Projetos e Propostas (páginas, menu, atalho do celular, busca global, aba Projetos do cliente) mostram dinheiro por natureza, então exigem também "ver valores".
- **Ações em lote e botões:** `AcoesDoCadastro` e as cinco listas (clientes, fornecedores, funcionários, produtos, projetos) só oferecem inativar, reativar e lixeira a quem pode; botão "Novo …" só para quem cria.
- **Painel:** cada bloco só aparece se a pessoa abre a lista por trás do número (`blocosDoPainel`, função pura): Campo vê agenda, obras e clientes; nenhum bloco de dinheiro, vendas ou custo.
- **Relatórios:** tabela única de acesso (`src/modules/relatorios/acesso.ts`) usada pelo índice e conferida por teste contra o `exigirModulo` de cada página; relatórios que mostram dinheiro (vendas, fechamento, funil, clientes, produtos e preços, obras, faturamento, financeiros) exigem valores na página e no CSV; o de estoque sem custo mostra só a posição (quantidades, mínimo, retalhos, sucata).
- **Decisão 151:** o aviso com números de propostas só aparece em telas e blocos que exigem valores (painel, vendas, faturamento) ou custo (aba e relatório de margem); quem não os abre nem chega a ele.
- **Testes novos:** `tests/unit/valores-nas-telas.test.ts` (acesso dos relatórios × página × CSV, blocos do painel, sanitizadores de obra, ações em lote por perfil), `tests/unit/texto-sem-valores.test.ts`; a matriz de ações passou a ler só `!can(` como guarda (um `can` que decide um detalhe não é guarda).

**Pendência deste bloco (vai para PENDENCIAS):** as telas de produto, funcionário (salário) e tipologia (composição) mostram custo a quem tem o módulo mas não "ver custo e margem" POR AJUSTE; os perfis prontos não são afetados (Escritório tem custo, Campo não tem esses módulos). As ações, o CSV e o relatório de estoque já estão fechados; o painel monta todos os dados no servidor e esconde o bloco (só otimização pendente).

## Bloco 7 — Configurações > Usuários

- **Criar usuário só escolhendo o perfil:** o formulário tem "Perfil" obrigatório e sem pré-seleção (Dono/Gestão, Escritório, Campo, com uma frase simples do que cada um faz); `papelSchema` recusa vazio ou perfil inventado; saiu o `papel: "ADMIN"` provisório do Bloco 1.
- **Permissões** (novo item "Permissões" no menu de cada pessoa): trocar o perfil (volta ao padrão dele), ajustar área por área ("Sem acesso", "Pode ver", "Pode alterar" e a caixa "Pode excluir e desfazer", que só vale com "Pode alterar"; Painel só tem "ver"), os dois acessos "Pode ver valores" e "Pode ver custo e margem" (custo só com valores) e a prévia **"O que esta pessoa vê"** (menu e os dois acessos, calculados ao vivo pela regra pura; avisa quando a pessoa será administradora). Só o que difere do perfil vira ajuste (`ajustesDeDiferenca`, na regra pura); nada diferente = perfil puro.
- **Ação `alterarPermissoesUsuario`:** exige Configurações "Pode alterar"; Zod estrito (`alterarPermissoesSchema`); tudo ou nada sob o lock dos usuários ativos; `versaoSessao` + 1 (a sessão da pessoa cai e vale na hora); `LogAuditoria` com perfil e ajuste de antes e de depois (ação `ALTERAR_PERMISSOES`); a senha nunca aparece (a temporária de novo usuário e de redefinição continua sendo mostrada uma única vez, como antes).
- **Último administrador (decisão 179):** regra pura `contarAdministradoresAtivos` (administrador = ativo com Configurações "Pode alterar", por perfil ou ajuste). Recusam, sob o lock: desativar o último administrador ativo, rebaixá-lo por perfil ou por ajuste, e a própria pessoa se rebaixar sendo a última (mensagens em português simples dizendo para dar o perfil a outra pessoa antes). Com outro administrador ativo, tudo é permitido.
- **Lista:** selo do perfil, "Ajustes personalizados" e "Ajuste inválido: acesso fechado" (ajuste fora do formato fecha o acesso de quem não é administrador; o de administrador volta ao perfil puro); o texto "por enquanto todos veem e fazem tudo" saiu.
- **Testes:** `tests/unit/usuarios-permissoes.test.ts` (contagem de administradores com perfil, ajuste, desativação e ajuste inválido; ida e volta dos ajustes; schemas estritos; as ações contra um banco EM MEMÓRIA: último administrador recusado por perfil e por ajuste, promover outra pessoa libera, ajuste inválido não toca o banco, quem não altera Configurações não mexe, auditoria com antes e depois, sessão derrubada) e `tests/integration/usuarios-administrador.test.ts` (somente leitura no banco real: há administrador ativo, perfis conhecidos, nenhum ajuste fora do formato, Dono sem ajuste com acesso total). Os 3 E2E de `usuarios.spec.ts` que criam usuário passam a escolher o perfil; os E2E novos da tela (trocar perfil, ajuste, prévia, último administrador) entram no Bloco 9.
