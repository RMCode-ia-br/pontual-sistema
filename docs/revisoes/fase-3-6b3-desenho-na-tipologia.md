# Fase 3.6b-3 — Desenho na tipologia e "Salvar este desenho como nova tipologia"

Pedido do Régis, a partir do Luan e do Marcelo: o desenho que o Marcelo faz no Word deve poder ser guardado na tipologia e reaparecer sozinho nas próximas propostas que a usarem; e o desenho de um item deve poder virar uma nova tipologia. Blocos 0 a 5 entregues, cada um com commit e push, mais a correção da revisão sênior. Decisões 165–174 em `docs/DECISOES.md`.

**Prioridade única do desenho: imagem do ITEM > imagem da TIPOLOGIA > desenho automático por tipo.** Sem imagem em nenhum dos dois lugares, tudo é exatamente como antes (provado nos 26 PDFs, abaixo).

## O que foi entregue
- **Tipologia com desenho (Blocos 1 e 2):** aba "Desenho" no cadastro (colar, arrastar ou escolher PNG/JPG, prévia, trocar, voltar ao automático, tamanho Normal/Grande salvo na hora), com o aviso fixo "Mudar o desenho afeta propostas em rascunho que usam esta tipologia. As propostas já enviadas não mudam." A imagem é um `Anexo` (`desenho-tipologia`, bucket privado) com o MESMO envio do item: núcleo `src/lib/imagem/envio.ts` e campo de tela `src/components/desenho/campo-desenho.tsx`, que servem o item e a tipologia (o item manteve textos e comportamento da 3.6b-1). Migração `20261127000000_desenho_tipologia` (aditiva: 4 colunas, 2 índices, 2 FK em `Tipologia`).
- **Regra única (Bloco 1):** `resolverDesenhoDoItem` é a única decisão (genérica no tipo da imagem): o snapshot, o cartão do editor, o diálogo e os dois PDFs passam por ela. A origem (`ITEM` ou `TIPOLOGIA`) define o tamanho.
- **Proposta e PDFs (Blocos 3 e 4):** rascunho acompanha a tipologia ao vivo; ao enviar (ou aprovar rascunho direto) o snapshot guarda a imagem JÁ RESOLVIDA (caminho + SHA-256, mesmas chaves de antes); proposta enviada nunca relê a tipologia, nem no PDF, nem na comparação, nem no CARTÃO (achado do Bloco 4: o cartão lia a tipologia ao vivo; agora lê o snapshot) nem nos links assinados. No diálogo: imagem herdada com prévia, "Tamanho definido na tipologia: Normal" (o seletor some), "Voltar ao desenho da tipologia" quando há imagem própria e da tipologia, e o link da imagem de outra tipologia vem sob demanda ao trocar a tipologia (`desenhoDaTipologiaParaTelaAcao`).
- **"Salvar este desenho como nova tipologia"** (painel no diálogo de edição de rascunho): nome obrigatório, tipo de desenho (12, pré-selecionado), modelo da descrição editável, aviso de que composição e preços ficam em branco. Mesmo `Anexo` (nenhum arquivo copiado), NADA comercial copiado ou inventado, nasce "criada de uma proposta, revisar" (selo na lista e no cadastro, aviso do que falta e "Marcar como revisada" com auditoria), idempotente contra clique duplo e chamadas paralelas, nome repetido recusado sem diferenciar maiúsculas (inclusive tipologia inativa).
- **Configuração estrita:** `desenhoConfig` (item e tipologia) só aceita `null` ou `{ "tamanhoDesenho": "GRANDE" }`; nenhum dado existente é recusado (0 de 26 itens e 0 de 14 tipologias têm configuração, conferido só em leitura).
- **Anexo compartilhado:** só recebe exclusão lógica sem item vivo e sem tipologia viva; `excluirAnexo` recusa os dois desenhos pela função pura `motivoDeRecusaDeExclusaoDoAnexo`. O arquivo do Storage nunca é apagado.
- **PDF, Bloco 5 (pendência da 3.6b-1):** a "página 1 só com o cabeçalho" tinha como causa o `marginBottom` do bloco da opção (ver abaixo). Corrigido com `paddingBottom`.

