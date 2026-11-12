# Revisão sênior — Fase 4 (Obras)

Data: 2026-11-12. Escopo: `8c9853f~1..HEAD` (9 commits, um por bloco): Bloco 0 (logout), modelo de dados e regras de prazo, modelo de etapas e geração na aprovação, execução da obra, lista/quadro/calendário, fotos e galeria, assistência e garantia, painel e relatórios.

## Regras do dono aplicadas (prevalecem sobre a spec)
Nenhuma duração de etapa, prazo, feriado de Macaé ou férias coletivas foi inventada: os dias vêm de cada proposta; sem prazo a obra avisa "Defina o prazo da obra"; feriados municipais e férias coletivas estão em `docs/PENDENCIAS.md`. A maioria das vendas é sem nota fiscal e não há comissões (nada novo nesta fase). A demonstração (`seed:demo`) usa dias fictícios marcados "[Demo]" e só roda em desenvolvimento. Identidade visual da 3.5 mantida (tokens e cor da marca; nenhuma cor fixa).

## Como foi revisado
1. **Revisor independente (subagente de contexto limpo, somente leitura):** recebeu a spec da fase (R5, R7, R8, R12, R18, 7.8, critérios de aceite), as decisões 92–99 e o `git diff`. Cada achado foi conferido no código antes de corrigir (todos os que tinham cenário concreto se confirmaram).
2. **Execução:** `typecheck`, `lint`, `build`; **805 testes unitários** e **196 de integração** (banco real, dados "Int ...") passam; **E2E completo em desktop e celular 390 px: 453 passaram** (≈ 39 min). Depois das correções da revisão foram rodados de novo `obras`, `agenda`, `assistencia`, `propostas` e `painel-obras` (**107 passaram**) e, na rodada com capturas, `obras-fotos` e `obras-lista` (**2 falhas de `toHaveURL` no desktop, que passaram na rodada seguinte, sem mudar nada; tratadas como oscilação de tempo sob carga, não reproduzidas**).
3. **Revisão visual:** capturas do chamado, da lista de assistência, do painel (desktop e celular) e do relatório. Corrigido: o gráfico de atrasos aparecia vazio quando nenhuma etapa atrasou (agora uma frase). Sem rolagem horizontal em nenhuma tela nova (`semRolagemHorizontal` nos specs).
4. **Mutações de sanidade** nas regras centrais (prazo máximo, dispensa sem esquadria, gatilho, autorização do portfólio, cobrança única, limite do atraso por etapa): cada uma derrubou o teste esperado e foi desfeita.

## Achados e o que foi feito
Nenhum **crítico**.

| # | Sev. | Achado | Ação |
|---|---|---|---|
| A1 | Alto | Parcela de uma segunda proposta cujo gatilho já tinha acontecido (etapa concluída ou dispensada) ficava aguardando para sempre: sem vencimento, tarefa nem aviso | Ao aprovar numa obra que já tem etapas, as parcelas novas dessas etapas abrem na hora (vencimento = conclusão da etapa, nunca antes do aceite), com tarefa "Cobrar parcela" e auditoria; idempotente; teste de integração |
| M1 | Médio | "Previstas, sem agendamento" ignorava compromisso remarcado (a decisão 96e partia de premissa errada: remarcar edita a mesma linha como `REMARCADO`) | `REMARCADO` conta como vivo; teste; decisão 96e corrigida |
| M2 | Médio | Concluir no sábado depois de um prazo de sexta dava "atrasada 0 dias" (veredito por data, desvio por dias úteis) | Regra única: atrasada tem desvio ≥ 1 e pontual ≤ 0; testes de sábado e domingo; decisão 93h |
| M3 | Médio | Cancelar chamado com a visita já cobrada deixava a conta a receber aberta | Cancelar cancela a conta (auditado) ou recusa se já tem pagamento; teste |
| B1 | Baixo | Legenda com duas linhas de alumínio saía "Gold e suprema" | `nomesProprios` preserva as maiúsculas; teste |
| B2 | Baixo | "Dias em aberto" de chamado cancelado não parava | Para na última alteração |
| B3 | Baixo | Ano digitado errado estourava o limite de dias úteis com erro genérico | Datas entre 2015 e 2060, com mensagem clara |
| B4 | Baixo | Dispensar etapa aceitava data futura (virava vencimento de parcela) | Recusa data futura |
| B9 | Baixo | Trocar obra/cliente do compromisso mantinha a etapa/o chamado antigos | Desliga o vínculo |

