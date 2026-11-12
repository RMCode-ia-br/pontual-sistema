# Revisão sênior — Fase 5 (Financeiro)

Data: 2026-11-12. Escopo: `2d1506c..HEAD` (Bloco 0 de feriados e os Blocos 1 a 6 da Fase 5, um commit por bloco): feriados de Macaé; modelo de dados e regras puras; contas e lançamentos; contas a receber; contas a pagar; visão geral, fluxo de caixa, DRE e relatórios; painel, E2E do ciclo de aceite e demonstração.

## Regras do dono aplicadas (prevalecem sobre a spec)
- **Fora do escopo:** notas fiscais (R16), RBT12 e alerta do Simples (R17), alíquota. Ficam só a marca `comNotaFiscal` e o acréscimo de 5% que já existia. Imposto = despesa real "Impostos (DAS)" lançada à mão; DRE gerencial. O menu "Notas fiscais" não foi construído e a alíquota e o limite do Simples saíram da tela (colunas continuam no banco, sem uso).
- **Contas financeiras nascem vazias:** nenhum saldo inventado ("saldo não informado" com aviso no fluxo, no DRE e nas contas); informar ou corrigir o saldo depois não quebra o histórico.
- **Tudo que é parâmetro está em Configurações:** vence em breve, lembrete de cobrança, horizonte das recorrências, categoria sugerida, categorias, gatilhos e condições de pagamento. Mapa gatilho → etapa **confirmado pelo Marcelo**.
- **Mês de teste com dados reais** (decisão 101): nenhum bloqueio nem aviso por privacidade; só proteção contra apagar ou poluir dados (testes com prefixo, sem `seed:demo` no banco real).
- **Banco compartilhado:** a migração foi mostrada, validada dentro de uma transação com ROLLBACK, aplicada só com o OK do dono, e o código que a usa foi para o GitHub depois do banco.

## Como foi revisado
1. **Revisor independente (subagente de contexto limpo, somente leitura):** recebeu as regras do dono, os critérios de aceite e o diff. Cada achado foi conferido no código antes de corrigir; nenhum crítico ou alto.
2. **Execução (depois das correções):** `typecheck`, `lint` e `build` limpos; **937 testes unitários** e **255 de integração** (banco real, dados "Int ...") passam; **E2E completo em desktop e celular 390 px: 519 passaram, 15 puladas** (as mesmas condicionais de antes: capturas de identidade e testes só de computador; 0 falhas; 1 h).
3. **Mutações de sanidade:** trocar a recusa de pagamento acima do saldo, a "última parcela absorve a diferença" e o `skipDuplicates` das recorrências derrubou 10 testes esperados (5 unitários e 5 de integração); desfeitas.
4. **Revisão visual:** capturas da visão geral, do DRE (desktop e celular) e do painel. Corrigidos: rótulos do eixo do gráfico quebrando em duas linhas e seção "Por categoria" vazia sem explicação. Sem rolagem horizontal da página em nenhuma tela nova (`semRolagemHorizontal` nos specs; o DRE rola só dentro da própria tabela).

## Achados e o que foi feito
Nenhum **crítico** ou **alto**.

| # | Sev. | Achado | Ação |
|---|---|---|---|
| 1 | Médio | Concluir, reabrir e concluir a etapa de novo deixava a parcela aberta **sem tarefa de cobrança** (a chave única mantinha a tarefa cancelada) | A abertura reabre a tarefa cancelada com o novo vencimento (por etapa e na liberação manual); teste de integração |
| 2 | Médio | Conta a pagar impossível de pagar se a categoria foi inativada depois de criada | O pagamento aceita o vínculo que já está no título; conta nova continua exigindo categoria ativa; teste |
| 3 | Médio | Saldo projetado ignorava contas a pagar vencidas (otimista) | O a pagar vencido sai no primeiro período (e é mostrado à parte); o a receber vencido continua fora; decisão conservadora, **a confirmar com o Marcelo** (PENDENCIAS); testes |
| 4 | Médio | Recorrência com início antigo (ou ano errado) gerava dezenas de contas atrasadas | Só nascem as ocorrências do mês anterior em diante; teste |
| 5 | Médio | Totais "a receber/a pagar nesta lista" somavam as canceladas | Canceladas ficam fora dos totais |
| 6 | Médio | Antecipar o fim da recorrência não cancelava as ocorrências já geradas | Cancela as abertas e sem pagamento depois do novo fim; teste |
| 7 | Médio | Parcelamento de valor pequeno podia gerar parcela zero ou negativa (a última recebia `total − soma`) | Piso por parcela, a última absorve o resto; testes de bordas (R$ 0,08 em 5x, R$ 1,00 em 60x) e asserção de que nenhuma parcela é menor que 1 centavo |
| 8 | Baixo | Possível deadlock ao estornar as duas pontas de uma transferência ao mesmo tempo | Travam-se todas as pontas numa só consulta, em ordem de id |
| 9 | Baixo | Reverter a liberação da parcela e cancelar chamado liam a conta sem travar | `FOR UPDATE` antes de decidir e `updateMany` filtrado por status e valor pago |
| 10 | Baixo | Realizado do fluxo incluía contas inativas (o saldo do mesmo cartão, não) | Só contas ativas |
| 11 | Baixo | Consulta de ocorrências existentes lia todo o histórico | Só competências do mês de hoje em diante |
| 14 | Baixo | Chave duplicada na seção "Sem categoria" do DRE; comentário desatualizado | Corrigidos |
| 15 | Baixo | Reabrir conta cancelada reabria a tarefa mesmo voltando a "aguardando etapa" | Só reabre se a conta volta a ser cobrável |