## Causa da pendência do Bloco 5
No react-pdf (`shouldBreak` em `@react-pdf/layout`), um elemento que CABE na página é empurrado para a seguinte quando o fim dele mais a sua `marginBottom` passa do limite. O bloco da opção (itens + totais) tinha `marginBottom` de 10 pt (proposta) e 8 pt (folha de produção); quando terminava nos últimos pontos da página, o bloco inteiro ia para a página 2 (numa janela de ~10 pt de altura, por isso o defeito parecia aleatório e sumia com um cabeçalho um pouco maior). Acontecia também SEM imagem (já existia antes do recurso). Correção: `paddingBottom` (mesmo espaço visual, mas dentro da caixa, que então é dividida). Na folha de produção o último bloco fica sem espaço (nada vem depois dele; o espaço sozinho criava uma página só com o rodapé, regressão achada na revisão sênior e corrigida).

## Prova "sem imagem o PDF é igual ao anterior" (26 PDFs)
Os 26 PDFs: 6 de fixture e 7 propostas reais enviadas (ids fixados), proposta e folha de produção. O "antes" foi gerado com o código do HEAD antes de cada edição de PDF. Método: texto com posições (pdfjs `getTextContent`) e todas as operações de desenho de cada página (`getOperatorList`, normalizando o prefixo `g_dN_` dos ids de fonte). Os bytes sempre diferem. Resultado após o Bloco 3, após o Bloco 5 e após a correção da revisão: **26 de 26 idênticos em texto e em operações, mesmo número de páginas** (uma geração isolada saiu sem a logo da empresa por falha transitória do Storage e foi repetida: ver APRENDIZADOS). Como a comparação é por operações, não por pixels rasterizados, o ruído conhecido de 8–14 px (renderização) não entra.

Regressão de paginação: `tests/unit/pdf-paginacao.test.ts` (7 testes). De 1 a 10 itens, sem imagem, Normal e Grande, proposta e produção: todos os itens aparecem, em ordem, e o item 1 fica na página 1; a página 1 nunca fica só com o cabeçalho (varredura da altura do cabeçalho e da observação do item 1); a última página da folha de produção nunca fica vazia. Os testes que cobrem o defeito FALHAM sem as correções. Nenhum teste fixa tamanho de caixa nem número exato de páginas.

## Testes da fase (por área, de dia; a suíte completa fica para o fim)
| Camada | O que cobre | Resultado |
|---|---|---|
| Unitário `desenho-item` | tabela de prioridade (item × tipologia × tamanhos × arquivada × removida), Zod estrito, recusa de exclusão de anexo | 53 verdes |
| Unitário `pdf-paginacao` | paginação e página vazia (acima) | 7 verdes |
| Integração `tipologias-desenho` | definir, trocar, remover e tamanho na tipologia; salvar como nova tipologia (nome repetido, clique duplo e paralelo, mesmo `Anexo`, nada comercial); anexo compartilhado | 18 verdes |
| Integração `propostas-desenho-tipologia` | herda, item vence, remover volta à tipologia, rascunho acompanha, arquivada vale, enviar congela, aprovar rascunho direto, comparação, PDF Normal e Grande, mensagem de imagem incompleta | 14 verdes |
| E2E `tipologias-desenho` (desktop e 390 px) | cadastro: colar, tamanho, formato recusado, voltar, selo e "Marcar como revisada", reversão do tamanho quando o servidor recusa | 7 por projeto |
| E2E `propostas-desenho-tipologia` (desktop e 390 px) | cartão e diálogo herdados, troca de tipologia sob demanda sem gravar nada, imagem própria vence, PDFs dentro da caixa (constantes), tamanho Grande herdado, "voltar", salvar como nova tipologia (duplo clique = uma), segunda proposta, enviada somente leitura com imagem congelada, Storage indisponível | 12 por projeto |

Regressão da 3.6b-1 depois das extrações (`envio.ts` e campo de desenho): integração do item e do PDF e os 4 specs E2E do desenho do item passaram.

## Revisão sênior (subagente de contexto limpo, somente leitura)
Pedida atenção a: decisão única e proposta enviada sem ler a tipologia ao vivo; "salvar como nova tipologia"; aposentar anexo compartilhado; extrações sem mudar a 3.6b-1; Zod estrito; URLs sob demanda e Storage indisponível; margens do PDF em casos longos; locks. **Sem achado** em todos os pontos, exceto:

