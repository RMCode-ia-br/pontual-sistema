# Aprendizados e armadilhas

O que funcionou, o que deu errado e o que evitar. Atualizar ao fim de cada fase.

## 2026-11-11 — Fase 0

- **Vitest falha com "Cannot read properties of undefined (reading 'config')" quando o terminal está em `d:\...` (minúsculo).**
  No Windows, a diferença de caixa da letra do drive (`d:` × `D:`) faz o Vite tratar o mesmo módulo como dois, e o Vitest se carrega duas vezes. Acontece no Git Bash (que converte para `d:`); no PowerShell com `D:\...` funciona. Não adianta normalizar na config (o Vitest já foi resolvido antes). **Rode os testes pelo PowerShell/terminal do VS Code com o drive em maiúsculo.** Qualquer teste, até um `expect(1).toBe(1)`, falha por isso, então não é erro do código.
- **`prisma` no npm: o `latest` pode ser um release candidate.** Em 2026-11-11 era `8.0.0-rc.33`; adotamos a última estável (`7.10.1`). Conferir `npm view prisma dist-tags` antes de instalar.
- **Auth.js v5 só existe como `beta`** (`next-auth@5.0.0-beta.32`), compatível com Next 16.
- **Next 16 renomeou `middleware` para `proxy`** (`src/proxy.ts`, função `proxy`). A documentação do Next vem dentro de `node_modules/next/dist/docs`.
- **Senha do banco com `@` ou `#` precisa ir codificada na URL** (`encodeURIComponent`), senão a URL é inválida e o Prisma não conecta.
- **Supabase + Prisma:** `migrate dev` precisa de banco-sombra, que o pooler não permite. Gerar o SQL com `prisma migrate diff --from-empty --to-schema ... --script`, gravar em `prisma/migrations/<data>_<nome>/migration.sql` e aplicar com `migrate deploy`.
- **Seed:** `upsert` em loop contra um banco em outra região leva minutos (uma ida e volta por linha). `createMany({ skipDuplicates: true })` faz o mesmo sem sobrescrever e leva segundos.
- **npm 11 exige aprovar scripts de instalação** (`npm install-scripts approve`); sem isso o Prisma não instala os engines.
- **`@types/node@20` do scaffold conflita com o Vitest 5** (pede 22+). Subir para `@types/node@^22`.
- **`create-next-app` recusa pasta com arquivos conflitantes**: gerar numa pasta temporária e copiar com `cp -rn`.
- **Redirecionar saída para `/tmp` no Git Bash do Windows falhou em silêncio** e pulou o comando. Usar caminhos absolutos do scratchpad.
- **Arquivos `"use server"` expõem TODA função exportada como endpoint público** (chamável do navegador, sem passar pela página). Só exportar de lá ações que começam com `exigirSessao()`; helpers e consultas ficam em `queries.ts` com `import "server-only"`. (Pego na revisão da própria Fase 0: `contarNaoLidas`.)
- **Playwright roda com `NODE_ENV=test`, e o Next não carrega `.env.local` nesse modo.** Subir o servidor do teste com `NODE_ENV=production`. O carregador de TS do Playwright é CommonJS e não importa o cliente Prisma gerado (ESM): preparar dados dos testes com `pg` direto.
- **O Next também usa `role="alert"` (anunciador de rotas):** em testes, restringir o seletor ao formulário.
- **shadcn 4 (estilo `base-nova`) usa `@base-ui/react`**: gatilhos recebem a prop `render={<Button/>}` (não `asChild`), e o CLI passou a adicionar o pacote `cn` (trocamos por função local).
- **`prisma generate` não pode exigir variáveis de banco.** Ele roda no `postinstall` e no `build` (Vercel, CI) antes de qualquer variável existir. `env("DIRECT_URL")` no `prisma.config.ts` lança `PrismaConfigEnvError` se faltar (erro visto no primeiro deploy na Vercel). O `prisma.config.ts` agora só exige `DIRECT_URL` para `migrate`, `db` e `studio`, com mensagem clara. O `dotenv` carrega o `.env.local` localmente e **esconde esse erro**: para reproduzir, rode numa pasta sem `.env.local` (ex.: cópia do `prisma/` e do `prisma.config.ts` com `node_modules` ligado por junction).