## O que NÃO foi corrigido, e por quê (em `docs/PENDENCIAS.md`, seção "Da revisão sênior da Fase 4")
Segunda parte com esquadria não reativa etapas dispensadas pela primeira; alterar prazo ou pausa de obra concluída (auditado); modelo sem etapa `ENTREGA`; EXIF no kit de postagem e limite agregado do ZIP; galeria e lista limitam antes de filtrar; ordem da conta do chamado sem unicidade; vidro avisado antes da instalação sai "fora da garantia" (decisão 93i); margem de 1 h na limpeza de `SessaoRevogada` (Fase 8); testes de integração usam o banco de desenvolvimento; sem teste de integração do Route Handler do kit. Nenhum tem cenário explorável hoje (um único gestor, sem dado real em ambiente hospedado) e todos têm correção conhecida.

## Verificação de aderência à spec (seção 14, Fase 4)
- **R7 etapas e modelo:** modelo editável (Configurações), 9 etapas, gatilho e marco da garantia no modelo, etapa dispensada, status da obra derivado. Geração na aprovação ligada ao ponto de extensão do R5.
- **R8 prazo, pontualidade, pausas, feriados:** prazo total (máximo) e por etapa (soma dos grupos), relógio inicia na medição exata, dias úteis (fim de semana + só feriados), pausas justificadas, semáforo, pontualidade com e sem pausas.
- **Critério 1 (aceite): concluir a etapa gatilho abre a parcela** (`ABERTA`, com vencimento, tarefa e auditoria; reabrir devolve a `AGUARDANDO_GATILHO`, recusado se houver pagamento). Testado em integração e E2E.
- **Critério 2 (aceite): pontualidade correta, com e sem pausas.** Exemplos feitos à mão em `tests/unit/obras-regras.test.ts` e `prazo-obra.test.ts` (inclui bordas: no dia, fim de semana, pausa que muda o veredito) e conferida nos relatórios.
- **Kanban/lista, calendário de instalação por equipe, condomínio, fotos antes/durante/depois, galeria e kit de postagem (R18), assistência e garantia (R12):** entregues e cobertos por E2E em desktop e celular.
- **Bloco 0:** o teste intermitente de sair era falha real (o logout não revogava o token e uma resposta do proxy devolvia o cookie renovado); corrigido com `sid` + revogação e teste determinístico (decisão 92).
- **Painel e relatórios:** seção Obras, atrasos em "Atenção hoje" e relatório "Obras e assistência" (tela e CSV), todos com a definição de cada número.

## O que não foi testado / limites honestos
- **Vercel/PDF em Geist:** nada de novo nesta fase; nenhuma falha foi reportada. Não foi feito deploy de teste.
- **Migrações:** aplicadas no banco de São Paulo e conferidas pelo teste de RLS; não testadas em um banco novo do zero nesta fase (as da Fase 4 só adicionam colunas anuláveis ou com padrão e tabelas novas).
- **Dados reais do dono:** o banco de desenvolvimento tem projetos reais (sem etapas, aprovados antes da fase): usar "Gerar etapas" na obra. Os testes só tocam em dados com prefixo; dois specs foram tornados condicionais para não supor banco vazio.
- **Sem teste de integração do download do kit** (só o E2E); sem teste de carga (limites de 300 obras e 600 fotos avisam quando estouram).
- **Aviso e pausa de férias coletivas/feriados de Macaé** dependem de cadastro que só o dono pode fazer.
- Dois testes E2E falharam uma vez por tempo sob carga (ver acima) e não se repetiram; se voltarem, investigar espera de navegação.
