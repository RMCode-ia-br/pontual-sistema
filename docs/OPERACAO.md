# Operação

Como configurar, publicar, monitorar e recuperar o sistema. Mantenha este arquivo atualizado a cada fase.

## 1. Ambientes e uma regra importante

| Ambiente | Para quê | Dados |
| --- | --- | --- |
| Local (`npm run dev`) | desenvolvimento | de teste/demonstração |
| Vercel (time `rmcode1`, projeto `pontual-sistema`) | laboratório e testes | **só demonstração** |
| Produção (a definir) | uso real da Pontual | reais |

**Nenhum dado real de clientes, fornecedores, funcionários ou financeiro da Pontual pode entrar em ambiente hospedado enquanto a RM Code não decidir a hospedagem de produção.** O plano Hobby da Vercel é restrito a uso pessoal não comercial; a Vercel define uso comercial como qualquer deploy usado para ganho financeiro de alguém envolvido na produção do projeto. O sistema é um laboratório da RM Code para a Pontual, uma zona cinzenta que só a Vercel pode esclarecer. Veja o checklist da seção 9.

## 2. Variáveis de ambiente

Todas estão em `.env.example`. Os valores reais ficam só em `.env.local` (fora do Git) e no painel da Vercel.

| Variável | Para quê | Onde obter |
| --- | --- | --- |
| `DATABASE_URL` | banco usado pelo app (Transaction pooler, porta 6543, `?pgbouncer=true`) | Supabase, Connect |
| `DIRECT_URL` | migrações, seed e backup: **Session pooler**, porta 5432, usuário `postgres.<ref>`. **Não** use a conexão direta `db.<ref>.supabase.co` (só IPv6: não conecta de redes IPv4, como a do escritório) | Supabase, Connect, "Session pooler" |
| `SUPABASE_URL` | URL do projeto | Supabase, Settings |
| `SUPABASE_SECRET_KEY` | chave secreta do servidor (Storage). **Nunca** no navegador | Supabase, API keys |
| `SUPABASE_STORAGE_BUCKET` | nome do bucket privado (`anexos`) | fixo |
| `AUTH_SECRET` | assina as sessões | gere: `npx auth secret` ou 32 bytes aleatórios |
| `AUTH_URL` / `NEXT_PUBLIC_APP_URL` | endereço público do app | local: `http://localhost:3000` |
| `CRON_SECRET` | protege `/api/cron/diario` | gere um valor aleatório longo |
| `SITE_ALLOWED_ORIGINS` | origens do site com CORS em `/api/public` | `https://pontualmacae.com.br` |

**Senha do banco com caracteres especiais** (`@ # : / ? %`) precisa ser codificada na URL com `encodeURIComponent`, senão a URL fica inválida e o Prisma não conecta.

`prisma generate` (rodado no `postinstall` e no `build`) **não exige** variáveis de banco. Só `migrate`, `db` e `studio` exigem `DIRECT_URL`.

## 3. Publicar na Vercel

**Estado (informado pela RM Code em 2026-11-11; eu não tenho acesso à Vercel para conferir):** o projeto `pontual-sistema` já foi implantado e as variáveis da seção 2 já estão cadastradas no painel. A vinculação da pasta local (`vercel link`) é opcional e não foi feita nesta máquina (sem Vercel CLI).

Passos de referência (para refazer em outro projeto ou ambiente):

1. (Opcional) Instale o CLI e entre (você faz isso; nunca envie token por chat): `npm i -g vercel` e `vercel login`. Na pasta do projeto: `vercel link`, time `rmcode1`, projeto `pontual-sistema`.
2. No painel da Vercel (Settings, Environment Variables), cadastre **todas** as variáveis da seção 2 para Production, Preview e Development. `AUTH_URL` e `NEXT_PUBLIC_APP_URL` devem ser o endereço público daquele ambiente. **Ao trocar de banco, atualize `DATABASE_URL`, `DIRECT_URL` e as chaves do Supabase na Vercel e faça novo deploy.**
3. Conecte o projeto ao repositório `RMCode-ia-br/pontual-sistema` (Settings, Git). O site (`rmcode-site`) **não deve ser alterado**.
4. **Região das funções: `gru1` (São Paulo)**, em `vercel.json`, a mesma do banco no Supabase (`sa-east-1`), para minimizar a latência. (Antes era `iad1`, quando o banco estava em `us-east-1`; ver `docs/DECISOES.md`, itens 3 e 25.)
5. Domínio: `sistema.pontualmacae.com.br`. Em Settings, Domains, adicione o domínio e crie no registro.br (DNS gerenciado pela RM Code) o registro que a **própria Vercel indicar** na tela.

Confira o primeiro deploy: `/api/health` deve responder `{"status":"ok"}` e o login deve abrir.

### Rotina diária (cron)

