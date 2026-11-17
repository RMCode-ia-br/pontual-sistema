# Revisão sênior — Fase 7A.1 (correção da aprovação: desfazer, trocar e reabrir)

Data: 2026-11-16/17. Escopo: `9900db0..HEAD` (commits `b54dea7` a `da88124` e a correção da revisão). Sem migração. A 7B e a 7C **não foram iniciadas**.

## O problema (relato do Marcelo e do Luan)
Ao revisar uma proposta, aprovaram a ORIGINAL e não a revisão, e o sistema não tinha como cancelar a aprovação.

### Diagnóstico do caso real (somente leitura no banco)
Proposta **2003-26**, projeto P-2026-0004 (horários UTC; São Paulo = UTC−3):

| Hora | Fato |
|---|---|
| 01:52 | Rev. 0 enviada e congelada; projeto vai a "Proposta enviada" |
| 01:56 | Rev. 1 criada (rascunho); a original continua enviada (decisão 67) |
| 01:59 | **Aprova-se a Rev. 0** (aceite 16/11 por WhatsApp, R$ 11.300,00); a Rev. 1 vira "Substituída"; projeto "Aprovado" |

Estado: 2 parcelas de R$ 5.650,00 (1 aberta, 1 aguardando a entrega); 9 etapas pendentes; tarefas de medição e condomínio abertas; **nada andou** (sem recebimento, compra, estoque, conta a pagar, chamado, pausa ou foto). Logo **não há bloqueio** para trocar.

**Atenção:** a Rev. 1 tem a opção "Desconto no PIX" com desconto de **R$ 5.000,03** (total R$ 7.799,97). Parece erro de digitação: conferir com o Marcelo antes de trocar.

### Causas
1. Não existia ação de desfazer (aprovada não tinha nenhuma transição).
2. O botão Aprovar aparecia na original mesmo com revisão mais nova, sem aviso.
3. Nada mostrava qual revisão era a vigente (cabeçalho, listas e projeto).
4. A aprovação não guardava o status anterior das irmãs que viravam "Substituída".
5. Uma "Substituída" nunca voltava.

## O que foi construído
- **Desfazer aprovação** (motivo obrigatório): a proposta volta a "enviada"; as parcelas viram histórico (canceladas, excluídas e desligadas da proposta); as tarefas da aprovação são canceladas com a chave aposentada; as etapas saem por exclusão lógica e o prazo da obra volta a "nenhum" (se não sobra outra parte aprovada); valor fechado, data de fechamento e fase voltam pela função de fases. Nada é apagado de verdade.
- **Aprovar de novo** dá o mesmo resultado de uma aprovação limpa (provado com projetos gêmeos).
- **Bloqueios** lidos dentro da transação depois dos locks: obra em execução, concluída ou cancelada; recebimento; etapa que andou; pausa; foto; agendamento; compra; saída de estoque; retalho; sucata; conta a pagar; despesa; chamado. A mensagem lista tudo.
- **Trocar a aprovação**: desfaz a vigente e aprova a revisão escolhida numa transação só (etapas e prazo refeitos com o prazo da revisão; tudo ou nada). A prévia mostra parcelas, valor fechado, etapas, prazo e tarefas; data e forma do aceite vêm preenchidas.
- **Reabrir revisão substituída** e escolha de qual revisão volta ao desfazer.
- **Prevenção**: aviso ao aprovar com revisão mais nova (com atalho); selo "Revisão vigente" ou "Não vigente" no cabeçalho, nas listas e no projeto.
- **Vendido**: aprovação desfeita não conta (decisão 129, confirmada pelo Régis), com aviso quando o aceite é de mês anterior. Nenhuma cláusula de indicador mudou.
- **Permissão** `can(…, "desfazer", "aprovacao")`, anotada em `ACOES_DESTRUTIVAS` para a 7C.

## Como foi revisado
Um subagente independente (contexto limpo, somente leitura, sem tocar no banco) recebeu as regras, os arquivos e os cenários. Cada achado foi conferido no código antes de corrigir.

