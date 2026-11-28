# Fase 7C — Permissões por perfil e por módulo

Plano aprovado pelo Régis em 2026-11-27 (arquivo de plano da sessão; decisões 176 a 184 em `docs/DECISOES.md`; inventário em `docs/revisoes/fase-7c-inventario.md`). Fase única, relatório único.

## Estado atual (retomar daqui)

| Bloco | Situação | Commit |
|---|---|---|
| 0 Inventário, decisões, CLAUDE.md | concluído, `verificar` e Vercel verdes | `979d772` |
| 1 Migração `20261128000000_permissoes_perfis` | concluído: aplicada no banco de São Paulo com OK do Régis; `papel: ADMIN` explícito em `criarUsuario`, seed e nos dois helpers de teste que inserem em SQL cru; `verificar` e Vercel verdes | `8d42985` |
| 2 Regra pura, sessão com permissões, seed | concluído, `verificar` e Vercel verdes | `22e3484` |
| 3 Menu, `/sem-acesso`, `exigirModulo` nas páginas | concluído (aguardando commit): typecheck, lint, build, 246 unitários da área e E2E `area-logada` verdes | — |
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

## Bloco 2 — Regra pura e sessão

- `src/lib/dominio/permissoes.ts` (pura): módulos, perfis prontos, `permissoesEfetivas(papel, ajustes)` com Zod estrito (falha fechada: papel ≠ ADMIN sem acesso a nada, ADMIN perfil puro, sempre com `ajustesInvalidos`), normalização (Painel só "ver", destrutivo só com alterar, custo exige valores), `decidir` com tabelas `NIVEL_DO_VERBO` e `RECURSO` (módulo, `tambem`, `exige` transversais; verbo, recurso ou perfil desconhecido = negado).
- `src/lib/permissoes/index.ts`: `can(usuario, acao, recurso)` calcula pelo papel quando a sessão não traz permissões já calculadas (ponto de extensão da Parte A: ator com `permissoes` próprias).
- `obterUsuarioAtual` lê `ajustesPermissao` na mesma consulta e devolve `permissoes`; ajuste inválido vai para o log com o id do usuário (nunca o conteúdo).
- Recursos de nome ambíguo (`projeto`, `configuracao`, `interacao`) ficam mapeados de forma provisória e conservadora; o Bloco 4 os troca por `visita`, `mao-de-obra`, `interacao-cliente`/`interacao-projeto` e a varredura passa a proibir os antigos.
- Testes: `tests/unit/permissoes.test.ts` (tabela esperada escrita à mão, perfil × módulo × nível, transversais, ajustes acima e abaixo do perfil, falha fechada com 8 tipos de ajuste inválido) e `tests/unit/permissoes-varredura.test.ts` (todo `can(` do código tem verbo e recurso mapeados; recurso dinâmico só na lixeira).

## Bloco 3 — Menu, páginas e `/sem-acesso`

- **Menu:** cada item tem `modulo` (e `exige` para "Preço do kg" = custo). `menuVisivel`, `menuCelularVisivel` e `paginasDisponiveis(permissoes)` são funções puras; as permissões chegam aos componentes de cliente como dado simples (`modulos`, `verValores`, `verCustoMargem`), nunca como função. Agenda e Tarefas viraram o grupo "Agenda e tarefas" (decisão 176); "Condições de pagamento" passou para Cadastros; "Ajuda" (primeiros passos, que lê contagens de usuários e produtos) exige Configurações. Barra do celular: até 4 atalhos entre Painel, Funil, Agenda, Tarefas e Obras (o Campo vê Painel, Agenda, Tarefas e Obras). Abas de Configurações filtradas pelo módulo de cada aba.
- **Páginas:** `exigirModulo(modulos, { nivel, exige })` (`src/lib/auth/modulo.ts`) nas 90 páginas, aplicado por script com tabela explícita rota → módulo; telas de cadastro novo, edição, reajuste e inventário inicial exigem "alterar"; telas de dinheiro (propostas, financeiro, compras e relatórios financeiros e de vendas) exigem também "ver valores"; preço do kg, reajuste de produtos e margem por obra exigem "ver custo e margem"; cada relatório exige Relatórios mais o módulo de origem. Sem acesso: `/sem-acesso` ("Você não tem acesso a esta área. Fale com o administrador."), que só pede sessão para não haver laço.
- **Testes:** `tests/unit/paginas-e-menu-permissao.test.ts` (toda página chama `exigirModulo`, exceções com motivo; cada item do menu aponta para uma página que exige o mesmo módulo; menu de cada perfil e do ajuste inválido). Único ajuste num E2E existente: `area-logada.spec.ts` abre "Agenda e tarefas" para achar "Tarefas".
- **Fica para o Bloco 6:** valores DENTRO de telas que o Campo vê (obra, cliente, visita, linha do tempo, lista de obras), o índice `/relatorios` filtrado por link, e custo nas telas de produto, funcionário e tipologia.