`vercel.json` agenda `GET /api/cron/diario` uma vez por dia. A Vercel envia `Authorization: Bearer <CRON_SECRET>` sozinha quando `CRON_SECRET` existe. A rotina é **idempotente** e hoje só apaga tentativas de login com mais de 30 dias; nas próximas fases gera notificações e recorrências. O sistema **não depende** dela para estar correto. O plano Hobby só permite agendamentos diários.

## 4. Banco de dados

```powershell
npm run db:deploy        # aplica as migrações pendentes (usa DIRECT_URL)
npm run seed             # dados iniciais, idempotente e seguro para produção
npm run storage:setup    # cria o bucket privado de anexos (idempotente)
npm run icones           # regenera logo circular, favicon, apple-icon e ícones do PWA a partir de public/logo-pontual.png
npm run identidade:extrair  # relê os tokens de estilo do site da empresa (docs/IDENTIDADE_VISUAL.extraido.md)
```

- **Banco novo, na ordem:** (1) `DIRECT_URL` = Session pooler; (2) `npm run db:deploy` (aplica também a migração de RLS); (3) defina `ADMIN_SENHA_INICIAL` e rode `npm run seed`; (4) `npm run storage:setup` (cria o bucket privado: o app **não** o cria sozinho); (5) confira que 0 tabelas estão expostas ao `anon` (`npm run test:integracao`, arquivo `seguranca-banco`). Foi assim que o banco de São Paulo foi preparado em 2026-11-11.
- Extensões `unaccent` e `pg_trgm` são criadas pela migração inicial.
- **Nova migração:** altere `prisma/schema.prisma`, gere o SQL com `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` (ou compare com o schema anterior), grave em `prisma/migrations/<AAAAMMDDHHMMSS>_<nome>/migration.sql` e aplique com `npm run db:deploy`. O `migrate dev` não funciona com o pooler do Supabase (precisa de banco-sombra).
- **Usuário inicial:** o seed cria `admin` com troca de senha obrigatória no primeiro acesso. Em desenvolvimento a senha é a padrão pública `admin`; **em produção o seed recusa a senha padrão**: defina `ADMIN_SENHA_INICIAL` (mínimo 8 caracteres). No banco novo de São Paulo (2026-11-11) o `admin` foi criado com a senha de `ADMIN_SENHA_INICIAL` e a **troca no primeiro acesso ainda está pendente**: entre e troque. Em qualquer banco novo, confira isso antes de publicar o endereço. Depois de cadastrar as pessoas, desative esse usuário.
- **Segurança do banco (RLS):** o Supabase expõe o schema `public` pela API de dados aos papéis `anon` e `authenticated`. A migração `20261111120000_seguranca_rls` fecha isso (RLS ligado, sem políticas, privilégios retirados). **Toda migração com tabela nova precisa de `ENABLE ROW LEVEL SECURITY`**; `npm run test:integracao` falha se alguma ficar sem.
- O seed **nunca** redefine a senha de um usuário existente nem sobrescreve o que foi editado em Configurações. Ele também carrega a **logo padrão** (de `public/marca/logo-pontual.png`) e a cor `#0064b5` **só quando estão vazias** (ou na cor padrão antiga e nunca editada); exige o bucket criado por `npm run storage:setup`. Para trocar a logo depois, use Configurações > Empresa; ao receber a logo modernizada, troque `public/logo-pontual.png` e rode `npm run icones`.

## 5. Backup e restauração

O plano gratuito do Supabase **não tem backup automático** e **pausa o projeto após 1 semana sem uso**.

### Backup automático (GitHub Actions)

Workflow `.github/workflows/backup.yml`, diário (07:00 UTC) e manual. Gera `pg_dump --schema=public` (cliente 17, só o que é do sistema), valida o arquivo com `pg_restore --list`, compacta, **criptografa** (AES-256, PBKDF2) e guarda como artefato por 30 dias. Falha de forma visível (e-mail do GitHub) se não rodar.

**Segredos no GitHub** (Settings, Secrets and variables, Actions): a RM Code informou em 2026-11-11 que `BACKUP_DATABASE_URL` e `BACKUP_PASSPHRASE` **já estão cadastrados** (eu não tenho como conferir). Eles precisam apontar para o **banco novo** (São Paulo); se o banco mudar de novo, atualize-os.

- `BACKUP_DATABASE_URL`: a URL do **Session pooler** (porta 5432), com a senha codificada.
- `BACKUP_PASSPHRASE`: senha de criptografia. **Guarde-a em um cofre**: sem ela o backup não abre.

Ainda falta rodar o workflow **manualmente uma vez** (aba Actions, "Backup do banco", "Run workflow") e **testar a restauração** (veja abaixo).

### Restaurar (passo a passo)

