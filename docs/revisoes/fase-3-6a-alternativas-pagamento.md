# Fase 3.6a — Alternativas de forma de pagamento na proposta

Início em 2026-11-24. Relatório em construção; é fechado no fim da fase. Plano aprovado pelo Régis com 4 ajustes (PDF em no máximo duas colunas; mudar a forma depois de aprovada = desfazer e aprovar de novo; migração só com OK; teste de aceite com as propostas 1260-26 e 1261-26 inteiras).

## Bloco 1 — modelo, migração e regra pura

**Regra pura:** `src/lib/dominio/alternativas-pagamento.ts` (teste `tests/unit/alternativas-pagamento.test.ts`, 26 casos). Ordem: itens − desconto da opção = referência → ajuste da forma (percentual ou total digitado, antes da nota) → nota fiscal por último, em linha separada → total. Limites: ajuste de −50% a +50%, 5 formas por proposta, cartão de 1 a 12.

### Migração `20261124000000_alternativas_pagamento` (aplicada no banco de São Paulo com OK do Régis)

Aditiva: um enum, duas tabelas (`AlternativaPagamento`, `AlternativaPagamentoTotal`), colunas opcionais em `Proposta` e `PropostaParcela`, regras (`CHECK`) e preenchimento dos campos do aceite nas propostas JÁ aprovadas a partir do próprio snapshot (nenhum valor existente muda). **O índice único parcial `AlternativaPagamentoTotal_alternativa_opcao_unico` existe só no SQL da migração, fora do `schema.prisma`** (decisão 142).

Validação antes do deploy (transação que termina em `ROLLBACK`, banco de São Paulo):

| Conferência | Antes | Depois |
|---|---|---|
| Propostas aprovadas com opção e valor | 4 | 4 com campos preenchidos |
| Vendido (soma de `valorAprovadoCentavos`) | R$ 33.399,97 | R$ 33.399,97 |
| Repasse da nota (snapshot × coluna nova) | R$ 0 | R$ 0 |
| Linhas em que referência + nota ≠ valor aprovado | — | 0 |
| Linhas fora das aprovadas com campo preenchido | — | 0 |
| Propostas / parcelas / alternativas | 10 / 22 / 0 | 10 / 22 / 0 |
| RLS nas duas tabelas novas | — | ligado |
| `ajustePb = 5001`; nome vazio | — | ambos recusados (23514) |
| Tabela nova existe depois do ROLLBACK | — | não |

Os 4 aprovados reais são todos sem nota (repasse zero dos dois lados); o caso com nota é coberto pelos testes de integração do Bloco 5.

**SQL de volta** (só se nenhuma alternativa tiver sido criada; senão exportar antes):

```sql
BEGIN;
ALTER TABLE "Proposta" DROP CONSTRAINT "Proposta_alternativaAprovadaId_fkey";
ALTER TABLE "PropostaParcela" DROP CONSTRAINT "PropostaParcela_alternativaId_fkey";
DROP TABLE "AlternativaPagamentoTotal";
DROP TABLE "AlternativaPagamento";
DROP INDEX "PropostaParcela_alternativaId_idx";
ALTER TABLE "PropostaParcela" DROP COLUMN "alternativaId";
ALTER TABLE "Proposta" DROP COLUMN "nomePagamentoPrincipal", DROP COLUMN "alternativaAprovadaId",
  DROP COLUMN "valorReferenciaAprovadoCentavos", DROP COLUMN "ajusteAprovadoCentavos", DROP COLUMN "acrescimoNotaAprovadoCentavos";
DROP TYPE "ModoAjustePagamento";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261124000000_alternativas_pagamento';
COMMIT;
```

### Migração `20261124120000_repasse_cartao` (início do Bloco 2; decisão 144)

Aditiva: `AlternativaPagamento.repasseCartao BOOLEAN NOT NULL DEFAULT false` e `Proposta.repasseCartaoAprovadoCentavos INTEGER` (zero nas 4 propostas aprovadas). Validação em transação com ROLLBACK: aprovadas 4 → 4, Vendido R$ 33.399,97 → R$ 33.399,97, repasse da nota R$ 0 → R$ 0, 4 linhas zeradas, 0 diferentes de zero, 0 fora do alvo, 10 propostas, coluna existe só dentro da transação.

