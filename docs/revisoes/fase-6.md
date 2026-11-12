# Revisão sênior — Fase 6 (Estoque e compras)

Data: 2026-11-12. Escopo: `a6645b8..HEAD` — Bloco 0 (fluxo projetado conta os vencidos e "cliente pediu até o dia X") e Blocos 1 a 8: modelo de dados e regras puras; produtos, perfis por kg, estoque e cadastro na hora; custo de material informado na proposta; retalhos e sucata; compras e recebimento; aba "Materiais e compras" da obra; custo real e margem por obra; painel e relatório de estoque; demonstração. Um commit por bloco.

## Regras do dono aplicadas (prevalecem sobre a spec)
- **Imposto na margem, opção B (decisão do dono):** receita da margem = valor fechado − acréscimo de nota; o acréscimo aparece como "repasse de imposto, fora da margem". Nenhuma alíquota, nenhuma nota fiscal, nenhum Simples.
- **Custo do produto a cada compra = último custo** (decisão do dono); recebimento sem preço entra "sem custo" e não mexe no custo.
- **Nada inventado:** preço do kg, peso por metro, comprimento da barra, retalho mínimo, mão de obra por m², estoque inicial, perdas e custos nascem vazios, com aviso na interface e em `docs/PENDENCIAS.md`. Custo desconhecido deixa a margem **"Incompleta"**, nunca zero.
- **A compra gera conta a pagar, mas o custo da obra lê o recebimento da compra**, nunca a conta a pagar.
- **Alumínio por kg:** perfis com custo por kg, preço do kg por acabamento (e linha), compra por kg ou barras com conversão informada, custo de material informado do programa só interno (fora do snapshot e do PDF). **Plano de corte e integração com o programa da linha Suprema não foram construídos** (evolução futura, decisão 108-j; arquivos de exemplo pedidos ao dono em PENDENCIAS).
- **Dados reais no banco compartilhado:** as duas migrações (`20261117000000_prorrogacao_receber`, `20261118000000_estoque_compras`) foram mostradas, validadas numa transação com ROLLBACK, aplicadas só com o OK do dono e o código foi para o GitHub depois. Testes só tocam registros com prefixo; `seed:demo` **não** foi executado.

## Critérios de aceite
1. **Nenhum custo contado duas vezes:** provado em `tests/integration/custo-obra.test.ts` contra uma **soma SQL independente** (R$ 6.200,00 = vidro R$ 3.000 + estoque R$ 400 + frete R$ 1.000 + avulso R$ 200 + mão de obra R$ 1.600; margem R$ 3.800 = 38% sobre R$ 10.000), com compra OBRA + conta a pagar ligada + pagamento + saída de estoque + devolução estornada + despesa avulsa. O revisor independente tentou refutar (estorno, recebimento estornado, compra cancelada, conta cancelada, transferência, lançamento de conta a receber) e não achou dupla contagem.
2. **Baixa de obra gera retalho conforme a regra:** `destinoDaSobra` (sobra ≥ mínimo → retalho; menor → sucata em kg; sem sobra → nada; **mínimo vazio → pergunta, nunca presume**), barra sem comprimento recusada, concorrência com `FOR UPDATE` e `pg_advisory_xact_lock`, estorno que desfaz retalho e sucata.
3. **A margem mostra a origem de cada custo** (com link para o registro) e **estimado × real** só de material.

## Como foi revisado
1. **Revisor independente (subagente de contexto limpo, somente leitura):** recebeu as regras do dono, os critérios de aceite e o diff. Cada achado foi conferido no código antes de corrigir. **Nenhum crítico.**
2. **Mutações de sanidade** (3 regras, todas derrubaram exatamente o teste esperado; desfeitas): presumir retalho quando o mínimo está vazio; fazer o retalho usado custar R$ 1,00 na obra; não contar o produto "sem custo" na posição do estoque.
3. **Execução (depois das correções):** `typecheck`, `lint` e `build` limpos; **1.041 testes unitários passam**; **345 de integração, 340 passam e 5 falham** (todos de `importacao.test.ts`, ver abaixo, não é regressão da fase); **E2E completo em desktop e celular 390 px: 559 passaram, 15 puladas (as condicionais de sempre), 4 falharam e 22 não rodaram.** As 4 falhas são de `fornecedores.spec.ts` e `importacao.spec.ts` (causa abaixo); **não verifiquei quais são os 22 que não rodaram** (provavelmente testes seguintes dessas duas specs, que são seriais).
4. **Revisão visual:** as telas novas são verificadas por `semRolagemHorizontal` nos specs, em desktop e celular de 390 px (painel, relatório de estoque, movimentações, retalhos, preço do kg, compras, aba Materiais e compras, aba Custo e margem, margem por obra). Não foram tiradas capturas separadas nesta revisão.