**Importante (corrigido, commit `52cab04`):**
1. Folha de produção ganhava uma página final VAZIA (só o rodapé) em ~0,5% dos casos por causa do `paddingBottom` do último bloco (regressão do Bloco 5). Reproduzido por sonda própria (NORMAL, 4 itens, cabeçalho +10 a +12: 12 casos em 960) e corrigido com o último bloco sem espaço (0 casos). Teste novo, que falha sem a correção. Os 26 PDFs foram comparados de novo: idênticos.

**Pendência (para PENDENCIAS):** título da opção órfão no pé da página (já existia; 18–24% das propostas com 2 ou 3 opções); margens positivas pequenas em `FormasDePagamento` e outros blocos curtos; corrida antiga de `aposentarDesenhoSeSemUso` (mais um leitor); diálogo do item com tipologia inativa; `excluirTipologias` conferindo "em uso" fora da transação. **Corrigidas na hora (baixas):** mensagem enganosa de imagem incompleta herdada da tipologia; `desenhoConfig` legado conferido no banco (nenhum).

**Varredura de PDF (cerca de 9.300 renderizações, antes × depois):** propostas de 3 a 40 itens, 1 a 3 opções, com e sem seções, com 4 formas de pagamento extras em duas colunas, com e sem nota fiscal e desconto, sem imagem e com imagem Normal, Grande e mista, alturas do conteúdo variadas (título, nome do cliente, endereço, observações). Texto, ordem e conteúdo idênticos em todos os pares; nenhuma página a mais além do caso corrigido; 13 casos da grade e 4 da varredura fina melhoraram (a página 1 que ficava só com o cabeçalho). Limitação: a janela de ~10 pt foi coberta por amostragem, não exaustivamente.

## Lista da 7C (permissões; hoje `can(…)` libera tudo)
- Quem cria e edita tipologias.
- Quem sobe, troca, remove e muda o tamanho (Normal/Grande) do desenho da tipologia.
- Quem usa "Salvar este desenho como nova tipologia" (cria uma tipologia a partir de um item de proposta).
- Quem marca uma tipologia como revisada (tira o selo "criada de uma proposta, revisar").
- (Da 3.6b-1, continua: quem sobe, troca e remove a imagem do item e muda o tamanho dele.)

## Fica para depois
- **3.6b-2:** editor de desenho (desenhar dentro do sistema, em vez de colar imagem).
- Tamanho por item mesmo com imagem herdada (hoje o item herdado usa o da tipologia; decidir depois do uso real).
- "Salvar como nova tipologia" a partir do cartão do item ou de proposta enviada (hoje só no diálogo de edição de rascunho).
- Título de opção órfão e margens pequenas no PDF (PENDENCIAS).

## Em aberto e sem teste
- Ctrl+C direto do Word real (continua sem teste; orientação do recorte de tela).
- Falha de rede no envio do desenho da tipologia (o "tentar de novo" existe só no item novo e foi coberto lá).
- Navegação por teclado e leitor de tela do campo de desenho.
- Capturas do diálogo mostram só a parte visível (diálogo rolável); a barra inferior do celular aparece sobreposta em capturas de página inteira (artefato).
- Janela de ~10 pt do defeito de paginação coberta por amostragem.

## Auditoria de `Anexo`
Nenhuma listagem de anexos mostra o desenho da tipologia (`Tipologia` não está em `ENTIDADES_COM_ANEXO`; o upload genérico recusa); `excluirAnexo` recusa a categoria `desenho-tipologia` e a entidade `Tipologia`; fotos e portfólio filtram `entidadeTipo = "Projeto"` e `categoria = "foto-obra"`.

## Commits
`d052f1d` (migração), `0a2133f` (Bloco 1), `048dbd5` (documentação), `270b2ce` (Bloco 2), `f7616f0` (Bloco 3), `bd90867` (Bloco 4), `9f67628` (Bloco 5), `52cab04` (correção da revisão sênior), `bf3b734` (teste E2E frágil do logo).

## Verificação final (suíte completa)
Rodada única em 27/11/2026 sobre o commit congelado `52cab04` (árvore de trabalho só com documentação), com a hora de cada linha gravada e a conexão com o banco conferida antes de cada etapa. Luan e Marcelo estavam avisados e fora do sistema.

