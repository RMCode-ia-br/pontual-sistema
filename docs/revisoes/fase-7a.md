# Revisão sênior — Fase 7A (Bloco 0, painel e relatórios financeiros)

Data: 2026-11-13. Escopo: `31a5b02..HEAD` — Bloco 0 (fechar a Fase 6), inventário, base dos relatórios, indicadores, painel novo e relatórios financeiros e de margem. Inventário completo em `docs/revisoes/fase-7-inventario.md`. A 7B (demais relatórios, SQL e paginação, busca, volume e índices) **não foi iniciada**.

## Regras do dono aplicadas (prevalecem sobre a spec)
- **Com nota e sem nota separados** em vendido e recebido; o acréscimo de 5% aparece como "repasse de imposto, fora da margem". Nenhum imposto, RBT12 ou alerta fiscal é calculado.
- **Indicador "Recebido com nota fiscal nos últimos 12 meses"** no lugar do bloco do Simples (decisão 117, confirmada pelo Marcelo): soma só pagamentos marcados com nota (a marca do **pagamento**, não a da conta), entrada avulsa sem conta a receber fica fora (e o painel avisa quantas). O limite vem de Configurações e **nasce vazio**; **vazio e zero valem igual: "limite não informado"**, sem percentual e sem divisão por zero (testados os dois casos). Migração M1 aplicada com OK do Régis.
- **Vendido por proposta aprovada pela data do aceite** (decisão 116, aprovada pelo Régis).
- "Saldo não informado" e margem "Incompleta" nunca aparecem como zero; custo e margem atrás de `can(ver, custo)` no painel, na página, no índice e no CSV.
- Poucos números por tela, português simples, "como é calculado" em cada número.

## Critérios de aceite
1. **Cada número do painel leva à lista filtrada e bate com o relatório:** cada indicador exporta a mesma cláusula usada pela lista (`ondeVendas`, `ondeRecebimentos`, `ondeAprovados`, `ondePerdidos`). `tests/integration/painel-bate-com-relatorio.test.ts` (20 testes) compara, por indicador, painel × lista/relatório × **soma SQL independente** × valor calculado à mão, em janeiro de 2020 (sem dado real) e por diferença onde o dado depende de "hoje". Mutação de sanidade: tirar `deletadoEm: null` de `ondeVendas` derrubou 4 testes.
2. **Painel completo da seção 8:** seletor de período, comparação com o mês anterior e com o mesmo mês do ano passado (até o mesmo dia quando o mês está em andamento), vendido, recebido, taxa de fechamento, valor médio por obra, tempo visita → proposta, ocupação da fábrica, pontualidade com período, margem por obra e o indicador de faturamento com nota.
3. **Bloco 0 fechado** (ver abaixo).

## Bloco 0 (fechar a Fase 6)
- **(a) Testes independentes de dados reais.** Causa **confirmada no banco** (somente leitura): a "Pontimac" estava na lixeira (a "Dafel" ainda casava pelo nome fantasia) e o "Nova Opção" virou "Nova Opção Temper". Eram **5** testes de integração da importação (não 6 como a leitura do código sugeria). Agora a fixture recebe os nomes e cada teste cria os seus com prefixo ("Int Imp ", "E2E "). Convertidos também motivos de bloqueio e de perda, linha, espessura, categorias financeiras, tipologia, condição de pagamento e feriados. **Ainda dependem do que vem semeado** (PENDENCIAS): o modelo de etapas padrão e os textos/valores padrão da empresa.
- **(b) Os 22 que não rodaram:** eram o 1 teste seguinte em `importacao.spec` + os 10 de `fornecedores.spec` (specs seriais), × desktop e celular = 22. Passam.
- **(c) Leitura de números:** `lerNumeroBr` é a regra única de todos os leitores (decisão 122). `"2,5"`, `"2.5"`, `"1.234,56"`, `"1234,56"` e `"R$ 1.234,56"` são lidos certo ou recusados com mensagem; custo de XLSX `0,125` deixa de virar R$ 125,00; medidas ilegíveis da compra viram erro (antes "sem medida"); as prévias do navegador usam o mesmo leitor; colar "2,5" num campo de dinheiro dá 2,50. Teste de tabela com 115 casos e mutação confirmada (17 falhas).
- **(d)** `.gitattributes` (LF); pasta de trabalho convertida para LF; o aviso de fim de linha acabou.
- **(e)** Isolamento do banco de testes registrado em PENDENCIAS (fica para os planos Pro).
- **(f)** "Nenhum commit com typecheck, lint ou testes da área vermelhos" virou regra no `CLAUDE.md`.

## Como foi revisado
1. **Revisor independente (subagente de contexto limpo, somente leitura, sem tocar no banco):** recebeu as regras do dono, as definições, os critérios e o diff (inclusive arquivos ainda não commitados). Cada achado foi conferido antes de corrigir; os dois Altos foram **reproduzidos com código** antes da correção.
2. **O teste de aceite achou 2 erros de fuso no meu SQL** (antes da revisão): `timestamp` sem fuso guardado em UTC com `AT TIME ZONE 'America/Sao_Paulo'` direto soma 3 h para o lado errado (venda das 22h do último dia caía no mês seguinte no gráfico; visita às 22h dava 1 dia a menos). Corrigido com `(col AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo'`.
3. **Captura de tela com dados** achou um erro que a tela vazia escondia: o servidor passava funções ao gráfico (componente de cliente) e o Next recusava. Corrigido (o gráfico recebe `formato`), com teste E2E permanente que cria dados nos meses recentes.
4. **Verificação visual:** capturas em desktop e celular (390 px), claro e escuro, do painel e de um relatório por grupo (vendas, produção, faturamento, estoque); contraste verificado automaticamente nas 5 telas e 4 combinações (830 textos no desktop, 652 no celular): **nenhuma violação** (pior caso 5,0:1; o gráfico do faturamento foi checado à parte, com dados, em claro e escuro, pela paleta validada: ΔE de daltonismo ≥ 24 e contraste ≥ 3:1). Corrigidos: "Novembro De 2026" (capitalização), rótulos do eixo sobrepostos com 12 meses, fonte grande estourando o cartão de 4 colunas.

