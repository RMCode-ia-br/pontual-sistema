# Decisões e suposições

Formato: data · decisão · motivo.

## 2026-11-10 — Fase 0

1. **Spec versionada só como `docs/ESPECIFICACAO.md`.** O original na raiz e os PDFs ficam no `.gitignore` (`/*.pdf`, `/PROMPT_CLAUDE_CODE_Pontual_Gestao.md`) para não duplicar e não enviar dados reais de cliente ao GitHub. Cópia conferida por hash SHA-256.
2. **`.env.local` já preenchido** (10 variáveis presentes). `AUTH_SECRET` e `CRON_SECRET` já existiam, então não foram regenerados.
3. **Região da Vercel `iad1`**, igual ao banco Supabase em `us-east-1` (spec seção 3), para evitar latência app↔banco. Muda para `gru1` se a RM Code recriar o banco em São Paulo.
4. **Tabelas da Fase 0 apenas.** `Interacao` e `Tarefa` guardam `clienteId`/`projetoId` como texto opcional, sem chave estrangeira, porque `Cliente` e `Projeto` só existem nas Fases 1 e 2. As FKs entram nessas fases, com migração.
5. **Seed base só com o que a Fase 0 usa:** admin, configuração da empresa, catálogos, feriados nacionais e modelos de texto. Fornecedores, tipologias, condições de pagamento e contas financeiras entram nas fases donas dessas tabelas (1, 3 e 5).
6. **Vercel CLI não instalado** na máquina de desenvolvimento. O `vercel link` fica documentado em `docs/OPERACAO.md` e pendente de ação do usuário (nunca pedir token no chat).