SQL de volta:

```sql
BEGIN;
ALTER TABLE "Proposta" DROP COLUMN "repasseCartaoAprovadoCentavos";
ALTER TABLE "AlternativaPagamento" DROP COLUMN "repasseCartao";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261124120000_repasse_cartao';
COMMIT;
```

### O que os PDFs reais mostraram
Em 1260-26 e 1261-26 a soma dos itens é o valor **à vista** (15.360 e 10.050). Os cartões é que têm acréscimo (3x +5,5%, 6x +8,4%, 10x +13%, na 1260-26). A forma principal (ajuste zero) pode ser o à vista e os cartões usam "total digitado". O Marcelo confirmou que o acréscimo do cartão é a taxa da maquininha repassada (decisão 144).

## Bloco 2 — editor das formas de pagamento

- **Editor:** a seção "Formas de pagamento" mantém a forma principal como sempre (modelo, parcelas, dados para pagamento) e ganha "Adicionar forma de pagamento" (até 4 extras = 5 no total): nome, modelo de condição ou texto livre, cronograma editável, valor por **ajuste em %** (aceita negativo e zero) ou **total digitado por opção de produto** (o % equivalente aparece derivado), marca "O acréscimo desta forma é taxa da maquininha (repasse)" (ligada sozinha quando há parcela em cartão, até a pessoa mexer nela), duplicar, subir, descer e remover. Totais, parcelas e "Nx R$ v" do cartão aparecem ao vivo (regra pura `alternativas-pagamento.ts`). Com formas extras, a principal ganha o campo de nome (ex.: "À vista"). Componentes: `linhas-de-parcelas.tsx` (cronograma compartilhado; rótulos da principal inalterados) e `formas-de-pagamento-extras.tsx`.
- **Salvar:** `salvarProposta` troca as formas extras por exclusão lógica + recriação (como o cronograma), só em rascunho, com auditoria; valida cada forma contra os itens já gravados (total a no máximo 50% da opção; mensagens em português simples; nomes repetidos recusados; dinheiro por `valorParaCentavos`, ajuste por `lerNumeroBr` com sinal).
- **Leitores protegidos:** todo leitor do cronograma da proposta (envio, snapshot, aprovação, cópia de revisão, prévia da troca, editor) passou a filtrar `alternativaId: null`, para as parcelas das formas extras nunca vazarem para a forma principal.
- **Guarda temporária:** enquanto os Blocos 3 e 4 não entram, uma proposta com formas extras NÃO pode ser enviada nem aprovada de rascunho (`problemasDaProposta`) e o editor avisa "Em preparo". Sai no Bloco 3.
- **Ainda não feito (Blocos 3 e 4):** PDF, snapshot, comparação, cópia da revisão, gravação do `repasseCartaoAprovadoCentavos` no aceite e o desconto do repasse de cartão (mais o da nota) na margem e nos relatórios, com o texto "repasse de taxa de cartão, fora da margem".
- **Testes:** unitários `alternativas-schema.test.ts` (20) e `alternativas-pagamento.test.ts` (26); E2E `formas-pagamento-editor.spec.ts` (5 cenários × desktop e 390 px: 10 passaram) com a limpeza de `tests/e2e/banco.ts` atualizada para as tabelas novas. Verificação visual de desktop e 390 px, claro e escuro: sem rolagem horizontal, formas empilhadas.

## Bloco 3 — snapshot, PDF e comparação