## Achados da revisão e o que foi feito
| # | Sev. | Achado | Ação |
|---|---|---|---|
| A1 | Alto | Número negativo saía do CSV como `'-19,99` (texto com apóstrofo, não soma): margem, saldo e variação negativos | `NumeroFormatado` não passa pela neutralização de fórmula; texto continua neutralizado; "Incompleta" sai como texto; teste com negativos em cada tipo |
| A2 | Alto | `lerNumeroBr("1,5.5")` lançava `SyntaxError`; o editor da proposta chama o leitor a cada tecla e quebrava | Só dígitos depois da vírgula; 7 arranjos novos na tabela, nenhum lança |
| M1 | Médio | Links de origem e perda do painel iam ao funil sem o período (o funil só lê `de/ate`) | O link leva `de` e `ate` |
| M2 | Médio | "Vendido" usava a data do aceite e a taxa de fechamento usava o instante do clique | `dataFechamento` passa a ser a data do aceite informada |
| M4 | Médio | Estorno deixava a conta "com nota" sem pagamento válido | Sem pagamento e sem proposta, volta a "sem nota"; ordem do "restante" igual à do registro; teste |
| M6 | Médio | Definição de "A receber" e "A pagar" não dizia o que soma (vencido, hoje e próximos N dias) | Texto corrigido |
| M7 | Médio | Saldo com conta sem saldo informado parecia total | Cartão diz "Parcial: N conta(s) com saldo não informado; só o movimento registrado" |
| B5–B8 | Baixo | Seletor sem acompanhar a URL; `?pagina=1.5`; texto da margem; soma de "recebido no mês" duplicada; m² duplicado com duas etapas de fabricação; "Ticket médio" × "Valor médio por obra" | Corrigidos (seletor remonta por `key`, sem `setState` em efeito) |
| — | — | Fonte grande estourava o cartão de 4 colunas | Painel usa fonte menor nos 4 cartões |

## O que NÃO foi corrigido, e por quê (`docs/PENDENCIAS.md`, "Da revisão sênior da Fase 7A")
Motivos de perda do painel × relatório do funil (7B refaz o funil por data da perda); visita registrada depois da proposta conta 0 dia (decisão de negócio: confirmar com o Marcelo); venda de projeto depois cancelado; meta de R$ 300.000 e capacidade de 300 m² são o padrão da spec; testes que mexem na Configuração real da empresa; espaço no meio de número; "1.250" em peso é milhar; colar ignora a seleção; CSV do faturamento com mês convertido em data pelo Excel; dois componentes de gráfico; alvo de toque de 32 px. Nenhum tem cenário explorável hoje. **Não feito na 7A por ser da 7B:** carga em lote da margem por obra (hoje uma consulta por obra, limite de 150) e lembrete de WhatsApp direto no painel.

## Execução (rodada limpa, sem outra atividade no banco, após as correções da revisão)
- `typecheck`, `lint` e `build` limpos.
- **Unitários: 1.224 passam** (69 arquivos).
- **Integração: 367 passam** (30 arquivos).
- **E2E (desktop e celular 390 px): 628 passaram, 1 falhou, 17 ignoradas, 6 não rodaram.** A falha é `tarefas` › "filtro 'Só as minhas' e 'Todas'" no celular (`toHaveURL`), numa área que a 7A não tocou; os 6 "não rodaram" são os testes seguintes da mesma spec serial. **A spec isolada passa 24 de 24**, então é intermitente sob carga (hipótese: clique no link antes da hidratação; não investigada a fundo, em PENDENCIAS). O alvo de zero falha **não foi atingido na rodada completa** por essa intermitência.
- Uma rodada anterior (antes das correções) teve 3 testes vermelhos: 2 sensíveis à data (a rodada de 1,1 h atravessou a meia-noite) e 1 por causa do painel de margem novo (a definição agora fica atrás do botão "Como é calculado"; o teste passou a abri-lo). Todos passam.

## Honestidade sobre o processo
- **Um commit só de testes** (`4f73e58`) foi feito antes de eu ter rodado o E2E completo; os testes alterados foram rodados antes (32/32, depois 145 + 81).
- **Os dois erros de fuso e o erro de funções no gráfico foram meus**; foram pegos pelo teste de aceite e pela captura com dados, não pela tela vazia. Lição em `docs/APRENDIZADOS.md`.
- **Parte do trabalho foi delegada a subagentes** (conversão dos testes de catálogo, teste de aceite, E2E novos e capturas, revisão); conferi os relatórios deles rodando os testes e olhando as imagens.
- **O gráfico do faturamento só foi visto com dados de teste "E2E "**, criados e removidos pelo próprio teste; as telas reais do banco estão quase vazias (2 projetos, 6 clientes), então o painel real mostra muitos zeros e "sem base para comparar".
- **O painel no celular é longo** (cerca de 6.500 px de altura): organizado em seções, mas longo. Se o Marcelo achar demais, o próximo passo é recolher seções no celular.
- **Não medi a carga do painel** (cerca de 18 consultas em paralelo); a medição com volume é da 7B.
