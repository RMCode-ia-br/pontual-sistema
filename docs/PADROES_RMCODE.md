# Padrões RM Code: blocos reutilizáveis

O sistema da Pontual é também um **laboratório**: tudo que não depende do negócio está isolado para ser reaproveitado em outros projetos. Regra de ouro: **isole e documente, não abstraia antes da hora**. Reuso nasce de código simples e bem separado, não de configuração excessiva.

Separação de pastas: `src/lib/*` (e alguns `src/components/*`) **não conhecem o negócio**; `src/modules/*` é o domínio da Pontual.

## Blocos (Fase 0)

| Bloco | Onde | O que entrega | Depende de |
| --- | --- | --- | --- |
| Autenticação por usuário e senha | `src/lib/auth/*`, `src/proxy.ts`, `src/types/next-auth.d.ts` | Auth.js v5 (Credentials), JWT 8 h, bcrypt custo 12, bloqueio 5 falhas/15 min por login e IP, **sessão validada no banco** (ativo + `versaoSessao`), `exigirSessao()` | Prisma (`Usuario`, `TentativaLogin`) |
| Telas de login e troca de senha | `src/modules/usuarios/{actions/sessao.ts,components}`, `src/app/(auth)` | login, troca obrigatória, política de senha | bloco acima |
| Gestão de usuários | `src/modules/usuarios/*` | criar, editar, ativar/desativar (derruba sessão), redefinir senha, "último ativo" protegido com `FOR UPDATE` | auth |
| Auditoria | `src/lib/auditoria`, `src/modules/auditoria` | `registrarAuditoria(tx, ...)`, diff só dos campos alterados, **hash nunca é gravado**, tela com filtros e CSV | Prisma (`LogAuditoria`) |
| Permissões | `src/lib/permissoes` | `can(usuario, acao, recurso)` num ponto único (hoje `true`) | nenhuma |
| Anexos privados | `src/lib/storage`, `src/modules/anexos` | upload direto ao Storage por URL assinada, compressão de imagem no navegador, validação do tamanho/tipo **reais**, download com link de 60 s, exclusão lógica | Supabase Storage, Prisma (`Anexo`) |
| CSV seguro | `src/lib/csv` | CSV para Excel pt-BR, com proteção contra injeção de fórmula | nenhuma |
| Formatadores e validadores | `src/lib/formatadores`, `src/lib/validadores` | moeda em centavos sem float, datas em SP, datas de calendário sem erro de fuso, telefone E.164, CPF/CNPJ | `date-fns-tz` |
| Resultado padrão de ações | `src/lib/acoes.ts` | `ResultadoAcao`, `executar()` (erro seguro, sem vazar detalhes), Zod → erros por campo | `zod` |
| Shell da aplicação | `src/components/layout/*` | menu lateral colapsável, barra inferior no celular, busca Ctrl+K, sino, tema, menu do usuário | shadcn/ui |
| Componentes de formulário | `src/components/formulario.tsx`, `campo-senha.tsx` | campo com erro inline e acessibilidade, select/checkbox nativos | Tailwind |
| Página de erro e 404 | `src/components/layout/pagina-de-erro.tsx`, `error.tsx`, `not-found.tsx` | erro amigável com código, sem detalhes técnicos | nenhuma |
| Rotina diária idempotente | `src/app/api/cron/diario` | protegida por `CRON_SECRET` (comparação em tempo constante) | Vercel Cron |
| Saúde | `src/app/api/health` | confere o banco sem expor dados | Prisma |
| PWA | `src/app/manifest.ts`, `src/app/icons/[arquivo]` | manifesto e ícones gerados com a cor e a inicial da empresa | `next/og` |
| Cabeçalhos de segurança | `next.config.ts` | CSP, HSTS, nosniff, frame DENY, referrer, permissions | nenhuma |
| Catálogos editáveis | `src/modules/catalogos` | CRUD genérico de listas simples com ordem e ativo, escritas dentro da transação | Prisma |
| CI e backup | `.github/workflows/{ci,backup}.yml` | lint, typecheck, testes e build; `pg_dump` criptografado agendado | GitHub Actions |
| Guarda de codificação | `tests/unit/encoding.test.ts` | falha se algum arquivo tiver texto UTF-8 corrompido ou BOM | Vitest |
| Harness de E2E | `playwright.config.ts`, `tests/e2e/{banco,ajudantes,dados}.ts` | usuário isolado, IP por teste, limpeza completa (inclusive Storage), restauração de configuração | Playwright, `pg` |

## Checklist para reaproveitar em um projeto novo

1. **Copie** `src/lib/{auth,db,auditoria,storage,csv,formatadores,validadores,permissoes}`, `src/lib/acoes.ts` e `src/proxy.ts`.
2. **Prisma:** reutilize os modelos `Usuario`, `TentativaLogin`, `LogAuditoria`, `Anexo` e as colunas padrão (`criadoEm`, `atualizadoEm`, `criadoPorId`, `atualizadoPorId`, `deletadoEm`). Use `prisma.config.ts` com `DIRECT_URL` **só para migrações** e o driver adapter `@prisma/adapter-pg`.
3. **Variáveis:** `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `AUTH_URL`, `SUPABASE_*`, `CRON_SECRET`. Gere os segredos; **codifique a senha do banco** na URL.
4. **Rotas públicas** em `src/lib/auth/config.ts` (`ROTAS_PUBLICAS`) e `matcher` do proxy.
5. **Seed:** copie o padrão de `prisma/seed.ts` (admin só se não houver usuário; `createMany` + `skipDuplicates`; nunca sobrescrever edições).
6. **Toda Server Action:** `exigirSessao()` → `can()` → Zod → `executar()` → transação com `registrarAuditoria(tx, ...)`.
7. **Arquivos `"use server"`** exportam **somente** ações que começam com `exigirSessao()`; consultas e helpers ficam em `queries.ts` com `import "server-only"`.
8. **Testes:** copie a pasta `tests/e2e` (setup/teardown e helpers) e o guarda de codificação.
9. **Backup:** copie `backup.yml`, cadastre os segredos e **teste a restauração**.
10. **Trocar o que é da Pontual:** nome, logo e cores vêm de Configurações; nada da empresa fica fixo no código.

## O que NÃO é reutilizável (é da Pontual)

Tudo em `src/modules/{tarefas,configuracoes,feriados,modelos-texto,backup}` que tenha regra do negócio (prazos em dias úteis, textos de proposta, limites do plano gratuito, categorias do DRE) e os dados do seed.
