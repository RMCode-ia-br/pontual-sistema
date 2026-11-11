# Decisões e suposições

Formato: data · decisão · motivo.

## 2026-11-10 — Fase 0

1. **Spec versionada só como `docs/ESPECIFICACAO.md`.** O original na raiz e os PDFs ficam no `.gitignore` (`/*.pdf`, `/PROMPT_CLAUDE_CODE_Pontual_Gestao.md`) para não duplicar e não enviar dados reais de cliente ao GitHub. Cópia conferida por hash SHA-256.
2. **`.env.local`:** as variáveis de banco, Supabase e `SITE_ALLOWED_ORIGINS` já estavam preenchidas; `AUTH_SECRET` e `CRON_SECRET` estavam **vazias** (como previsto na spec) e foram **geradas por mim** (32 bytes aleatórios, nunca exibidas). Correção: a checagem inicial contava aspas vazias como "preenchida". A senha do banco precisou ser codificada na URL.
3. **Região da Vercel `iad1`**, igual ao banco Supabase em `us-east-1` (spec seção 3), para evitar latência app↔banco. Muda para `gru1` se a RM Code recriar o banco em São Paulo.
4. **Tabelas da Fase 0 apenas.** `Interacao` e `Tarefa` guardam `clienteId`/`projetoId` como texto opcional, sem chave estrangeira, porque `Cliente` e `Projeto` só existem nas Fases 1 e 2. As FKs entram nessas fases, com migração.
5. **Seed base só com o que a Fase 0 usa:** admin, configuração da empresa, catálogos, feriados nacionais e modelos de texto. Fornecedores, tipologias, condições de pagamento e contas financeiras entram nas fases donas dessas tabelas (1, 3 e 5).
6. **Vercel CLI não instalado** na máquina de desenvolvimento. O `vercel link` fica documentado em `docs/OPERACAO.md` e pendente de ação do usuário (nunca pedir token no chat).
7. **`cacheComponents` e `partialPrefetching` do scaffold do Next 16 desativados.** Não são pedidos pela especificação e exigiriam `Suspense`/`use cache` em toda página que lê sessão ou banco; o sistema é inteiro dinâmico e por usuário. Reavaliar se houver necessidade de cache de dados.
8. **Prisma 7.10.1 (estável)**, e não o `latest` do npm (`8.0.0-rc.33`, release candidate). Auth.js v5 em `5.0.0-beta.32` (única linha v5 existente).
9. **`cn` local** (`clsx` + `tailwind-merge`) em `src/lib/utils.ts`, no lugar do pacote `cn` que o CLI do shadcn 4 passou a adicionar. Menos uma dependência em ponto central; um futuro `shadcn add` pode reintroduzir `from "cn"` e precisa ser revertido.
10. **Migrações sem banco-sombra:** o SQL é gerado com `prisma migrate diff` e aplicado com `migrate deploy`, porque o pooler do Supabase não permite criar o banco-sombra do `migrate dev`.
11. **TLS do banco:** o driver `pg` usa `ssl: { rejectUnauthorized: false }` (Supabase exige TLS e a CA não está instalada). Melhorar com a CA do Supabase antes da produção.
12. **Troca de senha encerra a sessão:** `versaoSessao` é incrementada (spec: sessões antigas inválidas), então o usuário entra de novo com a nova senha. Mais simples e seguro que reemitir o token.
13. **Bloqueio de login:** vale por login/e-mail e por IP separadamente, vence o que termina mais tarde; falhas anteriores a um login bem-sucedido não contam; dura 15 min a partir da última falha. Errar a senha atual na troca de senha conta como falha.
14. **Login em minúsculas:** `login` e `email` são gravados em minúsculas (unicidade sem diferenciar maiúsculas, sem índice funcional).