- **Snapshot:** `formasPagamento` opcional (regra pura `montarFormasDePagamento`): principal primeiro, depois as extras, com referência, ajuste, base, nota e total por opção. Sem formas extras o campo NÃO existe: o conteúdo congelado é o de antes. O envio valida cada forma (mensagem em português simples quando o total digitado passa de 50% da opção).
- **PDF (com formas extras):** quadros verticais em **no máximo duas colunas**, por opção de produto: nome da forma, "VALOR TOTAL", parcelas (cartão como "03X R$ 5.376,00 CARTÃO", última parcela absorve os centavos). Título dos termos, rótulo da opção e primeiro quadro ficam juntos; cada linha de quadros é indivisível. Dados para pagamento/Pix/e-mail seguem em peso normal. Imagens (5 formas × 2 opções): `docs/revisoes/img-3-6a/` (uma página com tudo; e o caso em que as formas atravessam a quebra de página, com a opção Linha Gold na página seguinte).
- **Sem formas extras o PDF é idêntico:** `tests/unit/pdf-proposta-formas.test.ts` compara o texto extraído de 4 cenários (uma opção 50/25/25, duas opções com nota e desconto, texto livre, cartão até 12x) com arquivos gravados ANTES da mudança (`tests/unit/golden/`), e confere que snapshot sem o campo e com lista vazia saem iguais.
- **Comparação de revisões:** forma nova, removida e total alterado por opção (por nome). **Cópia de revisão:** copia nome da principal, formas, cronograma de cada uma, marca de repasse e totais digitados com os ids novos das opções.
- **Enviar liberado, aprovar bloqueado:** a aprovação (e a troca) recusa com aviso "em preparo" até o Bloco 4; botão desligado no diálogo.
- **Verificação:** `typecheck` e `lint` limpos; unitários da área 136 passaram; integração nova `propostas-formas-pagamento` 7 passaram (snapshot com e sem extras, nota por último, forma inválida segura o envio, aprovação bloqueada, cópia de revisão com ids novos, comparação); integração do ciclo (propostas-ciclo, aprovacao-desfazer) reexecutada com as mudanças do serviço: 82 passaram junto com a nova; E2E (desktop e 390 px) 34 passaram: formas-pagamento-editor (6 cenários, agora com enviar, PDF, revisão copiada e comparação), propostas e condições.
- **Defeitos achados no caminho (corrigidos):** quadros do PDF colapsavam quando um `wrap={false}` ficava dentro de outro; título "TERMOS COMERCIAIS" ficava sozinho no pé da página (ver APRENDIZADOS).

## Bloco 4 — aprovação, ciclo e relatórios

- **Aceite:** com mais de uma forma de pagamento o diálogo pede "Forma de pagamento escolhida" (obrigatória, nenhuma pré-selecionada), mostra o total e as parcelas da forma e o texto "Para mudar a forma de pagamento depois de aprovada, desfaça a aprovação e aprove de novo (só se ainda não houve recebimento)". O valor, o ajuste e as parcelas vêm do SNAPSHOT (linhas vivas só como reserva para snapshot sem cronograma); o diálogo e a página usam o conteúdo congelado (antes o total do diálogo era recalculado ao vivo). Imagens do diálogo (desktop e 390 px) nas capturas do E2E.
- **`aprovarProposta`:** recebe o NOME da forma; grava `alternativaAprovadaId` (nulo na principal), `valorReferenciaAprovadoCentavos`, `ajusteAprovadoCentavos`, `acrescimoNotaAprovadoCentavos` e `repasseCartaoAprovadoCentavos` (só o ajuste positivo de forma marcada como taxa da maquininha; desconto à vista nunca é repasse). A conta a receber leva o nome da forma; interação e auditoria citam a forma. Ordem de bloqueio inalterada; a ação de aprovar ganhou a nova tentativa em deadlock (antes só desfazer, trocar e reabrir tinham).
- **Desfazer / trocar:** desfazer zera a forma e as cinco colunas. Trocar casa a forma pelo NOME na revisão escolhida (prévia já vem com ela e mostra as parcelas novas dessa forma); se não casar, a tela pede a escolha e o servidor recusa sem ela, sem mudar nada. Reabrir intacto.
- **Margem e relatórios (fonte única):** Vendido, faturamento mensal, painel e margem por obra leem as colunas do aceite. Repasse total = nota + cartão; receita da margem = fechado − nota − cartão. Texto "repasse de taxa de cartão, fora da margem" ao lado do de imposto no painel, no relatório de vendas, no faturamento (tela e CSV), na margem por obra (tela e CSV) e na aba "Custo e margem" da obra. O "Outros e ajustes" do mix cita o ajuste da forma de pagamento.
- **Aprovação liberada** ao fim do bloco (a trava "em preparo" saiu), com os testes da área verdes.
- **Testes:** integração nova `propostas-formas-aprovacao` (13 cenários: cartão 10x com parcelas somando o total e margem sem o repasse; desconto à vista com Vendido e margem menores e repasse zero mesmo com a marca ligada; forma principal; com nota (nota por último, repasse de cartão só o ajuste); sem formas extras igual a antes; forma obrigatória; snapshot manda; rascunho direto; desfazer e reaprovar com outra forma; trocar casando pelo nome e pedindo a escolha quando não casa; duas aprovações concorrentes) e `painel-bate-com-relatorio` ampliado (maio de 2020: painel = lista = SQL independente = faturamento mensal, com ajuste e com nota). Unitário da margem com o repasse de cartão. Resultado: unitários da área verdes; integração 120 (ciclo, desfazer, relatórios comerciais/clientes-produtos/operacionais) + 61 (formas, painel, custo) passaram; E2E da área (formas, propostas, aprovação e desfazer, custo da obra, painel, relatórios) 96 passaram e, depois do ajuste do teste de aviso, o spec de formas 12 passaram, incluindo aprovar escolhendo "Pix com desconto" e conferir as duas parcelas a receber (R$ 6.016,00 + R$ 6.016,00).
- **Ajuste visual feito na verificação:** com formas, a linha genérica "Valor aprovado" (total da opção) foi escondida do diálogo, porque confundia com o total da forma escolhida.

