# Pontual Gestão — CLAUDE.md

Sistema de gestão (CRM + obras + financeiro + estoque) da **Pontual Soluções em Esquadrias e Vidros** (Macaé-RJ). Construído pela RM Code, também como laboratório de blocos reutilizáveis.

**Fonte da verdade:** `docs/ESPECIFICACAO.md` (cópia integral da especificação). Releia-a no início de cada fase e diante de dúvida. Em conflito, ela vale mais que qualquer convenção.

## Método
- Uma fase por vez (seção 14 da spec). Ao fim: typecheck, lint, test, build → **revisão sênior (seção 0.6)** → relatório em `docs/revisoes/fase-N.md` → commit → **parar** e esperar "continuar".
- **Commit e push ao concluir cada bloco da fase** (não só no fim), depois de verificado. Conventional Commits em português; só os arquivos do bloco; conferir antes que nenhum `.env*`, PDF ou `docs/referencias/` entra.
- **Nunca editar arquivos com `Get-Content`/`Set-Content` do PowerShell 5.1** (corrompe acentos): usar Edit/Write/node. `tests/unit/encoding.test.ts` barra isso. Rodar o Vitest pelo PowerShell com `D:` maiúsculo.
- Decidir com bom senso e registrar em `docs/DECISOES.md`. Dependências de pessoas vão para `docs/PENDENCIAS.md`.
- Nunca inventar preços, fórmulas, alíquotas, margens ou prazos reais: campo vazio + aviso na interface + PENDENCIAS.
- Nunca imprimir, logar ou commitar valores de `.env*`. Validar conexões mostrando só sucesso/falha e tipo do erro.
- Nenhum dado real da Pontual em ambiente hospedado (Vercel Hobby = só demonstração). Ver `docs/OPERACAO.md`.

## Stack
Next.js (App Router) + TypeScript estrito + Tailwind + shadcn/ui + lucide-react; PostgreSQL no Supabase (só banco e Storage) via Prisma; Auth.js v5 (Credentials, JWT 8 h); Zod; react-hook-form; TanStack Table; Recharts; dnd-kit; date-fns (America/Sao_Paulo); `@react-pdf/renderer`; Vitest; Playwright. Windows 11/PowerShell: scripts npm multiplataforma, usar `npm`.

## Comandos
`npm run dev | build | start | lint | typecheck | test | test:integracao | test:e2e | format`
`npm run db:migrate | db:deploy | db:studio | seed | seed:demo` (ver `package.json`).

## Estrutura
- `src/lib/*`: blocos genéricos, **sem conhecimento do negócio** (db, auth, auditoria, storage, formatadores, validadores, permissoes).
- `src/lib/dominio/*`: regras puras e testáveis (preço, parcelas, prazos, estoque, fórmulas).
- `src/modules/<modulo>/{actions,queries,schemas,components}`: domínio da Pontual.
- `src/app/(auth)` público; `src/app/(app)` logado; `src/app/api/{public,v1,cron,health}`.
- `prisma/`, `tests/{unit,e2e}`, `docs/`.

## Convenções críticas
- Tabelas/campos/enums em português sem acento; código técnico genérico em inglês; interface em pt-BR (sem "vidraçaria", pouco "lead").
- Dinheiro: `Int` em centavos (`...Centavos`), nunca float; última parcela absorve a diferença. Medidas em mm (`Int`).
- Datas: UTC no banco; calendário em `@db.Date`; exibir `dd/mm/aaaa` em America/Sao_Paulo.
- Toda tabela: `id`, `criadoEm`, `atualizadoEm`, `criadoPorId`, `atualizadoPorId`, `deletadoEm` (exclusão lógica). Nunca apagar fisicamente registro com vínculos.
- Mutações via Server Actions: **sessão (`exigirSessao`) + Zod + auditoria (`LogAuditoria`)** sempre. Permissão por `can(usuario, acao, recurso)` (hoje `true`).
- Estados derivados (atrasado, em garantia, vencido) calculados na consulta; cron só gera notificações/recorrências e é idempotente.
- Fórmulas: interpretador seguro, nunca `eval`. Total da proposta = soma calculada, nunca digitada.
- Nada da empresa fixo no código: textos, cores, logo, endereço vêm de Configurações.

## Regras de negócio (resumo; detalhes na spec seção 5)
R1 preço (manual/tabela/composição, divisor por dentro) · R3 numeração `NNNN-AA` · R4 congelar proposta enviada · R5 aprovação transacional · R6 parcelas por gatilho · R7/R8 etapas e prazo em dias úteis (relógio inicia na medição exata) · R12 garantia de regulagem 90 dias · R14 estoque/retalhos · R15 custo real por obra.

## Ambiente e infraestrutura
Repo `RMCode-ia-br/pontual-sistema`; Vercel `rmcode1/pontual-sistema` (região `gru1`, igual ao banco; **deploy já feito e variáveis cadastradas**, informado pela RM Code); Supabase **projeto novo em São Paulo (`sa-east-1`)**, plano gratuito (sem backup automático, pausa por inatividade). Segredos `BACKUP_DATABASE_URL` e `BACKUP_PASSPHRASE` **já estão no GitHub**. Variáveis: ver `.env.example`.
- **Migrações e seed saindo de rede IPv4:** `DIRECT_URL` precisa ser o **Session pooler** (porta 5432), não a conexão direta `db.<ref>.supabase.co` (só IPv6; não conecta daqui). `DATABASE_URL` ideal: Transaction pooler (6543, `?pgbouncer=true`). Ver `docs/DECISOES.md` (26).

## Estado
Fases 0 (Fundação), 1 (Cadastros) e 2 (Comercial: funil e agenda) concluídas e revisadas (`docs/revisoes/fase-0.md`, `fase-1.md`, `fase-2.md`); aguardando o "continuar" para a Fase 3 (Propostas). A Fase 2 entregou projetos (código `P-AAAA-NNNN`), funil em Kanban (dnd-kit + menu "Mover para…"; "Aprovado" só por proposta, Fase 3), qualificação e perda com motivo, agenda (mês/semana/dia/lista, conflito como alerta, horários livres, exportação e feed `.ics` por token revogável), tela de visita no celular (medidas-rascunho, fotos, condomínio), tarefas/follow-up de proposta, WhatsApp com variáveis de visita, relatório "Funil e origem" e widgets comerciais no painel. Migrações no banco de São Paulo: `20261113000000_comercial` e `20261113120000_indice_tarefa_projeto` (`DIRECT_URL` já funciona). Regras do funil em `src/lib/dominio/funil.ts`; da agenda em `agenda.ts`/`calendario.ts`. Atenção ao editar: Client Components nunca importam valores de `@/lib/acoes`; toda tabela nova precisa de RLS na migração; "use server" só exporta funções async; E2E interrompido à força pode deixar sessão presa no Postgres (ver APRENDIZADOS). Atualize esta seção ao fim de cada fase.

## Documentos
`docs/ESPECIFICACAO.md` · `docs/DECISOES.md` · `docs/PENDENCIAS.md` · `docs/OPERACAO.md` · `docs/APRENDIZADOS.md` · `docs/PADROES_RMCODE.md` · `docs/revisoes/`