1. Baixe o artefato `backup-pontual` na aba Actions e extraia o arquivo `pontual-AAAAMMDD-HHMM.dump.enc`.
2. Descriptografe: `openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in pontual-....dump.enc -out pontual.dump`
3. Crie um banco **vazio** (novo projeto Supabase ou PostgreSQL local) e restaure: `pg_restore --no-owner --no-privileges --dbname "<URL do banco vazio>" pontual.dump`
4. Aponte `DATABASE_URL` e `DIRECT_URL` para o banco restaurado e rode `npm run db:deploy` (não deve haver migração pendente).
5. Os **arquivos** (fotos e anexos) ficam no Storage e **não entram** no `pg_dump`: copie o bucket separadamente.

> **Estado do teste (2026-11-11):**
> - **Testado:** a criptografia e a descriptografia (passos 1 e 2) com `openssl` 3.5, usando os mesmos comandos do workflow: o arquivo restaurado ficou idêntico ao original e uma senha errada falha ("bad decrypt").
> - **NÃO testado:** o `pg_dump` real do banco e o `pg_restore` em um banco vazio (passos 3 e 4). A máquina de desenvolvimento não tem `pg_dump`, `pg_restore`, `psql` nem Docker. Veja `docs/PENDENCIAS.md`. **Faça esse teste antes de operar com dados reais.**

### Verificação de saúde

`GET /api/health` responde `{"status":"ok"}` (200) ou `{"status":"erro"}` (503), sem expor dados. Cadastre-o em um monitor gratuito (ex.: UptimeRobot) a cada 5 a 30 minutos: além de avisar de queda, mantém o projeto Supabase ativo e avisa se ele pausar.

A tela Configurações, Backup e saúde mostra o uso do banco (limite 500 MB) e dos arquivos (limite 1 GB), com alerta a partir de 70% e 90%.

## 6. Rotação de chaves

| Chave | Efeito ao trocar | Como |
| --- | --- | --- |
| `AUTH_SECRET` | **todas as sessões caem** (todos precisam entrar de novo) | gere outro, atualize no `.env.local` e na Vercel, faça novo deploy |
| `CRON_SECRET` | nenhum para os usuários | atualize na Vercel (a Vercel passa a enviar o novo) |
| `SUPABASE_SECRET_KEY` | upload/download de arquivos param até atualizar | gere outra no Supabase, atualize local e Vercel |
| senha do banco | o app e o backup param até atualizar | troque no Supabase, atualize `DATABASE_URL`, `DIRECT_URL` e o segredo `BACKUP_DATABASE_URL` (codificada na URL) |

## 7. Logs e erros

Os logs são linhas JSON (`{"evento": "...", ...}`) e nunca trazem senhas, chaves nem dados de clientes. Páginas de erro mostram só um **código** (hash) que a RM Code usa para achar o log. Falhas de login aparecem como `auth.login_falhou`.

## 8. Segurança em produção

- Cookies de sessão `httpOnly`, `sameSite=lax` e `secure` em HTTPS. Sessão de 8 horas.
- Cabeçalhos: CSP, HSTS, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` (em `next.config.ts`).
- O bloqueio de login por IP usa `x-forwarded-for`: na Vercel esse cabeçalho é definido pela plataforma. Em outra hospedagem, só confie nele atrás de um proxy que o sobrescreva.
- O driver `pg` conecta ao Supabase com TLS sem verificar a cadeia (`rejectUnauthorized: false`). Instalar a CA do Supabase é uma melhoria pendente.

## 9. Checklist para a produção

Antes de colocar **qualquer dado real**:

- [ ] A RM Code decidiu a hospedagem (Vercel Pro, outro provedor, ou confirmação escrita da Vercel de que o uso é permitido).
- [ ] O Supabase está em plano com **backup diário** e sem pausa (ou o backup do GitHub Actions está ativo **e a restauração foi testada**).
- [x] **Transferência internacional de dados:** o banco foi recriado em **São Paulo (`sa-east-1`)** em 2026-11-11 e `regions` da Vercel ajustado para `gru1`. (Os arquivos do Storage ficam no mesmo projeto.)
- [ ] Senha do `admin` trocada e usuários de Marcelo e Luan criados (admin desativado).
- [ ] `AUTH_SECRET`, `CRON_SECRET` e chaves do Supabase **novos** para produção (nunca reaproveitar os de teste).
- [ ] Usuário dedicado `prisma` no banco (hoje pode estar usando `postgres`).
- [x] Segredos do backup cadastrados no GitHub (informado pela RM Code). [ ] `BACKUP_PASSPHRASE` guardada em cofre, workflow executado uma vez e **restauração testada**.
- [ ] Monitor externo em `/api/health`.
- [ ] Domínio `sistema.pontualmacae.com.br` com HTTPS.
- [ ] Dados de demonstração removidos do banco de produção.