## Bloco 5 — testes e verificação

- **Conferência no banco antes do bloco (somente leitura):** 0 propostas APROVADA com valor aprovado e coluna do aceite nula (as 4 aprovadas estão completas); 0 apontando para forma excluída; 0 não aprovadas com campo do aceite preenchido. Sem SQL de preenchimento a aplicar.
- **Coluna nula nunca vira zero (decisão 151):** Vendido, faturamento mensal e margem por obra recusam com `DadosDoAceiteIncompletos` (número das propostas). Teste de integração por coluna (as quatro) nos três relatórios, e unitário da mensagem. Os testes que gravam aprovada direto no banco passaram a gravar as quatro colunas (o teste do custo da obra, que só tinha duas, falhou exatamente por isso e foi corrigido).
- **Casos reais do Marcelo, inteiros, pelos serviços reais:** `propostas-casos-reais-1260-1261` (integração) envia e aprova cada forma das propostas 1260-26 (à vista R$ 15.360,00; cartão 3x R$ 16.200,00 = 3 × 5.400,00; 6x R$ 16.650,00 = 6 × 2.775,00; 10x R$ 17.350,00 = 10 × 1.735,00) e 1261-26 (à vista R$ 10.050,00; 3x R$ 10.620,00 = 3 × 3.540,00; 6x R$ 10.890,00 = 6 × 1.815,00; 10x R$ 11.350,00 = 10 × 1.135,00): a soma dos itens é o valor à vista, o snapshot congela os totais do PDF dele, o à vista gera sinal de 50% na confirmação (R$ 7.680,00 / R$ 5.025,00) e o restante na instalação, e cada cartão gera uma conta no cartão com as parcelas iguais às do PDF, sem diferença de centavo, e o repasse de cartão igual ao acréscimo. O percentual derivado de cada cartão sai igual ao que se vê nos PDFs (+5,47%, +8,40%, +12,96% e +5,67%, +8,36%, +12,94%). O teste de PDF extrai o texto do PDF do sistema e confere as mesmas linhas ("03X R$ 5.400,00 CARTÃO", "50% (R$ 7.680,00)"...).
- **E2E da fase (desktop e 390 px), `formas-pagamento-fase.spec.ts`:** cria as três formas pela tela (principal, Pix com desconto, cartão 10x com a marca da maquininha ligada sozinha), envia, baixa o PDF, confere o aceite (forma em branco e obrigatória; "Valor aprovado" escondido; texto "para mudar a forma depois de aprovada, desfaça a aprovação e aprove de novo"; prévia com "10X R$ 1.408,00 CARTÃO"), aprova o cartão, confere a parcela a receber (R$ 14.080,00), o Vendido do mês, o repasse de cartão (R$ 1.280,00) no relatório e no painel e a margem da obra (receita R$ 12.800,00); depois desfaz e aprova de novo no Pix com desconto (Vendido e margem menores, sem repasse). Outro cenário prova o contrário: sem formas extras a linha "Valor aprovado" aparece, a forma não é pedida e o texto de desfazer não aparece, e as parcelas são 50% + 50% como sempre.
- **Verificação visual final:** editor (desktop e 390 px, claro e escuro), diálogo de aceite (claro e escuro, desktop e 390 px), margem da obra com o repasse de cartão (claro e escuro) e PDF (5 formas × 2 opções, uma página e com quebra). Sem rolagem lateral em 390 px.
- **Resultado (só testes da área, de dia):** `typecheck` e `lint` limpos; unitários da área verdes; integração: casos reais, painel (com recusa de coluna nula), relatórios comerciais/clientes-produtos/operacionais, custo da obra e aprovação com formas, todos passaram (custo da obra rerodado depois da correção); E2E da área 112 passaram (formas, aprovação e desfazer, custo, painel, relatórios, propostas). A suíte completa fica para depois do "pode rodar a suíte".

