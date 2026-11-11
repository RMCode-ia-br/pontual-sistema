# Revisão sênior — Fase 2 (Comercial: funil e agenda)

Data: 2026-11-13. Escopo: `bca8b1a..HEAD` (modelo de dados e regras puras, projetos e Kanban, agenda e `.ics`, tela de visita no celular, tarefas e follow-ups, relatório de funil e origem, painel comercial, demonstração e documentação).

## Como foi revisado
1. **Revisor independente (subagente de contexto limpo, somente leitura):** recebeu só a especificação da fase e o `git diff`. Cada achado foi conferido no código antes de aceito (todos se confirmaram).
2. **Execução:** `typecheck`, `lint`, 376 testes unitários, 69 de integração (banco real) e a suíte E2E completa (desktop e celular 390 px): **344 passaram, 5 ignorados de propósito, 1 falha** (`autenticacao › sair encerra a sessão`, celular), que **passou ao ser repetida** (intermitência; o teste não foi tocado nesta fase).
3. **Revisão visual:** capturas de funil, ficha do projeto, agenda (mês, semana, dia, lista, conflito), tela de visita (celular), relatório e painel. Nada cortado nem com rolagem horizontal da página. Achados visuais corrigidos: título do período com "A" maiúsculo; captura do esqueleto de carregamento (só nos testes).

## Achados e o que foi feito
Nenhum **crítico**.

| # | Sev. | Achado | Ação |
|---|---|---|---|
| 1 | Alto | "Nova tarefa" pela ficha do projeto nunca ligava ao projeto (regex `[w-]` sem a barra) | Corrigido (`[\w-]`) e coberto por E2E (tarefa criada pelo projeto volta à aba) |
| 2 | Médio | Duplo clique/duas abas geravam histórico de fase e follow-up em dobro | `updateMany` condicionado à fase lida; recusa com mensagem; teste de integração com 2 movimentos simultâneos |
| 3 | Médio | Conversão do funil passava de 100% quando o projeto pulava fases | "Chegou à etapa" = passou por ela ou por qualquer posterior; testes (inclusive pular fases) |
| 4 | Médio | Compromissos fora de 7h–20h sumiam das grades de semana/dia | A grade se estende para caber os compromissos |
| 5 | Médio | Trocar só o endereço na edição mantinha o local antigo | O local acompanha a troca de endereço |
| 6 | Médio | Excluir cliente deixava projetos órfãos no funil/agenda/feed | Exclusão recusada enquanto houver projetos ativos (mensagem explica) |
| 7 | Médio | Feed `.ics` público levava as observações (texto livre) | Feed público sem observações; exportação autenticada mantém; aviso na tela |
| 8 | Baixo | Sem índice em `Tarefa.projetoId` | Migração `20261113120000_indice_tarefa_projeto` aplicada |
| 9 | Baixo | Coluna aberta truncada sem "Ver todos" | Link em qualquer coluna truncada |
| 10 | Baixo | Perder o projeto deixava o follow-up aberto | Tarefa "Acompanhar proposta" é cancelada ao perder; teste de integração |
| 11 | Baixo | `eventoId` do `FormData` sem Zod na tela de visita | Validado |

## O que NÃO foi corrigido, e por quê (em `docs/PENDENCIAS.md`)
- Feed `.ics`: janela truncada em 1.000 compromissos e URL com token em logs de acesso; sem limite de requisições (Fase 8).
- Compromissos REALIZADO/CANCELADO continuam editáveis; `ordem` das medidas pode repetir sob salvamento simultâneo; consultas auxiliares do formulário sem `can()`; compromissos que cruzam a meia-noite só aparecem no dia do início (Baixos).
- Relatório calculado em memória (até 20.000 projetos): mover para SQL agregado na Fase 7.

## Verificação de aderência à spec (seção 14, Fase 2)
Projetos e Kanban (R10, motivos de perda, qualificação, porte sem faixas inventadas), Agenda (mês/semana/dia/lista, conflito como alerta, horários livres, férias/feriados, `.ics` e feed assinável revogável), tela de visita no celular (medidas-rascunho, foto, dados da obra e condomínio), Tarefas e follow-ups (R11 no que a fase permite), modelos de WhatsApp com variáveis de visita, relatório de funil/origem: **entregues**.
- **Aceite 1 — arrastar respeita as regras:** E2E arrasta com o mouse; Aprovado é recusado com explicação; perder exige motivo; testes unitários das transições.
- **Aceite 2 — visita com conflito alerta:** E2E (conflito, domingo/fora do expediente) e integração.
- **Aceite 3 — medidas e fotos no celular:** E2E em 390 px com teclado numérico, câmera traseira (`capture`) e upload.
- **Aceite 4 — relatório de funil e origem:** E2E confere números, definições, lista filtrada e CSV.
- **Fora da fase por dependência:** botão "Importar medidas para a proposta", aprovação (`APROVADO`), "Pedir avaliação" e fim de garantia (Fases 3 e 4); notificações por cron (Fase 8).

## O que não foi testado / limites honestos
- **Importar o `.ics` em um Google Agenda real:** o conteúdo é validado por testes (UID, dobra, escape, UTC), mas não foi conferido em um calendário de verdade.
- **Toque longo para arrastar no celular real:** coberto pelo menu "Mover para…" nos E2E; o gesto de toque não foi exercitado em aparelho.
- **Câmera real:** o E2E simula o envio do arquivo; `capture="environment"` foi verificado como atributo, não em aparelho.
- **Desempenho com volume** (milhares de projetos) não foi medido.
- **Reexecução dos E2E em celular depois das correções da revisão** ficou incompleta: uma sessão do Postgres ficou "idle in transaction" segurando a trava de login (resto de um servidor de teste encerrado no meio de uma tentativa) e os logins do celular passaram a esperar. Em desktop, tudo passou depois das correções. Detalhes em `docs/APRENDIZADOS.md`.

## Como foi testado
`npm run typecheck`, `npm run lint`, `npm test` (376), `npm run test:integracao` (69, banco real), `npm run build` e `npm run test:e2e`. E2E novos: `funil`, `agenda`, `visita`, `relatorios` (desktop e celular).
