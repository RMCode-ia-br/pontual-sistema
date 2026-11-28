# Fase 7C — Permissões por perfil e por módulo

Plano aprovado pelo Régis em 2026-11-27 (arquivo de plano da sessão; decisões 176 a 184 em `docs/DECISOES.md`; inventário em `docs/revisoes/fase-7c-inventario.md`). Fase única, relatório único.

## Estado atual (retomar daqui)

| Bloco | Situação | Commit |
|---|---|---|
| 0 Inventário, decisões, CLAUDE.md | concluído | (este commit) |
| 1 Migração `20261128000000_permissoes_perfis` | SQL e validação BEGIN/ROLLBACK prontos (não aplicada, não commitada); aguardando o OK do Régis, depois `npm run db:deploy` e commit separado | — |
| 2 Regra pura, sessão com permissões, seed | pendente | — |
| 3 Menu, `/sem-acesso`, `exigirModulo` nas páginas | pendente | — |
| 4 Server Actions | pendente (parada obrigatória ao fim, relatório parcial) | — |
| 5 Rotas, anexos, busca, CSV | pendente | — |
| 6 Valores para o Campo, custo, painel, relatórios | pendente | — |
| 7 Telas de usuários | pendente | — |
| 8 Cancelar obra aprovada | pendente | — |
| 9 E2E por perfil | pendente (parar antes da revisão sênior e da suíte) | — |

Paradas obrigatórias: OK da migração; fim do Bloco 4; fim do Bloco 9; suíte só depois do aviso do Régis. Esforço High nos Blocos 1, 4 e 6 e na revisão sênior.

## Ajustes do Régis sobre o plano
1. `ajustesPermissao` inválido falha fechado (papel ≠ ADMIN: sem acesso a nada, só `/sem-acesso` e a própria conta, com log; ADMIN: perfil puro).
2. Escritório com "excluir e desfazer" só em Comercial, Obras e Financeiro.
3. Cancelar obra aprovada com prévia e bloqueios em palavras simples.
4. Teste gerado: ação exportada × perfil, resultado derivado do mapeamento recurso → módulo → nível; falha se houver ação sem mapeamento. E2E: Escritório ponta a ponta (criar e aprovar proposta, receber, estornar, cancelar obra); Campo (agenda, visita, etapa, foto).
5. Migração: `ADD VALUE` não usado na mesma transação; `prisma migrate diff` só leitura antes; ADMIN com acesso total depois.
6. Pergunta ao Marcelo sobre o Campo concluir etapa que dispara vencimento de parcela.

## Bloco 1 — Migração `20261128000000_permissoes_perfis`

**Antes:** `prisma migrate diff` só leitura (banco × schema) deu vazio: nenhuma divergência de base, nada a preservar além do que já existe.

**SQL (`prisma/migrations/20261128000000_permissoes_perfis/migration.sql`, gerado pelo diff do Prisma):**
```sql
ALTER TYPE "PapelUsuario" ADD VALUE 'ESCRITORIO';
ALTER TYPE "PapelUsuario" ADD VALUE 'CAMPO';
ALTER TABLE "Usuario" ADD COLUMN "ajustesPermissao" JSONB,
ALTER COLUMN "papel" DROP DEFAULT;
```
Sem UPDATE: os quatro usuários atuais continuam `ADMIN`. Sem tabela nova, então sem RLS novo.

**SQL de volta:**
```sql
ALTER TABLE "Usuario" DROP COLUMN "ajustesPermissao", ALTER COLUMN "papel" SET DEFAULT 'ADMIN';
-- Os valores ESCRITORIO e CAMPO ficam no enum (PostgreSQL não remove valor de enum). Só se NENHUM usuário
-- os usar: recriar o tipo (CREATE TYPE novo, ALTER COLUMN ... TYPE novo USING papel::text::novo, DROP TYPE antigo).
```

**Validação BEGIN/ROLLBACK no banco compartilhado** (nada gravado): migração aplicada dentro da transação sem erro; `papel` ficou `NOT NULL` sem padrão e `ajustesPermissao` `jsonb` nulável; usuários antes e depois: 4 `ADMIN` (acesso total preservado); **usar `CAMPO` na mesma transação foi RECUSADO** (erro `55P04 unsafe use of new value`), confirmando que a migração só cria os valores e nada os usa; após o ROLLBACK a coluna não existe e o enum tem só `ADMIN`.

**Efeito no código:** com o padrão removido, `criarUsuario` (hoje sem `papel`) e `prisma/seed.ts` passam a exigir perfil; o Bloco 2 corrige os dois e regenera o cliente. Entre a aplicação da migração e o deploy do código novo, só `criarUsuario` falharia (ninguém cria usuário nesse intervalo).