## Revisão sênior (subagente de contexto limpo)

Nove pontos pedidos, todos OK com evidência (arquivo:linha) no parecer; **nenhum defeito crítico ou alto**. Dois itens médios corrigidos antes da suíte; o resto foi para as pendências.

| Ponto | Veredito |
|---|---|
| (a) forma do aceite pertence à própria proposta e não está excluída | OK: o aceite recebe só o NOME, resolvido no snapshot/conteúdo da própria proposta; a linha viva é buscada com `propostaId` + nome + `deletadoEm: null`; nenhum id de forma vem da tela. Ressalva: unicidade do nome só no servidor (pendência) |
| (b) limites no servidor | OK: 4 extras, cartão 1 a 12, ajuste ±50% (também no total digitado), soma 100%, opção do total pertence à proposta, nomes únicos, texto livre XOR parcelas; CHECKs do SQL batem. Lacunas menores corrigidas (abaixo) |
| (c) ordem de bloqueio e nova tentativa em deadlock | OK nas quatro ações (aprovar, desfazer, trocar, reabrir) |
| (d) cinco colunas nos consumidores | OK: painel, vendas, faturamento mensal, margem por obra e CSVs; nada lê mais o repasse do JSON do snapshot |
| (e) desfazer e trocar sem resíduo | OK: cinco colunas zeradas; reabrir só muda status |
| (f) BigInt e última parcela absorvendo | OK; a prévia da tela usa as mesmas funções do servidor |
| (g) snapshot congelado | OK: aceite, PDF, comparação e prévia da troca leem o snapshot |
| (h) RLS | OK: bloco `ENABLE ROW LEVEL SECURITY` e `REVOKE` de anon/authenticated na migração |
| (i) propostas antigas e PDF sem formas | OK: só o preenchimento previsto; ramo sem formas do PDF estruturalmente idêntico; textos gravados em `tests/unit/golden/` |

**Corrigido (importante):**
1. **Número bloqueado derrubava a página inteira** (e o erro vira código genérico em produção). Agora o painel, o relatório de vendas (resumo e ticket), o faturamento mensal, a margem por obra e a aba "Custo e margem" mostram o AVISO com os números das propostas no lugar do valor (`ouAviso`, componente `AvisoDeDadosIncompletos`); as rotas de CSV respondem 409 com a mensagem. O número continua bloqueado (decisão 151); só mudou a apresentação.
2. **Servidor aceitava a mesma opção duas vezes no total digitado e total acima do teto** (erro cru do banco). `lerAlternativas` agora recusa as duas coisas em português.
3. Ajuste cosmético: o valor "− R$ 1.280,00" da margem não quebra mais de linha em 390 px.

**Pendências (não bloqueiam):** ver a seção "Da Fase 3.6a" de `docs/PENDENCIAS.md` (unicidade do nome só no servidor; validação antes do recálculo do markup; CSV da lista de vendas sem forma e repasse; `prisma migrate diff` antes da próxima migração; acessibilidade das formas; procedência dos arquivos golden).

