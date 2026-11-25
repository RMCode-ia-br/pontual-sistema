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