Lacunas de teste apontadas pelo revisor e fechadas: estorno e pagamento simultâneos (o valor pago sempre igual à soma dos lançamentos não estornados), categoria inativada, fim antecipado, parcelamento pequeno, tarefa depois de concluir, reabrir e concluir. O revisor viu o E2E do ciclo criando a obra no banco; o gatilho real (concluir a etapa na tela e ver a parcela de 25% abrir) é exercido por `financeiro-receber.spec.ts` (concluir a fabricação pela interface e conferir a parcela na lista "vencem hoje").

## O que NÃO foi corrigido, e por quê (em `docs/PENDENCIAS.md`, seção "Da revisão sênior da Fase 5")
Editar recorrência sobrescreve ajustes manuais das futuras em aberto (sem aviso); sem aviso no diálogo para data anterior ao saldo inicial; estorno reabre tarefa concluída à mão; extrato e visão geral leem sem limite no SQL (volume de um mês de teste); sem filtros salvos nas listas financeiras; comprovante só no lançamento; lembrete de cobrança é tarefa, não notificação (Fase 8); `seed:demo` financeiro não executado. Nenhum tem cenário explorável hoje (um gestor, mês de teste) e todos têm correção conhecida.

## Verificação de aderência à spec (seção 14, Fase 5, com as regras do dono)
- **A receber:** pagamentos parciais, cobrança por WhatsApp com o saldo, ajuste/cancelamento/reabertura/estorno, liberar antes da etapa, abas por situação derivada, CSV; integra a aba Parcelas da obra, a cobrança da assistência e a ficha do cliente.
- **A pagar:** única, parcelada e recorrente (cron idempotente, edição só das futuras); baixa com lançamento; salários e aluguel por recorrência mensal (sem gerador a partir de funcionários, por decisão do dono).
- **Contas e lançamentos:** contas sem saldo inventado, extrato com saldo corrido, lançamento avulso, transferência (fora do DRE), conciliação manual, estorno com motivo.
- **Fluxo realizado × projetado** (30/60/90 e por mês, com gráfico e tabela), **DRE** (caixa ou competência) e relatórios de contas por idade; painel com a seção Financeiro.
- **Critério de aceite 1 (aprovar → cobrar sinal → concluir etapa → cobrar 25% → receber fecha):** `financeiro-receber.spec.ts` (sinal parcial e quitado, concluir a fabricação, parcela de 25% abre, receber em duas vezes, estorno, aba Financeiro do cliente) e `financeiro-ciclo.spec.ts`.
- **Critério de aceite 2 (fluxo e DRE batem com os lançamentos):** integração `financeiro-fluxo-dre.test.ts` compara o DRE com uma soma SQL independente e o fluxo com os títulos criados (por diferença); o E2E do ciclo confere extrato, DRE, visão geral e CSV com números exatos (janeiro de 2020).
- **Critério de aceite 3 (atrasos derivados corretos):** `situacaoDoTitulo` com bordas (ontem, hoje, amanhã, virada de mês e de ano, parcial vencida), as abas das listas e o aging por faixa, em unitário e integração.
- **Integração com os gatilhos de etapa:** `abrirParcelasDoGatilho` e `reverterParcelasDaEtapa` agora usam as mesmas regras de recebimento (parcela com pagamento não reabre; tarefa de cobrança volta a existir).

## O que não foi testado / limites honestos
- **`seed:demo` financeiro** foi escrito e passa no typecheck e no lint, mas **não foi executado** (o banco compartilhado tem dados reais). Rodar em um banco de desenvolvimento sem dados reais antes de confiar nele.
- **Cron em produção (Vercel):** a geração de recorrências foi testada por chamada direta à função (idempotência, duas rodadas, cancelada não recriada), não pelo agendador da Vercel.
- **Migração em banco novo do zero:** validada em transação com ROLLBACK e aplicada sobre o banco existente; não rodada em um banco vazio nesta fase (as demais migrações já foram).
- **Gráfico:** conferido visualmente em desktop; no celular a tabela e os cartões trazem os mesmos números, o gráfico só encolhe.
- **Datas "hoje" perto da meia-noite de São Paulo** são tratadas por `dataLocalDoInstante`; não há teste que simule o virar do dia.
- **Volume:** nenhuma medição com milhares de títulos (listas paginadas, mas visão geral e extrato leem sem limite: PENDENCIAS).
