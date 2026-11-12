# Revisão sênior — Fase 3 (Propostas)

Data: 2026-11-14. Escopo: `af126fe..HEAD` (≈100 arquivos: domínio de fórmulas, preço, parcelas e numeração; tipologias, composição e tabela de preços; condições de pagamento; configurações de markup e nota fiscal; editor de propostas; ciclo de vida e aprovação; PDF e folha de produção; painel e busca).

## Regras do dono aplicadas (prevalecem sobre a spec; `docs/DECISOES.md` 57–84)
Venda COM e SEM nota (padrão: sem); preço de composição = **custo × (1 + markup)** (80%; 100% para guarda-corpo e vidro temperado; ambos em Configurações); manual e tabela sem markup; acréscimo da nota (5%, configurável) somado **depois**, em **linha separada**, nunca em divisor; comissões em zero e só informativas; numeração a partir de 2000-26; dados reais fora do ambiente hospedado.

## Como foi revisado
1. **Revisor independente (subagente de contexto limpo, somente leitura):** recebeu a spec da fase, as decisões do dono e o `git diff`. Cada achado foi conferido no código antes de aceito (todos os altos se confirmaram).
2. **Execução:** `typecheck`, `lint`, `build`; **522 testes unitários**, **96 de integração** (banco real) e a suíte E2E completa em desktop e celular 390 px (**367 passaram; 2 falhas** eram o teste antigo do menu, que esperava Propostas desabilitada — corrigido; os specs afetados foram rodados de novo: **67 passaram**).
3. **Revisão visual:** capturas do editor (desktop e celular), lista, tipologias/preços e **PDFs abertos num Chromium** (conferência de layout). O primeiro PDF tinha a descrição invadindo o desenho e o valor: corrigido e conferido de novo. Sem rolagem horizontal em nenhuma tela nova.

## Achados e o que foi feito
Nenhum **crítico**.

| # | Sev. | Achado | Ação |
|---|---|---|---|
| A1 | Alto | Duas revisões do mesmo número podiam ser aprovadas: valor fechado e parcelas em dobro | Uma revisão aprovada por número (as outras viram Substituída); trava da proposta e do projeto (`FOR UPDATE`); teste de integração nos dois sentidos |
| A2 | Alto | Excluir o rascunho de uma revisão impedia criar outra (índice único com excluídas) | O número de revisão considera as excluídas; teste |
| A3 | Alto | Salvar Configurações com o contador antigo gerava número repetido | A reserva confere o maior número já emitido (inclusive excluídas); teste |
| A4 | Alto | Duplicar opção com outra linha/vidro mantinha o texto da combinação antiga | Descrição regerada pelo modelo (função única `valoresDoTemplate`, também usada na tela); descrição editada à mão ganha aviso; teste |
| M1 | Médio | Edição concorrente com o envio; aprovação usava o estado ao vivo | `exigirRascunho` trava a linha; aprovar proposta enviada usa o valor congelado; teste |
| M2 | Médio | "Validade encerrada por reajuste" não chegava ao PDF (lê o snapshot) e não pedia confirmação | Atualiza o snapshot; diálogo de confirmação |
| M3 | Médio | Importar medidas duplicava itens e copiava a observação interna da visita para o texto do cliente | Confirmação quando já há itens; observação não é copiada |
| M4 | Médio | Estado "Expirada" nunca era atingido | Decisão 78: derivado (selo e aviso ao aprovar); lista/filtro em PENDENCIAS |
| B2 | Baixo | Total com nota podia passar do inteiro do banco | Validado na aprovação |
| B3 | Baixo | `se()` avaliava os dois ramos (divisão por zero em ramo não usado) | Avaliação preguiçosa; testes |
| B5 | Baixo | PDF de rascunho/cancelada saía igual ao válido | Aviso vermelho em todas as páginas |
| B7/B8 | Baixo | Comentário e pendências desatualizados; comparação sem checar projeto excluído | Corrigidos |

## O que NÃO foi corrigido, e por quê (em `docs/PENDENCIAS.md`)
Aviso de preço velho quando muda fórmula/tabela/markup (M5); desconto cortado sem aviso e parcela em data fixa no passado (B1, B4); busca da lista sem acento (B6); teste do PDF só estrutural (M6, parcialmente: regras de negócio novas ganharam testes); `seed:demo` sem propostas; geração de PDF na Vercel não medida; anexo do aceite sem vínculo; `desenhoConfig` sem tela.