| # | Sev. | Achado | Ação |
|---|---|---|---|
| 1 | Médio | Depois de reabrir uma revisão antiga e enviar uma mais nova, ficavam duas "enviadas" valendo (enviar só rebaixava a revisão de origem) | **Corrigido**: enviar rebaixa TODAS as irmãs enviadas ou expiradas; reabrir também rebaixa a expirada; testes novos |
| 2 | Médio | Deadlock entre recebimento/estorno e desfazer (ordem de locks diferente no financeiro) | **Mitigado**: desfazer, trocar e reabrir tentam de novo uma vez (`src/lib/db/deadlock.ts`, testado); a correção definitiva no financeiro está em PENDENCIAS |
| 3 | Médio | Na troca, a prévia de uma revisão ou opção antiga podia sobrescrever a nova e o botão ficava ativo | **Corrigido**: número de pedido descarta resposta velha; botão desligado enquanto carrega; falha limpa a prévia |
| 4 | Baixo-médio | Aprovar lia o status do projeto antes do lock | **Corrigido**: relê depois do lock |
| 5 | Baixo | Criar revisão não travava a família | **Corrigido** |
| 6 | Baixo | O padrão do desfazer contradizia o texto ("volta a enviada") | **Corrigido**: o texto e o rótulo dizem quando a proposta passa a substituída |
| 7 | Baixo | Consultas de bloqueio sem teste real | **Corrigido**: testes de foto, agendamento, despesa, sucata e pausa |
| 9 | Baixo | Jargão "sem mexer no banco"; rótulo acessível diferente do visível | **Corrigido** |
| 10 | Baixo | Teste de corrida fraco | **Corrigido**: confere o estado final coerente |
| 8, 11 e restos de 7 e 9 | Baixo | Código morto, bloqueios que faltam, prazo editado à mão, "vai descartar" | Em `docs/PENDENCIAS.md` (Fase 7A.1) |

A revisão conferiu e está correto: a ordem de locks (família → projeto → parcelas → etapas) com os bloqueios lidos depois dos locks; a reaprovação limpa; todos os leitores de parcelas e etapas filtram `deletadoEm`; a troca é tudo ou nada; nunca há duas aprovadas do mesmo número; indicadores e fuso coerentes; Server Actions com sessão, Zod, `can` e revalidação.

## Execução (rodada completa autorizada pelo Régis: "pode rodar a suíte")
- `typecheck`, `lint` e `build` limpos.
- **Unitários: 1.274 passam** (71 arquivos).
- **Integração: 398 passam** na rodada completa (31 arquivos, ANTES das correções da revisão). Depois das correções, `aprovacao-desfazer` + `propostas-ciclo`: **73 passam**.
- **E2E, rodada completa (ANTES das correções da revisão): 618 passaram, 6 falharam, 18 ignoradas, 24 não rodaram.** As 6 falhas são 3 specs (cada uma em desktop e celular), **nenhuma na aprovação**:
  - `financeiro-contas` › "informar o saldo depois" e `financeiro-prorrogar` › "Atrasada há 10 dias": a rodada passou das 21h (Brasília), quando a data em UTC já é "amanhã". **Passam depois da meia-noite** (reconfirmado).
  - `agenda` › "orienta quando está vazia": supõe agenda vazia e o banco tem 2 visitas reais (conferido só leitura). **Continua falhando por dado real**, não por esta fase.
  - Os 24 "não rodaram" são os testes seguintes dessas specs seriais.
- Depois das correções da revisão e do novo build: **E2E das propostas e do desfazer: 32 de 32** (desktop e celular de 390 px).
- **Não rodei uma segunda rodada completa depois das correções da revisão.** O que mudou nelas está coberto pelos testes da área acima; se quiser uma rodada completa nova, diga.

## Cliques para resolver o caso real (feitos pelo Régis e pelo Marcelo, depois do deploy)
1. Confirmar com o Marcelo o desconto da Rev. 1 (R$ 5.000,03). Se estiver errado, use o caminho B.
2. **Caminho A, a Rev. 1 está certa:** abrir **Propostas → 2003-26 (original, Aprovada) → "Trocar pela Rev. 1"**. Conferir na prévia o valor (R$ 7.799,97), as parcelas novas e o prazo; manter a data 16/11/2026 e WhatsApp; escrever o motivo ("aprovamos a original por engano") e clicar em **Trocar aprovação**.
3. **Caminho B, o desconto precisa de ajuste:** na original, **"Desfazer aprovação"** → deixar marcada "A Rev. 1 — volta como rascunho" → motivo → **Desfazer aprovação**. Abrir a Rev. 1, corrigir o desconto e **Aprovar** (data 16/11/2026, WhatsApp).
4. Conferir no projeto P-2026-0004: "Aprovado", valor fechado novo, 2 parcelas novas, 9 etapas e a tarefa "Agendar medição exata" da Rev. 1 (a da original aparece cancelada).

## Honestidade sobre o processo
- Corrigi três coisas minhas durante o trabalho: um deadlock entre revisões irmãs que o próprio desenho criava (ordem única de locks), a ordem do teste de "partes" (a segunda parte precisa ser enviada antes de a primeira ser aprovada) e uma expectativa errada no E2E de reabrir (revisão já congelada volta como "enviada").
- O diagnóstico do caso real foi só leitura (transação `READ ONLY` com `ROLLBACK`); nenhum dado real foi alterado.
- A única parte delegada foi a revisão final; conferi cada achado no código.
- A aprovação só foi vista com dados de teste "Int Desf" e "E2E "; o caso real ainda não foi trocado.