## Achados e o que foi feito
| # | Sev. | Achado | Ação |
|---|---|---|---|
| A1 | Alto | `lerQuantidade` tratava o ponto como milhar sem validar: "2.5" virava 25 (movimento, compra, contagem, sucata) | Ponto só é milhar com agrupamento válido; "2.5" é 2,5; ambíguo é recusado; testes |
| M1 | Médio | Promessa de pagamento ficava valendo depois de o vencimento ser corrigido para depois dela (saldo projetado otimista) | Promessa ≤ vencimento é ignorada; teste |
| M3 | Médio | Lista de materiais e "montar compra do que falta" ignoravam o que já saiu/foi recebido para a obra (pedido em dobro) | A falta desconta saídas líquidas e recebimentos de compras OBRA; a tela mostra "já entregue à obra"; teste de integração |
| M4 | Médio | "Custo real acima do estimado" comparava o total (com mão de obra e despesas) com um estimado só de material | Compara só o material real (compras da obra + estoque); texto "material real"; teste |
| M5 | Médio | Não dava para estornar saída de obra depois de CANCELADA/PERDIDA | Estorno não revalida a situação da obra; nova saída continua recusada; teste de integração |
| B1 | Baixo | Data do estorno e do ajuste de sucata em UTC (depois das 21h saía amanhã) | `dataLocalDoInstante` |
| B2 | Baixo | Arredondamento assimétrico: saída e devolução de 1,5 un a R$ 3,33 deixavam R$ 0,01 | Arredonda o valor absoluto e aplica o sinal; teste |
| B3 | Baixo | `de=2026-13-01` na URL das movimentações derrubava a página | Valida com `inputParaData` |
| B6 | Baixo | Peso por metro zero virava sucata de 0 kg sem comprimento | `pesoDaSucata` trata ≤ 0 como "sem peso"; teste |

## O que NÃO foi corrigido, e por quê (em `docs/PENDENCIAS.md`, seção "Da revisão sênior da Fase 6")
Devolução pelo custo atual (não o da saída), devolução de obra cancelada, mão de obra rateada × conta a pagar terceirizada sem aviso, mão de obra por m² sempre pelo valor atual, duas compras ativas para a mesma medida de vidro, recebimento só com valor total sem atualizar o custo, estorno de recebimento com saldo consumido sem aviso, peso por metro zero no cadastro, teto de valores nas compras, truncamento e produtos inativos no relatório de estoque, 6.000 mm assumido no cadastro rápido, metros → barras sem plano de corte, testes de integração que alteram o singleton de Configurações. Nenhum tem cenário explorável hoje (um gestor, mês de teste) e todos têm correção conhecida.

## Honestidade sobre o processo
- **Um commit (`3545ec6`) entrou com um teste unitário falhando** (`sessao-obrigatoria`: uma função auxiliar exportada de um arquivo "use server" sem exigir sessão). Foi corrigido no commit seguinte (`f60600c`), antes de qualquer outra coisa depender dele. Lição em APRENDIZADOS: rodar a suíte completa antes de commitar.
- **Uma primeira rodada do E2E completo teve 43 falhas**, coincidindo com as minhas rodadas de testes de integração e unitários no mesmo banco. Rodando de novo sem nenhuma outra atividade, sobraram só as 4 falhas abaixo; a causa da primeira rodada foi a interferência (não investiguei teste a teste).
- **Falhas que ficaram (`importacao` e `fornecedores`):** o teste de integração e o E2E da importação dependem de fornecedores semeados pelo nome ("Pontimac", "Dafel") e o dono, que usa o sistema, excluiu um e renomeou outro (o importador passou a ver 226 linhas novas em vez de 300; confirmei isso no banco, somente leitura). Para `fornecedores.spec.ts` (não achou "Nova Opção" na lista) a causa é provavelmente a mesma mudança nos cadastros reais, mas não a confirmei. **É dívida de teste, não de código** da Fase 6, mas é uma falha real na suíte que ficou aberta (PENDENCIAS): os testes precisam criar os fornecedores de que precisam, com prefixo.
- **`seed:demo` de estoque e compras foi escrito e passa no typecheck e no lint, mas não foi executado** (banco com dados reais); não sei se roda sem erro num banco vazio.
- **Cadastro na hora** (`CampoProduto`/`CampoFornecedor`) é exercitado pelo E2E de compras, não por teste unitário próprio.
