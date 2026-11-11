# Revisão sênior — Fase 1 (Cadastros)

Data: 2026-11-12. Escopo: commits de `3eb1f43` até o fim da fase (modelo de dados, domínio e leitor de planilhas, clientes e parceiros, fornecedores, funcionários e equipes, produtos e reajuste em lote, importação, busca global e lixeira, painel e documentação).

## Como foi revisado
1. **Revisor independente (subagente de contexto limpo)**: recebeu só os requisitos da fase e o `git diff`, sem o histórico da conversa. Li cada achado e conferi no código antes de aceitar. Ele leu as Server Actions, consultas SQL, migração, rotas de exportação e a lista de testes; **não** leu os componentes de tela nem os testes E2E.
2. **Execução (não só leitura):** `typecheck`, `lint`, testes unitários, testes de integração com o banco real, `build` e a suíte E2E (Playwright) completa em desktop e celular (390 px).
3. **Revisão visual:** capturas das telas principais em desktop e celular (lista e ficha de cliente, endereços, linha do tempo, fornecedores, produtos, reajuste, importação, equipes, lixeira, painel). Nada cortado; cartões no celular mostram etiquetas e contato.

## Achados e o que foi feito
Nenhum **crítico**. Corrigidos nesta fase:

| # | Severidade | Achado | Ação |
|---|---|---|---|
| 1 | Alto | Desfazer importação mandava para a lixeira registros criados que foram editados ou usados depois | Só sai o que continua como a importação deixou (sem edição posterior; cliente sem anotação nem tarefa). O resto fica e é contado ("ficaram porque já foram alterados ou usados depois"). Testes de integração |
| 2 | Alto | Importação em modo "atualizar" fazia 3 idas ao banco por linha (risco de estourar o tempo) | Produtos existentes em uma consulta, histórico de preço em lote; `maxDuration = 60` na página de importação |
| 3 | Médio | Editar produto com formulário velho desfazia um reajuste em lote e gravava histórico falso | O formulário envia o custo que mostrava; se a pessoa não mexeu no campo, vale o custo do banco; se mexeu e o custo mudou no meio-tempo, recusa com aviso |
| 4 | Médio | Apagar um custo já informado deixava buraco no histórico | Passou a ser recusado ("informe o valor correto") |
| 5 | Médio | CNPJ de fornecedor e CPF de funcionário só eram únicos na aplicação (corrida) | Migração `20261112120000_unicidade_cnpj_cpf`: índices únicos parciais entre não excluídos |
| 6 | Médio | Mensagem enganosa ao vincular usuário preso a funcionário na lixeira | Mensagem própria explicando que está na lixeira |
| T | — | Nenhum teste chamava `aplicarReajuste` | Núcleo extraído (`aplicarReajusteNoBanco`) e testado com o banco real: assinatura velha recusada, histórico por produto, auditoria, produtos de outro fornecedor/inativos intocados, segunda aplicação recusada |

## O que NÃO foi corrigido, e por quê (registrado em `docs/PENDENCIAS.md` / dívida)
- **Salário e custo por hora em claro na auditoria e nos dados da lista** (Médio): enquanto não há perfis de acesso todos veem tudo; a exportação já os omite e há aviso na tela. Mascarar na auditoria e restringir por permissão quando existirem perfis.
- **Duplicidade de cliente ignora contatos adicionais** e a checagem não é atômica com a gravação (Médio/baixo impacto: é só aviso). Padronizar com a importação na Fase 2.
- **Indicação circular** (A indica B e B indica A) é aceita (Baixo). Documentado.
- **Vínculo funcionário↔usuário** continua único mesmo com funcionário na lixeira (a unicidade é do Prisma, 1-para-1). Hoje há mensagem clara; revisar com perfis.
- **Restaurar da lixeira** e **inativar/excluir em lote** fazem consultas por item (até 200 por vez); aceitável, otimizar se ficar lento (Baixo).
- **`bodySizeLimit` de 5 MB vale para todas as Server Actions** (a importação precisa; nenhum upload passa por Server Action) e busca por dígitos com `LIKE '%…%'` sem índice trigram em CPF/telefone (Baixo; só pesa com muitos milhares de clientes).
- **Exportações sem `can(..., "exportar")`** e **`FiltroSalvo` excluído fisicamente** (exceção justificada em DECISOES 36), **reversão de lote com uma auditoria só** (o rastro por registro está nos itens do lote) — Baixos.

## Verificação de aderência à spec (seção 14, Fase 1)
- Clientes (endereços, contatos, duplicidade, indicadoPor, linha do tempo), Parceiros, Fornecedores, Funcionários e Equipes, Produtos/insumos (categorias, histórico de preço, reajuste em lote com prévia), Importação CSV/XLSX, busca global completa e lixeira: **entregues**.
- **Aceite 1 — importar 300 produtos de exemplo com validação:** teste de integração e E2E importam 300 produtos fictícios com 4 linhas com erro e 1 repetida de propósito; erros apontam o motivo; só as válidas entram; desfazer funciona.
- **Aceite 2 — reajuste em lote registra histórico:** uma linha de histórico por produto (origem "reajuste em lote"), mais auditoria do lote.
- **Aceite 3 — busca ignora acentos:** "joao conceicao" acha "João Conceição" (integração e E2E), inclusive na busca global.
- **Fora desta fase por dependência de outras:** projetos indicados de parceiros e importação da tabela de preços (Fases 2 e 3); "sem contato há 12 meses" usa a linha do tempo como aproximação.

## O que não foi testado / limites honestos
- Leitura de um **`.xlsx` real** (os testes usam CSV); precisa ser conferida com uma planilha do Excel da Pontual.
- **`seed:demo`** só teve o bloqueio de segurança verificado; não foi executado no banco compartilhado.
- **Desempenho com milhares de linhas em modo "atualizar"** e o limite real de duração de função na Vercel Hobby não foram medidos.
- Acessibilidade foi conferida por rótulos, papéis ARIA e testes de teclado/foco indiretos (Playwright), não por leitor de tela.

## Como foi testado
`npm run typecheck`, `npm run lint`, `npm test` (267 testes unitários), `npm run test:integracao` (43 testes, banco real), `npm run build` e `npm run test:e2e` (desktop + celular). E2E completo: 289 passaram, 3 ignorados de propósito (testes só de desktop), 0 falhas.