| Etapa | Início | Fim | Resultado |
|---|---|---|---|
| Unitários | 16:02:18 | 16:03:47 | **1.614 de 1.614** (90 arquivos; base 1.571, 43 novos), 0 ignorados |
| Integração | 16:03:47 | 16:25:18 | **588 de 588** (44 arquivos; base 556, 32 novos), 0 ignorados |
| Build | 16:25:18 | 16:26:57 | ok |
| E2E | 16:26:58 | 17:57:41 | **757 passaram, 1 falhou, 1 não rodou, 19 ignorados** (os mesmos da base) |

Base do E2E: 673 passaram na 1ª rodada da 3.6b-1 e 48 foram refeitos e passaram (721); com os 38 E2E novos desta fase, o esperado era 759. Faltaram exatamente a falha e o teste que não rodou por causa dela (grupo em série).

### A falha da rodada completa (teste frágil, não regressão)
- **17:22:39**, projeto celular: `configuracoes.spec.ts:124` "recusa arquivo que não é imagem como logo", estouro de 30 s esperando o aviso (o teste seguinte ficou sem rodar). No desktop o mesmo teste passou em 4,1 s às 16:37:42.
- **Não foi rede:** no trace há 83 requisições, nenhuma lenta ou com erro (Storage respondeu 200 em 193 ms) e o banco respondeu normal. **Nenhum erro de console ou de hidratação.**
- **Causa:** o `setInputFiles` rodou 50 a 80 ms depois do último script da página e ANTES de a página hidratar (as requisições de pré-carregamento de rotas, que o Next só faz depois de hidratar, começaram depois do `setInputFiles`). O navegador disparou o `change`, mas o React ainda não escutava o evento: nenhuma ação do servidor foi chamada.
- **Reexecução (18:00:26)** só do grupo: falhou de novo, em outro teste do mesmo grupo ("troca o logo", 30,8 s; mesmo trace). Parei e medi.

### Medição (arquivo `configuracoes.spec.ts`, projeto celular, servidor de produção novo a cada execução)
| Cenário | Execuções | Falhas |
|---|---|---|
| `52cab04` com build limpa | 5 | **1** (execução 3: "troca o logo", 18:45:50) |
| Commit base da 3.6b-1 (`582f8ef`, pasta isolada fora do repositório, build e segredos próprios) | 5 | **1** (execução 3: "recusa arquivo que não é imagem como logo", 19:06:53) |
| `52cab04` + teste corrigido | 5 | **0** (14 de 14 testes em cada) |

O commit base também falha, então **não é regressão da fase** (nenhum arquivo da fase está no caminho do logo, `form-empresa.tsx`). A configuração real da empresa foi restaurada pelo próprio teste (`atualizadoEm` continua 17/11/2026, sem usuário nem anexo de teste sobrando).

### Correção do teste (commit `bf3b734`, só `tests/e2e/`)
Ajudante `aguardarHidratado` (`tests/e2e/ajudantes.ts`): espera o React marcar o nó (`__reactProps$…`) antes de escolher o arquivo; usado nos dois testes do logo. **Limite honesto:** 5 de 5 com a correção contra 1 de 5 sem ela não é prova estatística; a confiança vem do mecanismo (trace). A rodada completa NÃO foi repetida; o grupo que falhou passou 5 de 5 no arquivo corrigido.

**Resumo:** unitários e integração 100%; E2E 757 de 759, com 1 falha de teste frágil (corrigida e verificada) e 1 teste que não rodou por causa dela (verificado junto). Commit verificado: `52cab04`, mais o commit do teste `bf3b734`.

## SQL de volta da migração
```sql
ALTER TABLE "Tipologia" DROP CONSTRAINT "Tipologia_criadaDeItemId_fkey";
ALTER TABLE "Tipologia" DROP CONSTRAINT "Tipologia_desenhoAnexoId_fkey";
DROP INDEX "Tipologia_criadaDeItemId_idx";
DROP INDEX "Tipologia_desenhoAnexoId_idx";
ALTER TABLE "Tipologia" DROP COLUMN "criadaDeItemId", DROP COLUMN "desenhoAnexoId",
  DROP COLUMN "desenhoConfig", DROP COLUMN "revisarCadastro";
```
Validação feita com BEGIN/ROLLBACK antes de aplicar (contagens de `Tipologia` 14, `ItemProposta` 26 e `Anexo` 11 iguais antes, dentro e depois; 4 colunas, 2 índices e 2 FK criados dentro; nada restou após o ROLLBACK), aplicada com `npm run db:deploy` com OK do dono.