## Passos manuais (para o Régis levar ao Marcelo)

1. **Cadastrar em Configurações → Condições de pagamento** as condições que ele usa nas formas extras (por exemplo "Cartão 3x", "Cartão 6x", "Cartão 10x" com uma parcela de 100% no cartão e o número de vezes, e "À vista, 50% de sinal na confirmação e o restante na instalação"). Elas aparecem na lista "Modelo de condição" de cada forma; a marca de taxa da maquininha liga sozinha quando há parcela no cartão.
2. **Lançar a taxa real da maquininha como despesa da empresa**, na categoria "Taxas de cartão", SEM ligar à obra (a margem da obra já tira o repasse; a despesa entra no resultado da empresa).
3. Para mudar a forma de pagamento de uma proposta já aprovada: desfazer a aprovação e aprovar de novo escolhendo a outra forma (só se ainda não houve recebimento); a tela do aceite diz isso.

## Para a 7C (permissões)

- Quem cria e edita formas de pagamento da proposta (hoje `can(editar, proposta)`, sempre verdadeiro).
- Quem escolhe a forma no aceite (`can(aprovar, proposta)`).
- **Desfazer a aprovação** (e trocar) como ação destrutiva em `ACOES_DESTRUTIVAS`: agora é também o caminho para mudar a forma depois de aprovada.
- Quem vê o repasse de taxa de cartão e a margem (`can(ver, custo)`).
- Fase 8: `CHECK` opcional no banco para os valores do aceite e índice único do nome da forma (PENDENCIAS).

## Verificação final (suíte completa)

Rodada única em 2026-11-25, das 21h21 às 22h55 (America/Sao_Paulo), sobre o commit `2ebe7e4`. Conexão com o banco conferida antes de cada etapa (DIRECT_URL e DATABASE_URL responderam); nenhuma falha de rede (nada de ENOTFOUND/ETIMEDOUT).

| Suíte | Passaram | Falharam | Ignorados | Não rodaram | Base 7B |
|---|---|---|---|---|---|
| Unitários (83 arquivos) | 1.470 | 0 | 0 | 0 | 1.274 |
| Integração (40 arquivos) | 526 | 0 | 0 | 0 | 398 |
| E2E (desktop e 390 px) | 673 | 0 (veja abaixo) | 19 | 0 | 647 passaram, 1 falha, 19 ignorados, 1 não rodou |

- **E2E, 1ª rodada completa:** 671 passaram, 19 ignorados, 1 falha e 1 não rodou. A falha foi `importacao.spec.ts:55` no desktop ("importa 300 produtos de exemplo"): o passo 2 da planilha (mapeamento de colunas) não apareceu dentro dos 5 s depois do envio ("element(s) not found"). Não é rede, o módulo de importação não foi tocado pela 3.6a, e o MESMO teste passou no celular nessa mesma rodada. O teste que "não rodou" é o seguinte do mesmo arquivo serial. Refiz SÓ esse arquivo no desktop (conexão conferida de novo): 5 de 5 passaram, inclusive os dois. Classificação: instabilidade de tempo sob carga (mesma família do login lento da 7B), não defeito; registrada na PENDENCIAS (aumentar a espera do passo 2). Total final do E2E: 671 + 2 = 673 passaram.
- **Os 19 ignorados são os mesmos da base da 7B** (12 de captura de tela, 2 de tarefas que exigem banco vazio, 5 só de desktop), por desenho; não são testes que deixaram de rodar por erro.
- **Saldo contra a base da 7B:** +196 unitários, +128 de integração, +26 de E2E (a fase acrescentou testes de regra de cálculo, schema, PDF com texto extraído, casos reais 1260-26 e 1261-26, recusa de valor do aceite nulo, aprovação com forma escolhida e a história inteira pela tela). Zero falha real e zero teste não rodado por erro.
- **Dados de teste:** tudo com prefixo ("Int ", "E2E "), nada dependeu de registro que o dono possa editar; o banco de São Paulo não recebeu migração nova nesta rodada (as duas da fase foram aplicadas nos Blocos 1 e 2, com OK do dono).
