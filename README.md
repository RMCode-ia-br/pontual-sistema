# Pontual Gestão

Sistema de gestão (CRM, obras, financeiro e estoque) da **Pontual Soluções em Esquadrias e Vidros**, em Macaé-RJ. Construído pela RM Code.

- Especificação completa: [`docs/ESPECIFICACAO.md`](docs/ESPECIFICACAO.md) (fonte da verdade)
- Operação, deploy e backup: [`docs/OPERACAO.md`](docs/OPERACAO.md)
- Guia de uso (para quem opera o sistema): [`docs/GUIA_DE_USO.md`](docs/GUIA_DE_USO.md)
- Decisões e pendências: [`docs/DECISOES.md`](docs/DECISOES.md), [`docs/PENDENCIAS.md`](docs/PENDENCIAS.md)
- Blocos reutilizáveis RM Code: [`docs/PADROES_RMCODE.md`](docs/PADROES_RMCODE.md)

> **Aviso:** o ambiente hospedado na Vercel (plano Hobby) é só de laboratório e demonstração. **Nenhum dado real** da Pontual deve entrar nele. Veja `docs/OPERACAO.md`.

**Infraestrutura:** banco e arquivos no Supabase em **São Paulo (`sa-east-1`)**; funções da Vercel na região `gru1` (a mesma). Deploy já feito pela RM Code, com as variáveis cadastradas.

## Stack

Next.js (App Router) · TypeScript estrito · Tailwind · shadcn/ui · PostgreSQL (Supabase) com Prisma · Auth.js v5 · Zod · Vitest · Playwright.

## Como rodar

Requisitos: Node 22 ou superior e npm. No Windows, use o PowerShell.

```powershell
npm install
Copy-Item .env.example .env.local   # e preencha os valores (veja docs/OPERACAO.md)
npm run db:deploy                   # aplica as migrações
npm run seed                        # dados iniciais (idempotente)
npm run storage:setup               # cria o bucket privado de anexos
npm run dev                         # http://localhost:3000
```

O seed cria o usuário `admin` com senha inicial `admin`; a troca é obrigatória no primeiro acesso.

> A senha do banco, se tiver `@`, `#`, `:` ou `/`, precisa estar **codificada** na URL (`encodeURIComponent`).
>
> `DIRECT_URL` (migrações e seed) deve ser o **Session pooler** (porta 5432). A conexão direta `db.<ref>.supabase.co` só funciona em redes IPv6.
>
> Em um banco novo, defina `ADMIN_SENHA_INICIAL` no `.env.local` antes do `npm run seed` (obrigatória em produção).

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | servidor de desenvolvimento |
| `npm run build` / `npm start` | build e servidor de produção |
| `npm run lint` | ESLint (zero avisos é a regra) |
| `npm run typecheck` | TypeScript |
| `npm test` | testes unitários (Vitest) |
| `npm run test:integracao` | testes de integração com o banco real (bloqueio de login sob concorrência, RLS) |
| `npm run test:e2e` | testes de ponta a ponta (Playwright; rode `npm run build` antes) |
| `npm run db:deploy` | aplica migrações |
| `npm run db:studio` | Prisma Studio |
| `npm run seed` | dados iniciais |
| `npm run storage:setup` | cria o bucket privado de anexos |

> **Windows:** rode `npm test` no **PowerShell** (ou no terminal do VS Code), com o drive em maiúsculo (`D:\...`). No Git Bash o Vitest falha por causa da caixa da letra do drive (veja `docs/APRENDIZADOS.md`).

## Testes de ponta a ponta

O E2E usa o banco configurado no `.env.local` e cria apenas dados de teste (usuários `e2e-*`, itens com prefixo "E2E "), removendo tudo no fim, inclusive os arquivos no Storage. Ele **nunca** altera o usuário `admin` e restaura a configuração da empresa que modificar.

```powershell
npm run build
npm run test:e2e
```

## Estrutura

```
src/lib/*          blocos genéricos, sem conhecimento do negócio (auth, db, auditoria, storage, csv...)
src/modules/*      domínio da Pontual (usuários, tarefas, catálogos, configurações...)
src/app/(auth)     telas públicas (login, troca de senha)
src/app/(app)      área logada
src/app/api        health, cron, exportação, auth
prisma/            schema, migrações, seed
tests/{unit,e2e}   testes
docs/              especificação, decisões, operação, guias
```