## Verificação de aderência à spec (seção 14, Fase 3)
- **Tipologias e composição (R2):** motor seguro (sem `eval`; 32 entradas maliciosas/ inválidas rejeitadas), editor com teste da fórmula, custo incompleto nunca vira zero, tipologia de EXEMPLO desativada.
- **Tabela de preços (R1):** linha mais específica; sem linha cai em manual com aviso; grade com combinações sem preço; importação CSV/XLSX tudo ou nada.
- **Condições (R6):** soma 100%, gatilhos, cartão até 12x sem juros, "a combinar".
- **Editor (7.7):** opções (duplicar), seções, itens com várias medidas, descrição por modelo com plural, três modos, painel com total/m²/custo/markup (interno), importar medidas da visita, duplicar item/proposta.
- **R4 revisões e congelamento; comparação;** **R5 aprovação transacional** (aceite, projeto Aprovado com valor fechado, parcelas, tarefas, linha do tempo; etapas = ponto de extensão da Fase 4).
- **PDF fiel à estrutura real** (conferido visualmente) e **folha de produção sem valores**.
- **Aceite — casos reais:** 1157-26 = R$ 19.830,00 (50/50) e 1127-26 = R$ 89.725,00 (50/25/25) nos testes unitários, com a ressalva de que os 22 itens do 1127-26 são valores de teste que reproduzem o total (o PDF original não está no repositório). Com nota: R$ 1.000 de custo → 1.890 (80%) e 2.100 (100%).
- **Aceite — E2E proposta → aprovação:** `tests/e2e/propostas.spec.ts` (criar a partir do projeto, itens, nota, salvar, duplicar opção/item/proposta, enviar, revisão e comparação, aprovar, parcelas e tarefas conferidas no banco, PDFs, painel e busca), em desktop e celular.

## O que não foi testado / limites honestos
- PDF aberto e conferido num Chromium com janela para 1 proposta de 2 opções e uma folha de produção; não foi validado em impressora nem em outros leitores.
- Geração de PDF no ambiente da Vercel (cold start, limites) não foi medida.
- `seed:demo` não foi estendido; nenhuma proposta real existe (decisão do dono: demonstração por ~1 mês, sem dados reais).
- O logo em WebP não aparece no PDF (react-pdf lê PNG/JPEG).
- As telas financeiras (a receber) são da Fase 5: as parcelas foram conferidas por consulta ao banco.

## Complemento (2026-11-14): casos reais e comparação com os PDFs originais
Os PDFs de referência (1127-26, 1157-26 e o questionário) e o prompt original passaram a ficar em `docs/referencias/` (ignorada pelo Git; nenhum arquivo está rastreado nem aparece no histórico). O `.md` do prompt é idêntico a `docs/ESPECIFICACAO.md` (diferem só na quebra de linha CRLF×LF).
- **1127-26:** os 22 valores de teste foram trocados pelos **reais** (medidas, quantidades e preços, transcritos do PDF); a soma calculada é **R$ 89.725,00** (o PDF imprime R$ 89.145,00: diferença de R$ 580,00, uma báscula fora da soma manual). Pagamento 50/25/25 = R$ 44.862,50 + R$ 22.431,25 + R$ 22.431,25. Com nota: R$ 94.211,25.
- **1157-26** (nome de arquivo "1257"): segundo caso do motor de preço e da descrição: itens 4.130,00 + 9.050,00 + 6.650,00 = **R$ 19.830,00**; guarda-corpo por metro linear (9,5 m × R$ 700,00); descrições geradas conferidas contra o texto real (única diferença: erros de gênero/português do original).
- **Achados do cotejo no motor:** a espessura do vidro agora sai com dois dígitos ("06MM") e medida com quantidade maior que 1 em item de várias medidas leva "= 02", como nos originais.
- **PDF:** estrutura comparada visualmente com as páginas reais; diferenças pequenas corrigidas; as grandes estão em `docs/PENDENCIAS.md` ("Complemento da Fase 3").
- **Privacidade:** as fixtures (`tests/unit/fixtures-casos-reais.ts`) não trazem nome, telefone, e-mail nem endereço do cliente, nem os nomes dos ambientes da casa; um teste confere. Resultado: 545 testes unitários, typecheck e lint verdes.
